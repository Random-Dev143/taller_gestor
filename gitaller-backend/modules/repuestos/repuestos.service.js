const { withTransaction } = require('../../db/connection');
const repo = require('./repuestos.repository');

async function listarCatalogo() { return await repo.listarCatalogo(); }

async function obtenerDetalleRepuesto(np) {
    const repuesto = await repo.obtenerPorNP(np);
    if (!repuesto) { const err = new Error('Repuesto no encontrado.'); err.status = 404; throw err; }
    return repuesto;
}

async function registrarNuevoRepuesto(datos) {
    if (!datos.np || !datos.descripcion) { const err = new Error('NP y descripción obligatorios.'); err.status = 400; throw err; }
    return await withTransaction(async () => {
        const existe = await repo.obtenerPorNP(datos.np);
        if (existe) { const err = new Error(`El repuesto ${datos.np} ya existe.`); err.status = 400; throw err; }
        const resultado = await repo.crearRepuestoMaestro({ ...datos, costo_actual: Number(datos.costo_actual) || 0, margen_ganancia: Number(datos.margen_ganancia) || 40.0 });
        return { id: resultado.lastID, np: datos.np };
    });
}

async function modificarRepuesto(id, datos) {
    return await withTransaction(async () => {
        const existe = await repo.obtenerPorId(id);
        if (!existe) { const err = new Error('Repuesto no encontrado.'); err.status = 404; throw err; }
        const datosSeguros = { ...datos };
        if (datos.costo_actual !== undefined) datosSeguros.costo_actual = Number(datos.costo_actual);
        if (datos.margen_ganancia !== undefined) datosSeguros.margen_ganancia = Number(datos.margen_ganancia);
        await repo.actualizarRepuestoMaestro(id, datosSeguros);
        return { status: 'Repuesto actualizado correctamente' };
    });
}

async function desactivarRepuesto(id) {
    await repo.cambiarEstadoRepuesto(id, 'Inactivo');
    return { status: 'Repuesto desactivado' };
}

// --- NUEVO: Ingreso de Stock ---
async function ingresarStock(catalogoId, datos) {
    const { cantidad, costo_unitario, referencia, legajo_usuario } = datos;
    if (cantidad <= 0) { const err = new Error('La cantidad debe ser mayor a 0'); err.status = 400; throw err; }

    return await withTransaction(async () => {
        const repuesto = await repo.obtenerPorId(catalogoId);
        if (!repuesto) { const err = new Error('Repuesto no encontrado.'); err.status = 404; throw err; }

        const nuevoSaldo = repuesto.stock_actual + cantidad;
        const nuevoPrecioVenta = costo_unitario * (1 + (repuesto.margen_ganancia / 100));

        // 1. Crear el Kardex primero (dejando lote_id nulo momentáneamente)
        const kardex = await repo.insertarMovimientoKardex({
            catalogo_id: catalogoId, lote_id: null, tipo_movimiento: 'Ingreso_Manual',
            cantidad, costo_unitario, precio_venta: nuevoPrecioVenta, saldo_stock: nuevoSaldo,
            referencia, legajo_usuario
        });

        // 2. Crear el Lote referenciando al Kardex
        const lote = await repo.insertarLote({
            catalogo_id: catalogoId, movimiento_ingreso_id: kardex.lastID,
            cantidad_inicial: cantidad, costo_unitario
        });

        // 3. Actualizar Kardex y Catálogo
        await repo.vincularLoteAKardex(kardex.lastID, lote.lastID);
        // FIX: sin margen_ganancia, actualizarRepuestoMaestro calcula
        // precio_venta = costo_actual * (1 + undefined/100) = NaN, que sqlite3
        // graba como NULL — cada ingreso de stock borraba el precio de venta.
        // Se reusa el margen_ganancia ya vigente del repuesto (no cambia acá).
        await repo.actualizarRepuestoMaestro(catalogoId, { costo_actual: costo_unitario, margen_ganancia: repuesto.margen_ganancia });
        await repo.recalcularStockCatalogo(catalogoId);

        return { status: 'Stock ingresado correctamente', lote_id: lote.lastID };
    });
}

module.exports = { listarCatalogo, obtenerDetalleRepuesto, registrarNuevoRepuesto, modificarRepuesto, desactivarRepuesto, ingresarStock };