'use strict';
// Planilla NPS: descarga manual por rango de fechas + estado del informe automático.
const express = require('express');
const router = express.Router();
const { all, get } = require('../config/database');
const { generarPlanilla } = require('../services/reporte-nps.service');
const { registrar, generarYGuardar } = require('../services/informe-automatico.service');

router.get('/xlsx', async (req, res) => {
    try {
        const { desde, hasta } = req.query;
        const { buffer, nombreArchivo, filas } = await generarPlanilla(desde, hasta);
        await registrar({ desde, hasta, origen: 'manual', filas });
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('X-Nombre-Archivo', encodeURIComponent(nombreArchivo));
        res.setHeader('Access-Control-Expose-Headers', 'X-Nombre-Archivo');
        res.send(buffer);
    } catch (error) {
        if (error.status) return res.status(error.status).json({ error: error.message });
        throw error;
    }
});

// Guarda la planilla de un período en la carpeta configurada (misma ubicación que el informe automático).
router.post('/guardar', async (req, res) => {
    const cfg = await get(`SELECT carpeta_informes FROM configuracion WHERE id = 1`);
    if (!cfg || !String(cfg.carpeta_informes || '').trim()) return res.status(400).json({ error: 'Primero configure la carpeta de informes en Configuración.' });
    try {
        const { desde, hasta } = req.body || {};
        require('../services/nps-periodos').tituloPeriodo(desde, hasta); // valida fechas
        const r = await generarYGuardar({ desde, hasta, origen: 'manual', carpeta: cfg.carpeta_informes });
        res.json({ status: 'Informe guardado', ruta: r.ruta, filas: r.filas });
    } catch (error) {
        if (error.status) return res.status(error.status).json({ error: error.message });
        return res.status(500).json({ error: `No se pudo guardar el informe: ${error.message}` });
    }
});

router.get('/estado', async (req, res) => {
    const cfg = await get(`SELECT carpeta_informes, informe_auto_activo FROM configuracion WHERE id = 1`);
    const historial = await all(`SELECT id, desde, hasta, origen, ruta, filas, error, generado_en FROM informes_generados WHERE tipo = 'nps' ORDER BY id DESC LIMIT 20`);
    res.json({
        carpeta: (cfg && cfg.carpeta_informes) || '',
        auto_activo: !cfg || cfg.informe_auto_activo !== 0,
        historial
    });
});

module.exports = router;
