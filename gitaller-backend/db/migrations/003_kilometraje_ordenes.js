async function up({ run, all }) {
    const cols = (await all(`PRAGMA table_info(ordenes)`)).map(c => c.name);
    if (!cols.includes('kilometraje')) {
        await run(`ALTER TABLE ordenes ADD COLUMN kilometraje TEXT DEFAULT ''`);
    }
}

module.exports = { up };
