'use strict';
// ─── SERVICE DE ÓRDENES DE TRABAJO ──────────────────────────────────
// Toda la lógica de negocio y las queries de OTs viven acá. routes/ordenes.js
// es apenas: parsear req -> llamar a esta función -> mandar res. Así el
// archivo de rutas se puede leer de un vistazo (qué endpoints hay) sin
// tener que bucear entre SQL para entender el flujo HTTP, y esta lógica
// se puede probar/reusar sin pasar por Express.

const { run, all, get, cambiarEstado, recalcularTiempoEmpleado, withTransaction } = require('../config/database');

// Filtro de facturación: usa la misma expresión de montos que OTTable.vue
// (tieneMontos) para que el criterio sea consistente entre lo que se ve
// en la tabla y lo que filtra el backend. El descuento sólo impacta la
// facturación una vez AUTORIZADO por un admin; mientras esté "pendiente"
// no se resta, para no reducir facturación sin aprobación.
const MONTOS_EXPR = `(COALESCE(o.monto_repuestos,0) + COALESCE(o.monto_mano_obra,0) + COALESCE(o.monto_repuestos_garantia,0) + COALESCE(o.monto_mano_obra_garantia,0) - (CASE WHEN o.descuento_estado = 'autorizado' THEN COALESCE(o.monto_descuento,0) ELSE 0 END))`;

// Orden dinámico con whitelist de columnas (evita inyección SQL).
// "mecanico" es un alias de subquery del SELECT; SQLite permite
// ordenar por el alias directamente.
const ORDENABLES = {
    ot: 'CAST(o.ot AS INTEGER)',
    cliente: 'c.nombre',
    patente: 'o.patente',
    unidad: 'u.unidad',
    mecanico: 'mecanico',
    estado: 'o.estado_actual',
    garantia: 'o.es_garantia',
    controlada: 'o.controlada',
    facturacion: MONTOS_EXPR,
    fecha_apertura: 'o.fecha_apertura',
    fecha_cierre: 'o.fecha_cierre'
};

async function listar(query) {
    const page = Math.max(1, parseInt(query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(query.limit) || 25));
    const offset = (page - 1) * limit;

    let where = " WHERE o.ot != '0000'";
    const params = [];

    if (query.estado === 'activas') where += ` AND o.estado_actual != 'Finalizada'`;
    else if (query.estado === 'finalizadas') where += ` AND o.estado_actual = 'Finalizada'`;
    else if (query.estado) { where += ` AND o.estado_actual = ?`; params.push(query.estado); }

    if (query.garantia !== undefined) { where += ` AND o.es_garantia = ?`; params.push(query.garantia); }

    if (query.facturacion === 'facturadas') where += ` AND ${MONTOS_EXPR} > 0`;
    else if (query.facturacion === 'pendientes') where += ` AND ${MONTOS_EXPR} = 0`;

    if (query.busqueda) {
        where += ` AND (o.ot LIKE ? OR o.patente LIKE ? OR c.nombre LIKE ?)`;
        const q = `%${query.busqueda}%`;
        params.push(q, q, q);
    }

    const totalRow = await get(`SELECT COUNT(*) AS total FROM ordenes o JOIN unidades u ON o.patente = u.patente JOIN clientes c ON u.cliente_id = c.id ${where}`, params);
    const total = totalRow.total;

    const sortCol = ORDENABLES[query.sortBy];
    const sortDir = (query.sortDir || '').toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    const orderBy = sortCol
        ? `ORDER BY ${sortCol} ${sortDir}, CAST(o.ot AS INTEGER) DESC`
        : `ORDER BY CAST(o.ot AS INTEGER) DESC, o.fecha_apertura DESC`;

    const sql = `
        SELECT o.*, u.unidad, c.nombre AS cliente, l.nombre AS nombre_asesor,
               (SELECT leg.nombre FROM asignaciones a JOIN legajos leg ON a.legajo_mecanico = leg.legajo WHERE a.ot = o.ot ORDER BY a.id DESC LIMIT 1) AS mecanico,
               (SELECT COUNT(*) FROM actividades WHERE ot = o.ot AND estado != 'Finalizada') AS tareas_pendientes,
               (SELECT COUNT(*) FROM actividades WHERE ot = o.ot) AS total_tareas
        FROM ordenes o 
        JOIN unidades u ON o.patente = u.patente
        JOIN clientes c ON u.cliente_id = c.id
        LEFT JOIN legajos l ON o.asesor_legajo = l.legajo 
        ${where} ${orderBy} LIMIT ? OFFSET ?
    `;
    const rows = await all(sql, [...params, limit, offset]);

    return { data: rows, total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) };
}

async function historialPorPatente(patente) {
    return all(`SELECT o.ot, c.nombre AS cliente, u.unidad, o.fecha_apertura, o.fecha_cierre, o.estado_actual, o.monto_repuestos, o.monto_mano_obra, o.monto_repuestos_garantia, o.monto_mano_obra_garantia, o.es_garantia FROM ordenes o JOIN unidades u ON o.patente = u.patente JOIN clientes c ON u.cliente_id = c.id WHERE o.patente = ? ORDER BY CAST(o.ot AS INTEGER) DESC`, [patente]);
}

async function obtenerDetalle(ot) {
    const orden = await get(`SELECT o.*, u.unidad, c.nombre AS cliente FROM ordenes o JOIN unidades u ON o.patente = u.patente JOIN clientes c ON u.cliente_id = c.id WHERE o.ot = ?`, [ot]);
    if (!orden) return null;

    const asignaciones = await all(`SELECT a.*, l.nombre FROM asignaciones a JOIN legajos l ON a.legajo_mecanico = l.legajo WHERE a.ot = ?`, [ot]);
    const actividades = await all(`
        SELECT a.*, 
        COALESCE(
            (SELECT GROUP_CONCAT(l.nombre, ', ') FROM actividad_mecanicos am JOIN legajos l ON am.legajo_mecanico = l.legajo WHERE am.actividad_id = a.id),
            (SELECT nombre FROM legajos WHERE legajo = a.legajo_mecanico)
        ) AS nombre_mecanico,
        COALESCE(
            (SELECT GROUP_CONCAT(am.legajo_mecanico, ',') FROM actividad_mecanicos am WHERE am.actividad_id = a.id),
            a.legajo_mecanico
        ) AS legajos_mecanicos,
        -- Detalle por mecánico: "Nombre|Estado|Horas" por integrante, separado por ';;'.
        -- Permite que el Jefe vea quién ya terminó su parte y quién sigue trabajando,
        -- en vez de solo el estado agregado de la tarea.
        (SELECT GROUP_CONCAT(l.nombre || '|' || am.estado || '|' || am.tiempo_real, ';;')
         FROM actividad_mecanicos am JOIN legajos l ON am.legajo_mecanico = l.legajo
         WHERE am.actividad_id = a.id) AS equipo_detalle
        FROM actividades a 
        WHERE a.ot = ?
    `, [ot]);
    const explicacion = await get(`SELECT * FROM explicaciones WHERE ot = ?`, [ot]);
    const aportes = await all(`SELECT ap.*, l.nombre, l.firma_path FROM aportes ap JOIN legajos l ON ap.legajo = l.legajo WHERE ap.ot = ?`, [ot]);
    const historial = await all(`SELECT * FROM estados_historial WHERE ot = ? ORDER BY id`, [ot]);
    const tiempos_actividad = await all(`SELECT ta.* FROM tiempos_actividad ta JOIN actividades a ON ta.actividad_id = a.id WHERE a.ot = ?`, [ot]);

    return { ...orden, asignaciones, actividades, explicacion, aportes, historial, tiempos_actividad };
}

async function crear(body) {
    const { ot, cliente, patente, unidad, kilometraje, asesor_legajo, fecha_apertura, es_garantia, es_no_iveco, tiempo_asignado_horas, tiempo_facturado_horas, monto_repuestos, monto_mano_obra, monto_repuestos_garantia, monto_mano_obra_garantia, monto_descuento, descuento_motivo } = body;

    const montoDescuentoSeguro = Number(monto_descuento) > 0 ? Number(monto_descuento) : 0;
    if (montoDescuentoSeguro > 0 && !(descuento_motivo && descuento_motivo.trim())) {
        const error = new Error('Para cargar un descuento/bonificación es obligatorio indicar el motivo.');
        error.status = 400;
        throw error;
    }

    await withTransaction(async () => {
        let cli = await get(`SELECT id FROM clientes WHERE nombre = ?`, [cliente.toUpperCase()]);
        if (!cli) {
            await run(`INSERT INTO clientes (nombre) VALUES (?)`, [cliente.toUpperCase()]);
            cli = await get(`SELECT id FROM clientes WHERE nombre = ?`, [cliente.toUpperCase()]);
        }

        const unidadExistente = await get(`SELECT * FROM unidades WHERE patente = ?`, [patente]);
        if (unidadExistente) {
            await run(`UPDATE unidades SET cliente_id = ?, unidad = ? WHERE patente = ?`, [cli.id, unidad, patente]);
        } else {
            await run(`INSERT INTO unidades (patente, cliente_id, unidad) VALUES (?, ?, ?)`, [patente, cli.id, unidad]);
        }

        const fechaAperturaSegura = fecha_apertura ? new Date(fecha_apertura).toISOString().replace('T', ' ').substring(0, 19) : null;
        const descuentoEstado = montoDescuentoSeguro > 0 ? 'pendiente' : 'ninguno';

        await run(
            `INSERT INTO ordenes (ot, patente, kilometraje, asesor_legajo, fecha_apertura, es_garantia, es_no_iveco, tiempo_asignado_horas, tiempo_facturado_horas, monto_repuestos, monto_mano_obra, monto_repuestos_garantia, monto_mano_obra_garantia, monto_descuento, descuento_motivo, descuento_estado) VALUES (?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [ot, patente, kilometraje || '', asesor_legajo, fechaAperturaSegura, es_garantia ? 1 : 0, es_no_iveco ? 1 : 0, tiempo_asignado_horas || 0, tiempo_facturado_horas || 0, monto_repuestos || 0, monto_mano_obra || 0, monto_repuestos_garantia || 0, monto_mano_obra_garantia || 0, montoDescuentoSeguro, (descuento_motivo || '').trim(), descuentoEstado]
        );
        await run(`INSERT INTO estados_historial (ot, estado, ts_desde) VALUES (?, 'En Espera', CURRENT_TIMESTAMP)`, [ot]);
    });

    return { status: 'OT creada', ot };
}

async function actualizar(ot, body) {
    const { cliente, patente, unidad, kilometraje, fecha_apertura, fecha_cierre, es_garantia, es_no_iveco, tiempo_asignado_horas, tiempo_facturado_horas, monto_repuestos, monto_mano_obra, monto_repuestos_garantia, monto_mano_obra_garantia, monto_descuento, descuento_motivo } = body;

    const seEnviaDescuento = monto_descuento !== undefined;
    const montoDescuentoSeguro = seEnviaDescuento ? (Number(monto_descuento) > 0 ? Number(monto_descuento) : 0) : null;
    if (seEnviaDescuento && montoDescuentoSeguro > 0 && !(descuento_motivo && descuento_motivo.trim())) {
        const error = new Error('Para cargar un descuento/bonificación es obligatorio indicar el motivo.');
        error.status = 400;
        throw error;
    }

    await withTransaction(async () => {
        if (cliente && patente) {
            let cli = await get(`SELECT id FROM clientes WHERE nombre = ?`, [cliente.toUpperCase()]);
            if (!cli) {
                await run(`INSERT INTO clientes (nombre) VALUES (?)`, [cliente.toUpperCase()]);
                cli = await get(`SELECT id FROM clientes WHERE nombre = ?`, [cliente.toUpperCase()]);
            }
            const unidadExistente = await get(`SELECT * FROM unidades WHERE patente = ?`, [patente]);
            if (unidadExistente) {
                await run(`UPDATE unidades SET cliente_id = ?, unidad = COALESCE(?, unidad) WHERE patente = ?`, [cli.id, unidad, patente]);
            } else {
                await run(`INSERT INTO unidades (patente, cliente_id, unidad) VALUES (?, ?, ?)`, [patente, cli.id, unidad]);
            }
        }

        // Si se está enviando un monto de descuento, comparamos contra el valor actual:
        // si cambió (o es nuevo), el descuento vuelve a "pendiente" y se limpia la autorización
        // previa, porque un descuento ya autorizado no puede modificarse sin volver a aprobarse.
        let descuentoEstadoNuevo = null, limpiarAutorizacion = false;
        if (seEnviaDescuento) {
            const actual = await get(`SELECT monto_descuento FROM ordenes WHERE ot = ?`, [ot]);
            const cambioMonto = !actual || Number(actual.monto_descuento || 0) !== montoDescuentoSeguro;
            if (cambioMonto) {
                descuentoEstadoNuevo = montoDescuentoSeguro > 0 ? 'pendiente' : 'ninguno';
                limpiarAutorizacion = true;
            }
        }

        await run(
            `UPDATE ordenes SET patente = COALESCE(?, patente), kilometraje = COALESCE(?, kilometraje), fecha_apertura = COALESCE(?, fecha_apertura), fecha_cierre = COALESCE(?, fecha_cierre), es_garantia = COALESCE(?, es_garantia), es_no_iveco = COALESCE(?, es_no_iveco), tiempo_asignado_horas = COALESCE(?, tiempo_asignado_horas), tiempo_facturado_horas = COALESCE(?, tiempo_facturado_horas), monto_repuestos = COALESCE(?, monto_repuestos), monto_mano_obra = COALESCE(?, monto_mano_obra), monto_repuestos_garantia = COALESCE(?, monto_repuestos_garantia), monto_mano_obra_garantia = COALESCE(?, monto_mano_obra_garantia), monto_descuento = COALESCE(?, monto_descuento), descuento_motivo = COALESCE(?, descuento_motivo), descuento_estado = COALESCE(?, descuento_estado), descuento_autorizado_por = CASE WHEN ? = 1 THEN NULL ELSE descuento_autorizado_por END, descuento_autorizado_en = CASE WHEN ? = 1 THEN NULL ELSE descuento_autorizado_en END WHERE ot = ?`,
            [patente, kilometraje, fecha_apertura, fecha_cierre, es_garantia !== undefined ? (es_garantia ? 1 : 0) : null, es_no_iveco !== undefined ? (es_no_iveco ? 1 : 0) : null, tiempo_asignado_horas, tiempo_facturado_horas, monto_repuestos, monto_mano_obra, monto_repuestos_garantia, monto_mano_obra_garantia, seEnviaDescuento ? montoDescuentoSeguro : null, seEnviaDescuento ? (descuento_motivo || '').trim() : null, descuentoEstadoNuevo, limpiarAutorizacion ? 1 : 0, limpiarAutorizacion ? 1 : 0, ot]
        );
    });

    return { status: 'OT actualizada' };
}

// Autorización de bonificación/descuento — el chequeo de permiso ('ot_autorizar_descuento')
// queda en la ruta, porque depende de req.usuario (una cuestión de HTTP/auth, no de negocio).
async function autorizarDescuento(ot, aprobado, autorizadorId) {
    const orden = await get(`SELECT monto_descuento, descuento_estado FROM ordenes WHERE ot = ?`, [ot]);
    if (!orden) {
        const error = new Error('OT no encontrada');
        error.status = 404;
        throw error;
    }
    if (!(Number(orden.monto_descuento) > 0)) {
        const error = new Error('Esta OT no tiene un descuento cargado para autorizar.');
        error.status = 400;
        throw error;
    }

    await run(
        `UPDATE ordenes SET descuento_estado = ?, descuento_autorizado_por = ?, descuento_autorizado_en = CURRENT_TIMESTAMP WHERE ot = ?`,
        [aprobado ? 'autorizado' : 'rechazado', autorizadorId, ot]
    );
    return { status: aprobado ? 'Descuento autorizado' : 'Descuento rechazado' };
}

async function cambiarEstadoOrden(ot, estado) {
    await withTransaction(async () => {
        await cambiarEstado(ot, estado);
        if (estado === 'Finalizada') await run(`UPDATE ordenes SET fecha_cierre = CURRENT_TIMESTAMP WHERE ot = ?`, [ot]);
        else await run(`UPDATE ordenes SET controlada = 0, fecha_cierre = NULL WHERE ot = ?`, [ot]);
    });
    return { status: 'Estado actualizado', nuevo_estado: estado };
}

async function actualizarExplicacion(ot, causa) {
    await withTransaction(async () => {
        const existe = await get(`SELECT id FROM explicaciones WHERE ot = ?`, [ot]);
        if (existe) {
            await run(`UPDATE explicaciones SET causa = ? WHERE ot = ?`, [causa, ot]);
        } else {
            await run(`INSERT INTO explicaciones (ot, causa) VALUES (?, ?)`, [ot, causa]);
        }
    });
    return { status: 'Explicación actualizada' };
}

async function controlar(ot, jefe_legajo) {
    await withTransaction(async () => {
        await run(`UPDATE ordenes SET controlada = 1, jefe_legajo = ?, fecha_cierre = CURRENT_TIMESTAMP WHERE ot = ?`, [jefe_legajo, ot]);
        await cambiarEstado(ot, 'Finalizada');

        // Cerrar forzosamente actividades colgadas del mecánico
        await run(`UPDATE actividades SET estado = 'Cerrada por Jefe' WHERE ot = ? AND estado NOT IN ('Finalizada', 'Cerrada por Jefe')`, [ot]);
    });
    return { status: 'OT controlada y finalizada' };
}

async function registrarAporte(ot, { legajo, actividades, horas }) {
    await withTransaction(async () => {
        await run(`INSERT INTO aportes (ot, legajo, actividades, horas) VALUES (?, ?, ?, ?)`, [ot, legajo, actividades, horas || 0]);
        if (horas) await recalcularTiempoEmpleado(ot);
    });
    return { status: 'Aporte registrado' };
}

async function obtenerExplicacionCompleta(ot) {
    const orden = await get(`SELECT o.*, c.nombre AS cliente, u.unidad, l.nombre AS nombre_asesor FROM ordenes o JOIN unidades u ON o.patente = u.patente JOIN clientes c ON u.cliente_id = c.id LEFT JOIN legajos l ON o.asesor_legajo = l.legajo WHERE o.ot = ?`, [ot]);
    const explicacion = await get(`SELECT * FROM explicaciones WHERE ot = ?`, [ot]);
    const aportes = await all(`SELECT ap.*, l.nombre, l.firma_path FROM aportes ap JOIN legajos l ON ap.legajo = l.legajo WHERE ap.ot = ? ORDER BY ap.fecha_aporte ASC`, [ot]);
    let jefe = orden.jefe_legajo ? await get(`SELECT legajo, nombre, firma_path FROM legajos WHERE legajo = ?`, [orden.jefe_legajo]) : null;
    return { orden, explicacion, aportes, jefe, controlada: !!orden.controlada };
}

async function actualizarAporte(id, { actividades, horas }) {
    await withTransaction(async () => {
        const aporte = await get(`SELECT ot FROM aportes WHERE id = ?`, [id]);
        if (!aporte) throw new Error('Aporte no encontrado');

        await run(`UPDATE aportes SET actividades = ?, horas = ? WHERE id = ?`, [actividades, horas, id]);
        await recalcularTiempoEmpleado(aporte.ot);
    });
    return { status: 'Aporte corregido exitosamente' };
}

module.exports = {
    listar, historialPorPatente, obtenerDetalle, crear, actualizar, autorizarDescuento,
    cambiarEstadoOrden, actualizarExplicacion, controlar, registrarAporte,
    obtenerExplicacionCompleta, actualizarAporte
};
