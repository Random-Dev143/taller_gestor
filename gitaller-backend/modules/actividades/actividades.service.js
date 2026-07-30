const { withTransaction } = require('../../db/connection');
const repo = require('./actividades.repository');
const ordenesService = require('../ordenes/ordenes.service');

// Calcula horas transcurridas entre el inicio de una sesión abierta y ahora
function horasDesde(inicioStr) {
    const inicioUTC = new Date(inicioStr + 'Z');
    let horas = (new Date() - inicioUTC) / 3600000;
    return horas < 0 ? 0 : horas;
}

function horasEntre(inicioStr, finStr) {
    const start = new Date(inicioStr + 'Z');
    const end = new Date(finStr + 'Z');
    return end > start ? (end - start) / 3600000 : 0;
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
    const miembros = await repo.listarMiembrosConEstado(actividadId);
    if (miembros.length === 0) return; // no debería pasar tras la migración, pero por las dudas

    const actividad = await repo.obtenerPorId(actividadId);
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
    } else if (actividad.estado === 'Cerrada por Jefe') {
        estadoCalc = 'Cerrada por Jefe';
    } else if (miembros.every(m => m.estado === 'Asignada')) {
        estadoCalc = 'Asignada';
    } else {
        estadoCalc = 'Pausada';
    }

    await repo.actualizarEstadoYTiempoAgregado(actividadId, estadoCalc, tiempoTotal);
    await ordenesService.sincronizarEstadoOT(actividad.ot);
}

async function asignarEquipoAOt(ot, { descripcion, tiempo_estimado, legajos_mecanicos, jefe_legajo }) {
    if (!Array.isArray(legajos_mecanicos) || legajos_mecanicos.length === 0) {
        const err = new Error('Debes seleccionar al menos un mecánico');
        err.status = 400;
        throw err;
    }

    await withTransaction(async () => {
        if (jefe_legajo) await ordenesService.repository.actualizarJefe(ot, jefe_legajo);

        // legajo_mecanico se mantiene como "representante" del equipo (el primero elegido),
        // ya que algunas partes del sistema todavía lo usan como referencia rápida.
        // El estado REAL de cada mecánico vive en actividad_mecanicos, de forma independiente.
        const result = await repo.crear(ot, descripcion, tiempo_estimado, legajos_mecanicos[0]);

        for (const legajo of legajos_mecanicos) {
            await repo.agregarMiembro(result.lastID, legajo);
            await ordenesService.repository.asegurarAsignacion(ot, legajo);
        }

        await ordenesService.sincronizarEstadoOT(ot);
    });
}

async function editarSesionTiempo(sesionId, inicio, fin) {
    await withTransaction(async () => {
        const tiempo = await repo.obtenerSesion(sesionId);
        if (!tiempo) throw new Error('Registro de tiempo no encontrado');

        // 1. Actualizar el registro modificado por el Jefe
        await repo.actualizarSesion(sesionId, inicio, fin);

        // 2. Recalcular la sumatoria exacta de las sesiones de ESE mecánico en esa actividad
        const sesiones = await repo.listarSesionesCerradasDelMecanico(tiempo.actividad_id, tiempo.legajo_mecanico);
        let totalHorasReal = 0;
        for (const s of sesiones) totalHorasReal += horasEntre(s.inicio, s.fin);

        // 3. Impactar el nuevo valor en el acumulado de ESE mecánico (no de toda la actividad)
        if (tiempo.legajo_mecanico) {
            await repo.fijarTiempoMiembro(tiempo.actividad_id, tiempo.legajo_mecanico, totalHorasReal);
        }

        // 4. Recalcular agregados de la actividad y de la OT
        await sincronizarEstadoActividad(tiempo.actividad_id);
        const actividad = await repo.obtenerPorId(tiempo.actividad_id);
        if (actividad) await ordenesService.recalcularTiempoEmpleado(actividad.ot);
    });
}

// Cada integrante del equipo tiene su propio play/pausa/finalizar, totalmente
// independiente del resto (ver flujos de trabajo del equipo).
async function cambiarEstadoMecanico(actividadId, { nuevo_estado, motivo, legajo_mecanico }) {
    if (!legajo_mecanico) {
        const err = new Error('Falta indicar qué mecánico está operando la tarea');
        err.status = 400;
        throw err;
    }

    await withTransaction(async () => {
        const actividad = await repo.obtenerPorId(actividadId);
        if (!actividad) throw new Error('Actividad no encontrada');

        const miEquipo = await repo.obtenerMiembro(actividadId, legajo_mecanico);
        if (!miEquipo) throw new Error('Este mecánico no forma parte del equipo asignado a esta tarea');

        if (nuevo_estado === 'En Curso') {
            // Si este mecánico tiene OTRA tarea en curso (en cualquier OT), se la pausamos
            // automáticamente. Esto es por-persona: no afecta a sus compañeros de equipo.
            const otrasEnCurso = await repo.otrasActividadesEnCursoDelMecanico(legajo_mecanico, actividadId);

            for (const otra of otrasEnCurso) {
                const sesion = await repo.obtenerSesionAbierta(otra.id, legajo_mecanico);
                if (sesion) {
                    const horas = horasDesde(sesion.inicio);
                    await repo.cerrarSesion(sesion.id);
                    await repo.incrementarTiempoYEstadoMiembro(otra.id, legajo_mecanico, horas, 'Pausada');
                    await sincronizarEstadoActividad(otra.id);
                }
            }

            await repo.iniciarSesion(actividadId, legajo_mecanico);
            await repo.actualizarEstadoMiembro(actividadId, legajo_mecanico, 'En Curso');
            await repo.actualizarAutoPausa(actividadId, 0);

        } else if (nuevo_estado === 'Pausada' || nuevo_estado === 'Finalizada') {
            const sesion = await repo.obtenerSesionAbierta(actividadId, legajo_mecanico);
            if (sesion) {
                const horas = horasDesde(sesion.inicio);
                await repo.cerrarSesion(sesion.id);
                await repo.incrementarTiempoMiembro(actividadId, legajo_mecanico, horas);
            }
            await repo.actualizarEstadoMiembro(actividadId, legajo_mecanico, nuevo_estado);

            // Si se pausa por un motivo que bloquea a todo el equipo (espera de repuestos,
            // trabajos de terceros), eso sigue siendo una condición de la OT completa.
            if (nuevo_estado === 'Pausada' && (motivo === 'Espera de Repuestos' || motivo === 'Trabajos de Terceros')) {
                await ordenesService.cambiarEstado(actividad.ot, motivo);
            }
        } else {
            throw new Error('Estado no soportado');
        }

        await sincronizarEstadoActividad(actividadId);
    });
}

// Un mecánico escribe/actualiza su propio aporte a la tarea sin necesariamente cambiar de estado
// (por ejemplo, al entregar la posta a un compañero, o al completar el informe de una tarea
// que un compañero ya cerró). No reabre la tarea.
async function guardarInforme(actividadId, legajo_mecanico, informe) {
    if (!legajo_mecanico) {
        const err = new Error('Falta indicar el mecánico');
        err.status = 400;
        throw err;
    }
    const miEquipo = await repo.obtenerMiembro(actividadId, legajo_mecanico);
    if (!miEquipo) throw new Error('Este mecánico no forma parte del equipo asignado a esta tarea');
    await repo.actualizarInformeMiembro(actividadId, legajo_mecanico, informe);
}

// Lista de tareas del mecánico (repo ya filtra am.estado != 'Finalizada': se le sigue
// mostrando una tarea mientras SU parte no esté Finalizada, incluso si un compañero ya
// cerró la tarea entera, así puede reanudar o simplemente completar su informe).
function listarPorMecanico(legajo) {
    return repo.listarPorMecanico(legajo);
}

async function agregarTiempo(actividadId, { inicio, fin, legajo_mecanico }) {
    if (!inicio) {
        const err = new Error('El inicio es obligatorio');
        err.status = 400;
        throw err;
    }

    await withTransaction(async () => {
        const actividad = await repo.obtenerPorId(actividadId);
        if (!actividad) throw new Error('Actividad no encontrada');

        await repo.insertarSesion(actividadId, legajo_mecanico, inicio, fin);

        if (legajo_mecanico && fin) {
            const horas = horasEntre(inicio, fin);
            await repo.incrementarTiempoMiembro(actividadId, legajo_mecanico, horas);
            await sincronizarEstadoActividad(actividadId);
        }
        await ordenesService.recalcularTiempoEmpleado(actividad.ot);
    });
}

async function eliminarTiempo(sesionId) {
    await withTransaction(async () => {
        const tiempo = await repo.obtenerSesionCompleta(sesionId);
        if (!tiempo) throw new Error('Registro de tiempo no encontrado');

        const actividad = await repo.obtenerPorId(tiempo.actividad_id);
        await repo.eliminarSesion(sesionId);

        if (tiempo.legajo_mecanico && tiempo.fin) {
            const horas = horasEntre(tiempo.inicio, tiempo.fin);
            await repo.decrementarTiempoMiembro(tiempo.actividad_id, tiempo.legajo_mecanico, horas);
            await sincronizarEstadoActividad(tiempo.actividad_id);
        }

        if (actividad) await ordenesService.recalcularTiempoEmpleado(actividad.ot);
    });
}

async function editarActividad(actividadId, { legajos_mecanicos, descripcion, tiempo_estimado, tiempo_real, fecha_inicio, fecha_fin }) {
    await withTransaction(async () => {
        const actividad = await repo.obtenerPorId(actividadId);
        if (!actividad) throw new Error('Actividad no encontrada');

        await repo.actualizarDatosBasicos(actividadId, { descripcion, tiempo_estimado, fecha_inicio, fecha_fin });

        if (legajos_mecanicos && legajos_mecanicos.length > 0) {
            // A diferencia de antes, NO se borra y recrea todo el equipo: eso destruiría
            // el progreso individual (estado/horas/informe) de quienes siguen en el equipo.
            // Solo se agregan los nuevos y se quitan los que ya no están.
            const actuales = (await repo.listarMiembros(actividadId)).map(r => r.legajo_mecanico);
            const aAgregar = legajos_mecanicos.filter(l => !actuales.includes(l));
            const aQuitar = actuales.filter(l => !legajos_mecanicos.includes(l));

            for (const legajo of aQuitar) await repo.quitarMiembro(actividadId, legajo);
            for (const legajo of aAgregar) {
                await repo.agregarMiembro(actividadId, legajo);
                await ordenesService.repository.asegurarAsignacion(actividad.ot, legajo);
            }

            // Mantener el campo "representante" sincronizado con el nuevo equipo
            await repo.actualizarLegajoRepresentante(actividadId, legajos_mecanicos[0]);

            // Corrección manual de horas del Jefe: como ahora el tiempo total es la suma de
            // cada mecánico, la corrección se aplica sobre el "representante" (ajustándolo
            // para que el nuevo total agregado coincida con lo que puso el Jefe), en vez de
            // pisar un único campo. El resto del equipo mantiene sus horas propias intactas.
            if (tiempo_real !== undefined && tiempo_real !== null && !Number.isNaN(Number(tiempo_real))) {
                const rep = legajos_mecanicos[0];
                const otros = await repo.sumaTiempoDeOtrosMiembros(actividadId, rep);
                const nuevoRepTiempo = Math.max(0, Number(tiempo_real) - (otros.s || 0));
                await repo.fijarTiempoMiembro(actividadId, rep, nuevoRepTiempo);
            }
        }

        await sincronizarEstadoActividad(actividadId);
        await ordenesService.recalcularTiempoEmpleado(actividad.ot);
    });
}

async function eliminarActividad(actividadId) {
    await withTransaction(async () => {
        const act = await repo.obtenerPorId(actividadId);
        await repo.eliminarSesionesPorActividad(actividadId);
        await repo.eliminar(actividadId);
        if (act) {
            await ordenesService.recalcularTiempoEmpleado(act.ot);
            await ordenesService.sincronizarEstadoOT(act.ot);
        }
    });
}

module.exports = {
    repository: repo,
    sincronizarEstadoActividad,
    asignarEquipoAOt,
    editarSesionTiempo,
    cambiarEstadoMecanico,
    guardarInforme,
    listarPorMecanico,
    agregarTiempo,
    eliminarTiempo,
    editarActividad,
    eliminarActividad
};
