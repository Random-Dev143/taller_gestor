const express = require('express');
const router = express.Router();
const { all } = require('../config/database');

router.get('/', async (req, res) => {
    try {
        const rows = await all(`
            SELECT o.ot, u.unidad, o.patente, o.estado_actual, o.fecha_apertura, o.fecha_cierre, c.nombre AS cliente,
                   COALESCE((SELECT SUM(tiempo_estimado) FROM actividades WHERE ot = o.ot), 0) as tiempo_asignado_horas,
                   COALESCE((SELECT SUM(tiempo_real) FROM actividades WHERE ot = o.ot), 0) as tiempo_empleado_horas,
                   (SELECT l.nombre FROM asignaciones a JOIN legajos l ON a.legajo_mecanico = l.legajo WHERE a.ot = o.ot ORDER BY a.id DESC LIMIT 1) as mecanico,
                   (SELECT ta.inicio FROM tiempos_actividad ta JOIN actividades a ON ta.actividad_id = a.id WHERE a.ot = o.ot AND ta.fin IS NULL ORDER BY ta.id DESC LIMIT 1) as inicio_curso
            FROM ordenes o
            JOIN unidades u ON o.patente = u.patente
            JOIN clientes c ON u.cliente_id = c.id
            WHERE o.ot != '0000'
            ORDER BY CAST(o.ot AS INTEGER) DESC, o.fecha_apertura DESC
        `);
        res.json(rows);
    } catch (error) { res.status(500).json({ error: error.message }); }
});

module.exports = router;