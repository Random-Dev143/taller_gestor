// gitaller-backend/db/migrations/014_actividades_cerrada_por_jefe_es_rutina.js
//
// Tareas Internas (ot='0000'): distinción entre rutinas (limpieza,
// capacitaciones periódicas — no tienen fin, nunca se cierran ni se
// vuelven a crear) y extraordinarias (reparaciones internas puntuales
// con un tiempo_estimado real, que sí se cierran cuando terminan y sí
// cuentan para eficacia/eficiencia). Por defecto 0 (extraordinaria)
// para no reclasificar silenciosamente tareas ya existentes como
// rutinas — el Jefe las revisa y marca a mano cuáles corresponden.
//
// Esta migración cubre 3 escenarios de instalación, porque esta rama
// (arquitectura de `repuestos`) se separó de `dev` ANTES de que `dev`
// tuviera este fix:
//   a) Instalación vieja, sin 'Cerrada por Jefe' en el CHECK de `estado`
//      y sin `es_rutina` -> hace falta reconstruir la tabla entera.
//   b) Instalación que ya venía corriendo `dev` (con el fix viejo
//      aplicado): ya tiene 'Cerrada por Jefe' en el CHECK, pero le
//      falta `es_rutina` -> alcanza con un ALTER TABLE simple.
//   c) Instalación nueva (001_schema_inicial.js ya trae 'Cerrada por
//      Jefe' en el CHECK, pero todavía no tenía `es_rutina` en su
//      definición) -> mismo caso que (b), ALTER simple.
async function up({ run, all, get, withTransaction }) {
    const actividadesDDL = await get(`SELECT sql FROM sqlite_master WHERE type='table' AND name='actividades'`);
    const faltaEstadoCerradaPorJefe = actividadesDDL && !actividadesDDL.sql.includes('Cerrada por Jefe');
    const actividadesCols = (await all(`PRAGMA table_info(actividades)`)).map(c => c.name);
    const faltaEsRutina = !actividadesCols.includes('es_rutina');

    if (faltaEstadoCerradaPorJefe) {
        await run('PRAGMA foreign_keys=OFF');
        await withTransaction(async () => {
            await run(`CREATE TABLE actividades_new2 (id INTEGER PRIMARY KEY AUTOINCREMENT, ot TEXT NOT NULL, descripcion TEXT NOT NULL, tiempo_estimado REAL NOT NULL, tiempo_real REAL DEFAULT 0, estado TEXT DEFAULT 'Asignada' CHECK(estado IN ('Pendiente', 'Asignada', 'En Curso', 'Pausada', 'Finalizada', 'Cerrada por Jefe')), legajo_mecanico TEXT NOT NULL, auto_pausa INTEGER DEFAULT 0, fecha_inicio DATETIME, fecha_fin DATETIME, es_rutina INTEGER NOT NULL DEFAULT 0, FOREIGN KEY(ot) REFERENCES ordenes(ot) ON DELETE CASCADE ON UPDATE CASCADE, FOREIGN KEY(legajo_mecanico) REFERENCES legajos(legajo) ON DELETE RESTRICT ON UPDATE CASCADE)`);
            await run(`INSERT INTO actividades_new2 (id, ot, descripcion, tiempo_estimado, tiempo_real, estado, legajo_mecanico, auto_pausa, fecha_inicio, fecha_fin) SELECT id, ot, descripcion, tiempo_estimado, tiempo_real, estado, legajo_mecanico, auto_pausa, fecha_inicio, fecha_fin FROM actividades`);
            await run(`DROP TABLE actividades`);
            await run(`ALTER TABLE actividades_new2 RENAME TO actividades`);
        });
        await run('PRAGMA foreign_keys=ON');
        console.log('✅ Migración de actividades completada (CHECK constraint con "Cerrada por Jefe" + columna es_rutina).');
    } else if (faltaEsRutina) {
        await run(`ALTER TABLE actividades ADD COLUMN es_rutina INTEGER NOT NULL DEFAULT 0`);
        console.log('✅ Migración de tareas internas (es_rutina) completada.');
    }
}

module.exports = { up };
