const express = require('express');
const router = express.Router();
const service = require('./repuestos.service');
const { requireAuth } = require('../../middlewares/auth');

// Función auxiliar para centralizar errores
function manejarError(res, error) {
    res.status(error.status || 500).json({ error: error.message });
}

// GET /api/repuestos - Listar todo el catálogo activo
router.get('/', requireAuth(['repuesto_ver']), async (req, res) => {
    try {
        const catalogo = await service.listarCatalogo();
        res.json(catalogo);
    } catch (error) { manejarError(res, error); }
});

// GET /api/repuestos/:np - Detalle de un repuesto puntual
router.get('/:np', requireAuth(['repuesto_ver']), async (req, res) => {
    try {
        const repuesto = await service.obtenerDetalleRepuesto(req.params.np);
        res.json(repuesto);
    } catch (error) { manejarError(res, error); }
});

// POST /api/repuestos - Crear un nuevo repuesto
router.post('/', requireAuth(['repuesto_gestionar']), async (req, res) => {
    try {
        const resultado = await service.registrarNuevoRepuesto(req.body);
        res.status(201).json(resultado);
    } catch (error) { manejarError(res, error); }
});

// PUT /api/repuestos/:id - Actualizar datos (costo, margen, ubicación, etc.)
router.put('/:id', requireAuth(['repuesto_gestionar']), async (req, res) => {
    try {
        const resultado = await service.modificarRepuesto(req.params.id, req.body);
        res.json(resultado);
    } catch (error) { manejarError(res, error); }
});

// DELETE /api/repuestos/:id - Baja lógica
router.delete('/:id', requireAuth(['repuesto_gestionar']), async (req, res) => {
    try {
        const resultado = await service.desactivarRepuesto(req.params.id);
        res.json(resultado);
    } catch (error) { manejarError(res, error); }
});

router.post('/:id/ingreso', requireAuth(['repuesto_gestionar']), async (req, res) => {
    try {
        const payload = { ...req.body, legajo_usuario: req.usuario.legajo || 'ADMIN' };
        const resultado = await service.ingresarStock(req.params.id, payload);
        res.json(resultado);
    } catch (error) { manejarError(res, error); }
});

module.exports = router;