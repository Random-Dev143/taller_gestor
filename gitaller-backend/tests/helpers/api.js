'use strict';
// Nota sobre `--forceExit` en el script `npm test`: el `fetch()` global de Node
// reutiliza conexiones keep-alive por debajo (undici), así que sin forceExit el
// proceso de Jest queda esperando indefinidamente a que esos sockets se cierren
// solos en vez de terminar apenas corrieron los tests. globalTeardown ya mata
// al server de test, así que forceExit es seguro acá (no deja nada huérfano).
const fs = require('fs');
const { STATE_FILE } = require('../setup/globalSetup');

function baseURL() {
    const { baseURL } = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    return baseURL;
}

async function req(method, path, { token, body } = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(`${baseURL()}${path}`, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined
    });

    let data = null;
    const text = await res.text();
    try { data = text ? JSON.parse(text) : null; } catch (_) { data = text; }

    return { status: res.status, ok: res.ok, data };
}

const get = (path, opts) => req('GET', path, opts);
const post = (path, body, opts = {}) => req('POST', path, { ...opts, body });
const put = (path, body, opts = {}) => req('PUT', path, { ...opts, body });
const del = (path, opts) => req('DELETE', path, opts);

let tokenCache = null;

// Credenciales del admin por defecto que crea el propio server al arrancar
// (ver routes/auth.js) — mismas que usamos a mano con curl durante el refactor.
async function loginAdmin() {
    if (tokenCache) return tokenCache;
    const { status, data } = await post('/api/auth/login', {
        email: 'admin@gitaller.com',
        password: 'gitaller123'
    });
    if (status !== 200 || !data || !data.token) {
        throw new Error(`No se pudo loguear como admin en el server de test: ${status} ${JSON.stringify(data)}`);
    }
    tokenCache = data.token;
    return tokenCache;
}

module.exports = { get, post, put, del, loginAdmin, baseURL };
