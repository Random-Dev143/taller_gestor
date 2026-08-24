'use strict';
// ─── ARRANQUE DEL SERVIDOR PARA TESTS ───────────────────────────────
// Levanta el server.js REAL (no un mock) como proceso hijo, apuntando a un
// %APPDATA% temporal y descartable, para que:
//   1. Se ejerciten conexión + esquema + migraciones + seed tal cual corren
//      en producción (lo mismo que veníamos verificando a mano con curl).
//   2. Los tests nunca toquen la base de datos real de una instalación.
// Corre una sola vez para toda la suite (ver jest.config.js: maxWorkers=1),
// así todos los archivos de test comparten el mismo server y la misma DB.

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const STATE_FILE = path.join(os.tmpdir(), 'gitaller-test-state.json');

// IMPORTANTE: server.js NO usa process.env.PORT como puerto final — lo
// resuelve leyendo `configuracion.puerto_servidor` de la base (ver
// setTimeout final en server.js), columna cuyo DEFAULT es 5881. Como acá
// arrancamos con una %APPDATA% nueva, el seed inserta esa fila con el
// default, así que el server SIEMPRE termina escuchando en 5881, pase lo
// que pase con PORT. Por eso los tests apuntan directo a 5881 en vez de
// inventarse un puerto "de test" que en la práctica nunca se usaría.
// Consecuencia: no se puede correr la suite mientras haya otra instancia
// de GITaller (o `node server.js` manual) escuchando ese puerto.
const PORT = 5881;

async function esperarServidor(baseURL, intentosMax = 40) {
    for (let i = 0; i < intentosMax; i++) {
        try {
            const res = await fetch(`${baseURL}/status`);
            if (res.ok) return true;
        } catch (_) { /* todavía no levantó */ }
        await new Promise(r => setTimeout(r, 300));
    }
    throw new Error(`El servidor de test no respondió en ${baseURL} tras ${intentosMax} intentos`);
}

// /status responde en cuanto Express arranca a escuchar, pero el admin por
// defecto (admin@gitaller.com) lo crea routes/auth.js recién 1 segundo
// DESPUÉS de que ese módulo se carga (setTimeout(asegurarAdmin, 1000) —
// deliberado en el código de producción, no es un bug: le da tiempo a que
// terminen antes las migraciones/seed de permisos de las que depende
// asegurarAdmin para poder vincular el rol "Administrador").
//
// Si los tests arrancaran a pegarle al login apenas /status responde, hay
// una ventana real donde el admin todavía no existe y el primer login de
// la suite recibe 401 por pura carrera de tiempos — no por credenciales
// erróneas. Por eso esperamos acá, en el setup, a que un login de prueba
// funcione de verdad, reintentando, en vez de asumir que "servidor arriba"
// == "listo para loguear".
async function esperarAdminListo(baseURL, intentosMax = 30) {
    for (let i = 0; i < intentosMax; i++) {
        try {
            const res = await fetch(`${baseURL}/api/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: 'admin@gitaller.com', password: 'gitaller123' })
            });
            if (res.ok) {
                const data = await res.json();
                if (data && data.token) return true;
            }
        } catch (_) { /* todavía no */ }
        await new Promise(r => setTimeout(r, 200));
    }
    throw new Error(`El admin por defecto no quedó disponible para login tras ${intentosMax} intentos`);
}

module.exports = async function globalSetup() {
    const tmpAppData = fs.mkdtempSync(path.join(os.tmpdir(), 'gitaller-test-appdata-'));

    const env = {
        ...process.env,
        APPDATA: tmpAppData,
        PORT: String(PORT),
        NODE_ENV: 'test'
    };

    const serverPath = path.join(__dirname, '..', '..', 'server.js');
    const logFile = path.join(tmpAppData, 'server-test.log');
    const logStream = fs.createWriteStream(logFile);

    const child = spawn(process.execPath, [serverPath], {
        cwd: path.join(__dirname, '..', '..'),
        env,
        stdio: ['ignore', 'pipe', 'pipe']
    });
    child.stdout.pipe(logStream);
    child.stderr.pipe(logStream);

    const baseURL = `http://127.0.0.1:${PORT}`;
    await esperarServidor(baseURL);
    await esperarAdminListo(baseURL);

    fs.writeFileSync(STATE_FILE, JSON.stringify({
        pid: child.pid,
        baseURL,
        tmpAppData,
        logFile
    }));

    // Se desconecta del proceso padre (Jest) para que no muera antes de tiempo,
    // pero seguimos siendo dueños de matarlo explícitamente en globalTeardown.
    child.unref();
};

module.exports.STATE_FILE = STATE_FILE;
