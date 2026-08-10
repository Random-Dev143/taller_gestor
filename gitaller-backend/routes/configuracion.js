const express = require('express');
const router = express.Router();
const { run, get } = require('../config/database');
const upload = require('../middlewares/upload');
const { requireAuth } = require('../middlewares/auth');

// GET PÚBLICO (Para que el Login y el Frontend puedan leer el nombre del taller)
router.get('/', async (req, res) => {
    const config = await get(`SELECT * FROM configuracion WHERE id = 1`);
    res.json(config || { nombre_taller: 'GITaller', trabaja_corrido: 0 });
});

// PUT PROTEGIDO (Solo Admin)
router.put('/', requireAuth(['usuario_gestionar']), async (req, res) => {
    const { 
        nombre_taller, hora_apertura, hora_cierre, hora_almuerzo_inicio, 
        hora_almuerzo_fin, trabaja_corrido, puerto_servidor,
        slogan, direccion, cuit, telefono, email 
    } = req.body;
    
    await run(`
        UPDATE configuracion SET 
        nombre_taller = ?, hora_apertura = ?, hora_cierre = ?, 
        hora_almuerzo_inicio = ?, hora_almuerzo_fin = ?, trabaja_corrido = ?, puerto_servidor = ?,
        slogan = ?, direccion = ?, cuit = ?, telefono = ?, email = ?
        WHERE id = 1
    `, [
        nombre_taller, hora_apertura, hora_cierre, hora_almuerzo_inicio, 
        hora_almuerzo_fin, trabaja_corrido ? 1 : 0, puerto_servidor || 5881,
        slogan, direccion, cuit, telefono, email
    ]);
    res.json({ status: 'Configuración actualizada' });
});

// POST LOGO (Aprovechamos el middleware de firmas, guardándolo como "logo_taller.png")
router.post('/logo', requireAuth(['usuario_gestionar']), (req, res, next) => {
    // Forzamos el nombre de parámetro a 'logo_taller' para que 'upload.js' lo use
    req.params.legajo = 'logo_taller'; 
    next();
}, upload.single('logo'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No se recibió archivo PNG' });
    const logo_path = `/firmas/logo_taller.png?v=${Date.now()}`; // Forzar recarga en el navegador
    await run(`UPDATE configuracion SET logo_path = ? WHERE id = 1`, [logo_path]);
    res.json({ status: 'Logo actualizado', logo_path });
});

module.exports = router;
