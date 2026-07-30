const express = require('express');
const router = express.Router();
const service = require('./actividades.service');

function manejarError(res, error) {
    res.status(error.status || 500).json({ error: error.message });
}

router.post('/orden/:ot', async (req, res) => {
    try {
        await service.asignarEquipoAOt(req.params.ot, req.body);
        res.json({ status: 'Actividad asignada al equipo' });
    } catch (error) { manejarError(res, error); }
});

router.put('/tiempos/:id', async (req, res) => {
    try {
        await service.editarSesionTiempo(req.params.id, req.body.inicio, req.body.fin);
        res.json({ status: 'Tiempo actualizado y recalculado correctamente' });
    } catch (error) { manejarError(res, error); }
});

// POST /:id/estado — es POR MECÁNICO: cada integrante del equipo tiene su propio
// play/pausa/finalizar, totalmente independiente del resto (ver actividades.service).
router.post('/:id/estado', async (req, res) => {
    try {
        await service.cambiarEstadoMecanico(req.params.id, req.body);
        res.json({ status: 'Estado actualizado' });
    } catch (error) { manejarError(res, error); }
});

router.post('/:id/informe', async (req, res) => {
    try {
        await service.guardarInforme(req.params.id, req.body.legajo_mecanico, req.body.informe);
        res.json({ status: 'Informe guardado' });
    } catch (error) { manejarError(res, error); }
});

router.delete('/:id', async (req, res) => {
    try {
        await service.eliminarActividad(req.params.id);
        res.json({ status: 'Actividad eliminada' });
    } catch (error) { manejarError(res, error); }
});

// Lista de tareas del mecánico, ordenada antes de '/:id' para no chocar con ese patrón.
router.get('/mecanico/:legajo', async (req, res) => {
    try {
        res.json(await service.listarPorMecanico(req.params.legajo));
    } catch (error) { manejarError(res, error); }
});

router.post('/:id/tiempos', async (req, res) => {
    try {
        await service.agregarTiempo(req.params.id, req.body);
        res.json({ status: 'Tiempo agregado' });
    } catch (error) { manejarError(res, error); }
});

router.delete('/tiempos/:id', async (req, res) => {
    try {
        await service.eliminarTiempo(req.params.id);
        res.json({ status: 'Tiempo eliminado' });
    } catch (error) { manejarError(res, error); }
});

router.put('/:id', async (req, res) => {
    try {
        await service.editarActividad(req.params.id, req.body);
        res.json({ status: 'Actividad actualizada' });
    } catch (error) {
        manejarError(res, error);
    }
});

module.exports = router;
