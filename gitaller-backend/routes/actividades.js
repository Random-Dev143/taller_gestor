const express = require('express');
const router = express.Router();
const { run, all, get, cambiarEstado, recalcularTiempoEmpleado, withTransaction, sincronizarEstadoOT, sincronizarEstadoActividad } = require('../config/database');

router.post('/orden/:ot', async (req, res) => {
    const { descripcion, tiempo_estimado, legajos_mecanicos, jefe_legajo } = req.body;

    if (!Array.isArray(legajos_mecanicos) || legajos_mecanicos.length === 0) {
        return res.status(400).json({ error: 'Debes seleccionar al menos un mecánico' });
    }

    try {
        await withTransaction(async () => {
            if(jefe_legajo) await run(`UPDATE ordenes SET jefe_legajo = ? WHERE ot = ?`, [jefe_legajo, req.params.ot]);

            // legajo_mecanico se mantiene como "representante" del equipo (el primero elegido),
            // ya que algunas partes del sistema todavía lo usan como referencia rápida.
            // El estado REAL de cada mecánico vive en actividad_mecanicos, de forma independiente.
            const result = await run(`INSERT INTO actividades (ot, descripcion, tiempo_estimado, legajo_mecanico, estado) VALUES (?, ?, ?, ?, 'Asignada')`, [req.params.ot, descripcion, tiempo_estimado, legajos_mecanicos[0]]);

            for (const legajo of legajos_mecanicos) {
                await run(`INSERT INTO actividad_mecanicos (actividad_id, legajo_mecanico, estado, tiempo_real) VALUES (?, ?, 'Asignada', 0)`, [result.lastID, legajo]);
                await run(`INSERT INTO asignaciones (ot, legajo_mecanico) SELECT ?, ? WHERE NOT EXISTS (SELECT 1 FROM asignaciones WHERE ot = ? AND legajo_mecanico = ?)`, [req.params.ot, legajo, req.params.ot, legajo]);
            }

            await sincronizarEstadoOT(req.params.ot);
        });
        res.json({ status: 'Actividad asignada al equipo' });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

router.put('/tiempos/:id', async (req, res) => {
    const { inicio, fin } = req.body;
    try {
        await withTransaction(async () => {
            const tiempo = await get(`SELECT actividad_id, legajo_mecanico FROM tiempos_actividad WHERE id = ?`, [req.params.id]);
            if (!tiempo) throw new Error('Registro de tiempo no encontrado');

            // 1. Actualizar el registro modificado por el Jefe
            await run(`UPDATE tiempos_actividad SET inicio = ?, fin = ? WHERE id = ?`, [inicio, fin, req.params.id]);

            // 2. Recalcular la sumatoria exacta de las sesiones de ESE mecánico en esa actividad
            const sesiones = await all(`SELECT inicio, fin FROM tiempos_actividad WHERE actividad_id = ? AND legajo_mecanico = ? AND fin IS NOT NULL`, [tiempo.actividad_id, tiempo.legajo_mecanico]);
            let totalHorasReal = 0;
            for (const s of sesiones) {
                const start = new Date(s.inicio + 'Z');
                const end = new Date(s.fin + 'Z');
                if (end > start) {
                    totalHorasReal += (end - start) / 3600000; // Convertir ms a horas
                }
            }

            // 3. Impactar el nuevo valor en el acumulado de ESE mecánico (no de toda la actividad)
            if (tiempo.legajo_mecanico) {
                await run(`UPDATE actividad_mecanicos SET tiempo_real = ? WHERE actividad_id = ? AND legajo_mecanico = ?`, [totalHorasReal, tiempo.actividad_id, tiempo.legajo_mecanico]);
            }

            // 4. Recalcular agregados de la actividad y de la OT
            await sincronizarEstadoActividad(tiempo.actividad_id);
            const actividad = await get(`SELECT ot FROM actividades WHERE id = ?`, [tiempo.actividad_id]);
            if (actividad) await recalcularTiempoEmpleado(actividad.ot);
        });
        res.json({ status: 'Tiempo actualizado y recalculado correctamente' });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

// Calcula horas transcurridas entre el inicio de una sesión abierta y ahora
function horasDesde(inicioStr) {
    const inicioUTC = new Date(inicioStr + 'Z');
    let horas = (new Date() - inicioUTC) / 3600000;
    return horas < 0 ? 0 : horas;
}

// POST /:id/estado — ahora es POR MECÁNICO: cada integrante del equipo tiene su propio
// play/pausa/finalizar, totalmente independiente del resto (ver flujos de trabajo del equipo).
router.post('/:id/estado', async (req, res) => {
    const { nuevo_estado, motivo, legajo_mecanico } = req.body;
    if (!legajo_mecanico) return res.status(400).json({ error: 'Falta indicar qué mecánico está operando la tarea' });

    try {
        await withTransaction(async () => {
            const actividad = await get(`SELECT * FROM actividades WHERE id = ?`, [req.params.id]);
            if (!actividad) throw new Error('Actividad no encontrada');

            const miEquipo = await get(`SELECT * FROM actividad_mecanicos WHERE actividad_id = ? AND legajo_mecanico = ?`, [req.params.id, legajo_mecanico]);
            if (!miEquipo) throw new Error('Este mecánico no forma parte del equipo asignado a esta tarea');

            if (nuevo_estado === 'En Curso') {
                // Si este mecánico tiene OTRA tarea en curso (en cualquier OT), se la pausamos
                // automáticamente. Esto es por-persona: no afecta a sus compañeros de equipo.
                const otrasEnCurso = await all(`
                    SELECT am.actividad_id AS id, a.ot FROM actividad_mecanicos am
                    JOIN actividades a ON a.id = am.actividad_id
                    WHERE am.legajo_mecanico = ? AND am.estado = 'En Curso' AND am.actividad_id != ?
                `, [legajo_mecanico, req.params.id]);

                for (const otra of otrasEnCurso) {
                    const sesion = await get(`SELECT id, inicio FROM tiempos_actividad WHERE actividad_id = ? AND legajo_mecanico = ? AND fin IS NULL ORDER BY id DESC LIMIT 1`, [otra.id, legajo_mecanico]);
                    if (sesion) {
                        const horas = horasDesde(sesion.inicio);
                        await run(`UPDATE tiempos_actividad SET fin = CURRENT_TIMESTAMP WHERE id = ?`, [sesion.id]);
                        await run(`UPDATE actividad_mecanicos SET tiempo_real = tiempo_real + ?, estado = 'Pausada' WHERE actividad_id = ? AND legajo_mecanico = ?`, [horas, otra.id, legajo_mecanico]);
                        await sincronizarEstadoActividad(otra.id);
                    }
                }

                await run(`INSERT INTO tiempos_actividad (actividad_id, legajo_mecanico, inicio) VALUES (?, ?, CURRENT_TIMESTAMP)`, [req.params.id, legajo_mecanico]);
                await run(`UPDATE actividad_mecanicos SET estado = 'En Curso' WHERE actividad_id = ? AND legajo_mecanico = ?`, [req.params.id, legajo_mecanico]);
                await run(`UPDATE actividades SET auto_pausa = 0 WHERE id = ?`, [req.params.id]);

            } else if (nuevo_estado === 'Pausada' || nuevo_estado === 'Finalizada') {
                const sesion = await get(`SELECT id, inicio FROM tiempos_actividad WHERE actividad_id = ? AND legajo_mecanico = ? AND fin IS NULL ORDER BY id DESC LIMIT 1`, [req.params.id, legajo_mecanico]);
                if (sesion) {
                    const horas = horasDesde(sesion.inicio);
                    await run(`UPDATE tiempos_actividad SET fin = CURRENT_TIMESTAMP WHERE id = ?`, [sesion.id]);
                    await run(`UPDATE actividad_mecanicos SET tiempo_real = tiempo_real + ? WHERE actividad_id = ? AND legajo_mecanico = ?`, [horas, req.params.id, legajo_mecanico]);
                }
                await run(`UPDATE actividad_mecanicos SET estado = ? WHERE actividad_id = ? AND legajo_mecanico = ?`, [nuevo_estado, req.params.id, legajo_mecanico]);

                // Si se pausa por un motivo que bloquea a todo el equipo (espera de repuestos,
                // trabajos de terceros), eso sigue siendo una condición de la OT completa.
                if (nuevo_estado === 'Pausada' && (motivo === 'Espera de Repuestos' || motivo === 'Trabajos de Terceros')) {
                    await cambiarEstado(actividad.ot, motivo);
                }
            } else {
                throw new Error('Estado no soportado');
            }

            await sincronizarEstadoActividad(req.params.id);
        });
        res.json({ status: 'Estado actualizado' });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

// Un mecánico escribe/actualiza su propio aporte a la tarea sin necesariamente cambiar de estado
// (por ejemplo, al entregar la posta a un compañero, o al completar el informe de una tarea
// que un compañero ya cerró). No reabre la tarea.
router.post('/:id/informe', async (req, res) => {
    const { legajo_mecanico, informe } = req.body;
    if (!legajo_mecanico) return res.status(400).json({ error: 'Falta indicar el mecánico' });
    try {
        const miEquipo = await get(`SELECT * FROM actividad_mecanicos WHERE actividad_id = ? AND legajo_mecanico = ?`, [req.params.id, legajo_mecanico]);
        if (!miEquipo) throw new Error('Este mecánico no forma parte del equipo asignado a esta tarea');
        await run(`UPDATE actividad_mecanicos SET informe = ? WHERE actividad_id = ? AND legajo_mecanico = ?`, [informe, req.params.id, legajo_mecanico]);
        res.json({ status: 'Informe guardado' });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

router.delete('/:id', async (req, res) => {
    try {
        await withTransaction(async () => {
            const act = await get(`SELECT ot FROM actividades WHERE id = ?`, [req.params.id]);
            await run(`DELETE FROM tiempos_actividad WHERE actividad_id = ?`, [req.params.id]);
            await run(`DELETE FROM actividades WHERE id = ?`, [req.params.id]);
            if (act) {
                await recalcularTiempoEmpleado(act.ot);
                await sincronizarEstadoOT(act.ot);
            }
        });
        res.json({ status: 'Actividad eliminada' });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

// Lista de tareas del mecánico. am.estado es SU estado personal, independiente del agregado.
// Se le sigue mostrando una tarea mientras SU parte no esté Finalizada, incluso si un
// compañero ya cerró la tarea entera (así puede reanudar o simplemente completar su informe).
router.get('/mecanico/:legajo', async (req, res) => {
    try {
        const actividades = await all(`
            SELECT a.*, 
                   am.estado AS mi_estado, am.tiempo_real AS mi_tiempo_real, am.informe AS mi_informe,
                   o.patente, u.unidad, c.nombre AS cliente,
                   (SELECT GROUP_CONCAT(l.nombre, ', ') FROM actividad_mecanicos am2 JOIN legajos l ON am2.legajo_mecanico = l.legajo WHERE am2.actividad_id = a.id) AS equipo
            FROM actividad_mecanicos am
            JOIN actividades a ON a.id = am.actividad_id
            JOIN ordenes o ON a.ot = o.ot
            JOIN unidades u ON o.patente = u.patente
            JOIN clientes c ON u.cliente_id = c.id
            WHERE am.legajo_mecanico = ? AND am.estado != 'Finalizada'
            ORDER BY a.id
        `, [req.params.legajo]);
        res.json(actividades);
    } catch (error) { res.status(500).json({ error: error.message }); }
});

router.post('/:id/tiempos', async (req, res) => {
    const { inicio, fin, legajo_mecanico } = req.body;
    if (!inicio) return res.status(400).json({ error: 'El inicio es obligatorio' });
    try {
        await withTransaction(async () => {
            const actividad = await get(`SELECT ot FROM actividades WHERE id = ?`, [req.params.id]);
            if (!actividad) throw new Error('Actividad no encontrada');

            await run(`INSERT INTO tiempos_actividad (actividad_id, legajo_mecanico, inicio, fin) VALUES (?, ?, ?, ?)`, [req.params.id, legajo_mecanico || null, inicio, fin || null]);

            if (legajo_mecanico && fin) {
                const start = new Date(inicio + 'Z');
                const end = new Date(fin + 'Z');
                const horas = end > start ? (end - start) / 3600000 : 0;
                await run(`UPDATE actividad_mecanicos SET tiempo_real = tiempo_real + ? WHERE actividad_id = ? AND legajo_mecanico = ?`, [horas, req.params.id, legajo_mecanico]);
                await sincronizarEstadoActividad(req.params.id);
            }
            await recalcularTiempoEmpleado(actividad.ot);
        });
        res.json({ status: 'Tiempo agregado' });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

router.delete('/tiempos/:id', async (req, res) => {
    try {
        await withTransaction(async () => {
            const tiempo = await get(`SELECT actividad_id, legajo_mecanico, inicio, fin FROM tiempos_actividad WHERE id = ?`, [req.params.id]);
            if (!tiempo) throw new Error('Registro de tiempo no encontrado');

            const actividad = await get(`SELECT ot FROM actividades WHERE id = ?`, [tiempo.actividad_id]);
            await run(`DELETE FROM tiempos_actividad WHERE id = ?`, [req.params.id]);

            if (tiempo.legajo_mecanico && tiempo.fin) {
                const start = new Date(tiempo.inicio + 'Z');
                const end = new Date(tiempo.fin + 'Z');
                const horas = end > start ? (end - start) / 3600000 : 0;
                await run(`UPDATE actividad_mecanicos SET tiempo_real = MAX(0, tiempo_real - ?) WHERE actividad_id = ? AND legajo_mecanico = ?`, [horas, tiempo.actividad_id, tiempo.legajo_mecanico]);
                await sincronizarEstadoActividad(tiempo.actividad_id);
            }

            if (actividad) await recalcularTiempoEmpleado(actividad.ot);
        });
        res.json({ status: 'Tiempo eliminado' });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

router.put('/:id', async (req, res) => {
    const { legajos_mecanicos, descripcion, tiempo_estimado, tiempo_real, fecha_inicio, fecha_fin } = req.body;
    try {
        await withTransaction(async () => {
            const actividad = await get(`SELECT ot FROM actividades WHERE id = ?`, [req.params.id]);
            if (!actividad) throw new Error('Actividad no encontrada');

            await run(
                `UPDATE actividades 
                 SET descripcion = ?, tiempo_estimado = ?,
                     fecha_inicio = COALESCE(NULLIF(?, ''), fecha_inicio),
                     fecha_fin = COALESCE(NULLIF(?, ''), fecha_fin)
                 WHERE id = ?`,
                [descripcion, tiempo_estimado, fecha_inicio, fecha_fin, req.params.id]
            );

            if (legajos_mecanicos && legajos_mecanicos.length > 0) {
                // A diferencia de antes, NO se borra y recrea todo el equipo: eso destruiría
                // el progreso individual (estado/horas/informe) de quienes siguen en el equipo.
                // Solo se agregan los nuevos y se quitan los que ya no están.
                const actuales = (await all(`SELECT legajo_mecanico FROM actividad_mecanicos WHERE actividad_id = ?`, [req.params.id])).map(r => r.legajo_mecanico);
                const aAgregar = legajos_mecanicos.filter(l => !actuales.includes(l));
                const aQuitar = actuales.filter(l => !legajos_mecanicos.includes(l));

                for (const legajo of aQuitar) {
                    await run(`DELETE FROM actividad_mecanicos WHERE actividad_id = ? AND legajo_mecanico = ?`, [req.params.id, legajo]);
                }
                for (const legajo of aAgregar) {
                    await run(`INSERT INTO actividad_mecanicos (actividad_id, legajo_mecanico, estado, tiempo_real) VALUES (?, ?, 'Asignada', 0)`, [req.params.id, legajo]);
                    await run(`INSERT INTO asignaciones (ot, legajo_mecanico) SELECT ?, ? WHERE NOT EXISTS (SELECT 1 FROM asignaciones WHERE ot = ? AND legajo_mecanico = ?)`, [actividad.ot, legajo, actividad.ot, legajo]);
                }

                // Mantener el campo "representante" sincronizado con el nuevo equipo
                await run(`UPDATE actividades SET legajo_mecanico = ? WHERE id = ?`, [legajos_mecanicos[0], req.params.id]);

                // Corrección manual de horas del Jefe: como ahora el tiempo total es la suma de
                // cada mecánico, la corrección se aplica sobre el "representante" (ajustándolo
                // para que el nuevo total agregado coincida con lo que puso el Jefe), en vez de
                // pisar un único campo. El resto del equipo mantiene sus horas propias intactas.
                if (tiempo_real !== undefined && tiempo_real !== null && !Number.isNaN(Number(tiempo_real))) {
                    const rep = legajos_mecanicos[0];
                    const otros = await get(`SELECT COALESCE(SUM(tiempo_real),0) AS s FROM actividad_mecanicos WHERE actividad_id = ? AND legajo_mecanico != ?`, [req.params.id, rep]);
                    const nuevoRepTiempo = Math.max(0, Number(tiempo_real) - (otros.s || 0));
                    await run(`UPDATE actividad_mecanicos SET tiempo_real = ? WHERE actividad_id = ? AND legajo_mecanico = ?`, [nuevoRepTiempo, req.params.id, rep]);
                }
            }

            await sincronizarEstadoActividad(req.params.id);
            await recalcularTiempoEmpleado(actividad.ot);
        });
        res.json({ status: 'Actividad actualizada' });
    } catch (error) { 
        res.status(500).json({ error: error.message }); 
    }
});

module.exports = router;
