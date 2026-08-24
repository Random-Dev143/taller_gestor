async function up({ run, all }) {
    const cols = (await all(`PRAGMA table_info(tiempos_actividad)`)).map(c => c.name);
    if (cols.includes('legajo_mecanico')) return;

    await run(`ALTER TABLE tiempos_actividad ADD COLUMN legajo_mecanico TEXT`);
    // Best-effort: las sesiones viejas se atribuyen al mecánico representante de su actividad
    await run(`
        UPDATE tiempos_actividad
        SET legajo_mecanico = (SELECT legajo_mecanico FROM actividades WHERE id = tiempos_actividad.actividad_id)
        WHERE legajo_mecanico IS NULL
    `);
    console.log('✅ Migración de sesiones de tiempo por mecánico (tiempos_actividad.legajo_mecanico) completada.');
}

module.exports = { up };
