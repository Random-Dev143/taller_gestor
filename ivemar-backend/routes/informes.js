const express = require('express');
const router = express.Router();
const { all, get } = require('../config/database');

// --- Motor de Cálculo de Horas de Taller ---
function calcularMinutosHabiles(startStr, endStr) {
    if (!startStr) return 0;
    
    let start = new Date(startStr + 'Z');
    let end = endStr ? new Date(endStr + 'Z') : new Date();

    if (end < start) return 0;

    let totalMinutos = 0;
    let actual = new Date(start);
    let maxIterations = 1000; 

    while (actual < end && maxIterations > 0) {
        maxIterations--;
        let dia = actual.getDay();
        let hora = actual.getHours();

        let enHorarioLaboral = false;
        if (dia >= 1 && dia <= 5) { 
            if ((hora >= 8 && hora < 13) || (hora >= 14 && hora < 18)) enHorarioLaboral = true;
        } else if (dia === 6) { 
            if (hora >= 8 && hora < 13) enHorarioLaboral = true;
        }

        if (enHorarioLaboral) {
            let limiteCorte = (hora < 13) ? 13 : 18;
            let finBloque = new Date(actual);
            finBloque.setHours(limiteCorte, 0, 0, 0);

            let corte = (end < finBloque) ? end : finBloque;
            totalMinutos += (corte - actual) / 60000;
            
            actual = new Date(corte);
        } else {
            if (hora < 8) {
                actual.setHours(8, 0, 0, 0);
            } else if (dia >= 1 && dia <= 5 && hora >= 13 && hora < 14) {
                actual.setHours(14, 0, 0, 0);
            } else {
                actual.setDate(actual.getDate() + 1);
                actual.setHours(8, 0, 0, 0);
            }
        }
    }
    return totalMinutos;
}

router.get('/mensual', async (req, res) => {
    let inicio, fin, textoRango;
    
    if (req.query.desde && req.query.hasta) {
        inicio = req.query.desde;
        fin = new Date(new Date(req.query.hasta).setDate(new Date(req.query.hasta).getDate() + 1)).toISOString().split('T')[0];
        textoRango = `${req.query.desde} al ${req.query.hasta}`;
    } else {
        const mes = req.query.mes || new Date().toISOString().substring(0, 7);
        inicio = `${mes}-01`;
        fin = new Date(new Date(inicio).setMonth(new Date(inicio).getMonth() + 1)).toISOString().split('T')[0];
        textoRango = mes;
    }

    const diasRango = Math.round((new Date(fin) - new Date(inicio)) / 86400000);
    const inicioAnterior = new Date(new Date(inicio).getTime() - diasRango * 86400000).toISOString().split('T')[0];
    const finAnterior = inicio;

    try {
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
                   ROUND(AVG(CASE WHEN estado_actual = 'Finalizada' THEN (monto_repuestos + monto_mano_obra + monto_repuestos_garantia + monto_mano_obra_garantia) ELSE NULL END), 2) AS facturacion_promedio,
                   ROUND(SUM(monto_repuestos_garantia + monto_mano_obra_garantia), 2) AS monto_garantia,
                   ROUND(SUM(monto_repuestos + monto_mano_obra), 2) AS monto_facturable
            FROM ordenes WHERE fecha_apertura >= ? AND fecha_apertura < ?
        `;
        const resumen = await get(queryResumen, [inicio, fin]);
        const resumen_anterior = await get(queryResumen, [inicioAnterior, finAnterior]);
        
        const facturacion_diaria = await all(`
            SELECT DATE(fecha_cierre) as fecha, 
                   SUM(monto_repuestos + monto_repuestos_garantia) as repuestos, 
                   SUM(monto_mano_obra + monto_mano_obra_garantia) as mano_obra 
            FROM ordenes 
            WHERE estado_actual = 'Finalizada' AND fecha_cierre IS NOT NULL AND fecha_apertura >= ? AND fecha_apertura < ?
            GROUP BY DATE(fecha_cierre)
            ORDER BY fecha ASC
        `, [inicio, fin]);

        // FIX: Proporción matemática de facturación según horas asignadas a la tarea vs horas totales de la OT.
        const tiempos_mecanicos = await all(`
            SELECT 
                a.legajo_mecanico AS legajo, 
                l.nombre, 
                COUNT(DISTINCT a.ot) AS ot_trabajadas, 
                ROUND(SUM(a.tiempo_estimado), 2) AS hs_estimadas, 
                ROUND(SUM(a.tiempo_real), 2) AS hs_empleadas, 
                ROUND((SUM(a.tiempo_estimado) / NULLIF(SUM(a.tiempo_real), 0)) * 100, 2) AS eficiencia_porcentaje,
                ROUND(SUM(
                    (a.tiempo_estimado / (SELECT NULLIF(SUM(tiempo_estimado), 0) FROM actividades WHERE ot = o.ot)) 
                    * (o.monto_mano_obra + o.monto_mano_obra_garantia)
                ), 2) AS facturacion_generada
            FROM actividades a 
            JOIN legajos l ON a.legajo_mecanico = l.legajo 
            JOIN ordenes o ON a.ot = o.ot 
            WHERE o.fecha_apertura >= ? AND o.fecha_apertura < ? AND a.estado = 'Finalizada' 
            GROUP BY a.legajo_mecanico 
            ORDER BY facturacion_generada DESC
        `, [inicio, fin]);

        let filtroPerm = "AND eh.estado != 'Finalizada'";
        const paramsPerm = [inicio, fin];
        if (req.query.filtro_cuellos) {
            filtroPerm += " AND (o.ot = ? OR o.patente = ?)";
            paramsPerm.push(req.query.filtro_cuellos, req.query.filtro_cuellos);
        }

        const historialRows = await all(`
            SELECT eh.estado, eh.ot, eh.ts_desde, eh.ts_hasta
            FROM estados_historial eh
            JOIN ordenes o ON eh.ot = o.ot
            WHERE o.fecha_apertura >= ? AND o.fecha_apertura < ? ${filtroPerm}
        `, paramsPerm);

        const cuellosMap = {};
        for (const row of historialRows) {
            const minHabiles = calcularMinutosHabiles(row.ts_desde, row.ts_hasta);
            if (!cuellosMap[row.estado]) {
                cuellosMap[row.estado] = { estado: row.estado, ots: new Set(), totalMin: 0 };
            }
            cuellosMap[row.estado].ots.add(row.ot);
            cuellosMap[row.estado].totalMin += minHabiles;
        }

        const permanencia_estado = Object.values(cuellosMap).map(c => ({
            estado: c.estado,
            ot_afectadas: c.ots.size,
            horas_totales: parseFloat((c.totalMin / 60).toFixed(2)),
            horas_promedio: parseFloat(((c.totalMin / c.ots.size) / 60).toFixed(2))
        })).sort((a, b) => b.horas_promedio - a.horas_promedio);

        const facturacion_por_marca = await all(`
            SELECT marca, COUNT(*) AS cantidad_ot, ROUND(SUM(monto_repuestos + monto_mano_obra + monto_repuestos_garantia + monto_mano_obra_garantia), 2) AS facturacion_total
            FROM ordenes WHERE fecha_apertura >= ? AND fecha_apertura < ?
            GROUP BY marca ORDER BY facturacion_total DESC
        `, [inicio, fin]).catch(() => []);

        const rentabilidad_unidad = await all(`
            SELECT u.unidad, COUNT(*) as cantidad, ROUND(SUM(o.monto_repuestos + o.monto_mano_obra + o.monto_repuestos_garantia + o.monto_mano_obra_garantia), 2) AS facturacion_total
            FROM ordenes o
            JOIN unidades u ON o.patente = u.patente
            WHERE o.fecha_apertura >= ? AND o.fecha_apertura < ? AND o.estado_actual = 'Finalizada'
            GROUP BY u.unidad ORDER BY facturacion_total DESC LIMIT 10
        `, [inicio, fin]);

        const top_clientes = await all(`
            SELECT c.nombre AS cliente, COUNT(*) AS cantidad_ot, ROUND(SUM(o.monto_repuestos + o.monto_mano_obra + o.monto_repuestos_garantia + o.monto_mano_obra_garantia), 2) AS facturacion_total
            FROM ordenes o
            JOIN unidades u ON o.patente = u.patente
            JOIN clientes c ON u.cliente_id = c.id
            WHERE o.fecha_apertura >= ? AND o.fecha_apertura < ?
            GROUP BY c.id ORDER BY cantidad_ot DESC, facturacion_total DESC LIMIT 10
        `, [inicio, fin]);

        const aperturas_por_dia = await all(`
            SELECT DATE(fecha_apertura) AS fecha, COUNT(*) AS cantidad
            FROM ordenes WHERE fecha_apertura >= ? AND fecha_apertura < ?
            GROUP BY DATE(fecha_apertura) ORDER BY fecha ASC
        `, [inicio, fin]);
        
        const cierres_por_dia = await all(`
            SELECT DATE(fecha_cierre) AS fecha, COUNT(*) AS cantidad
            FROM ordenes WHERE fecha_cierre IS NOT NULL AND fecha_apertura >= ? AND fecha_apertura < ?
            GROUP BY DATE(fecha_cierre) ORDER BY fecha ASC
        `, [inicio, fin]);

        const ciclo_promedio = await get(`
            SELECT ROUND(AVG(JULIANDAY(fecha_cierre) - JULIANDAY(fecha_apertura)), 2) AS dias_promedio
            FROM ordenes
            WHERE estado_actual = 'Finalizada' AND fecha_cierre IS NOT NULL
              AND fecha_apertura >= ? AND fecha_apertura < ?
        `, [inicio, fin]);

        res.json({
            mes: textoRango, resumen, resumen_anterior, facturacion_diaria, tiempos_mecanicos,
            permanencia_estado, rentabilidad_unidad, facturacion_por_marca,
            top_clientes, aperturas_por_dia, cierres_por_dia,
            ciclo_promedio: ciclo_promedio?.dias_promedio || 0
        });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

module.exports = router;