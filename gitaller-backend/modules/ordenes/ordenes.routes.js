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

// Anulación de OTs — solo con el permiso granular 'ot_anular' (jefe de taller).
const puedeAnular = (req, res) => {
    const permisosUsuario = (req.usuario && req.usuario.permisos) || [];
    if (permisosUsuario.includes('ot_anular')) return true;
    res.status(403).json({ error: 'No tiene permiso para anular órdenes de trabajo.' });
    return false;
};

router.post('/:ot/anular', async (req, res) => {
    if (!puedeAnular(req, res)) return;
    try {
        const quien = req.usuario.nombre_completo || req.usuario.legajo || req.usuario.email;
        res.json(await ordenesService.anularOrden(req.params.ot, req.body && req.body.motivo, quien));
    } catch (error) {
        if (error.status) return res.status(error.status).json({ error: error.message });
        throw error;
    }
});

router.post('/:ot/reactivar', async (req, res) => {
    if (!puedeAnular(req, res)) return;
    try {
        res.json(await ordenesService.reactivarOrden(req.params.ot));
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

// ─── Corrección de aportes habilitada por el Jefe (migración 017) ───
// Aportes que el Jefe habilitó para que el mecánico los corrija (lo que ve en su pantalla).
router.get('/aportes/habilitados/:legajo', async (req, res) => {
    res.json(await ordenesService.listarAportesCorregibles(req.params.legajo));
});

// Habilitar / cancelar la corrección: solo quien puede gestionar todas las tareas (el Jefe).
// Se reutiliza ese permiso a propósito: crear uno nuevo obligaría a asignarlo a mano en Roles.
router.put('/aportes/:id/habilitar', async (req, res) => {
    const permisosUsuario = (req.usuario && req.usuario.permisos) || [];
    if (!permisosUsuario.includes('tarea_gestionar_todas')) {
        return res.status(403).json({ error: 'Solo el Jefe de Taller puede habilitar la corrección de un aporte.' });
    }
    if (typeof req.body.habilitar !== 'boolean') {
        return res.status(400).json({ error: 'Debe indicar si se habilita (true) o se cancela (false).' });
    }
    const quien = req.usuario.legajo || req.usuario.nombre_completo || req.usuario.email;
    res.json(await ordenesService.habilitarCorreccionAporte(req.params.id, req.body.habilitar, quien));
});

// El mecánico corrige su propio aporte (una sola vez por habilitación).
router.put('/aportes/:id/corregir', async (req, res) => {
    res.json(await ordenesService.corregirAporte(req.params.id, req.body));
});

// ─── Panel de garantías (migración 018) ───
// Listado: las últimas 30 OT de garantía finalizadas, o la búsqueda por OT / patente / proforma.
router.get('/garantias/reclamos', async (req, res) => {
    res.json(await ordenesService.listarGarantias(req.query));
});

// Carga/modificación del reclamo de una OT. Requiere ot_editar (modificar montos de la OT):
// se reutiliza ese permiso para no obligar a asignar uno nuevo a mano en Roles.
router.put('/garantias/reclamos/:ot', async (req, res) => {
    const permisosUsuario = (req.usuario && req.usuario.permisos) || [];
    if (!permisosUsuario.includes('ot_editar')) {
        return res.status(403).json({ error: 'No tenés permiso para cargar datos de reclamo de garantía.' });
    }
    const quien = req.usuario.legajo || req.usuario.nombre_completo || req.usuario.email;
    res.json(await ordenesService.guardarReclamoGarantia(req.params.ot, req.body, quien));
});

router.put('/aportes/:id', async (req, res) => {
    res.json(await ordenesService.actualizarAporte(req.params.id, req.body));
});

module.exports = router;
