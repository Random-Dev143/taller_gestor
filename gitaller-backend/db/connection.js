'use strict';
// ─── CONEXIÓN A LA BASE DE DATOS ────────────────────────────────────
// Responsabilidad única de este archivo: abrir el archivo .db en
// %APPDATA%\GITaller\taller.db y exponer los helpers Promise-based
// (run/all/get) + un runner de transacciones. No define tablas ni
// migraciones (eso vive en db/migrations/*.js, orquestado por
// db/migrator.js) ni setea PRAGMAs (los setea migrator.js al arrancar).

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const os = require('os');
const fs = require('fs');

const appDataPath = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');

// Aislamiento dev/producción en la MISMA PC: por defecto usa la carpeta de
// siempre (%APPDATA%\GITaller, donde vive la base real del taller). Para
// correr un backend de pruebas en la misma máquina sin arriesgar la base
// de producción (que es exactamente lo que generó el incidente de
// corrupción de WAL que motivó este cambio), seteá la variable de entorno
// GITALLER_APPDATA_FOLDER (por ejemplo en gitaller-backend/.env, que no se
// versiona) a un nombre distinto, como 'GITaller-dev'. Con eso, el backend
// de pruebas abre su PROPIO archivo .db, completamente separado del real.
const nombreCarpeta = process.env.GITALLER_APPDATA_FOLDER || 'GITaller';
const appFolder = path.join(appDataPath, nombreCarpeta);

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
