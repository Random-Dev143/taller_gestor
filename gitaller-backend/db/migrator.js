const fs = require('fs');
const path = require('path');
const { db, run, all, get, withTransaction } = require('./connection');

async function ensureMigrationsTable() {
    await run(`CREATE TABLE IF NOT EXISTS schema_migrations (
        id TEXT PRIMARY KEY,
        aplicada_en DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
}

function cargarMigraciones() {
    const dir = path.join(__dirname, 'migrations');
    return fs.readdirSync(dir)
        .filter(f => f.endsWith('.js'))
        .sort() // el prefijo numérico (001_, 002_...) define el orden de aplicación
        .map(f => ({ id: f.replace('.js', ''), mod: require(path.join(dir, f)) }));
}

// Cada migración es idempotente por diseño (verifica columnas/tablas antes de tocar
// nada, igual que hacía la vieja migrarEstructura()), así que es seguro que en una
// instalación existente se re-evalúen todas la primera vez que arranca con este
// sistema: las que ya estaban aplicadas no van a hacer nada, y quedan igual
// registradas en schema_migrations para no volver a evaluarlas en el próximo boot.
async function migrar() {
    await run('PRAGMA foreign_keys = ON');
    await run('PRAGMA journal_mode = WAL');
    await run('PRAGMA busy_timeout = 5000');

    await ensureMigrationsTable();
    const aplicadas = new Set((await all(`SELECT id FROM schema_migrations`)).map(r => r.id));
    const migraciones = cargarMigraciones();

    for (const { id, mod } of migraciones) {
        if (aplicadas.has(id)) continue;
        console.log(`⏳ Aplicando migración: ${id}`);
        try {
            await mod.up({ db, run, all, get, withTransaction });
            await run(`INSERT INTO schema_migrations (id) VALUES (?)`, [id]);
            console.log(`✅ Migración aplicada: ${id}`);
        } catch (error) {
            console.error(`❌ Error en migración ${id}:`, error.message);
            throw error;
        }
    }
}

module.exports = { migrar };
