async function up({ run, all }) {
    const cols = (await all(`PRAGMA table_info(configuracion)`)).map(c => c.name);
    if (!cols.includes('puerto_servidor')) {
        await run(`ALTER TABLE configuracion ADD COLUMN puerto_servidor INTEGER DEFAULT 5881`);
    }
}

module.exports = { up };
