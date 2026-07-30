const { run, all, get } = require('../../db/connection');

const MONTOS_EXPR = `(COALESCE(o.monto_repuestos,0) + COALESCE(o.monto_mano_obra,0) + COALESCE(o.monto_repuestos_garantia,0) + COALESCE(o.monto_mano_obra_garantia,0) - (CASE WHEN o.descuento_estado = 'autorizado' THEN COALESCE(o.monto_descuento,0) ELSE 0 END))`;

// Orden dinámico con whitelist de columnas (evita inyección SQL).
// "mecanico" es un alias de subquery del SELECT; SQLite permite ordenar por el alias directamente.
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

// Construye WHERE/params a partir de los filtros ya validados que le pasa el service.
function construirFiltro(filtros) {
    let where = " WHERE o.ot != '0000'";
    const params = [];

    if (filtros.estado === 'activas') where += ` AND o.estado_actual != 'Finalizada'`;
    else if (filtros.estado === 'finalizadas') where += ` AND o.estado_actual = 'Finalizada'`;
    else if (filtros.estado) { where += ` AND o.estado_actual = ?`; params.push(filtros.estado); }

    if (filtros.garantia !== undefined) { where += ` AND o.es_garantia = ?`; params.push(filtros.garantia); }

    // Filtro de facturación: usa la misma expresión de montos que OTTable.vue (tieneMontos)
    // para que el criterio sea consistente entre lo que se ve en la tabla y lo que filtra el backend.
    // El descuento sólo impacta la facturación una vez AUTORIZADO por un admin; mientras esté
    // "pendiente" no se resta, para no reducir facturación sin aprobación.
    if (filtros.facturacion === 'facturadas') where += ` AND ${MONTOS_EXPR} > 0`;
    else if (filtros.facturacion === 'pendientes') where += ` AND ${MONTOS_EXPR} = 0`;

    if (filtros.busqueda) {
        where += ` AND (o.ot LIKE ? OR o.patente LIKE ? OR c.nombre LIKE ?)`;
        const q = `%${filtros.busqueda}%`;
        params.push(q, q, q);
    }

    return { where, params };
}

function construirOrderBy(sortBy, sortDir) {
    const sortCol = ORDENABLES[sortBy];
    const dir = (sortDir || '').toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    return sortCol
        ? `ORDER BY ${sortCol} ${dir}, CAST(o.ot AS INTEGER) DESC`
        : `ORDER BY CAST(o.ot AS INTEGER) DESC, o.fecha_apertura DESC`;
}

async function contar(filtros) {
    const { where, params } = construirFiltro(filtros);
    const row = await get(`SELECT COUNT(*) AS total FROM ordenes o JOIN unidades u ON o.patente = u.patente JOIN clientes c ON u.cliente_id = c.id ${where}`, params);
    return row.total;
}

function listar(filtros, limit, offset) {
    const { where, params } = construirFiltro(filtros);
    const orderBy = construirOrderBy(filtros.sortBy, filtros.sortDir);
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
    return all(sql, [...params, limit, offset]);
}

function historialPorPatente(patente) {
    return all(`SELECT o.ot, c.nombre AS cliente, u.unidad, o.fecha_apertura, o.fecha_cierre, o.estado_actual, o.monto_repuestos, o.monto_mano_obra, o.monto_repuestos_garantia, o.monto_mano_obra_garantia, o.es_garantia FROM ordenes o JOIN unidades u ON o.patente = u.patente JOIN clientes c ON u.cliente_id = c.id WHERE o.patente = ? ORDER BY CAST(o.ot AS INTEGER) DESC`, [patente]);
}

function obtenerConJoins(ot) {
    return get(`SELECT o.*, u.unidad, c.nombre AS cliente FROM ordenes o JOIN unidades u ON o.patente = u.patente JOIN clientes c ON u.cliente_id = c.id WHERE o.ot = ?`, [ot]);
}

function obtenerConJoinsYAsesor(ot) {
    return get(`SELECT o.*, c.nombre AS cliente, u.unidad, l.nombre AS nombre_asesor FROM ordenes o JOIN unidades u ON o.patente = u.patente JOIN clientes c ON u.cliente_id = c.id LEFT JOIN legajos l ON o.asesor_legajo = l.legajo WHERE o.ot = ?`, [ot]);
}

function asignaciones(ot) {
    return all(`SELECT a.*, l.nombre FROM asignaciones a JOIN legajos l ON a.legajo_mecanico = l.legajo WHERE a.ot = ?`, [ot]);
}

function asegurarAsignacion(ot, legajo) {
    return run(`INSERT INTO asignaciones (ot, legajo_mecanico) SELECT ?, ? WHERE NOT EXISTS (SELECT 1 FROM asignaciones WHERE ot = ? AND legajo_mecanico = ?)`, [ot, legajo, ot, legajo]);
}

function explicacion(ot) {
    return get(`SELECT * FROM explicaciones WHERE ot = ?`, [ot]);
}

function upsertExplicacion(ot, causa) {
    return (async () => {
        const existe = await explicacion(ot);
        if (existe) return run(`UPDATE explicaciones SET causa = ? WHERE ot = ?`, [causa, ot]);
        return run(`INSERT INTO explicaciones (ot, causa) VALUES (?, ?)`, [ot, causa]);
    })();
}

function aportes(ot) {
    return all(`SELECT ap.*, l.nombre, l.firma_path FROM aportes ap JOIN legajos l ON ap.legajo = l.legajo WHERE ap.ot = ?`, [ot]);
}

function aportesOrdenados(ot) {
    return all(`SELECT ap.*, l.nombre, l.firma_path FROM aportes ap JOIN legajos l ON ap.legajo = l.legajo WHERE ap.ot = ? ORDER BY ap.fecha_aporte ASC`, [ot]);
}

function insertarAporte(ot, legajo, actividades, horas) {
    return run(`INSERT INTO aportes (ot, legajo, actividades, horas) VALUES (?, ?, ?, ?)`, [ot, legajo, actividades, horas || 0]);
}

function obtenerAporte(id) {
    return get(`SELECT ot FROM aportes WHERE id = ?`, [id]);
}

function actualizarAporte(id, actividades, horas) {
    return run(`UPDATE aportes SET actividades = ?, horas = ? WHERE id = ?`, [actividades, horas, id]);
}

function historialEstados(ot) {
    return all(`SELECT * FROM estados_historial WHERE ot = ? ORDER BY id`, [ot]);
}

function tiemposActividad(ot) {
    return all(`SELECT ta.* FROM tiempos_actividad ta JOIN actividades a ON ta.actividad_id = a.id WHERE a.ot = ?`, [ot]);
}

function obtenerJefe(legajo) {
    return get(`SELECT legajo, nombre, firma_path FROM legajos WHERE legajo = ?`, [legajo]);
}

// -- clientes / unidades --

function buscarClientePorNombre(nombre) {
    return get(`SELECT id FROM clientes WHERE nombre = ?`, [nombre]);
}

function crearCliente(nombre) {
    return run(`INSERT INTO clientes (nombre) VALUES (?)`, [nombre]);
}

async function obtenerOCrearCliente(nombre) {
    const nombreNormalizado = nombre.toUpperCase();
    let cli = await buscarClientePorNombre(nombreNormalizado);
    if (!cli) {
        await crearCliente(nombreNormalizado);
        cli = await buscarClientePorNombre(nombreNormalizado);
    }
    return cli;
}

function buscarUnidadPorPatente(patente) {
    return get(`SELECT * FROM unidades WHERE patente = ?`, [patente]);
}

function crearUnidad(patente, clienteId, unidad) {
    return run(`INSERT INTO unidades (patente, cliente_id, unidad) VALUES (?, ?, ?)`, [patente, clienteId, unidad]);
}

function actualizarUnidad(patente, clienteId, unidad) {
    return run(`UPDATE unidades SET cliente_id = ?, unidad = ? WHERE patente = ?`, [clienteId, unidad, patente]);
}

function actualizarUnidadParcial(patente, clienteId, unidad) {
    return run(`UPDATE unidades SET cliente_id = ?, unidad = COALESCE(?, unidad) WHERE patente = ?`, [clienteId, unidad, patente]);
}

async function asegurarClienteYUnidad(cliente, patente, unidad, { parcial = false } = {}) {
    const cli = await obtenerOCrearCliente(cliente);
    const unidadExistente = await buscarUnidadPorPatente(patente);
    if (unidadExistente) {
        if (parcial) await actualizarUnidadParcial(patente, cli.id, unidad);
        else await actualizarUnidad(patente, cli.id, unidad);
    } else {
        await crearUnidad(patente, cli.id, unidad);
    }
    return cli;
}

// -- ordenes --

function crearOrden(datos) {
    const { ot, patente, kilometraje, asesor_legajo, fechaAperturaSegura, es_garantia, es_no_iveco, tiempo_asignado_horas, tiempo_facturado_horas, monto_repuestos, monto_mano_obra, monto_repuestos_garantia, monto_mano_obra_garantia, montoDescuentoSeguro, descuento_motivo, descuentoEstado } = datos;
    return run(
        `INSERT INTO ordenes (ot, patente, kilometraje, asesor_legajo, fecha_apertura, es_garantia, es_no_iveco, tiempo_asignado_horas, tiempo_facturado_horas, monto_repuestos, monto_mano_obra, monto_repuestos_garantia, monto_mano_obra_garantia, monto_descuento, descuento_motivo, descuento_estado) VALUES (?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [ot, patente, kilometraje || '', asesor_legajo, fechaAperturaSegura, es_garantia ? 1 : 0, es_no_iveco ? 1 : 0, tiempo_asignado_horas || 0, tiempo_facturado_horas || 0, monto_repuestos || 0, monto_mano_obra || 0, monto_repuestos_garantia || 0, monto_mano_obra_garantia || 0, montoDescuentoSeguro, (descuento_motivo || '').trim(), descuentoEstado]
    );
}

function obtenerMontoDescuento(ot) {
    return get(`SELECT monto_descuento FROM ordenes WHERE ot = ?`, [ot]);
}

function obtenerEstadoDescuento(ot) {
    return get(`SELECT monto_descuento, descuento_estado FROM ordenes WHERE ot = ?`, [ot]);
}

function actualizarOrden(ot, datos) {
    const { patente, kilometraje, fecha_apertura, fecha_cierre, es_garantia, es_no_iveco, tiempo_asignado_horas, tiempo_facturado_horas, monto_repuestos, monto_mano_obra, monto_repuestos_garantia, monto_mano_obra_garantia, montoDescuentoAEnviar, descuentoMotivoAEnviar, descuentoEstadoNuevo, limpiarAutorizacion } = datos;
    return run(
        `UPDATE ordenes SET patente = COALESCE(?, patente), kilometraje = COALESCE(?, kilometraje), fecha_apertura = COALESCE(?, fecha_apertura), fecha_cierre = COALESCE(?, fecha_cierre), es_garantia = COALESCE(?, es_garantia), es_no_iveco = COALESCE(?, es_no_iveco), tiempo_asignado_horas = COALESCE(?, tiempo_asignado_horas), tiempo_facturado_horas = COALESCE(?, tiempo_facturado_horas), monto_repuestos = COALESCE(?, monto_repuestos), monto_mano_obra = COALESCE(?, monto_mano_obra), monto_repuestos_garantia = COALESCE(?, monto_repuestos_garantia), monto_mano_obra_garantia = COALESCE(?, monto_mano_obra_garantia), monto_descuento = COALESCE(?, monto_descuento), descuento_motivo = COALESCE(?, descuento_motivo), descuento_estado = COALESCE(?, descuento_estado), descuento_autorizado_por = CASE WHEN ? = 1 THEN NULL ELSE descuento_autorizado_por END, descuento_autorizado_en = CASE WHEN ? = 1 THEN NULL ELSE descuento_autorizado_en END WHERE ot = ?`,
        [patente, kilometraje, fecha_apertura, fecha_cierre, es_garantia !== undefined ? (es_garantia ? 1 : 0) : null, es_no_iveco !== undefined ? (es_no_iveco ? 1 : 0) : null, tiempo_asignado_horas, tiempo_facturado_horas, monto_repuestos, monto_mano_obra, monto_repuestos_garantia, monto_mano_obra_garantia, montoDescuentoAEnviar, descuentoMotivoAEnviar, descuentoEstadoNuevo, limpiarAutorizacion ? 1 : 0, limpiarAutorizacion ? 1 : 0, ot]
    );
}

function autorizarDescuento(ot, estado, autorizadorId) {
    return run(`UPDATE ordenes SET descuento_estado = ?, descuento_autorizado_por = ?, descuento_autorizado_en = CURRENT_TIMESTAMP WHERE ot = ?`, [estado, autorizadorId, ot]);
}

function actualizarJefe(ot, jefe_legajo) {
    return run(`UPDATE ordenes SET jefe_legajo = ? WHERE ot = ?`, [jefe_legajo, ot]);
}

function controlarOrden(ot, jefe_legajo) {
    return run(`UPDATE ordenes SET controlada = 1, jefe_legajo = ?, fecha_cierre = CURRENT_TIMESTAMP WHERE ot = ?`, [jefe_legajo, ot]);
}

function marcarCerradaConFecha(ot) {
    return run(`UPDATE ordenes SET fecha_cierre = CURRENT_TIMESTAMP WHERE ot = ?`, [ot]);
}

function reabrirControlYFecha(ot) {
    return run(`UPDATE ordenes SET controlada = 0, fecha_cierre = NULL WHERE ot = ?`, [ot]);
}

function obtenerEstadoActual(ot) {
    return get(`SELECT estado_actual FROM ordenes WHERE ot = ?`, [ot]);
}

function actualizarEstadoActual(ot, estado) {
    return run(`UPDATE ordenes SET estado_actual = ? WHERE ot = ?`, [estado, ot]);
}

function actividadesPorOt(ot) {
    return all(`SELECT estado FROM actividades WHERE ot = ?`, [ot]);
}

function recalcularTiempoEmpleadoSQL(ot) {
    return run(`UPDATE ordenes SET tiempo_empleado_horas = ROUND(COALESCE((SELECT SUM(tiempo_real) FROM actividades WHERE ot = ?), 0) + COALESCE((SELECT SUM(horas) FROM aportes WHERE ot = ?), 0), 1) WHERE ot = ?`, [ot, ot, ot]);
}

// -- estados_historial --

function estadoAbierto(ot) {
    return get(`SELECT id, ts_desde FROM estados_historial WHERE ot = ? AND ts_hasta IS NULL ORDER BY id DESC LIMIT 1`, [ot]);
}

function cerrarEstadoHistorial(id, ts_hasta, minutos) {
    return run(`UPDATE estados_historial SET ts_hasta = ?, minutos = ? WHERE id = ?`, [ts_hasta, minutos, id]);
}

function insertarEstadoHistorial(ot, estado) {
    return run(`INSERT INTO estados_historial (ot, estado, ts_desde) VALUES (?, ?, CURRENT_TIMESTAMP)`, [ot, estado]);
}

module.exports = {
    MONTOS_EXPR,
    contar, listar, historialPorPatente, obtenerConJoins, obtenerConJoinsYAsesor,
    asignaciones, asegurarAsignacion, explicacion, upsertExplicacion, aportes, aportesOrdenados,
    insertarAporte, obtenerAporte, actualizarAporte, historialEstados, tiemposActividad, obtenerJefe,
    obtenerOCrearCliente, buscarUnidadPorPatente, crearUnidad, actualizarUnidad, actualizarUnidadParcial,
    asegurarClienteYUnidad,
    crearOrden, obtenerMontoDescuento, obtenerEstadoDescuento, actualizarOrden, autorizarDescuento,
    actualizarJefe, controlarOrden, marcarCerradaConFecha, reabrirControlYFecha,
    obtenerEstadoActual, actualizarEstadoActual, actividadesPorOt, recalcularTiempoEmpleadoSQL,
    estadoAbierto, cerrarEstadoHistorial, insertarEstadoHistorial
};
