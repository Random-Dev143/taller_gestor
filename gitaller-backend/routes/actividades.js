const express = require('express');
const router = express.Router();
const actividadesService = require('../services/actividades.service');

function manejarError(error, res) {
    if (error.status) return res.status(error.status).json({ error: error.message });
    throw error;
}

router.post('/orden/:ot', async (req, res) => {
    try {
        res.json(await actividadesService.asignarAOrden(req.params.ot, req.body));
    } catch (error) { manejarError(error, res); }
});

router.put('/tiempos/:id', async (req, res) => {
    res.json(await actividadesService.corregirTiempo(req.params.id, req.body));
});

// POST /:id/estado — POR MECÁNICO: cada integrante del equipo tiene su propio
// play/pausa/finalizar, totalmente independiente del resto.
router.post('/:id/estado', async (req, res) => {
    try {
        res.json(await actividadesService.cambiarEstadoMiembro(req.params.id, req.body));
    } catch (error) { manejarError(error, res); }
});

router.post('/:id/cerrar-jefe', async (req, res) => {
    res.json(await actividadesService.cerrarPorJefe(req.params.id));
});

router.post('/:id/informe', async (req, res) => {
    try {
        res.json(await actividadesService.guardarInforme(req.params.id, req.body));
    } catch (error) { manejarError(error, res); }
});

router.delete('/:id', async (req, res) => {
    res.json(await actividadesService.eliminar(req.params.id));
});

router.get('/mecanico/:legajo', async (req, res) => {
    res.json(await actividadesService.listarPorMecanico(req.params.legajo));
});

router.post('/:id/tiempos', async (req, res) => {
    try {
        res.json(await actividadesService.agregarTiempo(req.params.id, req.body));
    } catch (error) { manejarError(error, res); }
});

router.delete('/tiempos/:id', async (req, res) => {
    res.json(await actividadesService.eliminarTiempo(req.params.id));
});

router.put('/:id', async (req, res) => {
    res.json(await actividadesService.actualizar(req.params.id, req.body));
});

module.exports = router;
