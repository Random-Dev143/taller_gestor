'use strict';
// ─── ESTADOS DE OT Y ACTIVIDADES ─────────────────────────────────────
// Esto es lógica de NEGOCIO (no de acceso a datos): las reglas de cómo
// se calcula el estado agregado de una OT o de una actividad de equipo.
// Antes vivía mezclado en config/database.js junto a la conexión y las
// migraciones; se separa para poder testearlo y leerlo sin el ruido de
// PRAGMAs y CREATE TABLE alrededor.

const { run, all, get } = require('../db/connection');

async function cambiarEstado(ot, nuevoEstado) {
    const ahora = new Date().toISOString().replace('T', ' ').substring(0, 19);
    const abierto = await get(`SELECT id, ts_desde FROM estados_historial WHERE ot = ? AND ts_hasta IS NULL ORDER BY id DESC LIMIT 1`, [ot]);
    if (abierto) {
        const minutos = (Date.now() - new Date(abierto.ts_desde + 'Z').getTime()) / 60000;
        await run(`UPDATE estados_historial SET ts_hasta = ?, minutos = ? WHERE id = ?`, [ahora, minutos, abierto.id]);
    }
    await run(`INSERT INTO estados_historial (ot, estado, ts_desde) VALUES (?, ?, CURRENT_TIMESTAMP)`, [ot, nuevoEstado]);
    await run(`UPDATE ordenes SET estado_actual = ? WHERE ot = ?`, [nuevoEstado, ot]);
}

async function sincronizarEstadoOT(ot) {
    const acts = await all(`SELECT estado FROM actividades WHERE ot = ?`, [ot]);
    const orden = await get(`SELECT estado_actual FROM ordenes WHERE ot = ?`, [ot]);
    if (!orden || orden.estado_actual === 'Finalizada') return;

    let estadoCalculado = orden.estado_actual;
    const enCurso = acts.filter(a => a.estado === 'En Curso').length;
    const finalizadas = acts.filter(a => a.estado === 'Finalizada' || a.estado === 'Cerrada por Jefe').length;

    if (enCurso > 0) {
        estadoCalculado = 'En Proceso';
    } else if (acts.length > 0 && finalizadas === acts.length) {
        estadoCalculado = 'En Espera';
    } else {
        if (estadoCalculado === 'En Proceso') estadoCalculado = 'En Espera';
    }

    if (estadoCalculado !== orden.estado_actual) await cambiarEstado(ot, estadoCalculado);
}

// Recalcula el estado y el tiempo_real "de la actividad" (agregado) a partir del
// estado individual de cada mecánico del equipo (actividad_mecanicos). La actividad
// ya NO es la fuente de verdad del estado/tiempo: es un resumen calculado.
//
// Reglas (ver flujos de trabajo reales que las motivan):
// - Si alguien está "En Curso" -> la actividad se ve "En Curso" (aunque otro ya haya terminado su parte).
// - Si nadie está "En Curso", nadie quedó "Asignada" sin arrancar, y al menos uno "Finalizada"
//   -> la actividad se considera Finalizada (el resto que quedó "Pausada" sin cerrar formalmente
//      no bloquea el cierre: son compañeros que entregaron la posta o no volvieron a loguearse,
//      y siguen viendo la tarea para reanudarla o completar su informe).
// - Si el Jefe la cerró manualmente ("Cerrada por Jefe"), esa cerradura manda salvo que alguien
//   la reabra activamente poniéndose "En Curso".
// - Cualquier otro caso intermedio -> "Pausada".
async function sincronizarEstadoActividad(actividadId) {
    const miembros = await all(`SELECT estado, tiempo_real FROM actividad_mecanicos WHERE actividad_id = ?`, [actividadId]);
    if (miembros.length === 0) return; // no debería pasar tras la migración, pero por las dudas

    const actividad = await get(`SELECT ot, estado AS estado_actual FROM actividades WHERE id = ?`, [actividadId]);
    if (!actividad) return;

    const tiempoTotal = miembros.reduce((acc, m) => acc + (m.tiempo_real || 0), 0);
    const hayEnCurso = miembros.some(m => m.estado === 'En Curso');
    const haySinArrancar = miembros.some(m => m.estado === 'Asignada');
    const hayFinalizada = miembros.some(m => m.estado === 'Finalizada');

    let estadoCalc;
    if (hayEnCurso) {
        estadoCalc = 'En Curso';
    } else if (hayFinalizada && !haySinArrancar) {
        estadoCalc = 'Finalizada';
    } else if (actividad.estado_actual === 'Cerrada por Jefe') {
        estadoCalc = 'Cerrada por Jefe';
    } else if (miembros.every(m => m.estado === 'Asignada')) {
        estadoCalc = 'Asignada';
    } else {
        estadoCalc = 'Pausada';
    }

    await run(`UPDATE actividades SET estado = ?, tiempo_real = ? WHERE id = ?`, [estadoCalc, tiempoTotal, actividadId]);
    await sincronizarEstadoOT(actividad.ot);
}

async function recalcularTiempoEmpleado(ot) {
    await run(`UPDATE ordenes SET tiempo_empleado_horas = ROUND(COALESCE((SELECT SUM(tiempo_real) FROM actividades WHERE ot = ?), 0) + COALESCE((SELECT SUM(horas) FROM aportes WHERE ot = ?), 0), 1) WHERE ot = ?`, [ot, ot, ot]);
}

module.exports = { cambiarEstado, sincronizarEstadoOT, sincronizarEstadoActividad, recalcularTiempoEmpleado };
