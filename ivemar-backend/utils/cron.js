const fs = require('fs');
const path = require('path');
const { all, get, run, recalcularTiempoEmpleado, DB_PATH } = require('../config/database');

const BACKUPS_DIR = path.join(__dirname, '..', 'backups');
const MAX_BACKUPS = 14;

let ultimaAccionAutomatica = null;
let cronEjecutando = false; // <-- Bloqueo para evitar superposición

async function procesarPausaAutomatica(esAlmuerzo) {
    console.log(`[SISTEMA] Ejecutando corte automático. ¿Es almuerzo?: ${esAlmuerzo}`);
    try {
        const enCurso = await all(`SELECT id, ot FROM actividades WHERE estado = 'En Curso'`);
        
        for (const act of enCurso) {
            const sesion = await get(
                `SELECT id, inicio FROM tiempos_actividad WHERE actividad_id = ? AND fin IS NULL ORDER BY id DESC LIMIT 1`, 
                [act.id]
            );
            
            if (sesion) {
                const ahora = new Date();
                const inicioUTC = new Date(sesion.inicio.replace(' ', 'T') + 'Z');
                let horas = (ahora - inicioUTC) / (1000 * 60 * 60);
                if (horas < 0) horas = 0;

                await run(`UPDATE tiempos_actividad SET fin = CURRENT_TIMESTAMP WHERE id = ?`, [sesion.id]);
                await run(
                    `UPDATE actividades SET tiempo_real = tiempo_real + ?, estado = 'Pausada', auto_pausa = ? WHERE id = ?`, 
                    [horas, esAlmuerzo ? 1 : 0, act.id]
                );
                await recalcularTiempoEmpleado(act.ot);
            }
        }
    } catch (error) {
        console.error('[SISTEMA] Error en corte automático:', error.message);
    }
}

// Backup nativo de SQLite: VACUUM INTO
async function hacerBackupDB() {
    console.log('[SISTEMA] Ejecutando backup automático seguro...');
    try {
        if (!fs.existsSync(BACKUPS_DIR)) fs.mkdirSync(BACKUPS_DIR, { recursive: true });

        const ahora = new Date();
        const stamp = ahora.toISOString().replace(/[:.]/g, '-');
        const destino = path.join(BACKUPS_DIR, `taller_${stamp}.db`);

        // VACUUM INTO clona la base de datos de manera atómica sin requerir parar el servidor
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
        const paraReanudar = await all(`SELECT id FROM actividades WHERE estado = 'Pausada' AND auto_pausa = 1`);
        for (const act of paraReanudar) {
            await run(`UPDATE actividades SET estado = 'En Curso', auto_pausa = 0 WHERE id = ?`, [act.id]);
            await run(`INSERT INTO tiempos_actividad (actividad_id, inicio) VALUES (?, CURRENT_TIMESTAMP)`, [act.id]);
        }
    } catch (error) {
        console.error('[SISTEMA] Error en reanudación automática:', error.message);
    }
}

function iniciarCron() {
    console.log('⏱️ Cron job de automatización iniciado.');
    
    setInterval(async () => {
        // Bloqueo para evitar que una ejecución pise a la siguiente
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