const fs = require('fs');
const path = require('path');
const { all, get, run, recalcularTiempoEmpleado, sincronizarEstadoOT, sincronizarEstadoActividad, DB_PATH } = require('../config/database');
const { decidirAccionCron } = require('./cronSchedule');

// [FIX] Antes esto era path.join(__dirname, '..', 'backups'). __dirname, cuando
// el backend corre empaquetado como .exe con `pkg`, apunta adentro del
// "snapshot" virtual de solo lectura que pkg mete dentro del ejecutable
// (por eso el error "Cannot mkdir in a snapshot. Try mountpoints instead.").
// La base de datos ya vive en una carpeta real y escribible (%APPDATA%\GITaller),
// así que los backups van al lado de ella, no al lado del código empaquetado.
const BACKUPS_DIR = path.join(path.dirname(DB_PATH), 'backups');
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

const { verificarInformeAutomatico } = require('../services/informe-automatico.service');

function iniciarCron() {
    console.log('⏱️ Cron job de automatización iniciado.');
    
    setInterval(async () => {
        if (cronEjecutando) return; 
        
        cronEjecutando = true;
        try {
            // Informe NPS quincenal: independiente del horario laboral y de la
            // deduplicación por hora de las pausas, por eso va antes de ambos.
            await verificarInformeAutomatico();

            const ahora = new Date();
            const horaActual = ahora.getHours();
            const timeKey = `${ahora.getFullYear()}-${ahora.getMonth()}-${ahora.getDate()}-${horaActual}`;

            if (ultimaAccionAutomatica === timeKey) return; 

            // Se trae la config real de la base en cada tick (una SELECT
            // liviana cada 60s, sin costo relevante) en vez de cachearla
            // al arrancar el proceso: si alguien cambia el horario desde
            // Configuración, el cron lo empieza a respetar sin necesitar
            // reiniciar el backend.
            const config = await get(`SELECT hora_apertura, hora_cierre, hora_almuerzo_inicio, hora_almuerzo_fin, trabaja_corrido, trabaja_sabados, sabado_hora_apertura, sabado_hora_cierre FROM configuracion WHERE id = 1`);
            const accion = decidirAccionCron(ahora, config);
            if (accion === 'almuerzo') {
                await hacerBackupDB();
                await procesarPausaAutomatica(true);
                ultimaAccionAutomatica = timeKey;
            } else if (accion === 'reanudacion') {
                await procesarReanudacionAutomatica();
                ultimaAccionAutomatica = timeKey;
            } else if (accion === 'cierre') {
                await hacerBackupDB();
                await procesarPausaAutomatica(false);
                ultimaAccionAutomatica = timeKey;
            }
        } catch (error) {
            // BUG CORREGIDO: antes este bloque era try/finally SIN catch.
            // Si `get(...)` (o cualquier otro paso de acá arriba) tiraba una
            // excepción, se propagaba como una promesa rechazada sin
            // manejar — y en Node moderno eso tumba TODO el proceso por
            // default. Como este tick corre cada 60 segundos, tarde o
            // temprano un error transitorio (lock de SQLite, I/O, lo que
            // sea) terminaba cayéndose el servidor entero, sin ningún aviso
            // más allá del log. Ahora el error queda contenido acá: se
            // loguea y el cron simplemente reintenta en el siguiente tick.
            console.error('[SISTEMA] Error en el tick del cron (no debería tumbar el servidor):', error.message);
        } finally {
            cronEjecutando = false;
        }
    }, 60000);
}

// hacerBackupDB y decidirAccionCron también se usan fuera del cron (ver
// routes/sistema.js checkpoint-seguro, y tests/cron.test.js), así que se
// cuelgan como propiedades de la función exportada en vez de cambiar
// `module.exports` a un objeto — server.js hace
// `const iniciarCron = require('./utils/cron'); iniciarCron();`, así que
// el export tiene que seguir siendo invocable directamente.
module.exports = iniciarCron;
module.exports.hacerBackupDB = hacerBackupDB;
module.exports.decidirAccionCron = decidirAccionCron;