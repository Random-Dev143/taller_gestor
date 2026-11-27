'use strict';
// ─── ANALÍTICA: PANEL DE INICIO Y CRUCES DE TURNOS / OT / PRESUPUESTOS ──────────
// Todo se calcula con consultas sobre las tablas existentes (ordenes, turnos,
// ot_documentos); no se guarda nada nuevo. Las cifras de facturación del mes usan
// getFinanciero(), la misma función de los informes, para que el panel nunca
// contradiga lo que muestra "Informes".
//
// Fechas: se guardan en UTC; los días calendario se calculan con 'localtime',
// igual que en el resto de la app (ver FECHAS_Y_HORAS.md).

const { all, get } = require('../../config/database');
const turnosService = require('../turnos/turnos.service');
const { getFinanciero } = require('../../services/informes/financiero');

const UMBRAL_DIAS_ESTANCADA = 7;      // igual que la alerta de la tabla de OT
const UMBRAL_DIAS_PRESUPUESTO = 3;    // un presupuesto sin respuesta más de N días merece seguimiento
const DIAS_FALTA_FACTURAR = 30;       // ventana por defecto de la lista de Finalizadas
const LIMITE_ATENCION = 5;

const fail = (status, message) => Object.assign(new Error(message), { status });
const fechaValida = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(Date.parse(v));
const redondear = (n, d = 1) => (n === null || n === undefined || Number.isNaN(n)) ? null : Math.round(n * 10 ** d) / 10 ** d;
const pct = (a, b) => b > 0 ? redondear(100 * a / b) : null;

// Misma fórmula que MONTOS_EXPR del listado de OT y que los informes financieros.
const MONTOS = `(COALESCE(o.monto_repuestos,0) + COALESCE(o.monto_mano_obra,0) + COALESCE(o.monto_repuestos_garantia,0) + COALESCE(o.monto_mano_obra_garantia,0) - (CASE WHEN o.descuento_estado = 'autorizado' THEN COALESCE(o.monto_descuento,0) ELSE 0 END))`;
// OT del taller (sin la OT interna '0000' ni las anuladas).
const OT_VIVA = `o.ot != '0000' AND COALESCE(o.anulada,0) = 0`;

// ═════════════════════════════════════════════════════════════════
//  PANEL DE INICIO ("qué está pasando hoy")
// ═════════════════════════════════════════════════════════════════
async function panel({ puedeFinanzas = false } = {}) {
    const hoy = (await get(`SELECT date('now','localtime') AS d`)).d;

    // ── Taller ──
    const filasEstado = await all(
        `SELECT o.estado_actual AS estado, COUNT(*) AS n FROM ordenes o
         WHERE ${OT_VIVA} AND o.estado_actual != 'Finalizada' GROUP BY o.estado_actual`);
    const por_estado = {};
    for (const f of filasEstado) por_estado[f.estado] = f.n;
    const en_taller = filasEstado.reduce((a, f) => a + f.n, 0);

    const estancadas = await all(
        `SELECT o.ot, o.patente, u.unidad, c.nombre AS cliente, o.estado_actual,
                CAST(julianday('now') - julianday(o.fecha_apertura) AS INTEGER) AS dias
         FROM ordenes o JOIN unidades u ON o.patente = u.patente JOIN clientes c ON u.cliente_id = c.id
         WHERE ${OT_VIVA} AND o.estado_actual != 'Finalizada' AND julianday('now') - julianday(o.fecha_apertura) > ?
         ORDER BY o.fecha_apertura ASC`, [UMBRAL_DIAS_ESTANCADA]);

    const listas = await all(
        `SELECT o.ot, o.patente, u.unidad, c.nombre AS cliente
         FROM ordenes o JOIN unidades u ON o.patente = u.patente JOIN clientes c ON u.cliente_id = c.id
         WHERE ${OT_VIVA} AND o.estado_actual != 'Finalizada' AND COALESCE(o.controlada,0) = 0
           AND (SELECT COUNT(*) FROM actividades WHERE ot = o.ot) > 0
           AND (SELECT COUNT(*) FROM actividades WHERE ot = o.ot AND estado != 'Finalizada') = 0
         ORDER BY o.fecha_apertura ASC`);

    const sinTareas = (await get(
        `SELECT COUNT(*) AS n FROM ordenes o WHERE ${OT_VIVA} AND o.estado_actual != 'Finalizada'
           AND NOT EXISTS (SELECT 1 FROM actividades a WHERE a.ot = o.ot)`)).n;

    // ── Turnos de hoy ──
    const turnosHoy = await all(
        `SELECT estado, COUNT(*) AS n FROM turnos WHERE date(fecha_hora,'localtime') = ? GROUP BY estado`, [hoy]);
    const th = { total: 0, confirmado: 0, sin_confirmar: 0, reprogramar: 0, ot_creada: 0, cancelado: 0, no_asistio: 0 };
    for (const f of turnosHoy) { th[f.estado] = f.n; th.total += f.n; }
    const cap = (await turnosService.capacidad({ desde: hoy, hasta: hoy })).dias[0] || {};
    const turnos_hoy = {
        total: th.total - th.cancelado,
        esperados: th.confirmado + th.sin_confirmar,
        confirmados: th.confirmado,
        sin_confirmar: th.sin_confirmar,
        llegaron: th.ot_creada,
        horas_comprometidas: redondear(cap.horas_comprometidas || 0),
        horas_prioritarias: redondear(cap.horas_prioritarias || 0),
        horas_disponibles: redondear(cap.horas_disponibles || 0),
        abierto: cap.abierto !== false
    };

    // ── Pendientes que alguien tiene que resolver ──
    const confirmadosSinOt = await all(
        `SELECT id, fecha_hora, patente, unidad, cliente, tipo FROM turnos
         WHERE estado = 'confirmado' AND ot IS NULL AND date(fecha_hora,'localtime') <= date('now','localtime','+1 day')
         ORDER BY fecha_hora`);

    const presu = await get(
        `SELECT COUNT(*) AS n, COALESCE(SUM(d.monto),0) AS monto FROM ot_documentos d
         JOIN ordenes o ON o.ot = d.ot
         WHERE d.tipo = 'presupuesto' AND d.borrado_en IS NULL AND d.estado_presupuesto = 'pendiente' AND o.estado_actual != 'Finalizada'`);
    const presuViejos = await all(
        `SELECT d.id, d.ot, d.monto, d.version, o.patente, u.unidad,
                CAST(julianday('now') - julianday(d.subido_en) AS INTEGER) AS dias
         FROM ot_documentos d JOIN ordenes o ON o.ot = d.ot JOIN unidades u ON o.patente = u.patente
         WHERE d.tipo = 'presupuesto' AND d.borrado_en IS NULL AND d.estado_presupuesto = 'pendiente'
           AND o.estado_actual != 'Finalizada' AND julianday('now') - julianday(d.subido_en) > ?
         ORDER BY d.subido_en ASC`, [UMBRAL_DIAS_PRESUPUESTO]);

    const faltaFacturar = (await get(
        `SELECT COUNT(*) AS n FROM ordenes o
         WHERE ${OT_VIVA} AND o.estado_actual = 'Finalizada' AND ${MONTOS} = 0
           AND date(o.fecha_cierre,'localtime') >= date('now','localtime','-${DIAS_FALTA_FACTURAR} day')`)).n;
    const descuentosPendientes = (await get(`SELECT COUNT(*) AS n FROM ordenes WHERE descuento_estado = 'pendiente'`)).n;

    const resultado = {
        hoy,
        taller: {
            en_taller, por_estado,
            estancadas: estancadas.length,
            listas_para_controlar: listas.length,
            sin_tareas: sinTareas,
            umbral_dias_estancada: UMBRAL_DIAS_ESTANCADA
        },
        turnos_hoy,
        pendientes: {
            turnos_confirmados_sin_ot: confirmadosSinOt.length,
            presupuestos_sin_respuesta: presu.n,
            presupuestos_monto: redondear(presu.monto, 2),
            falta_facturar: faltaFacturar,
            descuentos_pendientes: descuentosPendientes
        },
        atencion: {
            turnos_confirmados: confirmadosSinOt.slice(0, LIMITE_ATENCION),
            estancadas: estancadas.slice(0, LIMITE_ATENCION),
            listas: listas.slice(0, LIMITE_ATENCION),
            presupuestos: presuViejos.slice(0, LIMITE_ATENCION),
            presupuestos_total: presuViejos.length
        },
        mes: null
    };

    // ── Mes en curso (solo con permiso de finanzas): mismo cálculo que "Informes" ──
    if (puedeFinanzas) {
        // Se compara lo que va del mes contra los MISMOS días del mes anterior (no contra el mes completo,
        // que a principios de mes mostraría siempre una caída que no es real).
        const mes = hoy.slice(0, 7);
        const inicio = `${mes}-01`;
        const [anio, m] = mes.split('-').map(Number);
        const transcurridos = Number(hoy.slice(8, 10));
        const dia = (y, mes0, d) => new Date(Date.UTC(y, mes0, d)).toISOString().split('T')[0];
        const fin = dia(anio, m - 1, transcurridos + 1);                       // exclusivo: incluye hoy
        const inicioAnterior = dia(anio, m - 2, 1);
        const diasMesAnterior = new Date(Date.UTC(anio, m - 1, 0)).getUTCDate();
        const finAnterior = dia(anio, m - 2, Math.min(transcurridos, diasMesAnterior) + 1);
        const f = await getFinanciero(inicio, fin, inicioAnterior, finAnterior);
        const r = f.resumen || {}; const ra = f.resumen_anterior || {};
        resultado.mes = {
            mes, desde: inicio, dias_transcurridos: transcurridos,
            finalizadas: r.total_ot || 0,
            facturado: r.total_facturado || 0,
            eficiencia_pct: r.eficiencia_pct ?? null,
            anterior: { finalizadas: ra.total_ot || 0, facturado: ra.total_facturado || 0, eficiencia_pct: ra.eficiencia_pct ?? null }
        };
    }
    return resultado;
}

// ═════════════════════════════════════════════════════════════════
//  ANÁLISIS CRUZADO: TURNOS → OT → PRESUPUESTO → FACTURACIÓN
// ═════════════════════════════════════════════════════════════════
async function rangoDe({ desde, hasta } = {}) {
    const hoy = (await get(`SELECT date('now','localtime') AS d`)).d;
    const h = fechaValida(hasta) ? hasta : hoy;
    const d = fechaValida(desde) ? desde : (await get(`SELECT date(?, '-29 day') AS d`, [h])).d;
    if (d > h) throw fail(400, 'La fecha "desde" no puede ser posterior a "hasta".');
    if ((new Date(h) - new Date(d)) / 86400000 > 366) throw fail(400, 'El rango máximo es de un año.');
    return { desde: d, hasta: h, hoy };
}

async function turnosPresupuestos(query = {}) {
    const { desde, hasta, hoy } = await rangoDe(query);
    const enRango = `date(t.fecha_hora,'localtime') BETWEEN ? AND ?`;
    const p = [desde, hasta];

    // ── Embudo ──
    const e = await get(
        `SELECT COUNT(*) AS agendados,
                SUM(CASE WHEN t.estado = 'confirmado' OR t.confirmado_en IS NOT NULL THEN 1 ELSE 0 END) AS confirmados,
                SUM(CASE WHEN t.estado = 'ot_creada' THEN 1 ELSE 0 END) AS llegaron,
                SUM(CASE WHEN t.estado = 'no_asistio' THEN 1 ELSE 0 END) AS no_asistio,
                SUM(CASE WHEN t.estado = 'cancelado' THEN 1 ELSE 0 END) AS cancelados,
                SUM(CASE WHEN t.estado = 'reprogramar' THEN 1 ELSE 0 END) AS reprogramar,
                SUM(CASE WHEN t.estado = 'ot_creada' AND EXISTS (SELECT 1 FROM ot_documentos d WHERE d.ot = t.ot AND d.tipo='presupuesto' AND d.borrado_en IS NULL) THEN 1 ELSE 0 END) AS con_presupuesto,
                SUM(CASE WHEN t.estado = 'ot_creada' AND EXISTS (SELECT 1 FROM ot_documentos d WHERE d.ot = t.ot AND d.tipo='presupuesto' AND d.borrado_en IS NULL AND d.estado_presupuesto IN ('aprobado','aprobado_parcial')) THEN 1 ELSE 0 END) AS presupuesto_aprobado,
                SUM(CASE WHEN t.estado = 'ot_creada' AND (SELECT estado_actual FROM ordenes WHERE ot = t.ot) = 'Finalizada' THEN 1 ELSE 0 END) AS finalizadas
         FROM turnos t WHERE ${enRango}`, p);
    const n = (k) => e[k] || 0;
    // Cada etapa se mide contra su base real: no todas las OT tienen presupuesto, así que
    // "finalizadas" no es una parte de "presupuesto aprobado" sino de "llegaron".
    const DEFS = [
        { clave: 'agendados', etiqueta: 'Turnos agendados', base: null, base_texto: '' },
        { clave: 'confirmados', etiqueta: 'Confirmados', base: 'agendados', base_texto: 'de los agendados' },
        { clave: 'llegaron', etiqueta: 'Llegaron (OT creada)', base: 'agendados', base_texto: 'de los agendados' },
        { clave: 'finalizadas', etiqueta: 'OT finalizada', base: 'llegaron', base_texto: 'de los que llegaron' },
        { clave: 'con_presupuesto', etiqueta: 'Con presupuesto', base: 'llegaron', base_texto: 'de los que llegaron' },
        { clave: 'presupuesto_aprobado', etiqueta: 'Presupuesto aprobado', base: 'con_presupuesto', base_texto: 'de los presupuestados' }
    ];
    const etapas = DEFS.map(x => ({ ...x, n: n(x.clave) }));
    for (const x of etapas) {
        x.pct_total = pct(x.n, etapas[0].n);
        x.pct_base = x.base ? pct(x.n, etapas.find(y => y.clave === x.base).n) : null;
    }

    // ── Asistencia: sobre turnos ya vencidos (antes de hoy) y no cancelados ni reprogramados ──
    const v = await get(
        `SELECT COUNT(*) AS vencidos, SUM(CASE WHEN t.estado = 'ot_creada' THEN 1 ELSE 0 END) AS llegaron
         FROM turnos t WHERE ${enRango} AND date(t.fecha_hora,'localtime') < ? AND t.estado NOT IN ('cancelado','reprogramar')`, [...p, hoy]);
    const asistencia = {
        vencidos: v.vencidos || 0,
        llegaron: v.llegaron || 0,
        pct_asistencia: pct(v.llegaron || 0, v.vencidos || 0),
        pct_no_show: v.vencidos ? redondear(100 - pct(v.llegaron || 0, v.vencidos)) : null,
        pct_cancelados: pct(n('cancelados'), n('agendados')),
        no_asistio: n('no_asistio'),
        cancelados: n('cancelados'),
        reprogramar: n('reprogramar')
    };

    // ── Por día de la semana y por tipo ──
    const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    const filasDia = await all(
        `SELECT CAST(strftime('%w', t.fecha_hora, 'localtime') AS INTEGER) AS dow,
                COUNT(*) AS total, SUM(CASE WHEN t.estado = 'ot_creada' THEN 1 ELSE 0 END) AS llegaron,
                SUM(CASE WHEN t.estado = 'no_asistio' THEN 1 ELSE 0 END) AS no_asistio
         FROM turnos t WHERE ${enRango} AND t.estado != 'cancelado' GROUP BY dow`, p);
    const por_dia = [1, 2, 3, 4, 5, 6, 0].map(d => {
        const f = filasDia.find(x => x.dow === d) || { total: 0, llegaron: 0, no_asistio: 0 };
        return { dia: DIAS[d], total: f.total, llegaron: f.llegaron, no_asistio: f.no_asistio };
    });
    const por_tipo = await all(`SELECT t.tipo, COUNT(*) AS total FROM turnos t WHERE ${enRango} AND t.estado != 'cancelado' GROUP BY t.tipo ORDER BY total DESC`, p);
    const confirmacion = await all(
        `SELECT COALESCE(t.confirmado_via, 'sin_confirmar') AS via, COUNT(*) AS total FROM turnos t
         WHERE ${enRango} AND t.estado != 'cancelado' GROUP BY via ORDER BY total DESC`, p);

    // ── Puntualidad y estimado vs real (solo turnos que llegaron) ──
    const pu = await get(
        `SELECT COUNT(*) AS n,
                AVG((julianday(o.fecha_apertura) - julianday(t.fecha_hora)) * 1440) AS min_prom,
                SUM(CASE WHEN ABS((julianday(o.fecha_apertura) - julianday(t.fecha_hora)) * 1440) <= 30 THEN 1 ELSE 0 END) AS a_horario,
                SUM(CASE WHEN (julianday(o.fecha_apertura) - julianday(t.fecha_hora)) * 1440 > 30 THEN 1 ELSE 0 END) AS tarde
         FROM turnos t JOIN ordenes o ON o.ot = t.ot WHERE ${enRango} AND t.estado = 'ot_creada'`, p);
    const puntualidad = {
        con_ot: pu.n || 0,
        minutos_promedio: redondear(pu.min_prom, 0),
        pct_a_horario: pct(pu.a_horario || 0, pu.n || 0),
        pct_tarde: pct(pu.tarde || 0, pu.n || 0)
    };
    const ev = await get(
        `SELECT COUNT(*) AS n, SUM(t.horas_estimadas) AS estimadas, SUM(o.tiempo_empleado_horas) AS reales
         FROM turnos t JOIN ordenes o ON o.ot = t.ot
         WHERE ${enRango} AND t.estado = 'ot_creada' AND o.estado_actual = 'Finalizada' AND t.horas_estimadas > 0 AND o.tiempo_empleado_horas > 0`, p);
    const estimado_vs_real = {
        ots: ev.n || 0,
        horas_estimadas: redondear(ev.estimadas || 0),
        horas_reales: redondear(ev.reales || 0),
        desvio_pct: ev.estimadas > 0 ? redondear(100 * ((ev.reales || 0) - ev.estimadas) / ev.estimadas) : null
    };

    // ── Origen de las OT abiertas en el período ──
    const org = await get(
        `SELECT COUNT(*) AS total,
                SUM(CASE WHEN EXISTS (SELECT 1 FROM turnos t WHERE t.ot = o.ot) THEN 1 ELSE 0 END) AS con_turno,
                SUM(CASE WHEN COALESCE(o.es_retrabajo,0) = 1 THEN 1 ELSE 0 END) AS retrabajos,
                SUM(CASE WHEN o.es_garantia = 1 THEN 1 ELSE 0 END) AS garantias
         FROM ordenes o WHERE ${OT_VIVA} AND date(o.fecha_apertura,'localtime') BETWEEN ? AND ?`, p);
    const origen_ots = {
        total: org.total || 0, con_turno: org.con_turno || 0, mostrador: (org.total || 0) - (org.con_turno || 0),
        pct_con_turno: pct(org.con_turno || 0, org.total || 0),
        retrabajos: org.retrabajos || 0, pct_retrabajo: pct(org.retrabajos || 0, org.total || 0),
        garantias: org.garantias || 0
    };

    // ── Presupuestos (por fecha de carga) ──
    const enRangoDoc = `d.tipo = 'presupuesto' AND d.borrado_en IS NULL AND date(d.subido_en,'localtime') BETWEEN ? AND ?`;
    const pr = await get(
        `SELECT COUNT(*) AS cantidad, COALESCE(SUM(d.monto),0) AS monto,
                SUM(CASE WHEN d.es_revision = 1 THEN 1 ELSE 0 END) AS revisiones,
                SUM(CASE WHEN d.estado_presupuesto = 'pendiente' THEN 1 ELSE 0 END) AS pendientes,
                SUM(CASE WHEN d.estado_presupuesto = 'aprobado' THEN 1 ELSE 0 END) AS aprobados,
                SUM(CASE WHEN d.estado_presupuesto = 'aprobado_parcial' THEN 1 ELSE 0 END) AS parciales,
                SUM(CASE WHEN d.estado_presupuesto = 'rechazado' THEN 1 ELSE 0 END) AS rechazados,
                COALESCE(SUM(CASE WHEN d.estado_presupuesto = 'pendiente' THEN d.monto END),0) AS monto_pendiente,
                COALESCE(SUM(CASE WHEN d.estado_presupuesto = 'aprobado' THEN d.monto END),0) AS monto_aprobado,
                COALESCE(SUM(CASE WHEN d.estado_presupuesto = 'aprobado_parcial' THEN d.monto END),0) AS monto_parcial,
                COALESCE(SUM(CASE WHEN d.estado_presupuesto = 'rechazado' THEN d.monto END),0) AS monto_rechazado,
                AVG(CASE WHEN d.estado_presupuesto != 'pendiente' AND d.estado_actualizado_en IS NOT NULL
                         THEN (julianday(d.estado_actualizado_en) - julianday(d.subido_en)) * 24 END) AS horas_respuesta
         FROM ot_documentos d WHERE ${enRangoDoc}`, p);
    const respondidos = (pr.aprobados || 0) + (pr.parciales || 0) + (pr.rechazados || 0);
    const cruce = await get(
        `SELECT COUNT(DISTINCT o.ot) AS ots, COALESCE(SUM(${MONTOS}),0) AS facturado
         FROM ordenes o WHERE o.estado_actual = 'Finalizada' AND o.ot IN (
             SELECT d.ot FROM ot_documentos d WHERE ${enRangoDoc} AND d.estado_presupuesto IN ('aprobado','aprobado_parcial'))`, p);
    const antiguos = await all(
        `SELECT d.id, d.ot, d.monto, d.version, o.patente, u.unidad, c.nombre AS cliente,
                CAST(julianday('now') - julianday(d.subido_en) AS INTEGER) AS dias
         FROM ot_documentos d JOIN ordenes o ON o.ot = d.ot JOIN unidades u ON o.patente = u.patente JOIN clientes c ON u.cliente_id = c.id
         WHERE d.tipo = 'presupuesto' AND d.borrado_en IS NULL AND d.estado_presupuesto = 'pendiente' AND o.estado_actual != 'Finalizada'
           AND julianday('now') - julianday(d.subido_en) > ?
         ORDER BY d.subido_en ASC LIMIT 10`, [UMBRAL_DIAS_PRESUPUESTO]);

    const presupuestos = {
        cantidad: pr.cantidad || 0,
        monto_total: redondear(pr.monto, 2),
        por_estado: [
            { estado: 'pendiente', cantidad: pr.pendientes || 0, monto: redondear(pr.monto_pendiente, 2) },
            { estado: 'aprobado', cantidad: pr.aprobados || 0, monto: redondear(pr.monto_aprobado, 2) },
            { estado: 'aprobado_parcial', cantidad: pr.parciales || 0, monto: redondear(pr.monto_parcial, 2) },
            { estado: 'rechazado', cantidad: pr.rechazados || 0, monto: redondear(pr.monto_rechazado, 2) }
        ],
        respondidos,
        pct_aprobacion: pct((pr.aprobados || 0) + (pr.parciales || 0), respondidos),
        pct_revisiones: pct(pr.revisiones || 0, pr.cantidad || 0),
        horas_respuesta_promedio: redondear(pr.horas_respuesta, 1),
        aprobados_finalizados: { ots: cruce.ots || 0, facturado: redondear(cruce.facturado, 2) },
        sin_respuesta_antiguos: antiguos,
        umbral_dias: UMBRAL_DIAS_PRESUPUESTO
    };

    return { rango: { desde, hasta }, embudo: etapas, asistencia, por_dia, por_tipo, confirmacion, puntualidad, estimado_vs_real, origen_ots, presupuestos };
}

module.exports = { panel, turnosPresupuestos };
