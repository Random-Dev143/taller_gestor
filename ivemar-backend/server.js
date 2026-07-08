'use strict';

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const iniciarCron = require('./utils/cron');

const app = express();
const PORT = 5881;
const FIRMAS_DIR = path.join(__dirname, 'firmas');

// Asegurar que exista la carpeta de firmas
if (!fs.existsSync(FIRMAS_DIR)) {
    fs.mkdirSync(FIRMAS_DIR, { recursive: true });
}

// ─── MIDDLEWARE ────────────────────────────────────────────────────
app.use(express.json());
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// ─── ARCHIVOS ESTÁTICOS ───────────────────────────────────────────
app.use('/firmas', express.static(FIRMAS_DIR));

// ─── RUTAS (API REST) ─────────────────────────────────────────────
app.get('/status', (req, res) => {
    res.json({ status: 'API IVEMAR activa', version: '2.0 - Modular' });
});

app.use('/api/unidades', require('./routes/unidades'));
app.use('/api/legajos', require('./routes/legajos'));
app.use('/api/ordenes', require('./routes/ordenes'));
app.use('/api/actividades', require('./routes/actividades'));
app.use('/api/informes', require('./routes/informes'));
app.use('/api/sala', require('./routes/sala'));

// ─── INICIAR TAREAS PROGRAMADAS ────────────────────────────────────
iniciarCron();

// ─── ARRANQUE ──────────────────────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 API IVEMAR activa en http://0.0.0.0:${PORT}`);
    console.log(`📁 Firmas: ${FIRMAS_DIR}`);
});