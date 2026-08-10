const express = require('express');
const router = express.Router();
const { run, all, get } = require('../config/database');
const upload = require('../middlewares/upload');

router.get('/', async (req, res) => {
    res.json(await all(`SELECT legajo, nombre, rol, firma_path FROM legajos`));
});

router.get('/:legajo', async (req, res) => {
    const row = await get(`SELECT * FROM legajos WHERE legajo = ?`, [req.params.legajo]);
    if (!row) return res.status(404).json({ error: 'Legajo no encontrado' });
    res.json(row);
});

router.post('/', async (req, res) => {
    const { legajo, nombre, rol } = req.body;
    if (!legajo || !nombre || !rol) return res.status(400).json({ error: 'Faltan datos' });
    if (!/^[a-zA-Z0-9_-]+$/.test(legajo)) {
        return res.status(400).json({ error: 'El legajo solo puede contener letras, números, guiones y guiones bajos' });
    }
    await run(`INSERT INTO legajos (legajo, nombre, rol) VALUES (?, ?, ?)`, [legajo, nombre, rol]);
    res.json({ status: 'Legajo creado', legajo });
});

router.post('/:legajo/firma', upload.single('firma'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No se recibió archivo PNG' });
    const firma_path = `/firmas/${req.params.legajo}.png`;
    await run(`UPDATE legajos SET firma_path = ? WHERE legajo = ?`, [firma_path, req.params.legajo]);
    res.json({ status: 'Firma subida', firma_path });
});

router.delete('/:legajo', async (req, res) => {
    // Caso 2: el catch traduce el error de FK a un mensaje entendible, así
    // que se mantiene — pero relanzando en vez de armar la respuesta acá.
    try {
        await run(`DELETE FROM legajos WHERE legajo = ?`, [req.params.legajo]);
        res.json({ status: 'Legajo eliminado' });
    } catch (error) {
        if (error.message.includes('FOREIGN KEY constraint failed')) {
            const e = new Error('No se puede eliminar el legajo. Este empleado está asignado a Órdenes o Tareas históricas.');
            e.status = 400;
            throw e;
        }
        throw error;
    }
});

// --- NUEVO: GESTIÓN DE EXCEPCIONES Y PERMISOS (TIEMPO MUERTO) ---

router.get('/:legajo/excepciones', async (req, res) => {
    // Se puede filtrar por mes enviando ?mes=YYYY-MM
    let query = `SELECT * FROM excepciones_mecanicos WHERE legajo = ?`;
    const params = [req.params.legajo];
    if (req.query.mes) {
        query += ` AND fecha LIKE ?`;
        params.push(`${req.query.mes}%`);
    }
    query += ` ORDER BY fecha DESC`;

    res.json(await all(query, params));
});

router.post('/excepciones', async (req, res) => {
    const { legajo, fecha, motivo, horas_descontadas } = req.body;
    await run(
        `INSERT INTO excepciones_mecanicos (legajo, fecha, motivo, horas_descontadas) VALUES (?, ?, ?, ?)`,
        [legajo, fecha, motivo, horas_descontadas]
    );
    res.json({ status: 'Excepción registrada' });
});

router.delete('/excepciones/:id', async (req, res) => {
    await run(`DELETE FROM excepciones_mecanicos WHERE id = ?`, [req.params.id]);
    res.json({ status: 'Excepción eliminada' });
});

module.exports = router;
