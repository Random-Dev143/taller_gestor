'use strict';
const { all, get } = require('../../config/database');
const { calcularMinutosHabiles } = require('../tiempos.service');
const { getFeriadosSet } = require('../feriados.service');

async function getTaller(inicio, fin, filtroCuellosStr) {
    let filtroPerm = "AND eh.estado != 'Finalizada'";
    const paramsPerm = [fin, inicio];
    if (filtroCuellosStr) {
        filtroPerm += " AND (o.ot = ? OR o.patente = ?)";
        paramsPerm.push(filtroCuellosStr, filtroCuellosStr);
    }

    const historialRows = await all(`
        SELECT eh.estado, eh.ot, eh.ts_desde, eh.ts_hasta FROM estados_historial eh JOIN ordenes o ON eh.ot = o.ot
        WHERE eh.ts_desde < ? AND (eh.ts_hasta IS NULL OR eh.ts_hasta >= ?) ${filtroPerm}
    `, paramsPerm);

    const feriadosSet = await getFeriadosSet();
    const cuellosMap = {};
    for (const row of historialRows) {
        const minHabiles = calcularMinutosHabiles(row.ts_desde, row.ts_hasta, row.estado, feriadosSet);
        if (!cuellosMap[row.estado]) cuellosMap[row.estado] = { estado: row.estado, ots: new Set(), totalMin: 0 };
        cuellosMap[row.estado].ots.add(row.ot);
        cuellosMap[row.estado].totalMin += minHabiles;
    }

    const permanencia_estado = Object.values(cuellosMap).map(c => ({
        estado: c.estado, ot_afectadas: c.ots.size,
        horas_totales: parseFloat((c.totalMin / 60).toFixed(2)),
        horas_promedio: parseFloat(((c.totalMin / c.ots.size) / 60).toFixed(2))
    })).sort((a, b) => b.horas_promedio - a.horas_promedio);

    const aperturas_por_dia = await all(`SELECT DATE(fecha_apertura) AS fecha, COUNT(*) AS cantidad FROM ordenes WHERE fecha_apertura >= ? AND fecha_apertura < ? GROUP BY DATE(fecha_apertura) ORDER BY fecha ASC`, [inicio, fin]);
    const cierres_por_dia = await all(`SELECT DATE(fecha_cierre) AS fecha, COUNT(*) AS cantidad FROM ordenes WHERE fecha_cierre IS NOT NULL AND fecha_cierre >= ? AND fecha_cierre < ? GROUP BY DATE(fecha_cierre) ORDER BY fecha ASC`, [inicio, fin]);
    const ciclo_promedio = await get(`SELECT ROUND(AVG(JULIANDAY(fecha_cierre) - JULIANDAY(fecha_apertura)), 2) AS dias_promedio FROM ordenes WHERE estado_actual = 'Finalizada' AND fecha_cierre IS NOT NULL AND fecha_cierre >= ? AND fecha_cierre < ?`, [inicio, fin]);

    return { permanencia_estado, aperturas_por_dia, cierres_por_dia, ciclo_promedio: ciclo_promedio?.dias_promedio || 0 };
}

module.exports = { getTaller };
