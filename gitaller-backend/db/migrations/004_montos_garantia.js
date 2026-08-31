async function up({ run, all }) {
    const cols = (await all(`PRAGMA table_info(ordenes)`)).map(c => c.name);
    if (cols.includes('monto_repuestos_garantia')) return;

    await run(`ALTER TABLE ordenes ADD COLUMN monto_repuestos_garantia REAL DEFAULT 0`);
    await run(`ALTER TABLE ordenes ADD COLUMN monto_mano_obra_garantia REAL DEFAULT 0`);
    // Mover montos a garantía y dejar los facturables en 0 si era garantía total antigua
    await run(`UPDATE ordenes SET monto_repuestos_garantia = monto_repuestos, monto_mano_obra_garantia = monto_mano_obra, monto_repuestos = 0, monto_mano_obra = 0 WHERE es_garantia = 1`);
}

module.exports = { up };
