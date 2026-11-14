'use strict';
// El backup que se hace al cerrar la app tiene que ser atómico: un archivo "taller_*.db" siempre está
// completo; si el proceso se corta a mitad quedan, como mucho, restos .tmp que se limpian solos.
const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3');
const { post, loginAdmin } = require('./helpers/api');
const { STATE_FILE } = require('./setup/globalSetup');

let token, dirBackups;

const integridad = (ruta) => new Promise((resolve, reject) => {
    const db = new sqlite3.Database(ruta, sqlite3.OPEN_READONLY, (e) => {
        if (e) return reject(e);
        db.get('PRAGMA integrity_check', (err, row) => { db.close(); err ? reject(err) : resolve(Object.values(row)[0]); });
    });
});

beforeAll(async () => {
    token = await loginAdmin();
    const { tmpAppData } = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    dirBackups = path.join(tmpAppData, process.env.GITALLER_APPDATA_FOLDER || 'GITaller', 'backups');
});

test('checkpoint-seguro deja un backup completo y válido, sin restos .tmp', async () => {
    const r = await post('/api/sistema/checkpoint-seguro', {}, { token });
    expect(r.status).toBe(200);
    const archivos = fs.readdirSync(dirBackups);
    const backups = archivos.filter(f => /^taller_.*\.db$/.test(f));
    expect(backups.length).toBeGreaterThan(0);
    expect(archivos.filter(f => f.endsWith('.tmp'))).toEqual([]);
    const ultimo = backups.map(f => ({ f, t: fs.statSync(path.join(dirBackups, f)).mtimeMs })).sort((a, b) => b.t - a.t)[0].f;
    expect(await integridad(path.join(dirBackups, ultimo))).toBe('ok');
});

test('un .tmp viejo (backup interrumpido) se limpia; uno reciente (backup en curso) se respeta', async () => {
    const viejo = path.join(dirBackups, 'taller_2000-01-01T00-00-00-000Z.db.tmp');
    const reciente = path.join(dirBackups, 'taller_2999-01-01T00-00-00-000Z.db.tmp');
    fs.writeFileSync(viejo, 'a medias');
    fs.writeFileSync(reciente, 'en curso');
    const hace2h = new Date(Date.now() - 2 * 60 * 60 * 1000);
    fs.utimesSync(viejo, hace2h, hace2h);

    expect((await post('/api/sistema/checkpoint-seguro', {}, { token })).status).toBe(200);

    expect(fs.existsSync(viejo)).toBe(false);
    expect(fs.existsSync(reciente)).toBe(true);
    fs.unlinkSync(reciente);
});

test('los .tmp no cuentan para la rotación: nunca desplazan a un backup bueno', async () => {
    const huerfano = path.join(dirBackups, 'taller_2998-01-01T00-00-00-000Z.db.tmp');
    fs.writeFileSync(huerfano, 'x');
    const antes = fs.readdirSync(dirBackups).filter(f => /^taller_.*\.db$/.test(f)).length;
    await post('/api/sistema/checkpoint-seguro', {}, { token });
    const despues = fs.readdirSync(dirBackups).filter(f => /^taller_.*\.db$/.test(f)).length;
    expect(despues).toBeGreaterThanOrEqual(Math.min(antes, 14));
    fs.unlinkSync(huerfano);
});
