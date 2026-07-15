'use strict';
require('dotenv').config(); // 1. Cargar variables de entorno

const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser'); // 2. Manejador de cookies
const rateLimit = require('express-rate-limit'); // 3. Límite de peticiones
const path = require('path');
const fs = require('fs');

const iniciarCron = require('./utils/cron');
const { requireAuth } = require('./middlewares/auth'); // 4. Middleware de seguridad

const app = express();
const PORT = process.env.PORT || 5881;
const FIRMAS_DIR = path.join(__dirname, 'firmas');

if (!fs.existsSync(FIRMAS_DIR)) {
    fs.mkdirSync(FIRMAS_DIR, { recursive: true });
}

// ─── SEGURIDAD: LIMITADORES DE PETICIONES (RATE LIMIT) ─────────────
// Límite general: Máximo 100 peticiones por minuto por IP
const limiterGeneral = rateLimit({
    windowMs: 1 * 60 * 1000, 
    max: 100,
    message: { error: 'Demasiadas peticiones. Por favor, espere un momento.' },
    standardHeaders: true,
    legacyHeaders: false,
});

// Límite estricto para Sala de Espera: Máximo 15 peticiones por minuto por IP
// (El frontend actualiza cada 30 segundos, por lo que 2 peticiones/minuto es lo normal)
const limiterSala = rateLimit({
    windowMs: 1 * 60 * 1000,
    max: 15,
    message: { error: 'Límite de recargas excedido para la sala de espera.' }
});

// ─── MIDDLEWARES BASE ─────────────────────────────────────────────
app.use(express.json());
app.use(cookieParser());
app.use(limiterGeneral); // Aplicamos el límite general a todo el servidor

// Configuración estricta de CORS para red local
const corsOptions = {
    origin: function (origin, callback) {
        // Permitir peticiones sin origen (ej. herramientas de terminal) o desde la red local
        if (!origin) return callback(null, true);
        
        // Expresión regular que acepta localhost, 127.0.0.1, y cualquier IP de red local 192.168.x.x o 10.x.x.x
        if (/^https?:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+)(:\d+)?$/.test(origin)) {
            callback(null, true);
        } else {
            callback(new Error('Acceso denegado por políticas de CORS. Origen no autorizado.'));
        }
    },
    credentials: true, // ¡CRÍTICO! Sin esto, el navegador rechazará la cookie HttpOnly
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
};
app.use(cors(corsOptions));

// ─── ARCHIVOS ESTÁTICOS ───────────────────────────────────────────
app.use('/firmas', express.static(FIRMAS_DIR));

// ─── RUTAS PÚBLICAS (No requieren token) ──────────────────────────
app.get('/status', (req, res) => {
    res.json({ status: 'API IVEMAR activa', version: '3.0 - Segura' });
});

app.use('/api/auth', require('./routes/auth'));
app.use('/api/sala', limiterSala, require('./routes/sala')); // Sala blindada con su propio limitador

// ─── RUTAS PROTEGIDAS (Requieren sesión válida) ───────────────────
// requireAuth() bloquea el paso si no hay cookie o si la cuenta no está aprobada.
// Se puede pasar un array con roles permitidos: requireAuth(['admin', 'jefe'])

app.use('/api/unidades', requireAuth(), require('./routes/unidades'));
app.use('/api/legajos', requireAuth(), require('./routes/legajos'));
app.use('/api/ordenes', requireAuth(), require('./routes/ordenes'));
app.use('/api/actividades', requireAuth(), require('./routes/actividades'));
app.use('/api/feriados', requireAuth(), require('./routes/feriados'));
// Restringido solo para el admin
app.use('/api/usuarios', requireAuth(['admin']), require('./routes/usuarios'));

// Restringir informes solo a jefes y administradores (opcional, ajustalo a tu lógica)
app.use('/api/informes', requireAuth(['admin', 'jefe', 'asesor']), require('./routes/informes'));

// ─── INICIAR TAREAS PROGRAMADAS ────────────────────────────────────
iniciarCron();

// ─── ARRANQUE ──────────────────────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 API IVEMAR Segura activa en http://0.0.0.0:${PORT}`);
    console.log(`📁 Firmas: ${FIRMAS_DIR}`);
});