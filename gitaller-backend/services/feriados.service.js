// ivemar-backend/services/feriados.service.js
const { all } = require('../config/database');

async function getFeriadosSet() {
    const rows = await all(`SELECT fecha FROM feriados`);
    return new Set(rows.map(r => r.fecha));
}

module.exports = { getFeriadosSet };
