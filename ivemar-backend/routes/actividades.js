const express = require('express');
const router = express.Router();
const { run, all, get, cambiarEstado, recalcularTiempoEmpleado, withTransaction, sincronizarEstadoOT } = require('../config/database');

router.post('/orden/:ot', async (req, res) => {
    const { descripcion, tiempo_estimado, legajo_mecanico, jefe_legajo } = req.body;
    try {
        await withTransaction(async () => {
            await run(`INSERT INTO asignaciones (ot, legajo_mecanico) SELECT ?, ? WHERE NOT EXISTS (SELECT 1 FROM asignaciones WHERE ot = ? AND legajo_mecanico = ?)`, [req.params.ot, legajo_mecanico, req.params.ot, legajo_mecanico]);
            if(jefe_legajo) await run(`UPDATE ordenes SET jefe_legajo = ? WHERE ot = ?`, [jefe_legajo, req.params.ot]);
            
            await run(`INSERT INTO actividades (ot, descripcion, tiempo_estimado, legajo_mecanico, estado) VALUES (?, ?, ?, ?, 'Asignada')`, [req.params.ot, descripcion, tiempo_estimado, legajo_mecanico]);
            await sincronizarEstadoOT(req.params.ot);
        });
        res.json({ status: 'Actividad asignada' });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

router.put('/:id', async (req, res) => {
    const { legajo_mecanico, descripcion, tiempo_estimado, tiempo_real, fecha_inicio, fecha_fin } = req.body;
    try {
        await withTransaction(async () => {
            const act = await get(`SELECT ot FROM actividades WHERE id = ?`, [req.params.id]);
            if (!act) throw new Error('Actividad no encontrada');

            await run(`
                UPDATE actividades 
                SET legajo_mecanico = ?, descripcion = ?, tiempo_estimado = ?, 
                    tiempo_real = COALESCE(?, tiempo_real),
                    fecha_inicio = COALESCE(?, fecha_inicio),
                    fecha_fin = COALESCE(?, fecha_fin)
                WHERE id = ?`, 
                [legajo_mecanico, descripcion, tiempo_estimado, tiempo_real, fecha_inicio, fecha_fin, req.params.id]
            );
            
            if (tiempo_real !== undefined) await recalcularTiempoEmpleado(act.ot);
        });
        res.json({ status: 'Actividad actualizada' });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

router.post('/:id/estado', async (req, res) => {
    const { nuevo_estado, motivo } = req.body; 
    try {
        await withTransaction(async () => {
            const actividad = await get(`SELECT * FROM actividades WHERE id = ?`, [req.params.id]);
            if (!actividad) throw new Error('Actividad no encontrada');
            
            await run(`UPDATE actividades SET auto_pausa = 0 WHERE id = ?`, [req.params.id]);

            if (nuevo_estado === 'En Curso') {
                const enCurso = await all(`SELECT id, ot FROM actividades WHERE legajo_mecanico = ? AND estado = 'En Curso' AND id != ?`, [actividad.legajo_mecanico, req.params.id]);
                for (const act of enCurso) {
                    const sesion = await get(`SELECT id, inicio FROM tiempos_actividad WHERE actividad_id = ? AND fin IS NULL ORDER BY id DESC LIMIT 1`, [act.id]);
                    if (sesion) {
                        const inicioUTC = new Date(sesion.inicio + 'Z');
                        let horas = (new Date() - inicioUTC) / 3600000;
                        if (horas < 0) horas = 0;

                        await run(`UPDATE tiempos_actividad SET fin = CURRENT_TIMESTAMP WHERE id = ?`, [sesion.id]);
                        await run(`UPDATE actividades SET tiempo_real = tiempo_real + ?, estado = 'Pausada' WHERE id = ?`, [horas, act.id]);
                        await recalcularTiempoEmpleado(act.ot);
                    }
                }
                await run(`INSERT INTO tiempos_actividad (actividad_id, inicio) VALUES (?, CURRENT_TIMESTAMP)`, [req.params.id]);
                await run(`UPDATE actividades SET estado = 'En Curso' WHERE id = ?`, [req.params.id]);
                await sincronizarEstadoOT(actividad.ot);

            } else if (nuevo_estado === 'Pausada' || nuevo_estado === 'Finalizada') {
                const sesion = await get(`SELECT id, inicio FROM tiempos_actividad WHERE actividad_id = ? AND fin IS NULL ORDER BY id DESC LIMIT 1`, [req.params.id]);
                if (sesion) {
                    const inicioUTC = new Date(sesion.inicio + 'Z');
                    let horas = (new Date() - inicioUTC) / 3600000;
                    if (horas < 0) horas = 0;

                    await run(`UPDATE tiempos_actividad SET fin = CURRENT_TIMESTAMP WHERE id = ?`, [sesion.id]);
                    await run(`UPDATE actividades SET tiempo_real = tiempo_real + ?, estado = ? WHERE id = ?`, [horas, nuevo_estado, req.params.id]);
                    await recalcularTiempoEmpleado(actividad.ot);
                } else {
                    await run(`UPDATE actividades SET estado = ? WHERE id = ?`, [nuevo_estado, req.params.id]);
                }

                // Si la pausamos expresamente por un motivo (espera repuestos), forzamos a la OT a ese estado
                if (nuevo_estado === 'Pausada' && (motivo === 'Espera de Repuestos' || motivo === 'Trabajos de Terceros')) {
                    await cambiarEstado(actividad.ot, motivo);
                } else {
                    // Si no es especial o se finalizó, dejamos que el sistema resuelva qué hacer
                    await sincronizarEstadoOT(actividad.ot);
                }
            }
        });
        res.json({ status: 'Estado actualizado' });
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

router.get('/mecanico/:legajo', async (req, res) => {
    try {
        const actividades = await all(`
            SELECT a.*, o.patente, u.unidad, c.nombre AS cliente 
            FROM actividades a 
            JOIN ordenes o ON a.ot = o.ot 
            JOIN unidades u ON o.patente = u.patente
            JOIN clientes c ON u.cliente_id = c.id
            WHERE a.legajo_mecanico = ? AND a.estado != 'Finalizada'
        `, [req.params.legajo]);
        res.json(actividades);
    } catch (error) { res.status(500).json({ error: error.message }); }
});

router.post('/:id/tiempos', async (req, res) => {
    const { inicio, fin } = req.body;
    if (!inicio) return res.status(400).json({ error: 'El inicio es obligatorio' });
    try {
        await withTransaction(async () => {
            const actividad = await get(`SELECT ot FROM actividades WHERE id = ?`, [req.params.id]);
            if (!actividad) throw new Error('Actividad no encontrada');

            await run(`INSERT INTO tiempos_actividad (actividad_id, inicio, fin) VALUES (?, ?, ?)`, [req.params.id, inicio, fin || null]);
            await recalcularTiempoEmpleado(actividad.ot);
        });
        res.json({ status: 'Tiempo agregado' });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

router.delete('/tiempos/:id', async (req, res) => {
    try {
        await withTransaction(async () => {
            const tiempo = await get(`SELECT actividad_id FROM tiempos_actividad WHERE id = ?`, [req.params.id]);
            if (!tiempo) throw new Error('Registro de tiempo no encontrado');
            
            const actividad = await get(`SELECT ot FROM actividades WHERE id = ?`, [tiempo.actividad_id]);
            await run(`DELETE FROM tiempos_actividad WHERE id = ?`, [req.params.id]);
            
            if (actividad) await recalcularTiempoEmpleado(actividad.ot);
        });
        res.json({ status: 'Tiempo eliminado' });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

router.put('/tiempos/:id', async (req, res) => {
    const { inicio, fin } = req.body;
    try {
        await withTransaction(async () => {
            const tiempo = await get(`SELECT actividad_id FROM tiempos_actividad WHERE id = ?`, [req.params.id]);
            if (!tiempo) throw new Error('Registro de tiempo no encontrado');

            await run(`UPDATE tiempos_actividad SET inicio = ?, fin = ? WHERE id = ?`, [inicio, fin, req.params.id]);
            
            const actividad = await get(`SELECT ot FROM actividades WHERE id = ?`, [tiempo.actividad_id]);
            if (actividad) await recalcularTiempoEmpleado(actividad.ot);
        });
        res.json({ status: 'Tiempo actualizado' });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

module.exports = router;