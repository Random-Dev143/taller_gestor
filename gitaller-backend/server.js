'use strict';
const path = require('path');
const os = require('os');
const fs = require('fs');
const crypto = require('crypto');

// ─── JWT_SECRET: generado localmente por instalación, nunca distribuido ───
// IMPORTANTE (seguridad): este secret firma las sesiones de los usuarios.
// NO debe hardcodearse en el código ni distribuirse igual en cada instalador,
// porque el .exe está compilado con `pkg` y es reversible: cualquiera que
// consiga el instalador podría extraer un secret compartido y forjar tokens
// válidos para CUALQUIER instalación del sistema, no solo la suya.
//
// En vez de eso: en el primer arranque de cada PC se genera un secret
// aleatorio de 512 bits y se guarda en %APPDATA%\GITaller\secret.key (la
// misma carpeta donde ya vive taller.db). En arranques siguientes se
// reutiliza el mismo archivo, así las sesiones no se invalidan cada vez que
// el watchdog reinicia el backend. Este archivo nunca sale de la PC del
// cliente: no viaja en el instalador, no está en el código fuente ni en git.
const appDataPath = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
const APP_DIR = path.join(appDataPath, 'GITaller');
if (!fs.existsSync(APP_DIR)) fs.mkdirSync(APP_DIR, { recursive: true });

const SECRET_FILE = path.join(APP_DIR, 'secret.key');

function obtenerOGenerarSecret() {
    if (fs.existsSync(SECRET_FILE)) {
        const existente = fs.readFileSync(SECRET_FILE, 'utf8').trim();
        if (existente) return existente;
    }
    const nuevoSecret = crypto.randomBytes(64).toString('hex'); // 512 bits
    fs.writeFileSync(SECRET_FILE, nuevoSecret, { mode: 0o600 });
    console.log('🔑 Nuevo JWT_SECRET generado para esta instalación:', SECRET_FILE);
    return nuevoSecret;
}

// Se define ANTES de requerir cualquier otro módulo (como middlewares/auth.js),
// porque ese módulo lee process.env.JWT_SECRET apenas se carga.
process.env.JWT_SECRET = obtenerOGenerarSecret();

// Cargamos igual un .env opcional (junto al propio ejecutable) para otras
// variables no sensibles, como PORT. Ya no se usa para JWT_SECRET.
const exeDir = path.dirname(process.pkg ? process.execPath : __filename);
require('dotenv').config({ path: path.join(exeDir, '.env') });

const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser'); // 2. Manejador de cookies
const rateLimit = require('express-rate-limit'); // 3. Límite de peticiones

const iniciarCron = require('./utils/cron');
const { requireAuth } = require('./middlewares/auth'); // 4. Middleware de seguridad

const app = express();
const PORT = process.env.PORT || 5881;
const FIRMAS_DIR = path.join(APP_DIR, 'firmas');

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
        if (!origin) return callback(null, true);

        // Se añaden los esquemas nativos de Tauri (Mac/Linux y Windows)
        const allowedOrigins = /^https?:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+)(:\d+)?$|^tauri:\/\/localhost$|^http:\/\/tauri\.localhost$/;

        if (allowedOrigins.test(origin)) {
            callback(null, true);
        } else {
            callback(new Error('Acceso denegado por políticas de CORS. Origen no autorizado.'));
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
};
app.use(cors(corsOptions));

// ─── ARCHIVOS ESTÁTICOS ───────────────────────────────────────────
app.use('/firmas', express.static(FIRMAS_DIR));
// (El frontend/dist se registra MÁS ABAJO, después de todas las rutas
// /api — ver comentario junto a sincronizarDist(). Si se registra acá
// arriba, su catch-all intercepta también las peticiones GET a /api/*
// y las deja colgadas sin respuesta, porque el handler no llama a next()
// cuando el path empieza con /api.)

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
app.use('/api/ordenes', requireAuth(['ot_ver_lista', 'ot_crear', 'ot_editar']), require('./modules/ordenes/ordenes.routes'));

// Tareas Operativas
app.use('/api/actividades', requireAuth(['tarea_ver_propias', 'tarea_gestionar_todas']), require('./modules/actividades/actividades.routes'));

// Feriados y Excepciones
app.use('/api/feriados', requireAuth(['ausencia_justificar', 'rol_gestionar']), require('./routes/feriados'));

// Informes y Estadísticas
app.use('/api/informes', requireAuth(['informe_financiero', 'informe_operativo', 'informe_taller']), require('./routes/informes'));

// Configuración y Administración del Sistema
app.use('/api/usuarios', requireAuth(['usuario_gestionar']), require('./routes/usuarios'));
app.use('/api/roles', requireAuth(['rol_gestionar']), require('./routes/roles')); // <-- NUEVA RUTA PARA ROLES

// NUEVO: Módulo de Repuestos (Pañol)
app.use('/api/repuestos', requireAuth(['repuesto_ver', 'repuesto_gestionar']), require('./modules/repuestos/repuestos.routes'));

// --- SERVIR EL FRONTEND A LA RED LOCAL (TV, Celulares) ---
// IMPORTANTE: este bloque va DESPUÉS de todas las rutas /api. Si se
// registra antes, su catch-all intercepta también los GET a /api/* y los
// deja colgados sin respuesta (el handler no llama a next() para esos
// paths), lo que hace que el frontend nunca reciba respuesta de /auth/me
// y quede con una pantalla en blanco esperando para siempre.
//
// El dist viaja EMBEBIDO dentro del .exe (ver pkg.assets en package.json).
// __dirname acá apunta al snapshot virtual de pkg, no a disco real —eso
// está bien, es justo de ahí de donde lo leemos para copiarlo una sola vez
// a %APPDATA%\GITaller\dist, que es carpeta real y persistente, y queda
// fuera de la carpeta de instalación (no al lado del .exe).
const distSourcePath = path.join(__dirname, 'dist');
const distPath = path.join(APP_DIR, 'dist'); // %APPDATA%\GITaller\dist

// La app corre sin consola visible (sidecar de Tauri), así que dejamos
// constancia en un archivo de log dentro de APP_DIR. Es la única forma
// práctica de diagnosticar esto en una instalación real del cliente.
const DIST_LOG_FILE = path.join(APP_DIR, 'dist-sync.log');
function logDist(msg) {
    const linea = `[${new Date().toISOString()}] ${msg}\n`;
    try { fs.appendFileSync(DIST_LOG_FILE, linea); } catch (_) { /* no-op */ }
}

// fs.cpSync (y en general las variantes "nativas" de copiado que dependen
// de lstat con paths largos \\?\...) NO son compatibles con el filesystem
// virtual que pkg monta para leer el snapshot embebido en el .exe.
// readdirSync / readFileSync / mkdirSync / writeFileSync sí lo son, así que
// copiamos a mano recorriendo el árbol con esas.
function copiarRecursivoDesdeSnapshot(origen, destino) {
    fs.mkdirSync(destino, { recursive: true });
    const entradas = fs.readdirSync(origen, { withFileTypes: true });
    for (const entrada of entradas) {
        const origenPath = path.join(origen, entrada.name);
        const destinoPath = path.join(destino, entrada.name);
        if (entrada.isDirectory()) {
            copiarRecursivoDesdeSnapshot(origenPath, destinoPath);
        } else {
            const contenido = fs.readFileSync(origenPath);
            fs.writeFileSync(destinoPath, contenido);
        }
    }
}

function sincronizarDist() {
    logDist(`__dirname = ${__dirname}`);
    logDist(`distSourcePath = ${distSourcePath}`);
    logDist(`distPath (destino) = ${distPath}`);

    if (!fs.existsSync(distSourcePath)) {
        logDist('ERROR: no se encontró dist embebido en el paquete (distSourcePath no existe). La UI de red no estará disponible.');
        return false;
    }
    try {
        const archivos = fs.readdirSync(distSourcePath);
        logDist(`dist embebido encontrado con ${archivos.length} entradas: ${archivos.join(', ')}`);

        // Se sobreescribe en cada arranque: así %APPDATA% siempre refleja
        // la versión del .exe que está corriendo, sin mezclar versiones viejas.
        fs.rmSync(distPath, { recursive: true, force: true });
        copiarRecursivoDesdeSnapshot(distSourcePath, distPath);
        logDist('OK: dist copiado correctamente a APPDATA.');
        return true;
    } catch (err) {
        logDist(`ERROR copiando dist a AppData: ${err.stack || err}`);
        return false;
    }
}

if (sincronizarDist()) {
    // 1. Sirve los archivos estáticos compilados (JS, CSS, imágenes)
    app.use(express.static(distPath));

    // 2. Redirige cualquier otra ruta de la red al index.html para que funcione Vue Router
    // NOTA: Express 5 (path-to-regexp v8) ya no acepta '*' como string suelto,
    // hay que usar una regex equivalente. Como este bloque ya está DESPUÉS
    // de todas las rutas /api, cualquier GET a /api/* que no matcheó arriba
    // ya cayó en un 404 real de Express antes de llegar acá — no hace falta
    // el chequeo de req.path.startsWith('/api') para "no hacer nada", pero
    // lo dejamos igual como capa extra de seguridad explícita.
    app.get(/.*/, (req, res) => {
        if (!req.path.startsWith('/api') && !req.path.startsWith('/firmas')) {
            res.sendFile(path.join(distPath, 'index.html'));
        } else {
            res.status(404).json({ error: 'Recurso de API no encontrado' });
        }
    });
}

// ─── INICIAR TAREAS PROGRAMADAS ────────────────────────────────────
iniciarCron();

// ─── ARRANQUE DINÁMICO ─────────────────────────────────────────────
const { get } = require('./config/database');

// Levanta el servidor en el puerto indicado, manejando explícitamente el
// error EADDRINUSE (puerto ocupado). Antes este error no se manejaba y,
// si un proceso backend anterior seguía vivo/colgado ocupando el puerto
// (por ejemplo tras un reinicio del watchdog de Tauri), el proceso nuevo
// moría en el acto de forma silenciosa y el watchdog nunca lograba
// "revivir" el backend. Ahora reintenta unas cuantas veces antes de rendirse.
function iniciarServidor(port, intento = 1) {
    const MAX_INTENTOS = 5;
    const server = app.listen(port, '0.0.0.0', () => {
        console.log(`🚀 API Taller Segura activa en http://0.0.0.0:${port}`);
        console.log(`📁 Firmas y Logos: ${FIRMAS_DIR}`);
    });

    server.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
            if (intento >= MAX_INTENTOS) {
                console.error(`❌ Puerto ${port} sigue ocupado tras ${MAX_INTENTOS} intentos. Abortando.`);
                process.exit(1);
                return;
            }
            console.error(`⚠️ Puerto ${port} ocupado (intento ${intento}/${MAX_INTENTOS}). Reintentando en 1.5s...`);
            setTimeout(() => iniciarServidor(port, intento + 1), 1500);
        } else {
            console.error('❌ Error al iniciar servidor:', err);
            process.exit(1);
        }
    });
}

// Esperamos a que database.js termine de crear/migrar las tablas.
// Se mantiene un pequeño margen (500ms) en vez de 1.5s fijos, ya que en la
// mayoría de los arranques la migración termina mucho antes; esto agiliza
// el arranque general y ayuda a que el frontend cargue la configuración
// en el primer intento en vez de tener que reintentar varias veces.
setTimeout(async () => {
    try {
        const conf = await get(`SELECT puerto_servidor FROM configuracion WHERE id = 1`);
        const PORT_FINAL = (conf && conf.puerto_servidor) ? conf.puerto_servidor : PORT;
        iniciarServidor(PORT_FINAL);
    } catch (error) {
        // Fallback de emergencia
        iniciarServidor(PORT);
    }
}, 500);
