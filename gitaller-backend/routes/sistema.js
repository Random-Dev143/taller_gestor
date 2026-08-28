const express = require('express');
const router = express.Router();
const { run } = require('../config/database');
const { hacerBackupDB } = require('../utils/cron');
const { requireAuth } = require('../middlewares/auth');

// POST /api/sistema/checkpoint-seguro
// Fuerza un checkpoint del WAL (vuelca todo lo pendiente al archivo .db
// principal) y dispara un backup consistente (VACUUM INTO, atómico) antes
// de que el proceso se cierre.
//
// Por qué existe: en Tauri, cerrar la ventana o cambiar el puerto desde
// Configuración termina en un `child.kill()` del sidecar de Node (kill
// forzado, sin aviso — ver src-tauri/src/lib.rs). Eso por sí solo no
// corrompe la base (SQLite está diseñado para recuperar un WAL sin
// checkpoint tras un cierre abrupto), pero SÍ deja al .db principal
// desactualizado respecto al -wal/-shm — y si alguien copia manualmente
// el .db sin esos dos archivos al lado (como pasó en el incidente que
// motivó este endpoint), la copia queda inconsistente. Llamar a este
// endpoint ANTES de dejar cerrar la ventana, o antes de un logout por
// expiración de sesión, minimiza esa ventana de riesgo.
//
// Protegido con requireAuth (sin permiso específico: alcanza con estar
// logueado) en vez de dejarlo abierto, porque el servidor escucha en
// 0.0.0.0 — cualquiera en la red podría, si no, forzar backups/checkpoints
// a repetición.
router.post('/checkpoint-seguro', requireAuth([]), async (req, res) => {
    try {
        // TRUNCATE vacía el archivo -wal después de volcarlo, dejando todo
        // consolidado en el .db principal — el estado más "de una pieza"
        // posible antes de un cierre.
        await run('PRAGMA wal_checkpoint(TRUNCATE)');
        await hacerBackupDB();
        res.json({ status: 'Checkpoint y backup completados' });
    } catch (error) {
        console.error('[SISTEMA] Error en checkpoint-seguro:', error.message);
        // Respondemos 200 igual: quien llama a esto (cierre de ventana,
        // logout por expiración) va a seguir adelante con el cierre pase lo
        // que pase — preferimos no trabar el cierre de la app por esto.
        res.json({ status: 'Checkpoint/backup con errores, ver logs del servidor', error: error.message });
    }
});

module.exports = router;
