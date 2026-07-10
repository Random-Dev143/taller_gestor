const express = require('express');
const router = express.Router();
const { all, run } = require('../config/database');

router.get('/', async (req, res) => {
    try {
        res.json(await all(`SELECT * FROM feriados ORDER BY fecha ASC`));
    } catch (error) { res.status(500).json({ error: error.message }); }
});

router.post('/', async (req, res) => {
    const { fecha, descripcion } = req.body;
    try {
        await run(`INSERT INTO feriados (fecha, descripcion) VALUES (?, ?)`, [fecha, descripcion || '']);
        res.json({ status: 'Feriado registrado' });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

router.delete('/:fecha', async (req, res) => {
    try {
        await run(`DELETE FROM feriados WHERE fecha = ?`, [req.params.fecha]);
        res.json({ status: 'Feriado eliminado' });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

module.exports = router;
