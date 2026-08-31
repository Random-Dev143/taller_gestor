'use strict';
// ─── SERVICE DE ACTIVIDADES ──────────────────────────────────────────
// Mismo criterio que ordenes.service.js: toda la lógica y las queries acá,
// modules/actividades/actividades.routes.js queda como controlador delgado.

const { run, all, get, cambiarEstado, recalcularTiempoEmpleado, withTransaction, sincronizarEstadoOT, sincronizarEstadoActividad } = require('../../config/database');

// Calcula horas transcurridas entre el inicio de una sesión abierta y ahora
function horasDesde(inicioStr) {
    const inicioUTC = new Date(inicioStr + 'Z');
    let horas = (new Date() - inicioUTC) / 3600000;
    return horas < 0 ? 0 : horas;
}

async function asignarAOrden(ot, { descripcion, tiempo_estimado, legajos_mecanicos, jefe_legajo, es_rutina }) {
    if (!Array.isArray(legajos_mecanicos) || legajos_mecanicos.length === 0) {
        const error = new Error('Debes seleccionar al menos un mecánico');
        error.status = 400;
        throw error;
    }

    await withTransaction(async () => {
        if (jefe_legajo) await run(`UPDATE ordenes SET jefe_legajo = ? WHERE ot = ?`, [jefe_legajo, ot]);

        const result = await run(`INSERT INTO actividades (ot, descripcion, tiempo_estimado, legajo_mecanico, estado, es_rutina) VALUES (?, ?, ?, ?, 'Asignada', ?)`, [ot, descripcion, tiempo_estimado, legajos_mecanicos[0], es_rutina ? 1 : 0]);

        for (const legajo of legajos_mecanicos) {
            await run(`INSERT INTO actividad_mecanicos (actividad_id, legajo_mecanico, estado, tiempo_real) VALUES (?, ?, 'Asignada', 0)`, [result.lastID, legajo]);
            await run(`INSERT INTO asignaciones (ot, legajo_mecanico) SELECT ?, ? WHERE NOT EXISTS (SELECT 1 FROM asignaciones WHERE ot = ? AND legajo_mecanico = ?)`, [ot, legajo, ot, legajo]);
        }

        await sincronizarEstadoOT(ot);
    });
    return { status: 'Actividad asignada al equipo' };
}

async function corregirTiempo(id, { inicio, fin }) {
    await withTransaction(async () => {
        const tiempo = await get(`SELECT actividad_id, legajo_mecanico FROM tiempos_actividad WHERE id = ?`, [id]);
        if (!tiempo) throw new Error('Registro de tiempo no encontrado');

        await run(`UPDATE tiempos_actividad SET inicio = ?, fin = ? WHERE id = ?`, [inicio, fin, id]);

        const sesiones = await all(`SELECT inicio, fin FROM tiempos_actividad WHERE actividad_id = ? AND legajo_mecanico = ? AND fin IS NOT NULL`, [tiempo.actividad_id, tiempo.legajo_mecanico]);
        let totalHorasReal = 0;
        for (const s of sesiones) {
            const start = new Date(s.inicio + 'Z');
            const end = new Date(s.fin + 'Z');
            if (end > start) totalHorasReal += (end - start) / 3600000;
        }

        if (tiempo.legajo_mecanico) {
            await run(`UPDATE actividad_mecanicos SET tiempo_real = ? WHERE actividad_id = ? AND legajo_mecanico = ?`, [totalHorasReal, tiempo.actividad_id, tiempo.legajo_mecanico]);
        }

        await sincronizarEstadoActividad(tiempo.actividad_id);
        const actividad = await get(`SELECT ot FROM actividades WHERE id = ?`, [tiempo.actividad_id]);
        if (actividad) await recalcularTiempoEmpleado(actividad.ot);
    });
    return { status: 'Tiempo actualizado y recalculado correctamente' };
}

// POR MECÁNICO: cada integrante del equipo tiene su propio play/pausa/finalizar,
// totalmente independiente del resto.
async function cambiarEstadoMiembro(id, { nuevo_estado, motivo, legajo_mecanico }) {
    if (!legajo_mecanico) {
        const error = new Error('Falta indicar qué mecánico está operando la tarea');
        error.status = 400;
        throw error;
    }

    await withTransaction(async () => {
        const actividad = await get(`SELECT * FROM actividades WHERE id = ?`, [id]);
        if (!actividad) throw new Error('Actividad no encontrada');

        const miEquipo = await get(`SELECT * FROM actividad_mecanicos WHERE actividad_id = ? AND legajo_mecanico = ?`, [id, legajo_mecanico]);
        if (!miEquipo) throw new Error('Este mecánico no forma parte del equipo asignado a esta tarea');

        if (nuevo_estado === 'Finalizada' && actividad.ot === '0000' && actividad.es_rutina) {
            throw new Error('Las tareas rutinarias no se cierran: quedan siempre disponibles para operar.');
        }

        if (nuevo_estado === 'En Curso') {
            const otrasEnCurso = await all(`
                SELECT am.actividad_id AS id, a.ot FROM actividad_mecanicos am
                JOIN actividades a ON a.id = am.actividad_id
                WHERE am.legajo_mecanico = ? AND am.estado = 'En Curso' AND am.actividad_id != ?
            `, [legajo_mecanico, id]);

            for (const otra of otrasEnCurso) {
                const sesion = await get(`SELECT id, inicio FROM tiempos_actividad WHERE actividad_id = ? AND legajo_mecanico = ? AND fin IS NULL ORDER BY id DESC LIMIT 1`, [otra.id, legajo_mecanico]);
                if (sesion) {
                    const horas = horasDesde(sesion.inicio);
                    await run(`UPDATE tiempos_actividad SET fin = CURRENT_TIMESTAMP WHERE id = ?`, [sesion.id]);
                    await run(`UPDATE actividad_mecanicos SET tiempo_real = tiempo_real + ?, estado = 'Pausada' WHERE actividad_id = ? AND legajo_mecanico = ?`, [horas, otra.id, legajo_mecanico]);
                    await sincronizarEstadoActividad(otra.id);
                }
            }

            await run(`INSERT INTO tiempos_actividad (actividad_id, legajo_mecanico, inicio) VALUES (?, ?, CURRENT_TIMESTAMP)`, [id, legajo_mecanico]);
            await run(`UPDATE actividad_mecanicos SET estado = 'En Curso' WHERE actividad_id = ? AND legajo_mecanico = ?`, [id, legajo_mecanico]);
            await run(`UPDATE actividades SET auto_pausa = 0 WHERE id = ?`, [id]);

        } else if (nuevo_estado === 'Pausada' || nuevo_estado === 'Finalizada') {
            const sesion = await get(`SELECT id, inicio FROM tiempos_actividad WHERE actividad_id = ? AND legajo_mecanico = ? AND fin IS NULL ORDER BY id DESC LIMIT 1`, [id, legajo_mecanico]);
            if (sesion) {
                const horas = horasDesde(sesion.inicio);
                await run(`UPDATE tiempos_actividad SET fin = CURRENT_TIMESTAMP WHERE id = ?`, [sesion.id]);
                await run(`UPDATE actividad_mecanicos SET tiempo_real = tiempo_real + ? WHERE actividad_id = ? AND legajo_mecanico = ?`, [horas, id, legajo_mecanico]);
            }
            await run(`UPDATE actividad_mecanicos SET estado = ? WHERE actividad_id = ? AND legajo_mecanico = ?`, [nuevo_estado, id, legajo_mecanico]);

            if (nuevo_estado === 'Pausada' && (motivo === 'Espera de Repuestos' || motivo === 'Trabajos de Terceros')) {
                await cambiarEstado(actividad.ot, motivo);
            }
        } else {
            throw new Error('Estado no soportado');
        }

        await sincronizarEstadoActividad(id);
        // FIX: este endpoint (play/pausa/finalizar por mecánico — el flujo más
        // usado del día a día) nunca recalculaba tiempo_empleado_horas de la OT.
        // Otros endpoints del mismo service (agregarTiempo, corregirTiempo,
        // eliminarTiempo, registrarAporte) sí lo hacen; a este le faltaba.
        // Detectado por tests/ordenes-actividades-flujo.test.js.
        await recalcularTiempoEmpleado(actividad.ot);
    });
    return { status: 'Estado actualizado' };
}

// Cierre manual desde el Jefe: para tareas internas EXTRAORDINARIAS que el
// mecánico se olvidó de cerrar. sincronizarEstadoActividad respeta el estado
// 'Cerrada por Jefe' como definitivo mientras nadie vuelva a poner algo en curso.
async function cerrarPorJefe(id) {
    await withTransaction(async () => {
        const actividad = await get(`SELECT * FROM actividades WHERE id = ?`, [id]);
        if (!actividad) throw new Error('Actividad no encontrada');
        if (actividad.ot !== '0000') throw new Error('Este cierre manual es solo para tareas internas');
        if (actividad.es_rutina) throw new Error('Las tareas rutinarias no se cierran: quedan siempre disponibles para operar.');

        const equipo = await all(`SELECT legajo_mecanico, estado FROM actividad_mecanicos WHERE actividad_id = ?`, [id]);
        for (const miembro of equipo) {
            if (miembro.estado === 'En Curso') {
                const sesion = await get(`SELECT id, inicio FROM tiempos_actividad WHERE actividad_id = ? AND legajo_mecanico = ? AND fin IS NULL ORDER BY id DESC LIMIT 1`, [id, miembro.legajo_mecanico]);
                if (sesion) {
                    const horas = horasDesde(sesion.inicio);
                    await run(`UPDATE tiempos_actividad SET fin = CURRENT_TIMESTAMP WHERE id = ?`, [sesion.id]);
                    await run(`UPDATE actividad_mecanicos SET tiempo_real = tiempo_real + ? WHERE actividad_id = ? AND legajo_mecanico = ?`, [horas, id, miembro.legajo_mecanico]);
                }
            }
            await run(`UPDATE actividad_mecanicos SET estado = 'Finalizada' WHERE actividad_id = ? AND legajo_mecanico = ?`, [id, miembro.legajo_mecanico]);
        }

        await run(`UPDATE actividades SET estado = 'Cerrada por Jefe' WHERE id = ?`, [id]);
        await sincronizarEstadoActividad(id);
    });
    return { status: 'Tarea interna cerrada' };
}

// Un mecánico escribe/actualiza su propio aporte sin necesariamente cambiar de estado.
async function guardarInforme(id, { legajo_mecanico, informe }) {
    if (!legajo_mecanico) {
        const error = new Error('Falta indicar el mecánico');
        error.status = 400;
        throw error;
    }
    const miEquipo = await get(`SELECT * FROM actividad_mecanicos WHERE actividad_id = ? AND legajo_mecanico = ?`, [id, legajo_mecanico]);
    if (!miEquipo) throw new Error('Este mecánico no forma parte del equipo asignado a esta tarea');
    await run(`UPDATE actividad_mecanicos SET informe = ? WHERE actividad_id = ? AND legajo_mecanico = ?`, [informe, id, legajo_mecanico]);
    return { status: 'Informe guardado' };
}

async function eliminar(id) {
    await withTransaction(async () => {
        const act = await get(`SELECT ot FROM actividades WHERE id = ?`, [id]);
        await run(`DELETE FROM tiempos_actividad WHERE actividad_id = ?`, [id]);
        await run(`DELETE FROM actividades WHERE id = ?`, [id]);
        if (act) {
            await recalcularTiempoEmpleado(act.ot);
            await sincronizarEstadoOT(act.ot);
        }
    });
    return { status: 'Actividad eliminada' };
}

// am.estado es el estado personal del mecánico. Se le sigue mostrando una tarea
// mientras SU parte no esté Finalizada, incluso si un compañero ya cerró la tarea entera.
async function listarPorMecanico(legajo) {
    return all(`
        SELECT a.*, 
               am.estado AS mi_estado, am.tiempo_real AS mi_tiempo_real, am.informe AS mi_informe,
               (SELECT ta.inicio FROM tiempos_actividad ta WHERE ta.actividad_id = a.id AND ta.legajo_mecanico = am.legajo_mecanico AND ta.fin IS NULL ORDER BY ta.id DESC LIMIT 1) AS mi_sesion_inicio,
               o.patente, u.unidad, c.nombre AS cliente,
               (SELECT GROUP_CONCAT(l.nombre, ', ') FROM actividad_mecanicos am2 JOIN legajos l ON am2.legajo_mecanico = l.legajo WHERE am2.actividad_id = a.id) AS equipo
        FROM actividad_mecanicos am
        JOIN actividades a ON a.id = am.actividad_id
        JOIN ordenes o ON a.ot = o.ot
        JOIN unidades u ON o.patente = u.patente
        JOIN clientes c ON u.cliente_id = c.id
        WHERE am.legajo_mecanico = ? AND am.estado != 'Finalizada'
        ORDER BY a.id
    `, [legajo]);
}

async function agregarTiempo(id, { inicio, fin, legajo_mecanico }) {
    if (!inicio) {
        const error = new Error('El inicio es obligatorio');
        error.status = 400;
        throw error;
    }
    await withTransaction(async () => {
        const actividad = await get(`SELECT ot FROM actividades WHERE id = ?`, [id]);
        if (!actividad) throw new Error('Actividad no encontrada');

        await run(`INSERT INTO tiempos_actividad (actividad_id, legajo_mecanico, inicio, fin) VALUES (?, ?, ?, ?)`, [id, legajo_mecanico || null, inicio, fin || null]);

        if (legajo_mecanico && fin) {
            const start = new Date(inicio + 'Z');
            const end = new Date(fin + 'Z');
            const horas = end > start ? (end - start) / 3600000 : 0;
            await run(`UPDATE actividad_mecanicos SET tiempo_real = tiempo_real + ? WHERE actividad_id = ? AND legajo_mecanico = ?`, [horas, id, legajo_mecanico]);
            await sincronizarEstadoActividad(id);
        }
        await recalcularTiempoEmpleado(actividad.ot);
    });
    return { status: 'Tiempo agregado' };
}

async function eliminarTiempo(id) {
    await withTransaction(async () => {
        const tiempo = await get(`SELECT actividad_id, legajo_mecanico, inicio, fin FROM tiempos_actividad WHERE id = ?`, [id]);
        if (!tiempo) throw new Error('Registro de tiempo no encontrado');

        const actividad = await get(`SELECT ot FROM actividades WHERE id = ?`, [tiempo.actividad_id]);
        await run(`DELETE FROM tiempos_actividad WHERE id = ?`, [id]);

        if (tiempo.legajo_mecanico && tiempo.fin) {
            const start = new Date(tiempo.inicio + 'Z');
            const end = new Date(tiempo.fin + 'Z');
            const horas = end > start ? (end - start) / 3600000 : 0;
            await run(`UPDATE actividad_mecanicos SET tiempo_real = MAX(0, tiempo_real - ?) WHERE actividad_id = ? AND legajo_mecanico = ?`, [horas, tiempo.actividad_id, tiempo.legajo_mecanico]);
            await sincronizarEstadoActividad(tiempo.actividad_id);
        }

        if (actividad) await recalcularTiempoEmpleado(actividad.ot);
    });
    return { status: 'Tiempo eliminado' };
}

async function actualizar(id, { legajos_mecanicos, descripcion, tiempo_estimado, tiempo_real, fecha_inicio, fecha_fin }) {
    await withTransaction(async () => {
        const actividad = await get(`SELECT ot FROM actividades WHERE id = ?`, [id]);
        if (!actividad) throw new Error('Actividad no encontrada');

        await run(
            `UPDATE actividades 
             SET descripcion = ?, tiempo_estimado = ?,
                 fecha_inicio = COALESCE(NULLIF(?, ''), fecha_inicio),
                 fecha_fin = COALESCE(NULLIF(?, ''), fecha_fin)
             WHERE id = ?`,
            [descripcion, tiempo_estimado, fecha_inicio, fecha_fin, id]
        );

        if (legajos_mecanicos && legajos_mecanicos.length > 0) {
            const actuales = (await all(`SELECT legajo_mecanico FROM actividad_mecanicos WHERE actividad_id = ?`, [id])).map(r => r.legajo_mecanico);
            const aAgregar = legajos_mecanicos.filter(l => !actuales.includes(l));
            const aQuitar = actuales.filter(l => !legajos_mecanicos.includes(l));

            for (const legajo of aQuitar) {
                await run(`DELETE FROM actividad_mecanicos WHERE actividad_id = ? AND legajo_mecanico = ?`, [id, legajo]);
            }
            for (const legajo of aAgregar) {
                await run(`INSERT INTO actividad_mecanicos (actividad_id, legajo_mecanico, estado, tiempo_real) VALUES (?, ?, 'Asignada', 0)`, [id, legajo]);
                await run(`INSERT INTO asignaciones (ot, legajo_mecanico) SELECT ?, ? WHERE NOT EXISTS (SELECT 1 FROM asignaciones WHERE ot = ? AND legajo_mecanico = ?)`, [actividad.ot, legajo, actividad.ot, legajo]);
            }

            await run(`UPDATE actividades SET legajo_mecanico = ? WHERE id = ?`, [legajos_mecanicos[0], id]);

            if (tiempo_real !== undefined && tiempo_real !== null && !Number.isNaN(Number(tiempo_real))) {
                const rep = legajos_mecanicos[0];
                const otros = await get(`SELECT COALESCE(SUM(tiempo_real),0) AS s FROM actividad_mecanicos WHERE actividad_id = ? AND legajo_mecanico != ?`, [id, rep]);
                const nuevoRepTiempo = Math.max(0, Number(tiempo_real) - (otros.s || 0));
                await run(`UPDATE actividad_mecanicos SET tiempo_real = ? WHERE actividad_id = ? AND legajo_mecanico = ?`, [nuevoRepTiempo, id, rep]);
            }
        }

        await sincronizarEstadoActividad(id);
        await recalcularTiempoEmpleado(actividad.ot);
    });
    return { status: 'Actividad actualizada' };
}

module.exports = {
    asignarAOrden, corregirTiempo, cambiarEstadoMiembro, cerrarPorJefe, guardarInforme,
    eliminar, listarPorMecanico, agregarTiempo, eliminarTiempo, actualizar
};
