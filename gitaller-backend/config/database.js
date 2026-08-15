'use strict';
// ─── FACHADA DE COMPATIBILIDAD ──────────────────────────────────────
// Este archivo YA NO contiene lógica propia. Desde el refactor de
// estructura, la base de datos vive en db/ (conexión, esquema y
// migraciones separados) y la lógica de negocio de estados en
// services/ordenes-estado.service.js.
//
// Se mantiene como re-export para no tener que tocar los ~13 archivos
// de routes/ y services/ que hacen `require('../config/database')`.
// Si estás por importar algo acá, considerá si es:
//   - acceso a datos (run/all/get/withTransaction/DB_PATH)  -> db/index.js
//   - lógica de estados de OT/actividad                     -> services/ordenes-estado.service.js
// y agregalo/edítalo ahí, no en este archivo.

const { db, run, all, get, DB_PATH, withTransaction } = require('../db');
const {
    cambiarEstado,
    sincronizarEstadoOT,
    sincronizarEstadoActividad,
    recalcularTiempoEmpleado
} = require('../services/ordenes-estado.service');

module.exports = {
    db, run, all, get, DB_PATH, withTransaction,
    cambiarEstado, sincronizarEstadoOT, sincronizarEstadoActividad, recalcularTiempoEmpleado
};
