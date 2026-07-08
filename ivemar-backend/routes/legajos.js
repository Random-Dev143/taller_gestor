const express = require('express');
const router = express.Router();
const { run, all, get } = require('../config/database');
const upload = require('../middlewares/upload');

// Equivalente a app.get('/api/legajos', ...)
router.get('/', async (req, res) => {
    try {
        const rows = await all(`SELECT legajo, nombre, rol, firma_path FROM legajos`);
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/:legajo', async (req, res) => {
    try {
        const row = await get(`SELECT * FROM legajos WHERE legajo = ?`, [req.params.legajo]);
        if (!row) return res.status(404).json({ error: 'Legajo no encontrado' });
        res.json(row);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/', async (req, res) => {
    const { legajo, nombre, rol } = req.body;
    if (!legajo || !nombre || !rol) return res.status(400).json({ error: 'Faltan datos' });
    // El legajo se usa tal cual como nombre de archivo al subir la firma
    // (ver middlewares/upload.js), así que se valida acá el formato para
    // evitar que termine escribiendo fuera de la carpeta de firmas
    // (ej. un legajo como "../../algo").
    if (!/^[a-zA-Z0-9_-]+$/.test(legajo)) {
        return res.status(400).json({ error: 'El legajo solo puede contener letras, números, guiones y guiones bajos' });
    }
    try {
        await run(`INSERT INTO legajos (legajo, nombre, rol) VALUES (?, ?, ?)`, [legajo, nombre, rol]);
        res.json({ status: 'Legajo creado', legajo });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/:legajo/firma', upload.single('firma'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No se recibió archivo PNG' });
    const firma_path = `/firmas/${req.params.legajo}.png`;
    try {
        await run(`UPDATE legajos SET firma_path = ? WHERE legajo = ?`, [firma_path, req.params.legajo]);
        res.json({ status: 'Firma subida', firma_path });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.delete('/:legajo', async (req, res) => {
    try {
        await run(`DELETE FROM legajos WHERE legajo = ?`, [req.params.legajo]);
        res.json({ status: 'Legajo eliminado' });
    } catch (error) {
        if (error.message.includes('FOREIGN KEY constraint failed')) {
            return res.status(400).json({ error: 'No se puede eliminar el legajo. Este empleado está asignado a Órdenes o Tareas históricas.' });
        }
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;