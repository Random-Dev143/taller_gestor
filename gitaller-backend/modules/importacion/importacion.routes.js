'use strict';
const express = require('express');
const multer = require('multer');
const router = express.Router();
const service = require('./importacion.service');

// Las planillas se procesan en memoria (no se guardan en disco).
const subir = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024, files: 40 },
    fileFilter: (req, file, cb) => {
        if (!/\.xlsx$/i.test(file.originalname || '')) return cb(new Error('Solo se aceptan archivos .xlsx'));
        cb(null, true);
    }
});

const manejar = (fn) => async (req, res, next) => {
    try { res.json(await fn(req)); }
    catch (error) {
        if (error.status) return res.status(error.status).json({ error: error.message });
        next(error);
    }
};

router.post('/analizar', (req, res, next) => {
    subir.array('archivos', 40)(req, res, (e) => {
        if (e) return res.status(400).json({ error: e.message });
        next();
    });
}, manejar(async (req) => {
    if (!req.files || !req.files.length) throw Object.assign(new Error('No se recibió ningún archivo .xlsx.'), { status: 400 });
    return service.analizar(req.files, req.usuario.nombre_completo || req.usuario.email);
}));

router.get('/', manejar(() => service.listar()));
router.get('/:id', manejar((req) => service.obtener(Number(req.params.id))));
router.get('/:id/items', manejar((req) => service.items(Number(req.params.id), req.query)));
router.post('/:id/aprobar-automaticos', manejar((req) => service.aprobarAutomaticos(Number(req.params.id))));
router.post('/:id/cancelar', manejar((req) => service.cancelar(Number(req.params.id))));
router.post('/items/:itemId/resolver', manejar((req) => service.resolverItem(Number(req.params.itemId), req.body.accion, req.body.valor)));

module.exports = router;
