async function up({ run, all }) {
    const cols = (await all(`PRAGMA table_info(configuracion)`)).map(c => c.name);
    if (cols.includes('slogan')) return;

    await run(`ALTER TABLE configuracion ADD COLUMN slogan TEXT DEFAULT ''`);
    await run(`ALTER TABLE configuracion ADD COLUMN direccion TEXT DEFAULT ''`);
    await run(`ALTER TABLE configuracion ADD COLUMN cuit TEXT DEFAULT ''`);
    await run(`ALTER TABLE configuracion ADD COLUMN telefono TEXT DEFAULT ''`);
    await run(`ALTER TABLE configuracion ADD COLUMN email TEXT DEFAULT ''`);
    console.log('✅ Migración de configuración (datos de membrete) completada.');
}

module.exports = { up };
