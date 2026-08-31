'use strict';
// ─── ORQUESTADOR DE ARRANQUE + FACHADA DE COMPATIBILIDAD ────────────
// Arquitectura post rama `repuestos`: la conexión vive en db/connection.js,
// el esquema y las migraciones en db/migrations/*.js (numeradas, corridas
// por db/migrator.js y registradas en la tabla schema_migrations — cada
// migración es idempotente por diseño), y los datos iniciales en db/seed.js.
//
// Las reglas de negocio de estados de OT/actividad (cambiarEstado,
// sincronizarEstadoOT, sincronizarEstadoActividad, recalcularTiempoEmpleado)
// viven en services/ordenes-estado.service.js — un módulo compartido, en vez
// de anidarlas dentro de modules/ordenes o modules/actividades, para que
// ninguno de los dos dependa del otro.
//
// Este archivo se mantiene como fachada de compatibilidad para los módulos
// que todavía no se migraron al patrón repository/service/routes de
// modules/ (auth, usuarios, roles, legajos, unidades, feriados,
// configuracion, informes, sala, cron) y siguen haciendo
// require('../config/database'). Cuando no quede ninguno, este archivo
// se puede borrar y esos routes/*.js pasan a importar directo de db/connection.
const { db, run, all, get, withTransaction, DB_PATH } = require('../db/connection');
const { migrar } = require('../db/migrator');
const { ejecutarSeed } = require('../db/seed');
const {
    cambiarEstado,
    sincronizarEstadoOT,
    sincronizarEstadoActividad,
    recalcularTiempoEmpleado
} = require('../services/ordenes-estado.service');

// Arranque: aplica migraciones pendientes y siembra los datos iniciales.
// Efecto de borde al cargar el módulo, igual que en versiones anteriores
// (server.js sigue esperando un margen fijo antes de escuchar en el puerto;
// ver el setTimeout al final de server.js).
(async () => {
    try {
        await migrar();
        await ejecutarSeed();
    } catch (error) {
        console.error('❌ Error inicializando la base de datos:', error.message);
    }
})();

module.exports = {
    db, run, all, get, DB_PATH, withTransaction,
    cambiarEstado, sincronizarEstadoOT, sincronizarEstadoActividad, recalcularTiempoEmpleado
};

