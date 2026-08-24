const express = require('express');
const router = express.Router();
const ordenesService = require('./ordenes.service');

router.get('/', async (req, res) => {
    res.json(await ordenesService.listar(req.query));
});

router.get('/historial/:patente', async (req, res) => {
    res.json(await ordenesService.historialPorPatente(req.params.patente));
});

router.get('/:ot', async (req, res) => {
    const detalle = await ordenesService.obtenerDetalle(req.params.ot);
    if (!detalle) return res.status(404).json({ error: 'OT no encontrada' });
    res.json(detalle);
});

router.post('/', async (req, res) => {
    try {
        res.json(await ordenesService.crear(req.body));
    } catch (error) {
        if (error.status) return res.status(error.status).json({ error: error.message });
        throw error;
    }
});

router.put('/:ot', async (req, res) => {
    try {
        res.json(await ordenesService.actualizar(req.params.ot, req.body));
    } catch (error) {
        if (error.status) return res.status(error.status).json({ error: error.message });
        throw error;
    }
});

// Autorización de bonificación/descuento — solo usuarios con el permiso granular
// 'ot_autorizar_descuento' (típicamente el administrador). El descuento sólo impacta
// los informes de facturación una vez que queda en estado 'autorizado'.
router.put('/:ot/descuento/autorizar', async (req, res) => {
    const permisosUsuario = (req.usuario && req.usuario.permisos) || [];
    if (!permisosUsuario.includes('ot_autorizar_descuento')) {
        return res.status(403).json({ error: 'No tiene permiso para autorizar descuentos/bonificaciones.' });
    }

    const { aprobado } = req.body;
    if (typeof aprobado !== 'boolean') {
        return res.status(400).json({ error: 'Debe indicar si el descuento se aprueba o se rechaza.' });
    }

    try {
        const autorizadorId = req.usuario.legajo || req.usuario.nombre || req.usuario.email;
        res.json(await ordenesService.autorizarDescuento(req.params.ot, aprobado, autorizadorId));
    } catch (error) {
        if (error.status) return res.status(error.status).json({ error: error.message });
        throw error;
    }
});

const cambiarEstadoHandler = async (req, res) => {
    res.json(await ordenesService.cambiarEstadoOrden(req.params.ot, req.body.estado));
};
router.put('/:ot/estado', cambiarEstadoHandler);
router.post('/:ot/estado', cambiarEstadoHandler);

// Endpoint colaborativo para la causa de la OT
router.put('/:ot/explicacion', async (req, res) => {
    res.json(await ordenesService.actualizarExplicacion(req.params.ot, req.body.causa));
});

router.post('/:ot/controlar', async (req, res) => {
    res.json(await ordenesService.controlar(req.params.ot, req.body.jefe_legajo));
});

router.post('/:ot/aportes', async (req, res) => {
    res.json(await ordenesService.registrarAporte(req.params.ot, req.body));
});

router.get('/:ot/explicacion', async (req, res) => {
    res.json(await ordenesService.obtenerExplicacionCompleta(req.params.ot));
});

router.put('/aportes/:id', async (req, res) => {
    res.json(await ordenesService.actualizarAporte(req.params.id, req.body));
});

module.exports = router;
