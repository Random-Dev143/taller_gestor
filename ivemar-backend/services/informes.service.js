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

async function getOperativo(inicio, fin) {
    const feriadosSet = await getFeriadosSet();
    const rangeStart = new Date(inicio + 'T00:00:00Z');
    const rangeEnd = new Date(fin + 'T00:00:00Z');

    // Días hábiles ya transcurridos dentro del rango (lunes a sábado, sin feriados).
    // Sirven de base para detectar en qué días puntuales un mecánico no se logueó.
    const diasHabilesPeriodo = [];
    {
        const limite = new Date(Math.min(rangeEnd.getTime(), Date.now()));
        for (let cursor = new Date(rangeStart); cursor < limite; cursor = new Date(cursor.getTime() + 86400000)) {
            const fecha = cursor.toISOString().split('T')[0];
            const dia = new Date(fecha + 'T12:00:00Z').getDay();
            if (dia >= 1 && dia <= 6 && !feriadosSet.has(fecha)) diasHabilesPeriodo.push(fecha);
        }
    }

    // Arrancamos con TODOS los mecánicos activos (no solo los que tuvieron actividad),
    // para que quien no se logueó ningún día del período también aparezca en el informe.
    const mecanicosActivos = await all(`SELECT legajo, nombre FROM legajos WHERE rol = 'mecanico'`);
    const porLegajo = {};
    for (const mec of mecanicosActivos) {
        porLegajo[mec.legajo] = {
            legajo: mec.legajo, nombre: mec.nombre, ot_set: new Set(),
            hs_estimadas: 0, hs_productivas: 0, hs_internas: 0,
            facturacion_generada: 0, rentabilidad_eficiencia: 0
        };
    }

    // Sesiones de trabajo (tiempos_actividad) que se solapan con el rango.
    // Ya NO exigimos que la actividad esté Finalizada: si el mecánico trabajó varios días
    // sobre una tarea que sigue en curso, esas horas deben contar igual como trabajo real.
    // Solo la atribución de facturación (dinero) sigue esperando el cierre de la actividad,
    // porque repartir el monto de mano de obra de una tarea aún no finalizada es especulativo.
    // Además prorrateamos cada sesión a las horas reales caídas dentro del rango, en vez de
    // sumar la actividad completa (evita que una tarea que cruza fin de mes duplique o fugue horas).
    const sesiones = await all(`
        SELECT
            a.legajo_mecanico AS legajo, l.nombre, a.estado,
            a.id AS actividad_id, a.ot, a.tiempo_estimado, a.tiempo_real AS tiempo_real_total,
            ta.inicio, ta.fin,
            c.nombre AS cliente_nombre,
            (o.monto_mano_obra + o.monto_mano_obra_garantia) AS monto_mano_obra_total,
            (SELECT SUM(tiempo_estimado) FROM actividades WHERE ot = a.ot AND estado = 'Finalizada') AS denom_estimado
        FROM tiempos_actividad ta
        JOIN actividades a ON ta.actividad_id = a.id
        JOIN legajos l ON a.legajo_mecanico = l.legajo
        JOIN ordenes o ON a.ot = o.ot
        JOIN unidades u ON o.patente = u.patente
        JOIN clientes c ON u.cliente_id = c.id
        WHERE ta.inicio < ? AND (ta.fin IS NULL OR ta.fin > ?)
          -- Descarta sesiones "abiertas" huérfanas (fin NULL que no sea la última del legajo
          -- ni de una actividad realmente En Curso): un bug de doble-inicio puede dejar filas
          -- sin cerrar para siempre, y contarlas como "trabajando hasta ahora" infla las horas.
          AND (ta.fin IS NOT NULL OR (
                a.estado = 'En Curso'
                AND ta.id = (SELECT MAX(id) FROM tiempos_actividad WHERE actividad_id = a.id)
          ))
    `, [fin, inicio]);

    for (const s of sesiones) {
        const inicioSesion = new Date(s.inicio + 'Z');
        const finSesion = s.fin ? new Date(s.fin + 'Z') : new Date();
        const start = inicioSesion < rangeStart ? rangeStart : inicioSesion;
        const end = finSesion > rangeEnd ? rangeEnd : finSesion;
        const horasPeriodo = Math.max(0, (end - start) / 3600000);
        if (horasPeriodo <= 0) continue;

        if (!porLegajo[s.legajo]) {
            porLegajo[s.legajo] = {
                legajo: s.legajo, nombre: s.nombre, ot_set: new Set(),
                hs_estimadas: 0, hs_productivas: 0, hs_internas: 0,
                facturacion_generada: 0, rentabilidad_eficiencia: 0
            };
        }
        const m = porLegajo[s.legajo];

        if (s.cliente_nombre === 'IVEMAR') {
            m.hs_internas += horasPeriodo;
            continue;
        }

        m.ot_set.add(s.ot);
        m.hs_productivas += horasPeriodo;

        // Fracción del trabajo real total de la actividad que cayó en este período,
        // usada para prorratear (sin duplicar) el peso estimado y su facturación asociada.
        const fraccion = s.tiempo_real_total > 0 ? Math.min(1, horasPeriodo / s.tiempo_real_total) : 0;
        m.hs_estimadas += s.tiempo_estimado * fraccion;

        if (s.estado === 'Finalizada') {
            const denom = s.denom_estimado || 0;
            if (denom > 0) {
                const tasaPorHoraEstimada = s.monto_mano_obra_total / denom;
                m.facturacion_generada += s.tiempo_estimado * tasaPorHoraEstimada * fraccion;
                m.rentabilidad_eficiencia += (s.tiempo_estimado - s.tiempo_real_total) * tasaPorHoraEstimada * fraccion;
            }
        }
    }

    // 2. Extraer los días que cada mecánico tuvo al menos 1 segundo de actividad (sin filtrar por estado de la tarea)
    const dias_activos = await all(`
        SELECT a.legajo_mecanico AS legajo, DATE(ta.inicio) as fecha
        FROM tiempos_actividad ta
        JOIN actividades a ON ta.actividad_id = a.id
        WHERE ta.inicio >= ? AND ta.inicio < ?
        GROUP BY a.legajo_mecanico, DATE(ta.inicio)
    `, [inicio, fin]);

    // 3. Extraer excepciones/justificaciones cargadas por el Jefe (normalizamos ambos lados a DATE)
    const excepciones = await all(`
        SELECT id, legajo, DATE(fecha) as fecha, motivo, horas_descontadas
        FROM excepciones_mecanicos
        WHERE DATE(fecha) >= ? AND DATE(fecha) < ?
    `, [inicio, fin]);

    // 4. Lógica Matemática del Ocio + detección de días puntuales sin login
    const tiempos_mecanicos = Object.values(porLegajo).map(m => {
        let dias_del_mecanico = dias_activos.filter(d => d.legajo === m.legajo);
        const diasTrabajadosSet = new Set(dias_del_mecanico.map(d => d.fecha));
        let hs_exigidas = 0;

        for (let d of dias_del_mecanico) {
            // Evaluamos la fecha al mediodía UTC para evitar saltos de zona horaria
            let fechaObj = new Date(d.fecha + 'T12:00:00Z');
            let isSabado = fechaObj.getDay() === 6;
            let esFeriado = feriadosSet.has(d.fecha);

            let base_dia = esFeriado ? 0 : (isSabado ? 5 : 10);

            // Restar horas si el jefe cargó una salida anticipada/permiso para ese día
            let exc = excepciones.find(e => e.legajo === m.legajo && e.fecha === d.fecha);
            if (exc) base_dia -= exc.horas_descontadas;

            hs_exigidas += Math.max(0, base_dia);
        }

        // Días hábiles del período en los que el mecánico NO registró ningún trabajo.
        // Si hay una excepción cargada (franco, permiso, vacaciones) se informa el motivo;
        // si no hay ninguna, queda como ausencia sin justificar para que el Jefe la revise.
        const dias_ausentes = diasHabilesPeriodo
            .filter(fecha => !diasTrabajadosSet.has(fecha))
            .map(fecha => {
                const exc = excepciones.find(e => e.legajo === m.legajo && e.fecha === fecha);
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
            dias_asistidos: dias_del_mecanico.length,
            dias_ausentes,
            dias_ausentes_count: dias_ausentes.length,
            tiempo_muerto: Math.max(0, parseFloat((hs_exigidas - hs_productivas - hs_internas).toFixed(2))),
            eficiencia_porcentaje: hs_productivas > 0 ? parseFloat(((hs_estimadas / hs_productivas) * 100).toFixed(2)) : 0,
            productividad_porcentaje: hs_exigidas > 0 ? parseFloat((hs_empleadas / hs_exigidas * 100).toFixed(2)) : 0
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