'use strict';
// ─── CONEXIÓN A LA BASE DE DATOS ────────────────────────────────────
// Responsabilidad única de este archivo: abrir el archivo .db en
// %APPDATA%\GITaller\taller.db, configurar PRAGMAs, y exponer los
// helpers Promise-based (run/all/get) + un runner de transacciones.
// No define tablas ni migraciones — eso vive en schema.js y migrations.js.

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const os = require('os');
const fs = require('fs');

const appDataPath = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
const appFolder = path.join(appDataPath, 'GITaller');

if (!fs.existsSync(appFolder)) {
    fs.mkdirSync(appFolder, { recursive: true });
}

const DB_PATH = path.join(appFolder, 'taller.db');
const db = new sqlite3.Database(DB_PATH);

const run = (sql, params = []) => new Promise((resolve, reject) => {
    db.run(sql, params, function (err) { if (err) reject(err); else resolve(this); });
});
const all = (sql, params = []) => new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => { if (err) reject(err); else resolve(rows); });
});
const get = (sql, params = []) => new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => { if (err) reject(err); else resolve(row); });
});

const withTransaction = async (callback) => {
    await run('BEGIN TRANSACTION');
    try {
        const result = await callback();
        await run('COMMIT');
        return result;
    } catch (error) {
        await run('ROLLBACK');
        console.error('⚠️ Transacción revertida:', error.message);
        throw error;
    }
};

module.exports = { db, run, all, get, withTransaction, DB_PATH, appFolder };
