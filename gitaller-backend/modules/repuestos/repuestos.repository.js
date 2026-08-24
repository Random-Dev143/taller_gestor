const { run, all, get } = require('../../db/connection');

// --- CATÁLOGO DE REPUESTOS ---
function listarCatalogo() {
    return all(`SELECT * FROM catalogo_repuestos WHERE estado = 'Activo' ORDER BY np ASC`);
}

function obtenerPorNP(np) {
    return get(`SELECT * FROM catalogo_repuestos WHERE np = ?`, [np]);
}

function obtenerPorId(id) {
    return get(`SELECT * FROM catalogo_repuestos WHERE id = ?`, [id]);
}

function crearRepuestoMaestro(datos) {
    const { np, np_alternativo, descripcion, marca, categoria, costo_actual, margen_ganancia, ubicacion_fisica, proveedor_habitual } = datos;
    const precio_venta = costo_actual * (1 + (margen_ganancia / 100));
    return run(`
        INSERT INTO catalogo_repuestos 
        (np, np_alternativo, descripcion, marca, categoria, costo_actual, margen_ganancia, precio_venta_actual, ubicacion_fisica, proveedor_habitual) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [np, np_alternativo, descripcion, marca, categoria, costo_actual, margen_ganancia, precio_venta, ubicacion_fisica, proveedor_habitual]);
}

function actualizarRepuestoMaestro(id, datos) {
    const { np_alternativo, descripcion, marca, categoria, costo_actual, margen_ganancia, ubicacion_fisica, proveedor_habitual } = datos;
    const precio_venta = costo_actual * (1 + (margen_ganancia / 100));
    return run(`
        UPDATE catalogo_repuestos 
        SET np_alternativo = COALESCE(?, np_alternativo), descripcion = COALESCE(?, descripcion), marca = COALESCE(?, marca), categoria = COALESCE(?, categoria),
            costo_actual = COALESCE(?, costo_actual), margen_ganancia = COALESCE(?, margen_ganancia), precio_venta_actual = ?,
            ubicacion_fisica = COALESCE(?, ubicacion_fisica), proveedor_habitual = COALESCE(?, proveedor_habitual)
        WHERE id = ?
    `, [np_alternativo, descripcion, marca, categoria, costo_actual, margen_ganancia, precio_venta, ubicacion_fisica, proveedor_habitual, id]);
}

function cambiarEstadoRepuesto(id, estado) {
    return run(`UPDATE catalogo_repuestos SET estado = ? WHERE id = ?`, [estado, id]);
}

// --- KARDEX Y LOTES (NUEVO) ---
function insertarMovimientoKardex(datos) {
    const { catalogo_id, lote_id, tipo_movimiento, cantidad, costo_unitario, precio_venta, saldo_stock, referencia, legajo_usuario } = datos;
    return run(`
        INSERT INTO movimientos_stock (catalogo_id, lote_id, tipo_movimiento, cantidad, costo_unitario, precio_venta, saldo_stock, referencia, legajo_usuario)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [catalogo_id, lote_id || null, tipo_movimiento, cantidad, costo_unitario, precio_venta, saldo_stock, referencia, legajo_usuario]);
}

function insertarLote(datos) {
    const { catalogo_id, movimiento_ingreso_id, cantidad_inicial, costo_unitario } = datos;
    return run(`
        INSERT INTO inventario_lotes (catalogo_id, movimiento_ingreso_id, cantidad_inicial, cantidad_disponible, costo_unitario)
        VALUES (?, ?, ?, ?, ?)
    `, [catalogo_id, movimiento_ingreso_id, cantidad_inicial, cantidad_inicial, costo_unitario]);
}

function vincularLoteAKardex(kardexId, loteId) {
    return run(`UPDATE movimientos_stock SET lote_id = ? WHERE id = ?`, [loteId, kardexId]);
}

function recalcularStockCatalogo(catalogoId) {
    return run(`
        UPDATE catalogo_repuestos 
        SET stock_actual = (SELECT COALESCE(SUM(cantidad_disponible), 0) FROM inventario_lotes WHERE catalogo_id = ?),
            fecha_ultimo_ingreso = CASE WHEN (SELECT COUNT(*) FROM inventario_lotes WHERE catalogo_id = ?) > 0 THEN CURRENT_TIMESTAMP ELSE fecha_ultimo_ingreso END,
            fecha_ultima_actualizacion = CURRENT_TIMESTAMP
        WHERE id = ?
    `, [catalogoId, catalogoId, catalogoId]);
}

function obtenerLotesDisponibles(catalogoId) {
    return all(`SELECT * FROM inventario_lotes WHERE catalogo_id = ? AND cantidad_disponible > 0 ORDER BY fecha_ingreso ASC, id ASC`, [catalogoId]);
}

function consumirStockLote(loteId, nuevaCantidad) {
    return run(`UPDATE inventario_lotes SET cantidad_disponible = ? WHERE id = ?`, [nuevaCantidad, loteId]);
}

function insertarCargoOT(datos) {
    const { ot, tipo_cargo, catalogo_id, np_referencia, descripcion_cargo, cantidad, costo_interno_total, precio_venta_unitario, es_garantia, legajo_cargo, comprobante_path, nro_factura_tercero, monto_total_factura } = datos;
    return run(`
        INSERT INTO ot_cargos (ot, tipo_cargo, catalogo_id, np_referencia, descripcion_cargo, cantidad, costo_interno_total, precio_venta_unitario, es_garantia, legajo_cargo, comprobante_path, nro_factura_tercero, monto_total_factura)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [ot, tipo_cargo, catalogo_id || null, np_referencia, descripcion_cargo, cantidad, costo_interno_total, precio_venta_unitario, es_garantia ? 1 : 0, legajo_cargo, comprobante_path, nro_factura_tercero, monto_total_factura]);
}

function listarCargosPorOT(ot) {
    return all(`SELECT c.*, l.nombre as mecanico_nombre FROM ot_cargos c JOIN legajos l ON c.legajo_cargo = l.legajo WHERE c.ot = ? ORDER BY c.id ASC`, [ot]);
}

function recalcularMontosRepuestosOT(ot) {
    return run(`
        UPDATE ordenes 
        SET monto_repuestos = COALESCE((SELECT SUM(cantidad * precio_venta_unitario) FROM ot_cargos WHERE ot = ? AND es_garantia = 0), 0),
            monto_repuestos_garantia = COALESCE((SELECT SUM(cantidad * precio_venta_unitario) FROM ot_cargos WHERE ot = ? AND es_garantia = 1), 0)
        WHERE ot = ?
    `, [ot, ot, ot]);
}

module.exports = {
    listarCatalogo, obtenerPorNP, obtenerPorId, crearRepuestoMaestro, actualizarRepuestoMaestro, cambiarEstadoRepuesto,
    insertarMovimientoKardex, insertarLote, vincularLoteAKardex, recalcularStockCatalogo, obtenerLotesDisponibles, consumirStockLote,
    insertarCargoOT, listarCargosPorOT, recalcularMontosRepuestosOT
};