const fs = require('fs');
const path = require('path');
const { all, get, run, recalcularTiempoEmpleado, sincronizarEstadoOT, sincronizarEstadoActividad, DB_PATH } = require('../config/database');

const BACKUPS_DIR = path.join(__dirname, '..', 'backups');
const MAX_BACKUPS = 14;

let ultimaAccionAutomatica = null;
let cronEjecutando = false; 

// Pausa/reanudación automática (mediodía): opera POR MECÁNICO, no por actividad completa.
// Si dos mecánicos comparten una tarea, cada uno se pausa/reanuda de forma independiente
// según lo que él mismo tenía en curso, no lo que tenía su compañero.
async function procesarPausaAutomatica(esAlmuerzo) {
    console.log(`[SISTEMA] Ejecutando corte automático. ¿Es almuerzo?: ${esAlmuerzo}`);
    try {
        const enCurso = await all(`SELECT actividad_id, legajo_mecanico FROM actividad_mecanicos WHERE estado = 'En Curso'`);
        const actividadesAfectadas = new Set();

        for (const m of enCurso) {
            const sesion = await get(
                `SELECT id, inicio FROM tiempos_actividad WHERE actividad_id = ? AND legajo_mecanico = ? AND fin IS NULL ORDER BY id DESC LIMIT 1`,
                [m.actividad_id, m.legajo_mecanico]
            );

            if (sesion) {
                const ahora = new Date();
                const inicioUTC = new Date(sesion.inicio.replace(' ', 'T') + 'Z');
                let horas = (ahora - inicioUTC) / (1000 * 60 * 60);
                if (horas < 0) horas = 0;

                await run(`UPDATE tiempos_actividad SET fin = CURRENT_TIMESTAMP WHERE id = ?`, [sesion.id]);
                await run(
                    `UPDATE actividad_mecanicos SET tiempo_real = tiempo_real + ?, estado = 'Pausada' WHERE actividad_id = ? AND legajo_mecanico = ?`,
                    [horas, m.actividad_id, m.legajo_mecanico]
                );
                // auto_pausa vive en la actividad (marca "esto lo pausó el sistema, hay que
                // reanudarlo solo"); si más de un mecánico estaba en curso en la misma tarea,
                // el flag queda igual en 1 para ambos, que es lo que queremos.
                await run(`UPDATE actividades SET auto_pausa = ? WHERE id = ?`, [esAlmuerzo ? 1 : 0, m.actividad_id]);

                actividadesAfectadas.add(m.actividad_id);
                const actividad = await get(`SELECT ot FROM actividades WHERE id = ?`, [m.actividad_id]);
                if (actividad) await recalcularTiempoEmpleado(actividad.ot);
            }
        }

        for (const actividadId of actividadesAfectadas) {
            await sincronizarEstadoActividad(actividadId);
        }
    } catch (error) {
        console.error('[SISTEMA] Error en corte automático:', error.message);
    }
}

async function hacerBackupDB() {
    console.log('[SISTEMA] Ejecutando backup automático seguro...');
    try {
        if (!fs.existsSync(BACKUPS_DIR)) fs.mkdirSync(BACKUPS_DIR, { recursive: true });

        const ahora = new Date();
        const stamp = ahora.toISOString().replace(/[:.]/g, '-');
        const destino = path.join(BACKUPS_DIR, `taller_${stamp}.db`);

        await run(`VACUUM INTO '${destino}'`);
        console.log(`[SISTEMA] Backup creado: ${destino}`);

        const archivos = fs.readdirSync(BACKUPS_DIR)
            .filter(f => f.startsWith('taller_') && f.endsWith('.db'))
            .map(f => ({ nombre: f, ruta: path.join(BACKUPS_DIR, f), mtime: fs.statSync(path.join(BACKUPS_DIR, f)).mtimeMs }))
            .sort((a, b) => b.mtime - a.mtime);

        for (const viejo of archivos.slice(MAX_BACKUPS)) {
            fs.unlinkSync(viejo.ruta);
            console.log(`[SISTEMA] Backup antiguo eliminado por rotación: ${viejo.nombre}`);
        }
    } catch (error) {
        console.error('[SISTEMA] Error generando backup automático:', error.message);
    }
}

async function procesarReanudacionAutomatica() {
    console.log(`[SISTEMA] Ejecutando reanudación automática post-almuerzo.`);
    try {
        // Solo reanuda a quienes el sistema pausó automáticamente (auto_pausa=1 en la actividad)
        // y que efectivamente seguían "Pausada" en su estado personal (si alguien ya arrancó
        // otra cosa o finalizó su parte mientras tanto, no lo tocamos).
        const paraReanudar = await all(`
            SELECT am.actividad_id, am.legajo_mecanico FROM actividad_mecanicos am
            JOIN actividades a ON a.id = am.actividad_id
            WHERE am.estado = 'Pausada' AND a.auto_pausa = 1
        `);

        const actividadesAfectadas = new Set();
        for (const m of paraReanudar) {
            await run(`UPDATE actividad_mecanicos SET estado = 'En Curso' WHERE actividad_id = ? AND legajo_mecanico = ?`, [m.actividad_id, m.legajo_mecanico]);
            await run(`INSERT INTO tiempos_actividad (actividad_id, legajo_mecanico, inicio) VALUES (?, ?, CURRENT_TIMESTAMP)`, [m.actividad_id, m.legajo_mecanico]);
            actividadesAfectadas.add(m.actividad_id);
        }

        for (const actividadId of actividadesAfectadas) {
            await run(`UPDATE actividades SET auto_pausa = 0 WHERE id = ?`, [actividadId]);
            await sincronizarEstadoActividad(actividadId);
        }
    } catch (error) {
        console.error('[SISTEMA] Error en reanudación automática:', error.message);
    }
}

function iniciarCron() {
    console.log('⏱️ Cron job de automatización iniciado.');
    
    setInterval(async () => {
        if (cronEjecutando) return; 
        
        cronEjecutando = true;
        try {
            const ahora = new Date();
            const horaActual = ahora.getHours();
            const timeKey = `${ahora.getFullYear()}-${ahora.getMonth()}-${ahora.getDate()}-${horaActual}`;

            if (ultimaAccionAutomatica === timeKey) return; 

            if (horaActual === 13) {
                await hacerBackupDB();
                await procesarPausaAutomatica(true);
                ultimaAccionAutomatica = timeKey;
            } else if (horaActual === 14) {
                await procesarReanudacionAutomatica();
                ultimaAccionAutomatica = timeKey;
            } else if (horaActual === 18) {
                await hacerBackupDB();
                await procesarPausaAutomatica(false);
                ultimaAccionAutomatica = timeKey;
            }
        } finally {
            cronEjecutando = false;
        }
    }, 60000);
}

module.exports = iniciarCron;
