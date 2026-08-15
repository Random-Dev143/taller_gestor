'use strict';
// ─── FACHADA DE COMPATIBILIDAD ──────────────────────────────────────
// La lógica real vive separada por tipo de informe en services/informes/
// (financiero.js, operativo.js, taller.js). Este archivo se mantiene
// solo para que routes/informes.js no tenga que cambiar su import.
module.exports = require('./informes');
