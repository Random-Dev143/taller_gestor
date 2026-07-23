const multer = require('multer');
const path = require('path');
const os = require('os');

// Redirigimos la ruta a AppData, igual que en server.js
const appDataPath = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
const FIRMAS_DIR = path.join(appDataPath, 'GITaller', 'firmas');

const sanitizarLegajo = (legajo) => String(legajo).replace(/[^a-zA-Z0-9_-]/g, '');

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, FIRMAS_DIR),
    filename: (req, file, cb) => cb(null, `${sanitizarLegajo(req.params.legajo)}.png`)
});

const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // Aumentado a 5MB por si el logo tiene alta resolución
    fileFilter: (req, file, cb) => {
        // Aceptamos cualquier formato de imagen para evitar bloqueos del navegador
        if (!file.mimetype.startsWith('image/')) {
            return cb(new Error('Formato no válido. Sube un archivo de imagen.'));
        }
        cb(null, true);
    }
});

module.exports = upload;