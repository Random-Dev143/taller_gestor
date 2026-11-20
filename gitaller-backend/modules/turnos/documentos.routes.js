'use strict';
const express = require('express');
const multer = require('multer');
const router = express.Router();
const { requireAuth } = require('../../middlewares/auth');
const docs = require('./documentos.service');

// PDFs en memoria (se validan y se escriben en la carpeta configurada); tope de 15 MB.
const subida = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 15 * 1024 * 1024, files: 1 },
    fileFilter: (req, file, cb) => {
        const esPdf = file.mimetype === 'application/pdf' || /\.pdf$/i.test(file.originalname || '');
        cb(esPdf ? null : Object.assign(new Error('Solo se aceptan archivos PDF.'), { status: 400 }), esPdf);
    }
});
const recibirPdf = (req, res, next) => subida.single('archivo')(req, res, (err) => {
    if (!err) return next();
    const mensaje = err.code === 'LIMIT_FILE_SIZE' ? 'El PDF supera el máximo de 15 MB.' : err.message;
    res.status(err.status || 400).json({ error: mensaje });
});

const manejar = (fn) => async (req, res) => {
    try { await fn(req, res); }
    catch (e) {
        if (e.status) return res.status(e.status).json({ error: e.message });
        console.error('⚠️ ot-documentos:', e);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
};

// Rutas con "item" primero para que no se confundan con /:ot.
router.get('/item/:id/archivo', manejar(async (req, res) => {
    const { abs, nombre } = await docs.rutaArchivo(Number(req.params.id));
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(nombre)}"`);
    res.sendFile(abs);
}));

router.put('/item/:id', requireAuth(['ot_documento_subir']), manejar(async (req, res) => {
    res.json(await docs.actualizarPresupuesto(Number(req.params.id), req.body, req.usuario));
}));

router.delete('/item/:id', requireAuth(['ot_documento_borrar']), manejar(async (req, res) => {
    res.json(await docs.borrar(Number(req.params.id), req.body && req.body.motivo, req.usuario));
}));

router.get('/:ot', manejar(async (req, res) => {
    // Los borrados solo los ve quien puede darlos de baja (auditoría).
    const veBorrados = (req.usuario.permisos || []).includes('ot_documento_borrar');
    res.json(await docs.listar(req.params.ot, { incluirBorrados: veBorrados }));
}));

router.post('/:ot', requireAuth(['ot_documento_subir']), recibirPdf, manejar(async (req, res) => {
    res.json(await docs.subir(req.params.ot, req.file, req.body, req.usuario));
}));

module.exports = router;
