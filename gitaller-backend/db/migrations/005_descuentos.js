async function up({ run, all }) {
    const cols = (await all(`PRAGMA table_info(ordenes)`)).map(c => c.name);
    if (cols.includes('monto_descuento')) return;

    await run(`ALTER TABLE ordenes ADD COLUMN monto_descuento REAL DEFAULT 0`);
    await run(`ALTER TABLE ordenes ADD COLUMN descuento_motivo TEXT DEFAULT ''`);
    // 'ninguno' | 'pendiente' | 'autorizado' | 'rechazado'
    await run(`ALTER TABLE ordenes ADD COLUMN descuento_estado TEXT DEFAULT 'ninguno'`);
    await run(`ALTER TABLE ordenes ADD COLUMN descuento_autorizado_por TEXT`);
    await run(`ALTER TABLE ordenes ADD COLUMN descuento_autorizado_en DATETIME`);
}

module.exports = { up };
