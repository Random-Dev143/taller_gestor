'use strict';
const express = require('express');
const router = express.Router();
const { requireAuth } = require('../../middlewares/auth');
const turnos = require('./turnos.service');

const ver = requireAuth(['turno_ver', 'turno_gestionar']);
const gestionar = requireAuth(['turno_gestionar']);

const manejar = (fn) => async (req, res) => {
    try { await fn(req, res); }
    catch (e) {
        if (e.status) return res.status(e.status).json({ error: e.message });
        console.error('⚠️ turnos:', e);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
};

router.get('/', ver, manejar(async (req, res) => res.json(await turnos.listar(req.query))));
router.get('/resumen', ver, manejar(async (req, res) => res.json(await turnos.resumen())));
router.get('/capacidad', ver, manejar(async (req, res) => res.json(await turnos.capacidad(req.query))));
router.get('/siguiente-ot', gestionar, manejar(async (req, res) => res.json(await turnos.siguienteOt())));
router.get('/ultimo-km/:patente', gestionar, manejar(async (req, res) => res.json(await turnos.ultimoKm(req.params.patente))));

// Legajo digital de una OT (turno, llamados, documentos, explicación de los mecánicos). Lo ve quien pueda ver la OT.
router.get('/legajo/:ot', manejar(async (req, res) => res.json(await turnos.legajo(req.params.ot))));

router.post('/', gestionar, manejar(async (req, res) => res.json(await turnos.crear(req.body, req.usuario))));
router.get('/:id', ver, manejar(async (req, res) => res.json(await turnos.obtener(Number(req.params.id)))));
router.put('/:id', gestionar, manejar(async (req, res) => res.json(await turnos.actualizar(Number(req.params.id), req.body, req.usuario))));
router.post('/:id/estado', gestionar, manejar(async (req, res) => res.json(await turnos.cambiarEstado(Number(req.params.id), req.body, req.usuario))));
router.post('/:id/llamado', gestionar, manejar(async (req, res) => res.json(await turnos.registrarLlamado(Number(req.params.id), req.body, req.usuario))));
router.post('/:id/generar-ot', gestionar, manejar(async (req, res) => res.json(await turnos.generarOt(Number(req.params.id), req.body, req.usuario))));

module.exports = router;
