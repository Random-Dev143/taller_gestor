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
app.use('/api/configuracion', require('./routes/configuracion'));


// ─── RUTAS PROTEGIDAS (Requieren sesión válida y permisos específicos) ───

// Agenda y Contactos
app.use('/api/unidades', requireAuth(['agenda_ver', 'agenda_gestionar']), require('./routes/unidades'));

// RRHH y Legajos
app.use('/api/legajos', requireAuth(['legajo_ver', 'legajo_gestionar']), require('./routes/legajos'));

// Órdenes de Trabajo (Si tiene al menos uno de estos permisos, pasa)
app.use('/api/ordenes', requireAuth(['ot_ver_lista', 'ot_crear', 'ot_editar']), require('./routes/ordenes'));

// Tareas Operativas
app.use('/api/actividades', requireAuth(['tarea_ver_propias', 'tarea_gestionar_todas']), require('./routes/actividades'));

// Feriados y Excepciones
app.use('/api/feriados', requireAuth(['ausencia_justificar', 'rol_gestionar']), require('./routes/feriados'));

// Informes y Estadísticas
app.use('/api/informes', requireAuth(['informe_financiero', 'informe_operativo', 'informe_taller']), require('./routes/informes'));

// Configuración y Administración del Sistema
app.use('/api/usuarios', requireAuth(['usuario_gestionar']), require('./routes/usuarios'));
app.use('/api/roles', requireAuth(['rol_gestionar']), require('./routes/roles')); // <-- NUEVA RUTA PARA ROLES

// ─── INICIAR TAREAS PROGRAMADAS ────────────────────────────────────
iniciarCron();

// ─── ARRANQUE DINÁMICO ─────────────────────────────────────────────
const { get } = require('./config/database');

// Esperamos 1.5s para que database.js termine de crear/migrar las tablas
setTimeout(async () => {
    try {
        const conf = await get(`SELECT puerto_servidor FROM configuracion WHERE id = 1`);
        const PORT_FINAL = (conf && conf.puerto_servidor) ? conf.puerto_servidor : PORT;
        
        app.listen(PORT_FINAL, '0.0.0.0', () => {
            console.log(`🚀 API Taller Segura activa en http://0.0.0.0:${PORT_FINAL}`);
            console.log(`📁 Firmas y Logos: ${FIRMAS_DIR}`);
        });
    } catch (error) {
        // Fallback de emergencia
        app.listen(PORT, '0.0.0.0', () => {
            console.log(`🚀 API activa en puerto: ${PORT}`);
        });
    }
}, 1500);
