'use strict';
const express = require('express');
const router = express.Router();
const { requireAuth } = require('../../middlewares/auth');
const analitica = require('./analitica.service');

const manejar = (fn) => async (req, res) => {
    try { await fn(req, res); }
    catch (e) {
        if (e.status) return res.status(e.status).json({ error: e.message });
        console.error('⚠️ analitica:', e);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
};

// Panel de inicio: lo ve cualquiera que gestione OT, turnos o tareas. Las cifras de
// facturación del mes solo se incluyen si además tiene permiso de informe financiero.
router.get('/panel', manejar(async (req, res) => {
    const permisos = (req.usuario && req.usuario.permisos) || [];
    res.json(await analitica.panel({ puedeFinanzas: permisos.includes('informe_financiero') }));
}));

// Cruces turnos / OT / presupuestos (informe operativo).
router.get('/turnos-presupuestos', requireAuth(['informe_operativo', 'informe_financiero']),
    manejar(async (req, res) => res.json(await analitica.turnosPresupuestos(req.query))));

module.exports = router;
