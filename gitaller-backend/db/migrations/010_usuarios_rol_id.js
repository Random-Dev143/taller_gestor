async function up({ run, all }) {
    const cols = (await all(`PRAGMA table_info(usuarios)`)).map(c => c.name);
    if (!cols.includes('rol_id')) {
        await run(`ALTER TABLE usuarios ADD COLUMN rol_id TEXT REFERENCES roles(id) ON DELETE SET NULL`);
    }
}

module.exports = { up };
