const express = require('express');
const router = express.Router();
const { all, run } = require('../config/database');

router.get('/', async (req, res) => {
    res.json(await all(`SELECT * FROM feriados ORDER BY fecha ASC`));
});

router.post('/', async (req, res) => {
    const { fecha, descripcion } = req.body;
    await run(`INSERT INTO feriados (fecha, descripcion) VALUES (?, ?)`, [fecha, descripcion || '']);
    res.json({ status: 'Feriado registrado' });
});

router.delete('/:fecha', async (req, res) => {
    await run(`DELETE FROM feriados WHERE fecha = ?`, [req.params.fecha]);
    res.json({ status: 'Feriado eliminado' });
});

module.exports = router;
