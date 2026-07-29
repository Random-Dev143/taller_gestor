// Trabajo en equipo independiente: cada mecánico de una actividad tiene su propio
// estado (Asignada/En Curso/Pausada/Finalizada), su propio acumulado de horas, y
// puede escribir su propio informe/aporte, sin depender de lo que hagan sus compañeros.
async function up({ run, all }) {
    const cols = (await all(`PRAGMA table_info(actividad_mecanicos)`)).map(c => c.name);
    if (cols.includes('estado')) return;

    await run(`ALTER TABLE actividad_mecanicos ADD COLUMN estado TEXT NOT NULL DEFAULT 'Asignada'`);
    await run(`ALTER TABLE actividad_mecanicos ADD COLUMN tiempo_real REAL NOT NULL DEFAULT 0`);
    await run(`ALTER TABLE actividad_mecanicos ADD COLUMN informe TEXT`);

    // Migración de datos: para las actividades ya existentes, el estado/tiempo_real
    // "de la actividad" en realidad pertenecía a UNA sola persona (el sistema todavía
    // no soportaba equipos independientes). Se lo asignamos al mecánico "representante"
    // (actividades.legajo_mecanico); el resto del equipo, si lo hay, arranca en 0/Asignada
    // porque no hay forma de reconstruir cuánto trabajó cada uno en el pasado.
    await run(`
        UPDATE actividad_mecanicos
        SET estado = (SELECT a.estado FROM actividades a WHERE a.id = actividad_mecanicos.actividad_id),
            tiempo_real = (SELECT a.tiempo_real FROM actividades a WHERE a.id = actividad_mecanicos.actividad_id)
        WHERE legajo_mecanico = (SELECT a.legajo_mecanico FROM actividades a WHERE a.id = actividad_mecanicos.actividad_id)
    `);
    console.log('✅ Migración de equipo independiente (actividad_mecanicos) completada.');
}

module.exports = { up };
