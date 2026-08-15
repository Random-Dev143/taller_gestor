'use strict';
// ─── ORQUESTADOR DE LA BASE DE DATOS ────────────────────────────────
// Punto de entrada único para todo lo relacionado a la base: conexión,
// esquema, migraciones y seed. Reproduce EXACTAMENTE la secuencia de
// arranque que tenía el config/database.js original (mismo orden,
// mismo setTimeout de 500ms para dar tiempo a que el schema termine
// de crearse antes de migrar).

const { db, run, all, get, withTransaction, DB_PATH } = require('./connection');
const { crearEsquema } = require('./schema');
const { migrarEstructura } = require('./migrations');
const { inicializarTallerInterno, inicializarRolesYPermisos } = require('./seed');

db.serialize(async () => {
    db.run('PRAGMA foreign_keys = ON');
    db.run('PRAGMA journal_mode = WAL');
    db.run('PRAGMA busy_timeout = 5000');

    crearEsquema(db);

    setTimeout(async () => {
        await migrarEstructura({ run, all, get, withTransaction });
        await inicializarTallerInterno({ run, get });
        await inicializarRolesYPermisos({ run, get });

        // Inyectar configuración por defecto
        const conf = await get(`SELECT id FROM configuracion WHERE id = 1`);
        if (!conf) await run(`INSERT INTO configuracion (id) VALUES (1)`);
    }, 500);
});

module.exports = { db, run, all, get, DB_PATH, withTransaction };
