'use strict';
const fs = require('fs');
const { get, post, loginAdmin, baseURL } = require('./helpers/api');
const { STATE_FILE } = require('./setup/globalSetup');

describe('Arranque del servidor', () => {
    test('/status responde OK', async () => {
        const { status, data } = await get('/status');
        expect(status).toBe(200);
        expect(data.status).toMatch(/activa/i);
    });

    // Lee el log de arranque con reintentos: globalSetup ya espera a que el
    // login funcione (lo que garantiza que el admin fue creado), pero el
    // *stream* del log a disco puede tardar unos milisegundos más en
    // flushear que el propio evento que dispara la escritura.
    function leerLogConReintentos(intentosMax = 20) {
        const { logFile } = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
        let log = '';
        for (let i = 0; i < intentosMax; i++) {
            log = fs.readFileSync(logFile, 'utf8');
            if (log.includes('Admin por defecto creado')) return log;
        }
        return log; // se devuelve igual lo que haya, para que el assert falle con detalle
    }

    test('el log de arranque no contiene los "tips" promocionales de dotenv', () => {
        const log = leerLogConReintentos();
        expect(log).not.toMatch(/injected env/i);
        expect(log).not.toMatch(/vestauth/i);
    });

    test('el arranque crea el admin por defecto y las OT/permisos base', () => {
        const log = leerLogConReintentos();
        expect(log).toMatch(/OT 0000 \(Trabajos Internos\) inicializada correctamente/);
        expect(log).toMatch(/Permisos y roles base inicializados correctamente/);
        expect(log).toMatch(/Admin por defecto creado/);
    });
});

describe('Autenticación', () => {
    test('login con credenciales correctas devuelve un JWT', async () => {
        const { status, data } = await post('/api/auth/login', {
            email: 'admin@gitaller.com',
            password: 'gitaller123'
        });
        expect(status).toBe(200);
        expect(typeof data.token).toBe('string');
        expect(data.token.split('.').length).toBe(3); // header.payload.signature
    });

    test('login con contraseña incorrecta es rechazado', async () => {
        const { status, data } = await post('/api/auth/login', {
            email: 'admin@gitaller.com',
            password: 'contraseña-incorrecta'
        });
        expect(status).toBeGreaterThanOrEqual(400);
        expect(status).toBeLessThan(500);
        expect(data.token).toBeUndefined();
    });

    test('una ruta protegida sin token responde 401', async () => {
        const { status } = await get('/api/ordenes');
        expect(status).toBe(401);
    });

    test('una ruta protegida con token inválido responde 401 o 403', async () => {
        const { status } = await get('/api/ordenes', { token: 'esto-no-es-un-jwt-valido' });
        expect([401, 403]).toContain(status);
    });

    test('una ruta protegida con token válido responde 200', async () => {
        const token = await loginAdmin();
        const { status } = await get('/api/ordenes', { token });
        expect(status).toBe(200);
    });
});
