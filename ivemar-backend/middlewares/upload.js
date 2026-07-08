const multer = require('multer');
const path = require('path');

const FIRMAS_DIR = path.join(__dirname, '..', 'firmas');

// Defensa en profundidad: aunque legajos.js ya valida el formato al crear
// un legajo nuevo, esto protege también a legajos viejos que se hayan
// creado antes de esa validación, evitando que un ":legajo" con "../" en
// la URL escriba fuera de la carpeta de firmas.
const sanitizarLegajo = (legajo) => String(legajo).replace(/[^a-zA-Z0-9_-]/g, '');

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, FIRMAS_DIR),
    filename: (req, file, cb) => cb(null, `${sanitizarLegajo(req.params.legajo)}.png`)
});

const upload = multer({
    storage,
    limits: { fileSize: 2 * 1024 * 1024 }, // 2MB es más que suficiente para una firma en PNG
    fileFilter: (req, file, cb) => {
        if (file.mimetype !== 'image/png') {
            return cb(new Error('Solo se aceptan archivos PNG'));
        }
        cb(null, true);
    }
});

module.exports = upload;