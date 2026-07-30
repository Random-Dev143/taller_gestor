const { withTransaction } = require('../../db/connection');
const repo = require('./ordenes.repository');
const repuestosRepo = require('../repuestos/repuestos.repository');

async function cambiarEstado(ot, nuevoEstado) {
    const ahora = new Date().toISOString().replace('T', ' ').substring(0, 19);
    const abierto = await repo.estadoAbierto(ot);
    if (abierto) {
        const minutos = (Date.now() - new Date(abierto.ts_desde + 'Z').getTime()) / 60000;
        await repo.cerrarEstadoHistorial(abierto.id, ahora, minutos);
    }
    await repo.insertarEstadoHistorial(ot, nuevoEstado);
    await repo.actualizarEstadoActual(ot, nuevoEstado);
}

async function sincronizarEstadoOT(ot) {
    const acts = await repo.actividadesPorOt(ot);
    const orden = await repo.obtenerEstadoActual(ot);
    if (!orden || orden.estado_actual === 'Finalizada') return;

    let estadoCalculado = orden.estado_actual;
    const enCurso = acts.filter(a => a.estado === 'En Curso').length;
    const finalizadas = acts.filter(a => a.estado === 'Finalizada' || a.estado === 'Cerrada por Jefe').length;

    if (enCurso > 0) {
        estadoCalculado = 'En Proceso';
    } else if (acts.length > 0 && finalizadas === acts.length) {
        estadoCalculado = 'En Espera';
    } else {
        if (estadoCalculado === 'En Proceso') estadoCalculado = 'En Espera';
    }

    if (estadoCalculado !== orden.estado_actual) await cambiarEstado(ot, estadoCalculado);
}

function recalcularTiempoEmpleado(ot) {
    return repo.recalcularTiempoEmpleadoSQL(ot);
}

async function listar(query) {
    const page = Math.max(1, parseInt(query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(query.limit) || 25));
    const offset = (page - 1) * limit;

    const filtros = {
        estado: query.estado,
        garantia: query.garantia,
        facturacion: query.facturacion,
        busqueda: query.busqueda,
        sortBy: query.sortBy,
        sortDir: query.sortDir
    };

    const total = await repo.contar(filtros);
    const rows = await repo.listar(filtros, limit, offset);

    return { data: rows, total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) };
}

function historialPorPatente(patente) {
    return repo.historialPorPatente(patente);
}

async function obtenerDetalle(ot) {
    const orden = await repo.obtenerConJoins(ot);
    if (!orden) return null;

    const [asignaciones, actividades, explicacion, aportes, historial, tiempos_actividad] = await Promise.all([
        repo.asignaciones(ot),
        requireActividadesRepo().listarPorOt(ot),
        repo.explicacion(ot),
        repo.aportes(ot),
        repo.historialEstados(ot),
        repo.tiemposActividad(ot)
    ]);

    return { ...orden, asignaciones, actividades, explicacion, aportes, historial, tiempos_actividad };
}

// Lazy require para evitar ciclo en el "require" en frío de node (actividades.service ya
// depende de ordenes.service; esto solo hace falta para la vista de detalle de una OT).
function requireActividadesRepo() {
    return require('../actividades/actividades.repository');
}

async function crear(datos) {
    const { ot, cliente, patente, unidad, kilometraje, asesor_legajo, fecha_apertura, es_garantia, es_no_iveco, tiempo_asignado_horas, tiempo_facturado_horas, monto_repuestos, monto_mano_obra, monto_repuestos_garantia, monto_mano_obra_garantia, monto_descuento, descuento_motivo } = datos;

    const montoDescuentoSeguro = Number(monto_descuento) > 0 ? Number(monto_descuento) : 0;
    if (montoDescuentoSeguro > 0 && !(descuento_motivo && descuento_motivo.trim())) {
        const err = new Error('Para cargar un descuento/bonificación es obligatorio indicar el motivo.');
        err.status = 400;
        throw err;
    }

    await withTransaction(async () => {
        await repo.asegurarClienteYUnidad(cliente, patente, unidad);

        const fechaAperturaSegura = fecha_apertura ? new Date(fecha_apertura).toISOString().replace('T', ' ').substring(0, 19) : null;
        const descuentoEstado = montoDescuentoSeguro > 0 ? 'pendiente' : 'ninguno';

        await repo.crearOrden({
            ot, patente, kilometraje, asesor_legajo, fechaAperturaSegura, es_garantia, es_no_iveco,
            tiempo_asignado_horas, tiempo_facturado_horas, monto_repuestos, monto_mano_obra,
            monto_repuestos_garantia, monto_mano_obra_garantia, montoDescuentoSeguro, descuento_motivo, descuentoEstado
        });
        await repo.insertarEstadoHistorial(ot, 'En Espera');
    });
}

async function actualizar(ot, datos) {
    const { cliente, patente, unidad, kilometraje, fecha_apertura, fecha_cierre, es_garantia, es_no_iveco, tiempo_asignado_horas, tiempo_facturado_horas, monto_repuestos, monto_mano_obra, monto_repuestos_garantia, monto_mano_obra_garantia, monto_descuento, descuento_motivo } = datos;

    const seEnviaDescuento = monto_descuento !== undefined;
    const montoDescuentoSeguro = seEnviaDescuento ? (Number(monto_descuento) > 0 ? Number(monto_descuento) : 0) : null;
    if (seEnviaDescuento && montoDescuentoSeguro > 0 && !(descuento_motivo && descuento_motivo.trim())) {
        const err = new Error('Para cargar un descuento/bonificación es obligatorio indicar el motivo.');
        err.status = 400;
        throw err;
    }

    await withTransaction(async () => {
        if (cliente && patente) {
            await repo.asegurarClienteYUnidad(cliente, patente, unidad, { parcial: true });
        }

        // Si se está enviando un monto de descuento, comparamos contra el valor actual:
        // si cambió (o es nuevo), el descuento vuelve a "pendiente" y se limpia la autorización
        // previa, porque un descuento ya autorizado no puede modificarse sin volver a aprobarse.
        let descuentoEstadoNuevo = null, limpiarAutorizacion = false;
        if (seEnviaDescuento) {
            const actual = await repo.obtenerMontoDescuento(ot);
            const cambioMonto = !actual || Number(actual.monto_descuento || 0) !== montoDescuentoSeguro;
            if (cambioMonto) {
                descuentoEstadoNuevo = montoDescuentoSeguro > 0 ? 'pendiente' : 'ninguno';
                limpiarAutorizacion = true;
            }
        }

        await repo.actualizarOrden(ot, {
            patente, kilometraje, fecha_apertura, fecha_cierre, es_garantia, es_no_iveco,
            tiempo_asignado_horas, tiempo_facturado_horas, monto_repuestos, monto_mano_obra,
            monto_repuestos_garantia, monto_mano_obra_garantia,
            montoDescuentoAEnviar: seEnviaDescuento ? montoDescuentoSeguro : null,
            descuentoMotivoAEnviar: seEnviaDescuento ? (descuento_motivo || '').trim() : null,
            descuentoEstadoNuevo, limpiarAutorizacion
        });
    });
}

async function autorizarDescuento(ot, aprobado, autorizadorId) {
    const orden = await repo.obtenerEstadoDescuento(ot);
    if (!orden) {
        const err = new Error('OT no encontrada');
        err.status = 404;
        throw err;
    }
    if (!(Number(orden.monto_descuento) > 0)) {
        const err = new Error('Esta OT no tiene un descuento cargado para autorizar.');
        err.status = 400;
        throw err;
    }
    await repo.autorizarDescuento(ot, aprobado ? 'autorizado' : 'rechazado', autorizadorId);
}

async function cambiarEstadoOrden(ot, estado) {
    await withTransaction(async () => {
        await cambiarEstado(ot, estado);
        if (estado === 'Finalizada') await repo.marcarCerradaConFecha(ot);
        else await repo.reabrirControlYFecha(ot);
    });
}

async function actualizarExplicacion(ot, causa) {
    await withTransaction(async () => {
        await repo.upsertExplicacion(ot, causa);
    });
}

async function controlar(ot, jefe_legajo) {
    await withTransaction(async () => {
        await repo.controlarOrden(ot, jefe_legajo);
        await cambiarEstado(ot, 'Finalizada');
        // Cerrar forzosamente actividades colgadas del mecánico
        await requireActividadesRepo().cerrarPorJefe(ot);
    });
}

async function agregarAporte(ot, legajo, actividades, horas) {
    await withTransaction(async () => {
        await repo.insertarAporte(ot, legajo, actividades, horas);
        if (horas) await recalcularTiempoEmpleado(ot);
    });
}

async function obtenerExplicacionDetalle(ot) {
    const orden = await repo.obtenerConJoinsYAsesor(ot);
    const explicacion = await repo.explicacion(ot);
    const aportes = await repo.aportesOrdenados(ot);
    const jefe = orden.jefe_legajo ? await repo.obtenerJefe(orden.jefe_legajo) : null;
    return { orden, explicacion, aportes, jefe, controlada: !!orden.controlada };
}

async function editarAporte(id, actividades, horas) {
    await withTransaction(async () => {
        const aporte = await repo.obtenerAporte(id);
        if (!aporte) throw new Error('Aporte no encontrado');
        await repo.actualizarAporte(id, actividades, horas);
        await recalcularTiempoEmpleado(aporte.ot);
    });
}

async function agregarCargoOT(ot, datos) {
    return await withTransaction(async () => {
        let costo_interno_total = 0;
        let precio_venta = Number(datos.precio_venta_unitario) || 0;
        const cantidadRequerida = Number(datos.cantidad);

        if (datos.tipo_cargo === 'Catalogo') {
            const repuesto = await repuestosRepo.obtenerPorId(datos.catalogo_id);
            if (!repuesto) throw new Error('Repuesto no encontrado en catálogo.');
            if (repuesto.stock_actual < cantidadRequerida) throw new Error(`Stock insuficiente. Disponible: ${repuesto.stock_actual}`);

            // CAMBIO: Respetamos el precio de venta manual que mandó el asesor. 
            // Si por error mandaron 0 o nulo, usamos el sugerido del catálogo.
            precio_venta = precio_venta > 0 ? precio_venta : repuesto.precio_venta_actual; 
            
            let restante = cantidadRequerida;
            let stockCorriente = repuesto.stock_actual;

            // Extraer de lotes FIFO
            const lotes = await repuestosRepo.obtenerLotesDisponibles(repuesto.id);
            for (const lote of lotes) {
                if (restante <= 0) break;
                const aDescontar = Math.min(lote.cantidad_disponible, restante);
                
                await repuestosRepo.consumirStockLote(lote.id, lote.cantidad_disponible - aDescontar);
                costo_interno_total += (aDescontar * lote.costo_unitario);
                restante -= aDescontar;
                stockCorriente -= aDescontar;

                // Auditoría en Kardex usando el precio cobrado en mostrador
                await repuestosRepo.insertarMovimientoKardex({
                    catalogo_id: repuesto.id,
                    lote_id: lote.id,
                    tipo_movimiento: 'Salida_OT',
                    cantidad: -aDescontar,
                    costo_unitario: lote.costo_unitario,
                    precio_venta: precio_venta, 
                    saldo_stock: stockCorriente,
                    referencia: `OT-${ot}`,
                    legajo_usuario: datos.legajo_cargo
                });
            }

            await repuestosRepo.recalcularStockCatalogo(repuesto.id);
            // Sobrescribimos datos para asegurar consistencia meticulosa de la lista de materiales
            datos.np_referencia = repuesto.np;
            datos.descripcion_cargo = repuesto.descripcion;

        } else {
            // Directo o Terceros (sin gestión de lotes)
            costo_interno_total = Number(datos.costo_interno_total) || 0;
        }

        await repo.insertarCargoOT({
            ...datos, ot, costo_interno_total, precio_venta_unitario: precio_venta
        });

        await repo.recalcularMontosRepuestosOT(ot);
        return { status: 'Cargo registrado y procesado correctamente' };
    });
}

async function listarCargosOT(ot) {
    return await repo.listarCargosPorOT(ot);
}

module.exports = {
    repository: repo,
    cambiarEstado,
    sincronizarEstadoOT,
    recalcularTiempoEmpleado,
    listar,
    historialPorPatente,
    obtenerDetalle,
    crear,
    actualizar,
    autorizarDescuento,
    cambiarEstadoOrden,
    actualizarExplicacion,
    controlar,
    agregarAporte,
    obtenerExplicacionDetalle,
    editarAporte,
    agregarCargoOT,
    listarCargosOT
};
