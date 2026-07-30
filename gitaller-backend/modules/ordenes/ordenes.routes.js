const express = require('express');
const router = express.Router();
const service = require('./ordenes.service');

function manejarError(res, error) {
    res.status(error.status || 500).json({ error: error.message });
}

router.get('/', async (req, res) => {
    try {
        res.json(await service.listar(req.query));
    } catch (error) { manejarError(res, error); }
});

router.get('/historial/:patente', async (req, res) => {
    try {
        res.json(await service.historialPorPatente(req.params.patente));
    } catch (error) { manejarError(res, error); }
});

router.get('/:ot', async (req, res) => {
    try {
        const detalle = await service.obtenerDetalle(req.params.ot);
        if (!detalle) return res.status(404).json({ error: 'OT no encontrada' });
        res.json(detalle);
    } catch (error) { manejarError(res, error); }
});

router.post('/', async (req, res) => {
    try {
        await service.crear(req.body);
        res.json({ status: 'OT creada', ot: req.body.ot });
    } catch (error) { manejarError(res, error); }
});

router.put('/:ot', async (req, res) => {
    try {
        await service.actualizar(req.params.ot, req.body);
        res.json({ status: 'OT actualizada' });
    } catch (error) { manejarError(res, error); }
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
        await service.autorizarDescuento(req.params.ot, aprobado, autorizadorId);
        res.json({ status: aprobado ? 'Descuento autorizado' : 'Descuento rechazado' });
    } catch (error) { manejarError(res, error); }
});

const cambiarEstadoHandler = async (req, res) => {
    try {
        await service.cambiarEstadoOrden(req.params.ot, req.body.estado);
        res.json({ status: 'Estado actualizado', nuevo_estado: req.body.estado });
    } catch (error) { manejarError(res, error); }
};
router.put('/:ot/estado', cambiarEstadoHandler);
router.post('/:ot/estado', cambiarEstadoHandler);

router.put('/:ot/explicacion', async (req, res) => {
    try {
        await service.actualizarExplicacion(req.params.ot, req.body.causa);
        res.json({ status: 'Explicación actualizada' });
    } catch (error) { manejarError(res, error); }
});

router.post('/:ot/controlar', async (req, res) => {
    try {
        await service.controlar(req.params.ot, req.body.jefe_legajo);
        res.json({ status: 'OT controlada y finalizada' });
    } catch (error) { manejarError(res, error); }
});

router.post('/:ot/aportes', async (req, res) => {
    try {
        const { legajo, actividades, horas } = req.body;
        await service.agregarAporte(req.params.ot, legajo, actividades, horas);
        res.json({ status: 'Aporte registrado' });
    } catch (error) { manejarError(res, error); }
});

router.get('/:ot/explicacion', async (req, res) => {
    try {
        res.json(await service.obtenerExplicacionDetalle(req.params.ot));
    } catch (error) { manejarError(res, error); }
});

router.put('/aportes/:id', async (req, res) => {
    try {
        const { actividades, horas } = req.body;
        await service.editarAporte(req.params.id, actividades, horas);
        res.json({ status: 'Aporte corregido exitosamente' });
    } catch (error) {
        console.error('Error editando aporte:', error);
        manejarError(res, error);
    }
});


//RUTAS DE REPUESTOS
//Obtener los cargos/materiales de la OT
router.get('/:ot/cargos', async (req, res) => {
    try {
        res.json(await service.listarCargosOT(req.params.ot));
    } catch (error) { manejarError(res, error); }
});

//Agregar cargo/repuesto a la OT
router.post('/:ot/cargos', async (req, res) => {
    try {
        const payload = { ...req.body, legajo_cargo: req.usuario.legajo || 'ADMIN' };
        res.json(await service.agregarCargoOT(req.params.ot, payload));
    } catch (error) { manejarError(res, error); }
});

module.exports = router;
