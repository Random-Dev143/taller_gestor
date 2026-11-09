'use strict';
// ─── SERVICE DE ÓRDENES DE TRABAJO ──────────────────────────────────
// Toda la lógica de negocio y las queries de OTs viven acá. modules/ordenes/ordenes.routes.js
// es apenas: parsear req -> llamar a esta función -> mandar res. Así el
// archivo de rutas se puede leer de un vistazo (qué endpoints hay) sin
// tener que bucear entre SQL para entender el flujo HTTP, y esta lógica
// se puede probar/reusar sin pasar por Express.

const { run, all, get, cambiarEstado, recalcularTiempoEmpleado, withTransaction } = require('../../config/database');

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

    // Solo se filtra con '1' (es garantía) o '0' (no es garantía); cualquier otro
    // valor (vacío, 'todas', etc.) se ignora y trae todas.
    if (query.garantia === '0' || query.garantia === '1') { where += ` AND o.es_garantia = ?`; params.push(Number(query.garantia)); }

    // Rango de fechas opcional (YYYY-MM-DD, en hora local). Se compara contra la
    // fecha de cierre; si la OT no tiene (datos viejos), contra la de apertura.
    // Las fechas se guardan en UTC, por eso 'localtime' antes de comparar el día.
    // Valores con formato inválido se ignoran (igual que `garantia`).
    const fechaValida = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(Date.parse(v));
    const FECHA_REF = `date(COALESCE(o.fecha_cierre, o.fecha_apertura), 'localtime')`;
    if (fechaValida(query.desde)) { where += ` AND ${FECHA_REF} >= ?`; params.push(query.desde); }
    if (fechaValida(query.hasta)) { where += ` AND ${FECHA_REF} <= ?`; params.push(query.hasta); }

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

// Anulación de OTs: la hace el jefe de taller (permiso 'ot_anular'). No borra
// nada: marca la OT, guarda quién/cuándo/por qué y alimenta el motivo
// "Anulada" de la planilla de NPS. Se puede revertir con reactivarOrden.
async function anularOrden(ot, motivo, usuario) {
    const orden = await get(`SELECT ot, anulada FROM ordenes WHERE ot = ?`, [ot]);
    if (!orden) throw Object.assign(new Error('OT no encontrada'), { status: 404 });
    if (ot === '0000') throw Object.assign(new Error('La OT interna 0000 no se puede anular.'), { status: 400 });
    if (orden.anulada) throw Object.assign(new Error('La OT ya está anulada.'), { status: 409 });
    await run(`UPDATE ordenes SET anulada = 1, anulada_motivo = ?, anulada_por = ?, anulada_en = CURRENT_TIMESTAMP WHERE ot = ?`,
        [String(motivo || '').trim(), usuario || '', ot]);
    return { status: 'OT anulada', ot };
}

async function reactivarOrden(ot) {
    const orden = await get(`SELECT ot, anulada FROM ordenes WHERE ot = ?`, [ot]);
    if (!orden) throw Object.assign(new Error('OT no encontrada'), { status: 404 });
    if (!orden.anulada) throw Object.assign(new Error('La OT no está anulada.'), { status: 409 });
    await run(`UPDATE ordenes SET anulada = 0, anulada_motivo = '', anulada_por = '', anulada_en = NULL WHERE ot = ?`, [ot]);
    return { status: 'OT reactivada', ot };
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
    // Se trae también el nombre del mecánico (l.nombre) junto a cada
    // registro de tiempo, no solo el legajo: el frontend lo usa para
    // agrupar visualmente los logueos por mecánico cuando una actividad
    // tiene más de uno asignado — antes se mostraban todos mezclados en
    // una sola lista, sin forma de saber a quién correspondía cada fila.
    const tiempos_actividad = await all(`SELECT ta.*, l.nombre AS nombre_mecanico FROM tiempos_actividad ta JOIN actividades a ON ta.actividad_id = a.id LEFT JOIN legajos l ON ta.legajo_mecanico = l.legajo WHERE a.ot = ?`, [ot]);

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
        // Motivo de descarte manual para la planilla de NPS. Solo se admite "Otros"
        // (el resto de los motivos se calculan solos, ver services/nps-motivos.js).
        if (body.motivo_descarte_manual !== undefined) {
            const manual = String(body.motivo_descarte_manual || '').trim();
            if (manual !== '' && manual !== 'Otros') {
                const error = new Error('El motivo manual solo puede ser "Otros" o quedar vacío.');
                error.status = 400;
                throw error;
            }
            await run(`UPDATE ordenes SET motivo_descarte_manual = ? WHERE ot = ?`, [manual, ot]);
        }
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

    // Horas reales trabajadas por cada mecánico en esta OT (suma de todas sus
    // actividades). aportes.horas NO sirve para esto: el aporte se guarda con
    // horas = 0 al finalizar la tarea; el tiempo real vive en
    // actividad_mecanicos.tiempo_real. El segundo SELECT cubre actividades
    // viejas que no tienen filas en actividad_mecanicos.
    const tiempos_mecanicos = await all(`
        SELECT t.legajo, l.nombre, ROUND(SUM(t.horas), 4) AS horas,
               MIN(t.aux) AS es_auxiliar  -- 1 solo si fue auxiliar en TODAS sus actividades de la OT
        FROM (
            SELECT am.legajo_mecanico AS legajo, am.tiempo_real AS horas, am.es_auxiliar AS aux
            FROM actividad_mecanicos am JOIN actividades a ON a.id = am.actividad_id
            WHERE a.ot = ?
            UNION ALL
            SELECT a.legajo_mecanico AS legajo, a.tiempo_real AS horas, 0 AS aux
            FROM actividades a
            WHERE a.ot = ? AND a.legajo_mecanico IS NOT NULL
              AND NOT EXISTS (SELECT 1 FROM actividad_mecanicos am WHERE am.actividad_id = a.id)
        ) t
        LEFT JOIN legajos l ON l.legajo = t.legajo
        GROUP BY t.legajo, l.nombre
        ORDER BY l.nombre
    `, [ot, ot]);

    return { orden, explicacion, aportes, jefe, controlada: !!orden.controlada, tiempos_mecanicos };
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

// ─── CORRECCIÓN DE APORTES HABILITADA POR EL JEFE ────────────────────
// Flujo: el Jefe habilita un aporte puntual -> su autor lo corrige UNA vez -> vuelve a
// quedar bloqueado. (actualizarAporte, de arriba, es el viejo PUT sin reglas y se deja como está.)
const falla = (status, mensaje) => { const e = new Error(mensaje); e.status = status; return e; };

// El Jefe habilita (o cancela la habilitación de) la corrección de un aporte.
async function habilitarCorreccionAporte(id, habilitar, quien) {
    const aporte = await get(`SELECT id FROM aportes WHERE id = ?`, [id]);
    if (!aporte) throw falla(404, 'Aporte no encontrado');

    if (habilitar) {
        await run(`UPDATE aportes SET correccion_habilitada = 1, correccion_habilitada_por = ?, correccion_habilitada_en = CURRENT_TIMESTAMP WHERE id = ?`, [quien || null, id]);
    } else {
        await run(`UPDATE aportes SET correccion_habilitada = 0 WHERE id = ?`, [id]);
    }
    return { status: habilitar ? 'Corrección habilitada' : 'Habilitación cancelada', correccion_habilitada: habilitar ? 1 : 0 };
}

// Aportes de un mecánico que el Jefe habilitó para corregir (lo que ve en su pantalla).
async function listarAportesCorregibles(legajo) {
    return all(`
        SELECT ap.id, ap.ot, ap.actividades, ap.fecha_aporte, ap.correccion_habilitada_en,
               o.patente, u.unidad, c.nombre AS cliente,
               (SELECT l.nombre FROM legajos l WHERE l.legajo = ap.correccion_habilitada_por) AS habilitado_por_nombre
        FROM aportes ap
        JOIN ordenes o ON o.ot = ap.ot
        JOIN unidades u ON u.patente = o.patente
        JOIN clientes c ON c.id = u.cliente_id
        WHERE ap.legajo = ? AND ap.correccion_habilitada = 1
        ORDER BY ap.correccion_habilitada_en DESC, ap.id DESC
    `, [legajo]);
}

// El mecánico corrige SU aporte. Solo se puede si el Jefe lo habilitó, y se usa una vez.
async function corregirAporte(id, { legajo, actividades }) {
    const texto = (actividades === undefined || actividades === null) ? '' : String(actividades).trim();
    if (!legajo) throw falla(400, 'Falta indicar el mecánico.');
    if (!texto) throw falla(400, 'El aporte no puede quedar vacío.');

    await withTransaction(async () => {
        const aporte = await get(`SELECT * FROM aportes WHERE id = ?`, [id]);
        if (!aporte) throw falla(404, 'Aporte no encontrado');
        if (aporte.legajo !== legajo) throw falla(403, 'Solo podés corregir tus propios aportes.');
        if (!aporte.correccion_habilitada) throw falla(403, 'El Jefe de Taller no habilitó la corrección de este aporte.');
        // Si no cambió nada no se gasta la habilitación (así no se pierde por un clic de más).
        if (texto === String(aporte.actividades || '').trim()) throw falla(400, 'No hiciste ningún cambio en el texto.');

        // WHERE correccion_habilitada = 1: si dos pedidos llegan a la vez, solo uno la consume.
        const r = await run(
            `UPDATE aportes SET actividades = ?, texto_original = COALESCE(texto_original, actividades), corregido_en = CURRENT_TIMESTAMP, correccion_habilitada = 0 WHERE id = ? AND correccion_habilitada = 1`,
            [texto, id]
        );
        if (!r.changes) throw falla(403, 'La habilitación ya fue usada.');
    });
    return { status: 'Aporte corregido' };
}

// ─── PANEL DE GARANTÍAS (migración 018) ──────────────────────────────
// "Número de garantía" = número de OT. El panel lista las OT de garantía FINALIZADAS y
// permite cargar/ver los datos del reclamo (fecha, monto solicitado, monto pagado, proforma).

const escaparLike = (t) => t.replace(/[\\%_]/g, (c) => '\\' + c);

// Sin búsqueda: las últimas 30 (por fecha de cierre). Con búsqueda: se busca en TODAS las
// garantías finalizadas (si no, una vieja no se podría encontrar), con un tope de 100.
async function listarGarantias(query = {}) {
    const termino = String(query.busqueda || '').trim();
    const limite = termino
        ? 100
        : Math.min(100, Math.max(1, parseInt(query.limit) || 30));

    let where = `WHERE o.ot != '0000' AND o.es_garantia = 1 AND o.estado_actual = 'Finalizada'`;
    const params = [];
    if (termino) {
        const like = `%${escaparLike(termino)}%`;
        where += ` AND (o.ot LIKE ? ESCAPE '\\' OR o.patente LIKE ? ESCAPE '\\' OR g.numero_proforma LIKE ? ESCAPE '\\')`;
        params.push(like, like, like);
    }

    const base = `
        FROM ordenes o
        JOIN unidades u ON u.patente = o.patente
        JOIN clientes c ON c.id = u.cliente_id
        LEFT JOIN garantias_reclamos g ON g.ot = o.ot
        ${where}`;

    const { total } = await get(`SELECT COUNT(*) AS total ${base}`, params);
    const data = await all(`
        SELECT o.ot, c.nombre AS cliente, o.patente, u.unidad, o.fecha_cierre,
               (COALESCE(o.monto_repuestos_garantia, 0) + COALESCE(o.monto_mano_obra_garantia, 0)) AS monto_ot_garantia,
               g.fecha_reclamo, g.monto_solicitado, g.monto_pagado, g.numero_proforma, g.actualizado_en
        ${base}
        ORDER BY COALESCE(o.fecha_cierre, o.fecha_apertura) DESC, o.ot DESC
        LIMIT ?`, [...params, limite]);

    return { data, total, limite, busqueda: termino };
}

// Alta/modificación del reclamo de una OT de garantía. Un campo que NO viene en el pedido
// se conserva; uno que viene vacío/null se borra.
async function guardarReclamoGarantia(ot, body = {}, quien = null) {
    const orden = await get(`SELECT ot, es_garantia FROM ordenes WHERE ot = ?`, [ot]);
    if (!orden) throw falla(404, 'OT no encontrada');
    if (!orden.es_garantia) throw falla(400, 'La OT no está marcada como garantía.');

    const actual = (await get(`SELECT * FROM garantias_reclamos WHERE ot = ?`, [ot])) || {};
    const trae = (k) => Object.prototype.hasOwnProperty.call(body, k);
    const vacio = (v) => v === undefined || v === null || String(v).trim() === '';

    let fecha = actual.fecha_reclamo ?? null;
    if (trae('fecha_reclamo')) {
        if (vacio(body.fecha_reclamo)) fecha = null;
        else {
            const f = String(body.fecha_reclamo).trim();
            if (!/^\d{4}-\d{2}-\d{2}$/.test(f) || isNaN(Date.parse(f)) || new Date(f).toISOString().slice(0, 10) !== f) {
                throw falla(400, 'La fecha de reclamo no es válida (formato AAAA-MM-DD).');
            }
            fecha = f;
        }
    }

    const monto = (clave, etiqueta, previo) => {
        if (!trae(clave)) return previo ?? null;
        if (vacio(body[clave])) return null;
        const n = Number(typeof body[clave] === 'string' ? body[clave].replace(',', '.') : body[clave]);
        if (!Number.isFinite(n) || n < 0) throw falla(400, `${etiqueta} debe ser un número mayor o igual a 0.`);
        return Math.round(n * 100) / 100;
    };
    const solicitado = monto('monto_solicitado', 'El monto solicitado', actual.monto_solicitado);
    const pagado = monto('monto_pagado', 'El monto pagado', actual.monto_pagado);

    let proforma = actual.numero_proforma ?? null;
    if (trae('numero_proforma')) {
        proforma = vacio(body.numero_proforma) ? null : String(body.numero_proforma).trim();
        if (proforma && proforma.length > 60) throw falla(400, 'El número de proforma es demasiado largo (máx. 60).');
    }

    await run(`
        INSERT INTO garantias_reclamos (ot, fecha_reclamo, monto_solicitado, monto_pagado, numero_proforma, actualizado_por, actualizado_en)
        VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(ot) DO UPDATE SET fecha_reclamo = excluded.fecha_reclamo, monto_solicitado = excluded.monto_solicitado,
            monto_pagado = excluded.monto_pagado, numero_proforma = excluded.numero_proforma,
            actualizado_por = excluded.actualizado_por, actualizado_en = CURRENT_TIMESTAMP`,
        [ot, fecha, solicitado, pagado, proforma, quien]);

    return { status: 'Reclamo guardado', ot, fecha_reclamo: fecha, monto_solicitado: solicitado, monto_pagado: pagado, numero_proforma: proforma };
}

module.exports = {
    listarGarantias, guardarReclamoGarantia,
    listar, historialPorPatente, obtenerDetalle, crear, actualizar, autorizarDescuento, anularOrden, reactivarOrden,
    cambiarEstadoOrden, actualizarExplicacion, controlar, registrarAporte,
    obtenerExplicacionCompleta, actualizarAporte,
    habilitarCorreccionAporte, listarAportesCorregibles, corregirAporte
};
