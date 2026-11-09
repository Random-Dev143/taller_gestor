const express = require('express');
const router = express.Router();
const { run, get } = require('../config/database');
const upload = require('../middlewares/upload');
const { requireAuth } = require('../middlewares/auth');
const { validarCarpeta } = require('../services/carpeta-informes');

// GET PÚBLICO (Para que el Login y el Frontend puedan leer el nombre del taller)
router.get('/', async (req, res) => {
    const config = await get(`SELECT * FROM configuracion WHERE id = 1`);
    // La ruta de la carpeta de informes no es pública: se lee por GET /configuracion/informes (protegido).
    if (config) delete config.carpeta_informes;
    res.json(config || { nombre_taller: 'GITaller', trabaja_corrido: 0, trabaja_sabados: 1, sabado_hora_apertura: 8, sabado_hora_cierre: 13 });
});

// Ajustes del informe NPS (solo Admin): carpeta de guardado, automático y códigos de la planilla.
router.get('/informes', requireAuth(['usuario_gestionar']), async (req, res) => {
    const c = await get(`SELECT nps_concesionario, nps_sede, carpeta_informes, informe_auto_activo FROM configuracion WHERE id = 1`);
    res.json({
        nps_concesionario: (c && c.nps_concesionario) || '7',
        nps_sede: (c && c.nps_sede) || '20',
        carpeta_informes: (c && c.carpeta_informes) || '',
        informe_auto_activo: !c || c.informe_auto_activo !== 0
    });
});

router.put('/informes', requireAuth(['usuario_gestionar']), async (req, res) => {
    const concesionario = String(req.body.nps_concesionario ?? '').trim();
    const sede = String(req.body.nps_sede ?? '').trim();
    const carpeta = String(req.body.carpeta_informes ?? '').trim();
    if (!concesionario || !sede) return res.status(400).json({ error: 'Concesionario y Sede son obligatorios.' });
    if (carpeta) {
        try { validarCarpeta(carpeta); }
        catch (e) { return res.status(400).json({ error: `La carpeta no es válida o no se puede escribir en ella: ${e.message}` }); }
    }
    await run(`UPDATE configuracion SET nps_concesionario = ?, nps_sede = ?, carpeta_informes = ?, informe_auto_activo = ? WHERE id = 1`,
        [concesionario, sede, carpeta, req.body.informe_auto_activo === false || req.body.informe_auto_activo === 0 ? 0 : 1]);
    res.json({ status: 'Ajustes de informes actualizados' });
});

// PUT PROTEGIDO (Solo Admin)
router.put('/', requireAuth(['usuario_gestionar']), async (req, res) => {
    const { 
        nombre_taller, hora_apertura, hora_cierre, hora_almuerzo_inicio, 
        hora_almuerzo_fin, trabaja_corrido, puerto_servidor,
        slogan, direccion, cuit, telefono, email,
        trabaja_sabados, sabado_hora_apertura, sabado_hora_cierre
    } = req.body;
    
    await run(`
        UPDATE configuracion SET 
        nombre_taller = ?, hora_apertura = ?, hora_cierre = ?, 
        hora_almuerzo_inicio = ?, hora_almuerzo_fin = ?, trabaja_corrido = ?, puerto_servidor = ?,
        slogan = ?, direccion = ?, cuit = ?, telefono = ?, email = ?,
        trabaja_sabados = ?, sabado_hora_apertura = ?, sabado_hora_cierre = ?
        WHERE id = 1
    `, [
        nombre_taller, hora_apertura, hora_cierre, hora_almuerzo_inicio, 
        hora_almuerzo_fin, trabaja_corrido ? 1 : 0, puerto_servidor || 5881,
        slogan, direccion, cuit, telefono, email,
        trabaja_sabados ? 1 : 0, sabado_hora_apertura, sabado_hora_cierre
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
