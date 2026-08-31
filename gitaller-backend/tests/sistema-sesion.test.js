'use strict';
// ─── MANTENIMIENTO DEL SISTEMA Y RENOVACIÓN DE SESIÓN ────────────────
// Cubre routes/sistema.js (checkpoint-seguro) y el endpoint /auth/refresh
// agregado a routes/auth.js. Ambos existen para el flujo de "sesión por
// vencer" del frontend (useSessionExpiry.js): antes de cerrar la sesión
// por inactividad, o antes de cerrar la ventana de Tauri (que mata el
// sidecar de Node a la fuerza), se le pide al backend un checkpoint del
// WAL + backup consistente para minimizar el riesgo de dejar la base
// desincronizada respecto al -wal/-shm.

const { get, post, loginAdmin } = require('./helpers/api');

let token;

beforeAll(async () => {
    token = await loginAdmin();
});

describe('POST /sistema/checkpoint-seguro', () => {
    test('con token válido, hace el checkpoint y responde 200', async () => {
        const { status, data } = await post('/api/sistema/checkpoint-seguro', {}, { token });
        expect(status).toBe(200);
        expect(data.status).toMatch(/checkpoint/i);
    });

    test('sin token, responde 401 (protegido)', async () => {
        const { status } = await post('/api/sistema/checkpoint-seguro', {});
        expect(status).toBe(401);
    });
});

describe('POST /auth/refresh', () => {
    test('con un token válido, devuelve uno nuevo', async () => {
        const { status, data } = await post('/api/auth/refresh', {}, { token });
        expect(status).toBe(200);
        expect(typeof data.token).toBe('string');
        expect(data.token.split('.').length).toBe(3);
        // El token nuevo tiene que servir para pegarle a una ruta protegida
        const check = await get('/api/ordenes', { token: data.token });
        expect(check.status).toBe(200);
    });

    test('sin token, responde 401', async () => {
        const { status } = await post('/api/auth/refresh', {});
        expect(status).toBe(401);
    });

    test('con un token inválido, responde 401', async () => {
        const { status } = await post('/api/auth/refresh', {}, { token: 'esto-no-es-un-jwt' });
        expect(status).toBe(401);
    });
});
