async function up({ run, all }) {
    const cols = (await all(`PRAGMA table_info(configuracion)`)).map(c => c.name);
    if (!cols.includes('puerto_servidor')) {
        // Este ALTER solo corre en instalaciones viejas que ya tenían la
        // tabla `configuracion` de antes de que existiera esta columna (para
        // instalaciones nuevas, 001_schema_inicial.js ya la trae desde el
        // CREATE TABLE). El default acá es solo un valor de arranque; una
        // vez migrado, cada instalación tiene su propio valor guardado
        // explícitamente, así que cambiar este default no afecta a nadie
        // que ya haya pasado por acá (como la base de producción real).
        await run(`ALTER TABLE configuracion ADD COLUMN puerto_servidor INTEGER DEFAULT 5723`);
    }
}

module.exports = { up };
