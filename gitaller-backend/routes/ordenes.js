const express = require('express');
const router = express.Router();
const { run, all, get, cambiarEstado, recalcularTiempoEmpleado, withTransaction, sincronizarEstadoOT } = require('../config/database');

router.get('/', async (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 25));
        const offset = (page - 1) * limit;

        let where = " WHERE o.ot != '0000'";
        const params = [];

        if (req.query.estado === 'activas') where += ` AND o.estado_actual != 'Finalizada'`;
        else if (req.query.estado === 'finalizadas') where += ` AND o.estado_actual = 'Finalizada'`;
        else if (req.query.estado) { where += ` AND o.estado_actual = ?`; params.push(req.query.estado); }

        if (req.query.garantia !== undefined) { where += ` AND o.es_garantia = ?`; params.push(req.query.garantia); }

        // Filtro de facturación: usa la misma expresión de montos que
        // OTTable.vue (tieneMontos) para que el criterio sea consistente
        // entre lo que se ve en la tabla y lo que filtra el backend.
        // El descuento sólo impacta la facturación una vez AUTORIZADO por un admin;
        // mientras esté "pendiente" no se resta, para no reducir facturación sin aprobación.
        const MONTOS_EXPR = `(COALESCE(o.monto_repuestos,0) + COALESCE(o.monto_mano_obra,0) + COALESCE(o.monto_repuestos_garantia,0) + COALESCE(o.monto_mano_obra_garantia,0) - (CASE WHEN o.descuento_estado = 'autorizado' THEN COALESCE(o.monto_descuento,0) ELSE 0 END))`;
        if (req.query.facturacion === 'facturadas') where += ` AND ${MONTOS_EXPR} > 0`;
        else if (req.query.facturacion === 'pendientes') where += ` AND ${MONTOS_EXPR} = 0`;

        if (req.query.busqueda) {
            where += ` AND (o.ot LIKE ? OR o.patente LIKE ? OR c.nombre LIKE ?)`;
            const q = `%${req.query.busqueda}%`;
            params.push(q, q, q);
        }

        const totalRow = await get(`SELECT COUNT(*) AS total FROM ordenes o JOIN unidades u ON o.patente = u.patente JOIN clientes c ON u.cliente_id = c.id ${where}`, params);
        const total = totalRow.total;

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
        const sortCol = ORDENABLES[req.query.sortBy];
        const sortDir = (req.query.sortDir || '').toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
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

        res.json({ data: rows, total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

router.get('/historial/:patente', async (req, res) => {
    try {
        const rows = await all(`SELECT o.ot, c.nombre AS cliente, u.unidad, o.fecha_apertura, o.fecha_cierre, o.estado_actual, o.monto_repuestos, o.monto_mano_obra, o.monto_repuestos_garantia, o.monto_mano_obra_garantia, o.es_garantia FROM ordenes o JOIN unidades u ON o.patente = u.patente JOIN clientes c ON u.cliente_id = c.id WHERE o.patente = ? ORDER BY CAST(o.ot AS INTEGER) DESC`, [req.params.patente]);
        res.json(rows);
    } catch (error) { res.status(500).json({ error: error.message }); }
});

router.get('/:ot', async (req, res) => {
    try {
        const ot = await get(`SELECT o.*, u.unidad, c.nombre AS cliente FROM ordenes o JOIN unidades u ON o.patente = u.patente JOIN clientes c ON u.cliente_id = c.id WHERE o.ot = ?`, [req.params.ot]);
        if (!ot) return res.status(404).json({ error: 'OT no encontrada' });

        const asignaciones = await all(`SELECT a.*, l.nombre FROM asignaciones a JOIN legajos l ON a.legajo_mecanico = l.legajo WHERE a.ot = ?`, [req.params.ot]);
        const actividades = await all(`SELECT a.*, l.nombre AS nombre_mecanico FROM actividades a JOIN legajos l ON a.legajo_mecanico = l.legajo WHERE a.ot = ?`, [req.params.ot]);
        const explicacion = await get(`SELECT * FROM explicaciones WHERE ot = ?`, [req.params.ot]);
        const aportes = await all(`SELECT ap.*, l.nombre, l.firma_path FROM aportes ap JOIN legajos l ON ap.legajo = l.legajo WHERE ap.ot = ?`, [req.params.ot]);
        const historial = await all(`SELECT * FROM estados_historial WHERE ot = ? ORDER BY id`, [req.params.ot]);
        const tiempos_actividad = await all(`SELECT ta.* FROM tiempos_actividad ta JOIN actividades a ON ta.actividad_id = a.id WHERE a.ot = ?`, [req.params.ot]);

        res.json({ ...ot, asignaciones, actividades, explicacion, aportes, historial, tiempos_actividad });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

router.post('/', async (req, res) => {
    const { ot, cliente, patente, unidad, kilometraje, asesor_legajo, fecha_apertura, es_garantia, es_no_iveco, tiempo_asignado_horas, tiempo_facturado_horas, monto_repuestos, monto_mano_obra, monto_repuestos_garantia, monto_mano_obra_garantia, monto_descuento, descuento_motivo } = req.body;

    const montoDescuentoSeguro = Number(monto_descuento) > 0 ? Number(monto_descuento) : 0;
    if (montoDescuentoSeguro > 0 && !(descuento_motivo && descuento_motivo.trim())) {
        return res.status(400).json({ error: 'Para cargar un descuento/bonificación es obligatorio indicar el motivo.' });
    }

    try {
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
        res.json({ status: 'OT creada', ot });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

router.put('/:ot', async (req, res) => {
    const { cliente, patente, unidad, kilometraje, fecha_apertura, fecha_cierre, es_garantia, es_no_iveco, tiempo_asignado_horas, tiempo_facturado_horas, monto_repuestos, monto_mano_obra, monto_repuestos_garantia, monto_mano_obra_garantia, monto_descuento, descuento_motivo } = req.body;

    const seEnviaDescuento = monto_descuento !== undefined;
    const montoDescuentoSeguro = seEnviaDescuento ? (Number(monto_descuento) > 0 ? Number(monto_descuento) : 0) : null;
    if (seEnviaDescuento && montoDescuentoSeguro > 0 && !(descuento_motivo && descuento_motivo.trim())) {
        return res.status(400).json({ error: 'Para cargar un descuento/bonificación es obligatorio indicar el motivo.' });
    }

    try {
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
                const actual = await get(`SELECT monto_descuento FROM ordenes WHERE ot = ?`, [req.params.ot]);
                const cambioMonto = !actual || Number(actual.monto_descuento || 0) !== montoDescuentoSeguro;
                if (cambioMonto) {
                    descuentoEstadoNuevo = montoDescuentoSeguro > 0 ? 'pendiente' : 'ninguno';
                    limpiarAutorizacion = true;
                }
            }

            await run(
                `UPDATE ordenes SET patente = COALESCE(?, patente), kilometraje = COALESCE(?, kilometraje), fecha_apertura = COALESCE(?, fecha_apertura), fecha_cierre = COALESCE(?, fecha_cierre), es_garantia = COALESCE(?, es_garantia), es_no_iveco = COALESCE(?, es_no_iveco), tiempo_asignado_horas = COALESCE(?, tiempo_asignado_horas), tiempo_facturado_horas = COALESCE(?, tiempo_facturado_horas), monto_repuestos = COALESCE(?, monto_repuestos), monto_mano_obra = COALESCE(?, monto_mano_obra), monto_repuestos_garantia = COALESCE(?, monto_repuestos_garantia), monto_mano_obra_garantia = COALESCE(?, monto_mano_obra_garantia), monto_descuento = COALESCE(?, monto_descuento), descuento_motivo = COALESCE(?, descuento_motivo), descuento_estado = COALESCE(?, descuento_estado), descuento_autorizado_por = CASE WHEN ? = 1 THEN NULL ELSE descuento_autorizado_por END, descuento_autorizado_en = CASE WHEN ? = 1 THEN NULL ELSE descuento_autorizado_en END WHERE ot = ?`,
                [patente, kilometraje, fecha_apertura, fecha_cierre, es_garantia !== undefined ? (es_garantia ? 1 : 0) : null, es_no_iveco !== undefined ? (es_no_iveco ? 1 : 0) : null, tiempo_asignado_horas, tiempo_facturado_horas, monto_repuestos, monto_mano_obra, monto_repuestos_garantia, monto_mano_obra_garantia, seEnviaDescuento ? montoDescuentoSeguro : null, seEnviaDescuento ? (descuento_motivo || '').trim() : null, descuentoEstadoNuevo, limpiarAutorizacion ? 1 : 0, limpiarAutorizacion ? 1 : 0, req.params.ot]
            );
        });
        res.json({ status: 'OT actualizada' });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

// Autorización de bonificación/descuento — solo usuarios con el permiso granular
// 'ot_autorizar_descuento' (típicamente el administrador). El descuento sólo impacta
// los informes de facturación una vez que queda en estado 'autorizado'.
router.put('/:ot/descuento/autorizar', async (req, res) => {
    const permisosUsuario = (req.usuario && req.usuario.permisos) || [];
    if (!permisosUsuario.includes('ot_autorizar_descuento')) {
        return res.status(403).json({ error: 'No tiene permiso para autorizar descuentos/bonificaciones.' });
    }

    const { aprobado } = req.body;
    if (typeof aprobado !== 'boolean') {
        return res.status(400).json({ error: 'Debe indicar si el descuento se aprueba o se rechaza.' });
    }

    try {
        const orden = await get(`SELECT monto_descuento, descuento_estado FROM ordenes WHERE ot = ?`, [req.params.ot]);
        if (!orden) return res.status(404).json({ error: 'OT no encontrada' });
        if (!(Number(orden.monto_descuento) > 0)) {
            return res.status(400).json({ error: 'Esta OT no tiene un descuento cargado para autorizar.' });
        }

        const autorizadorId = req.usuario.legajo || req.usuario.nombre || req.usuario.email;
        await run(
            `UPDATE ordenes SET descuento_estado = ?, descuento_autorizado_por = ?, descuento_autorizado_en = CURRENT_TIMESTAMP WHERE ot = ?`,
            [aprobado ? 'autorizado' : 'rechazado', autorizadorId, req.params.ot]
        );
        res.json({ status: aprobado ? 'Descuento autorizado' : 'Descuento rechazado' });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

const cambiarEstadoHandler = async (req, res) => {
    const { estado } = req.body;
    try {
        await withTransaction(async () => {
            await cambiarEstado(req.params.ot, estado);
            if (estado === 'Finalizada') await run(`UPDATE ordenes SET fecha_cierre = CURRENT_TIMESTAMP WHERE ot = ?`, [req.params.ot]);
            else await run(`UPDATE ordenes SET controlada = 0, fecha_cierre = NULL WHERE ot = ?`, [req.params.ot]);
        });
        res.json({ status: 'Estado actualizado', nuevo_estado: estado });
    } catch (error) { res.status(500).json({ error: error.message }); }
};

router.put('/:ot/estado', cambiarEstadoHandler);
router.post('/:ot/estado', cambiarEstadoHandler);

// NUEVO: Endpoint colaborativo para la causa de la OT
router.put('/:ot/explicacion', async (req, res) => {
    const { causa } = req.body;
    try {
        await withTransaction(async () => {
            const existe = await get(`SELECT id FROM explicaciones WHERE ot = ?`, [req.params.ot]);
            if (existe) {
                await run(`UPDATE explicaciones SET causa = ? WHERE ot = ?`, [causa, req.params.ot]);
            } else {
                await run(`INSERT INTO explicaciones (ot, causa) VALUES (?, ?)`, [req.params.ot, causa]);
            }
        });
        res.json({ status: 'Explicación actualizada' });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

router.post('/:ot/controlar', async (req, res) => {
    const { jefe_legajo } = req.body;
    try {
        await withTransaction(async () => {
            await run(`UPDATE ordenes SET controlada = 1, jefe_legajo = ?, fecha_cierre = CURRENT_TIMESTAMP WHERE ot = ?`, [jefe_legajo, req.params.ot]);
            await cambiarEstado(req.params.ot, 'Finalizada');

            // NUEVO: Cerrar forzosamente actividades colgadas del mecánico
            await run(`UPDATE actividades SET estado = 'Cerrada por Jefe' WHERE ot = ? AND estado NOT IN ('Finalizada', 'Cerrada por Jefe')`, [req.params.ot]);
        });
        res.json({ status: 'OT controlada y finalizada' });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

router.post('/:ot/aportes', async (req, res) => {
    const { legajo, actividades, horas } = req.body;
    try {
        await withTransaction(async () => {
            await run(`INSERT INTO aportes (ot, legajo, actividades, horas) VALUES (?, ?, ?, ?)`, [req.params.ot, legajo, actividades, horas || 0]);
            if (horas) await recalcularTiempoEmpleado(req.params.ot);
        });
        res.json({ status: 'Aporte registrado' });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

router.get('/:ot/explicacion', async (req, res) => {
    try {
        const orden = await get(`SELECT o.*, c.nombre AS cliente, u.unidad, l.nombre AS nombre_asesor FROM ordenes o JOIN unidades u ON o.patente = u.patente JOIN clientes c ON u.cliente_id = c.id LEFT JOIN legajos l ON o.asesor_legajo = l.legajo WHERE o.ot = ?`, [req.params.ot]);
        const explicacion = await get(`SELECT * FROM explicaciones WHERE ot = ?`, [req.params.ot]);
        const aportes = await all(`SELECT ap.*, l.nombre, l.firma_path FROM aportes ap JOIN legajos l ON ap.legajo = l.legajo WHERE ap.ot = ? ORDER BY ap.fecha_aporte ASC`, [req.params.ot]);
        let jefe = orden.jefe_legajo ? await get(`SELECT legajo, nombre, firma_path FROM legajos WHERE legajo = ?`, [orden.jefe_legajo]) : null;
        res.json({ orden, explicacion, aportes, jefe, controlada: !!orden.controlada });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

router.put('/aportes/:id', async (req, res) => {
    const { actividades, horas } = req.body;
    try {
        await withTransaction(async () => {
            const aporte = await get(`SELECT ot FROM aportes WHERE id = ?`, [req.params.id]);
            if (!aporte) throw new Error('Aporte no encontrado');

            await run(`UPDATE aportes SET actividades = ?, horas = ? WHERE id = ?`, 
                [actividades, horas, req.params.id]);
            
            await recalcularTiempoEmpleado(aporte.ot);
        });
        res.json({ status: 'Aporte corregido exitosamente' });
    } catch (error) { 
        console.error('Error editando aporte:', error);
        res.status(500).json({ error: error.message }); 
    }
});

module.exports = router;