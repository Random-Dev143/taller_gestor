const { all, get } = require('../config/database');
const { calcularMinutosHabiles } = require('./tiempos.service');
const { getFeriadosSet } = require('./feriados.service');

// Informe financiero: criterio único en todo el bloque = OT Finalizada + fecha_cierre (fecha real de facturación)
async function getFinanciero(inicio, fin, inicioAnterior, finAnterior) {
    const queryResumen = `
        SELECT COUNT(*) AS total_ot,
               SUM(CASE WHEN es_garantia = 1 THEN 1 ELSE 0 END) AS total_garantia,
               SUM(CASE WHEN es_no_iveco = 1 THEN 1 ELSE 0 END) AS total_no_iveco,
               SUM(CASE WHEN es_garantia = 0 AND es_no_iveco = 0 THEN 1 ELSE 0 END) AS total_normales,
               SUM(CASE WHEN controlada = 1 THEN 1 ELSE 0 END) AS total_controladas,
               ROUND(SUM(tiempo_asignado_horas), 2) AS hs_asignadas,
               ROUND(SUM(tiempo_empleado_horas), 2) AS hs_empleadas,
               ROUND(SUM(monto_repuestos + monto_repuestos_garantia), 2) AS total_repuestos,
               ROUND(SUM(monto_mano_obra + monto_mano_obra_garantia), 2) AS total_mano_obra,
               ROUND(SUM(monto_repuestos + monto_mano_obra + monto_repuestos_garantia + monto_mano_obra_garantia), 2) AS total_facturado,
               ROUND(AVG(monto_repuestos + monto_mano_obra + monto_repuestos_garantia + monto_mano_obra_garantia), 2) AS facturacion_promedio,
               ROUND(SUM(monto_repuestos_garantia + monto_mano_obra_garantia), 2) AS monto_garantia,
               ROUND(SUM(monto_repuestos + monto_mano_obra), 2) AS monto_facturable
        FROM ordenes WHERE estado_actual = 'Finalizada' AND fecha_cierre IS NOT NULL AND fecha_cierre >= ? AND fecha_cierre < ?
    `;
    const resumen = await get(queryResumen, [inicio, fin]);
    const resumen_anterior = await get(queryResumen, [inicioAnterior, finAnterior]);

    const facturacion_diaria = await all(`
        SELECT DATE(fecha_cierre) as fecha, SUM(monto_repuestos + monto_repuestos_garantia) as repuestos, SUM(monto_mano_obra + monto_mano_obra_garantia) as mano_obra
        FROM ordenes WHERE estado_actual = 'Finalizada' AND fecha_cierre IS NOT NULL AND fecha_cierre >= ? AND fecha_cierre < ?
        GROUP BY DATE(fecha_cierre) ORDER BY fecha ASC
    `, [inicio, fin]);

    const facturacion_por_marca = await all(`
        SELECT marca, COUNT(*) AS cantidad_ot, ROUND(SUM(monto_repuestos + monto_mano_obra + monto_repuestos_garantia + monto_mano_obra_garantia), 2) AS facturacion_total
        FROM ordenes WHERE estado_actual = 'Finalizada' AND fecha_cierre IS NOT NULL AND fecha_cierre >= ? AND fecha_cierre < ?
        GROUP BY marca ORDER BY facturacion_total DESC
    `, [inicio, fin]).catch(() => []);

    const rentabilidad_unidad = await all(`
        SELECT u.unidad, COUNT(*) as cantidad, ROUND(SUM(o.monto_repuestos + o.monto_mano_obra + o.monto_repuestos_garantia + o.monto_mano_obra_garantia), 2) AS facturacion_total
        FROM ordenes o JOIN unidades u ON o.patente = u.patente
        WHERE o.estado_actual = 'Finalizada' AND o.fecha_cierre IS NOT NULL AND o.fecha_cierre >= ? AND o.fecha_cierre < ?
        GROUP BY u.unidad ORDER BY facturacion_total DESC LIMIT 10
    `, [inicio, fin]);

    const top_clientes = await all(`
        SELECT c.nombre AS cliente, COUNT(*) AS cantidad_ot, ROUND(SUM(o.monto_repuestos + o.monto_mano_obra + o.monto_repuestos_garantia + o.monto_mano_obra_garantia), 2) AS facturacion_total
        FROM ordenes o JOIN unidades u ON o.patente = u.patente JOIN clientes c ON u.cliente_id = c.id
        WHERE o.estado_actual = 'Finalizada' AND o.fecha_cierre IS NOT NULL AND o.fecha_cierre >= ? AND o.fecha_cierre < ?
        GROUP BY c.id ORDER BY cantidad_ot DESC, facturacion_total DESC LIMIT 10
    `, [inicio, fin]);

    return { resumen, resumen_anterior, facturacion_diaria, facturacion_por_marca, rentabilidad_unidad, top_clientes };
}

// ==========================================================================
// INFORME OPERATIVO / RENDIMIENTO
// ==========================================================================

// Horarios laborales centralizados: antes estaban hardcodeados en 3 lugares
// distintos (construirMapaOcio, cálculo de días hábiles y hs_exigidas).
const HORAS_LABORALES = { habil: [8, 9, 10, 11, 12, 14, 15, 16, 17], sabado: [8, 9, 10, 11, 12] };
const horasDelDia = (diaSemana) => diaSemana === 6 ? HORAS_LABORALES.sabado : HORAS_LABORALES.habil;

// Función matemática para escanear huecos de inactividad
// Función matemática para escanear huecos de inactividad
function construirMapaOcio(diasHabiles, sesiones, excepcionesPorFecha) {
    const heatmap = {};
    for (let d = 1; d <= 6; d++) {
        heatmap[d] = {};
        for (const h of horasDelDia(d)) heatmap[d][h] = 0;
    }

    const bucketCapacity = {};

    // 1. Llenar los "baldes" de horas hábiles disponibles (60 min por hora),
    //    prorrateando las excepciones parciales (ej: 4hs de permiso) en vez de
    //    solo excluir el día completo cuando son >= 8hs.
    for (const fecha of diasHabiles) {
        const exc = excepcionesPorFecha.get(fecha);
        const horasDescontadas = exc ? exc.horas_descontadas : 0;

        // Día completo justificado: no aporta capacidad, no cuenta como ocio.
        if (horasDescontadas >= 8) continue;

        const dSemana = new Date(fecha + 'T12:00:00Z').getDay();
        const slots = horasDelDia(dSemana);

        // Minutos a descontar del total de franjas de ese día (permiso parcial),
        // repartidos secuencialmente entre las franjas disponibles.
        let minutosADescontar = Math.round(horasDescontadas * 60);

        for (const h of slots) {
            const key = `${fecha}-${h}`;
            const capacidadFranja = Math.max(0, 60 - minutosADescontar);
            minutosADescontar = Math.max(0, minutosADescontar - 60);

            bucketCapacity[key] = capacidadFranja;
            heatmap[dSemana][h] += capacidadFranja; // Ocio potencial ya neto de permisos
        }
    }

    // 2. Restar los minutos exactos trabajados en cada balde
    for (const s of sesiones) {
        let curr = new Date(s.inicio + 'Z');
        const end = s.fin ? new Date(s.fin + 'Z') : new Date();

        while (curr < end) {
            const fecha = curr.toISOString().split('T')[0];
            const h = curr.getHours();
            const dSemana = curr.getDay();

            const nextHour = new Date(curr);
            nextHour.setHours(h + 1, 0, 0, 0);
            const chunkEnd = nextHour < end ? nextHour : end;
            const mins = (chunkEnd - curr) / 60000;

            const key = `${fecha}-${h}`;
            if (bucketCapacity[key] && heatmap[dSemana] && heatmap[dSemana][h] !== undefined) {
                heatmap[dSemana][h] = Math.max(0, heatmap[dSemana][h] - mins);
            }
            curr = chunkEnd;
        }
    }

    // 3. Formatear para el Frontend
    const result = [];
    for (let d = 1; d <= 6; d++) {
        for (const h of horasDelDia(d)) {
            result.push({ dia: d, hora: h, minutos_ocio: Math.round(heatmap[d][h]) });
        }
    }
    return result;
}

async function getOperativo(inicio, fin) {
    if (!inicio || !fin) {
        throw new Error('Debe indicar fecha de inicio y fin para el informe operativo');
    }

    const feriadosSet = await getFeriadosSet();
    const rangeStart = new Date(inicio + 'T00:00:00Z');
    const rangeEnd = new Date(fin + 'T00:00:00Z');

    const diasHabilesPeriodo = [];
    {
        const limite = new Date(Math.min(rangeEnd.getTime(), Date.now()));
        for (let cursor = new Date(rangeStart); cursor < limite; cursor = new Date(cursor.getTime() + 86400000)) {
            const fecha = cursor.toISOString().split('T')[0];
            const dia = new Date(fecha + 'T12:00:00Z').getDay();
            if (dia >= 1 && dia <= 6 && !feriadosSet.has(fecha)) diasHabilesPeriodo.push(fecha);
        }
    }

    const mecanicosActivos = await all(`SELECT legajo, nombre FROM legajos WHERE rol IN ('mecanico', 'jefe')`);
    const porLegajo = {};
    for (const mec of mecanicosActivos) {
        porLegajo[mec.legajo] = {
            legajo: mec.legajo, nombre: mec.nombre, ot_set: new Set(),
            hs_estimadas: 0, hs_productivas: 0, hs_internas: 0,
            facturacion_generada: 0, rentabilidad_eficiencia: 0, sesiones: []
        };
    }

    // Antes: subquery correlacionada "(SELECT SUM(tiempo_estimado) FROM actividades
    // WHERE ot = a.ot AND estado = 'Finalizada')" ejecutada por CADA fila de sesiones.
    // Ahora: se precalcula una sola vez y se consulta en memoria con un Map.
    const denomEstimadoPorOT = await all(`
        SELECT ot, SUM(tiempo_estimado) AS denom_estimado
        FROM actividades WHERE estado = 'Finalizada' GROUP BY ot
    `);
    const denomPorOTMap = new Map(denomEstimadoPorOT.map(r => [r.ot, r.denom_estimado]));

    const sesiones = await all(`
        SELECT
            a.legajo_mecanico AS legajo, l.nombre, a.estado,
            a.id AS actividad_id, a.ot, a.tiempo_estimado, a.tiempo_real AS tiempo_real_total,
            ta.inicio, ta.fin, c.nombre AS cliente_nombre,
            (o.monto_mano_obra + o.monto_mano_obra_garantia) AS monto_mano_obra_total
        FROM tiempos_actividad ta
        JOIN actividades a ON ta.actividad_id = a.id
        JOIN legajos l ON a.legajo_mecanico = l.legajo
        JOIN ordenes o ON a.ot = o.ot
        JOIN unidades u ON o.patente = u.patente
        JOIN clientes c ON u.cliente_id = c.id
        WHERE ta.inicio < ? AND (ta.fin IS NULL OR ta.fin > ?)
          AND (ta.fin IS NOT NULL OR (a.estado = 'En Curso' AND ta.id = (SELECT MAX(id) FROM tiempos_actividad WHERE actividad_id = a.id)))
    `, [fin, inicio]);

    for (const s of sesiones) {
        const inicioSesion = new Date(s.inicio + 'Z');
        const finSesion = s.fin ? new Date(s.fin + 'Z') : new Date();
        const start = Math.max(inicioSesion, rangeStart);
        const end = Math.min(finSesion, rangeEnd);
        const horasPeriodo = Math.max(0, (end - start) / 3600000);

        if (horasPeriodo <= 0) continue;

        const m = porLegajo[s.legajo];
        if (!m) continue;

        m.sesiones.push(s);

        if (s.cliente_nombre === 'IVEMAR') {
            m.hs_internas += horasPeriodo;
            continue;
        }

        m.ot_set.add(s.ot);
        m.hs_productivas += horasPeriodo;
        const fraccion = s.tiempo_real_total > 0 ? Math.min(1, horasPeriodo / s.tiempo_real_total) : 0;
        m.hs_estimadas += s.tiempo_estimado * fraccion;

        const denomEstimado = denomPorOTMap.get(s.ot) || 0;
        if (s.estado === 'Finalizada' && denomEstimado > 0) {
            const tasaPorHoraEstimada = s.monto_mano_obra_total / denomEstimado;
            m.facturacion_generada += s.tiempo_estimado * tasaPorHoraEstimada * fraccion;
            m.rentabilidad_eficiencia += (s.tiempo_estimado - s.tiempo_real_total) * tasaPorHoraEstimada * fraccion;
        }
    }

    const diasActivosRows = await all(`
        SELECT a.legajo_mecanico AS legajo, DATE(ta.inicio) as fecha
        FROM tiempos_actividad ta JOIN actividades a ON ta.actividad_id = a.id
        WHERE ta.inicio >= ? AND ta.inicio < ? GROUP BY a.legajo_mecanico, DATE(ta.inicio)
    `, [inicio, fin]);

    const excepcionesRows = await all(`SELECT id, legajo, DATE(fecha) as fecha, motivo, horas_descontadas FROM excepciones_mecanicos WHERE DATE(fecha) >= ? AND DATE(fecha) < ?`, [inicio, fin]);

    // Antes: dentro del .map() de cada mecánico se hacía dias_activos.filter(...) y
    // excepciones.find(...) recorriendo TODO el array en cada iteración (O(n*m)).
    // Ahora: se indexa una sola vez por legajo/fecha con Map.
    const diasActivosPorLegajo = new Map();
    for (const d of diasActivosRows) {
        if (!diasActivosPorLegajo.has(d.legajo)) diasActivosPorLegajo.set(d.legajo, []);
        diasActivosPorLegajo.get(d.legajo).push(d.fecha);
    }

    const excepcionesPorLegajoFecha = new Map(); // legajo -> Map(fecha -> excepcion)
    for (const e of excepcionesRows) {
        if (!excepcionesPorLegajoFecha.has(e.legajo)) excepcionesPorLegajoFecha.set(e.legajo, new Map());
        excepcionesPorLegajoFecha.get(e.legajo).set(e.fecha, e);
    }

    const tiempos_mecanicos = Object.values(porLegajo).map(m => {
        const diasDelMecanico = diasActivosPorLegajo.get(m.legajo) || [];
        const diasTrabajadosSet = new Set(diasDelMecanico);
        const excepcionesMecanico = excepcionesPorLegajoFecha.get(m.legajo) || new Map();

        let hs_exigidas = 0;
        for (const fecha of diasDelMecanico) {
            const esFeriado = feriadosSet.has(fecha);
            let base_dia = esFeriado ? 0 : (new Date(fecha + 'T12:00:00Z').getDay() === 6 ? 5 : 10);
            const exc = excepcionesMecanico.get(fecha);
            if (exc) base_dia -= exc.horas_descontadas;
            hs_exigidas += Math.max(0, base_dia);
        }

        const dias_ausentes = diasHabilesPeriodo
            .filter(fecha => !diasTrabajadosSet.has(fecha))
            .map(fecha => {
                const exc = excepcionesMecanico.get(fecha);
                return { fecha, motivo: exc ? exc.motivo : null, excepcion_id: exc ? exc.id : null };
            });

        const hs_estimadas = parseFloat(m.hs_estimadas.toFixed(2));
        const hs_productivas = parseFloat(m.hs_productivas.toFixed(2));
        const hs_internas = parseFloat(m.hs_internas.toFixed(2));
        const hs_empleadas = parseFloat((hs_productivas + hs_internas).toFixed(2));

        return {
            legajo: m.legajo, nombre: m.nombre,
            ot_trabajadas: m.ot_set.size,
            hs_estimadas, hs_productivas, hs_internas,
            facturacion_generada: parseFloat(m.facturacion_generada.toFixed(2)),
            rentabilidad_eficiencia: parseFloat(m.rentabilidad_eficiencia.toFixed(2)),
            hs_empleadas,
            hs_exigidas: parseFloat(hs_exigidas.toFixed(2)),
            dias_asistidos: diasDelMecanico.length,
            dias_ausentes, dias_ausentes_count: dias_ausentes.length,
            tiempo_muerto: Math.max(0, parseFloat((hs_exigidas - hs_productivas - hs_internas).toFixed(2))),
            eficiencia_porcentaje: hs_productivas > 0 ? parseFloat(((hs_estimadas / hs_productivas) * 100).toFixed(2)) : 0,
            productividad_porcentaje: hs_exigidas > 0 ? parseFloat((hs_empleadas / hs_exigidas * 100).toFixed(2)) : 0,
            mapa_ocio: construirMapaOcio(diasHabilesPeriodo, m.sesiones, excepcionesMecanico)
        };
    }).sort((a, b) => b.facturacion_generada - a.facturacion_generada);

    return { tiempos_mecanicos };
}

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

module.exports = { getFinanciero, getOperativo, getTaller };
