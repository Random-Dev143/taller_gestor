'use strict';
const { all, get } = require('../../config/database');

// Informe financiero: criterio único en todo el bloque = OT Finalizada + fecha_cierre (fecha real de facturación)
// Un descuento/bonificación sólo resta de la facturación una vez que un admin
// lo autorizó (descuento_estado = 'autorizado'). Mientras esté pendiente o haya
// sido rechazado, la facturación NO se ve afectada — pero sigue siendo visible
// para la gerencia como "pendiente de autorización" en el resumen.
const DESCUENTO_AUTORIZADO = `(CASE WHEN descuento_estado = 'autorizado' THEN COALESCE(monto_descuento,0) ELSE 0 END)`;

async function getFinanciero(inicio, fin, inicioAnterior, finAnterior) {
    const queryResumen = `
        SELECT COUNT(*) AS total_ot,
               -- "Garantía" exige ser IVECO (es_no_iveco = 0) Y estar
               -- marcada como garantía. Antes esta métrica solo miraba
               -- es_garantia=1 sin chequear la marca, lo cual sumaba mal
               -- si alguna vez existiera una OT de otra marca marcada
               -- (por error o excepción) como garantía.
               SUM(CASE WHEN es_garantia = 1 AND es_no_iveco = 0 THEN 1 ELSE 0 END) AS total_garantia,
               SUM(CASE WHEN es_no_iveco = 1 THEN 1 ELSE 0 END) AS total_no_iveco,
               -- "IVECO" = todo lo que NO es de otra marca, incluye garantía
               -- (una OT de garantía IVECO sigue siendo IVECO). Es la base
               -- de la métrica de "Eficacia" pedida: cuántas OTs cerradas
               -- fueron de la marca principal del taller, a diferencia de
               -- "Eficiencia" que cuenta TODO lo cerrado sin importar marca.
               COALESCE(SUM(CASE WHEN es_no_iveco = 0 THEN 1 ELSE 0 END), 0) AS total_iveco,
               SUM(CASE WHEN es_garantia = 0 AND es_no_iveco = 0 THEN 1 ELSE 0 END) AS total_normales,
               SUM(CASE WHEN controlada = 1 THEN 1 ELSE 0 END) AS total_controladas,
               ROUND(SUM(tiempo_asignado_horas), 2) AS hs_asignadas,
               ROUND(SUM(tiempo_empleado_horas), 2) AS hs_empleadas,
               ROUND(SUM(monto_repuestos + monto_repuestos_garantia), 2) AS total_repuestos,
               ROUND(SUM(monto_mano_obra + monto_mano_obra_garantia), 2) AS total_mano_obra,
               ROUND(SUM(monto_repuestos + monto_mano_obra + monto_repuestos_garantia + monto_mano_obra_garantia - ${DESCUENTO_AUTORIZADO}), 2) AS total_facturado,
               ROUND(AVG(monto_repuestos + monto_mano_obra + monto_repuestos_garantia + monto_mano_obra_garantia - ${DESCUENTO_AUTORIZADO}), 2) AS facturacion_promedio,
               ROUND(SUM(monto_repuestos_garantia + monto_mano_obra_garantia), 2) AS monto_garantia,
               ROUND(SUM(monto_repuestos + monto_mano_obra), 2) AS monto_facturable,
               ROUND(SUM(${DESCUENTO_AUTORIZADO}), 2) AS total_descuentos,
               SUM(CASE WHEN descuento_estado = 'autorizado' THEN 1 ELSE 0 END) AS cantidad_descuentos,
               ROUND(SUM(CASE WHEN descuento_estado = 'pendiente' THEN COALESCE(monto_descuento,0) ELSE 0 END), 2) AS total_descuentos_pendientes,
               SUM(CASE WHEN descuento_estado = 'pendiente' THEN 1 ELSE 0 END) AS cantidad_descuentos_pendientes,
               -- EFICIENCIA: % de las OTs del período (sin importar marca)
               -- que se abrieron y se cerraron el mismo día calendario —
               -- mide qué tan rápido responde el taller en el caso general.
               -- EFICACIA (IVECO): mismo criterio de "mismo día", pero
               -- solo sobre OTs IVECO (incluye garantía) y sobre el total
               -- de OTs IVECO, no sobre el total general.
               -- NULLIF evita división por cero cuando el período no tiene
               -- OTs (o no tiene OTs IVECO) — el resultado queda NULL, que
               -- el frontend interpreta como "sin datos" en vez de mostrar
               -- un 0% engañoso.
               ROUND(100.0 * SUM(CASE WHEN DATE(fecha_apertura) = DATE(fecha_cierre) THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0), 1) AS eficiencia_pct,
               COALESCE(SUM(CASE WHEN DATE(fecha_apertura) = DATE(fecha_cierre) THEN 1 ELSE 0 END), 0) AS cantidad_mismo_dia,
               ROUND(100.0 * SUM(CASE WHEN es_no_iveco = 0 AND DATE(fecha_apertura) = DATE(fecha_cierre) THEN 1 ELSE 0 END) / NULLIF(SUM(CASE WHEN es_no_iveco = 0 THEN 1 ELSE 0 END), 0), 1) AS eficacia_iveco_pct,
               COALESCE(SUM(CASE WHEN es_no_iveco = 0 AND DATE(fecha_apertura) = DATE(fecha_cierre) THEN 1 ELSE 0 END), 0) AS cantidad_iveco_mismo_dia,
               -- Horas de OTs en garantía: reales (siempre disponibles, se
               -- miden solas con el trabajo) vs. facturadas (las carga a
               -- mano el asesor cuando llega la respuesta de fábrica, algo
               -- que puede demorar hasta 30 días). Mientras no llegue ese
               -- dato (tiempo_facturado_horas en 0), se usan las horas
               -- reales como estimación provisoria, para que el informe no
               -- muestre "0 horas facturadas" en OTs que en realidad solo
               -- están esperando el dato — ver hs_garantia_facturacion_estimada.
               -- Mismo criterio de "garantía" que total_garantia: exige
               -- es_no_iveco = 0 además de es_garantia = 1.
               ROUND(SUM(CASE WHEN es_garantia = 1 AND es_no_iveco = 0 THEN tiempo_empleado_horas ELSE 0 END), 2) AS hs_garantia_reales,
               ROUND(SUM(CASE WHEN es_garantia = 1 AND es_no_iveco = 0 THEN (CASE WHEN tiempo_facturado_horas > 0 THEN tiempo_facturado_horas ELSE 0 END) ELSE 0 END), 2) AS hs_garantia_facturadas,
               ROUND(SUM(CASE WHEN es_garantia = 1 AND es_no_iveco = 0 THEN (CASE WHEN tiempo_facturado_horas > 0 THEN tiempo_facturado_horas ELSE tiempo_empleado_horas END) ELSE 0 END), 2) AS hs_garantia_facturacion_estimada,
               SUM(CASE WHEN es_garantia = 1 AND es_no_iveco = 0 AND (tiempo_facturado_horas IS NULL OR tiempo_facturado_horas <= 0) THEN 1 ELSE 0 END) AS cantidad_garantia_facturacion_pendiente,
               -- Señal de proceso: OTs que se cerraron sin cargar NINGÚN
               -- monto (ni repuestos ni mano de obra, facturable o de
               -- garantía). No necesariamente es un error — puede ser una
               -- OT interna o de cortesía — pero en general vale la pena
               -- que el asesor lo revise, porque suele ser un olvido de
               -- carga antes de cerrar.
               COALESCE(SUM(CASE WHEN (COALESCE(monto_repuestos,0) + COALESCE(monto_mano_obra,0) + COALESCE(monto_repuestos_garantia,0) + COALESCE(monto_mano_obra_garantia,0)) = 0 THEN 1 ELSE 0 END), 0) AS cantidad_finalizadas_sin_montos
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
        SELECT marca, COUNT(*) AS cantidad_ot, ROUND(SUM(monto_repuestos + monto_mano_obra + monto_repuestos_garantia + monto_mano_obra_garantia - ${DESCUENTO_AUTORIZADO}), 2) AS facturacion_total
        FROM ordenes WHERE estado_actual = 'Finalizada' AND fecha_cierre IS NOT NULL AND fecha_cierre >= ? AND fecha_cierre < ?
        GROUP BY marca ORDER BY facturacion_total DESC
    `, [inicio, fin]).catch(() => []);

    const rentabilidad_unidad = await all(`
        SELECT u.unidad, COUNT(*) as cantidad, ROUND(SUM(o.monto_repuestos + o.monto_mano_obra + o.monto_repuestos_garantia + o.monto_mano_obra_garantia - ${DESCUENTO_AUTORIZADO}), 2) AS facturacion_total
        FROM ordenes o JOIN unidades u ON o.patente = u.patente
        WHERE o.estado_actual = 'Finalizada' AND o.fecha_cierre IS NOT NULL AND o.fecha_cierre >= ? AND o.fecha_cierre < ?
        GROUP BY u.unidad ORDER BY facturacion_total DESC LIMIT 10
    `, [inicio, fin]);

    const top_clientes = await all(`
        SELECT c.nombre AS cliente, COUNT(*) AS cantidad_ot, ROUND(SUM(o.monto_repuestos + o.monto_mano_obra + o.monto_repuestos_garantia + o.monto_mano_obra_garantia - ${DESCUENTO_AUTORIZADO}), 2) AS facturacion_total
        FROM ordenes o JOIN unidades u ON o.patente = u.patente JOIN clientes c ON u.cliente_id = c.id
        WHERE o.estado_actual = 'Finalizada' AND o.fecha_cierre IS NOT NULL AND o.fecha_cierre >= ? AND o.fecha_cierre < ?
        GROUP BY c.id ORDER BY cantidad_ot DESC, facturacion_total DESC LIMIT 10
    `, [inicio, fin]);

    return { resumen, resumen_anterior, facturacion_diaria, facturacion_por_marca, rentabilidad_unidad, top_clientes };
}

module.exports = { getFinanciero };
