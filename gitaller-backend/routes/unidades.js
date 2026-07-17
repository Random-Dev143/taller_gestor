const express = require('express');
const router = express.Router();
const { run, all, get, withTransaction } = require('../config/database');

router.get('/clientes/buscar', async (req, res) => {
    try {
        const q = `%${(req.query.q || '').toUpperCase()}%`;
        const clientes = await all(`SELECT id, nombre, telefono, correo FROM clientes WHERE nombre LIKE ? LIMIT 8`, [q]);
        res.json(clientes);
    } catch (error) { res.status(500).json({ error: error.message }); }
});

// Vehículos ya registrados para un cliente. Se usa en NuevaOT.vue para
// sugerir la unidad al elegir el cliente del autocompletado, en vez de
// tener que tipear la patente de nuevo si ya la conocemos.
router.get('/cliente/:clienteId', async (req, res) => {
    try {
        const unidades = await all(
            `SELECT u.patente, u.unidad,
                    (SELECT o.kilometraje FROM ordenes o WHERE o.patente = u.patente ORDER BY CAST(o.ot AS INTEGER) DESC LIMIT 1) AS ultimo_kilometraje
             FROM unidades u WHERE u.cliente_id = ? ORDER BY u.id DESC`,
            [req.params.clienteId]
        );
        res.json(unidades);
    } catch (error) { res.status(500).json({ error: error.message }); }
});

router.get('/', async (req, res) => {
    try { 
        res.json(await all(`SELECT u.*, c.nombre AS cliente FROM unidades u JOIN clientes c ON u.cliente_id = c.id ORDER BY u.id DESC`)); 
    } 
    catch (error) { res.status(500).json({ error: error.message }); }
});

router.get('/:patente', async (req, res) => {
    try {
        const unidad = await get(`SELECT u.*, c.nombre AS cliente FROM unidades u JOIN clientes c ON u.cliente_id = c.id WHERE u.patente = ?`, [req.params.patente]);
        if (!unidad) return res.status(404).json({ error: 'Unidad no encontrada' });
        res.json(unidad);
    } catch (error) { res.status(500).json({ error: error.message }); }
});

router.post('/', async (req, res) => {
    const { patente, cliente, unidad, telefono, correo, contacto_nombre, contacto_apellido } = req.body;
    if (!patente || !cliente || !unidad) return res.status(400).json({ error: 'Faltan datos' });
    try {
        await withTransaction(async () => {
            let cli = await get(`SELECT id FROM clientes WHERE nombre = ?`, [cliente.toUpperCase()]);
            if (!cli) {
                await run(`INSERT INTO clientes (nombre) VALUES (?)`, [cliente.toUpperCase()]);
                cli = await get(`SELECT id FROM clientes WHERE nombre = ?`, [cliente.toUpperCase()]);
            }
            await run(`INSERT INTO unidades (patente, cliente_id, unidad, telefono, correo, contacto_nombre, contacto_apellido) VALUES (?, ?, ?, ?, ?, ?, ?)`, 
                [patente, cli.id, unidad, telefono || '', correo || '', contacto_nombre || '', contacto_apellido || '']);
        });
        res.json({ status: 'Unidad creada' });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

router.put('/:id', async (req, res) => {
    const { patente, cliente, unidad, telefono, correo, contacto_nombre, contacto_apellido } = req.body;
    try {
        await withTransaction(async () => {
            let cli = await get(`SELECT id FROM clientes WHERE nombre = ?`, [cliente.toUpperCase()]);
            if (!cli) {
                await run(`INSERT INTO clientes (nombre) VALUES (?)`, [cliente.toUpperCase()]);
                cli = await get(`SELECT id FROM clientes WHERE nombre = ?`, [cliente.toUpperCase()]);
            }
            await run(`UPDATE unidades SET patente = ?, cliente_id = ?, unidad = ?, telefono = ?, correo = ?, contacto_nombre = ?, contacto_apellido = ? WHERE id = ?`, 
                [patente, cli.id, unidad, telefono || '', correo || '', contacto_nombre || '', contacto_apellido || '', req.params.id]);
        });
        res.json({ status: 'Unidad actualizada' });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

router.delete('/:id', async (req, res) => {
    try {
        await run(`DELETE FROM unidades WHERE id = ?`, [req.params.id]);
        res.json({ status: 'Unidad eliminada' });
    } catch (error) { 
        if (error.message.includes('FOREIGN KEY constraint failed')) {
            return res.status(400).json({ error: 'No se puede eliminar la unidad porque tiene OTs asociadas. Elimine primero el historial de taller.' });
        }
        res.status(500).json({ error: error.message }); 
    }
});

module.exports = router;