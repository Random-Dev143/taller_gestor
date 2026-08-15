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
               SUM(CASE WHEN es_garantia = 1 THEN 1 ELSE 0 END) AS total_garantia,
               SUM(CASE WHEN es_no_iveco = 1 THEN 1 ELSE 0 END) AS total_no_iveco,
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
               SUM(CASE WHEN descuento_estado = 'pendiente' THEN 1 ELSE 0 END) AS cantidad_descuentos_pendientes
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
