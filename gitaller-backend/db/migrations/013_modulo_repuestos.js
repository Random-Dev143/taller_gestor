// gitaller-backend/db/migrations/013_modulo_repuestos.js

async function up({ run }) {
    console.log('⏳ Creando tablas del Módulo de Repuestos (Catálogo, Lotes, Kardex, OT Cargos)...');

    // 1. Catálogo Maestro (Lista de Materiales detallada)
    await run(`CREATE TABLE IF NOT EXISTS catalogo_repuestos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        np TEXT UNIQUE NOT NULL,
        np_alternativo TEXT DEFAULT NULL,
        descripcion TEXT NOT NULL,
        marca TEXT DEFAULT NULL,
        categoria TEXT DEFAULT NULL,
        costo_actual REAL DEFAULT 0,
        margen_ganancia REAL NOT NULL DEFAULT 40.0,
        precio_venta_actual REAL DEFAULT 0,
        stock_actual REAL DEFAULT 0,
        stock_minimo REAL DEFAULT 0,
        unidad_medida TEXT DEFAULT 'Unidad',
        ubicacion_fisica TEXT DEFAULT NULL,
        proveedor_habitual TEXT DEFAULT NULL,
        fecha_ultimo_ingreso DATETIME,
        fecha_ultima_salida DATETIME,
        fecha_ultima_actualizacion DATETIME DEFAULT CURRENT_TIMESTAMP,
        estado TEXT DEFAULT 'Activo' CHECK(estado IN ('Activo', 'Inactivo'))
    )`);

    // 2. Control FIFO por Lotes
    await run(`CREATE TABLE IF NOT EXISTS inventario_lotes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        catalogo_id INTEGER NOT NULL,
        movimiento_ingreso_id INTEGER NOT NULL,
        cantidad_inicial REAL NOT NULL CHECK(cantidad_inicial > 0),
        cantidad_disponible REAL NOT NULL CHECK(cantidad_disponible >= 0),
        costo_unitario REAL NOT NULL,
        fecha_ingreso DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(catalogo_id) REFERENCES catalogo_repuestos(id) ON DELETE RESTRICT
    )`);

    // 3. Kardex Contable (Historial de movimientos)
    await run(`CREATE TABLE IF NOT EXISTS movimientos_stock (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        catalogo_id INTEGER NOT NULL,
        lote_id INTEGER DEFAULT NULL,
        tipo_movimiento TEXT NOT NULL CHECK(tipo_movimiento IN ('Ingreso_Excel', 'Ingreso_Manual', 'Ajuste_Positivo', 'Salida_OT', 'Ajuste_Negativo')),
        cantidad REAL NOT NULL,
        costo_unitario REAL NOT NULL,
        precio_venta REAL NOT NULL,
        saldo_stock REAL NOT NULL,
        referencia TEXT DEFAULT NULL,
        legajo_usuario TEXT NOT NULL,
        fecha_movimiento DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(catalogo_id) REFERENCES catalogo_repuestos(id) ON DELETE RESTRICT,
        FOREIGN KEY(lote_id) REFERENCES inventario_lotes(id) ON DELETE SET NULL,
        FOREIGN KEY(legajo_usuario) REFERENCES legajos(legajo) ON DELETE RESTRICT
    )`);

    // 4. Cargos a la OT (Transaccional)
    await run(`CREATE TABLE IF NOT EXISTS ot_cargos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ot TEXT NOT NULL,
        tipo_cargo TEXT NOT NULL CHECK(tipo_cargo IN ('Catalogo', 'Compra_Directa', 'Servicio_Tercero')),
        catalogo_id INTEGER DEFAULT NULL,
        np_referencia TEXT DEFAULT NULL,
        descripcion_cargo TEXT NOT NULL,
        cantidad REAL NOT NULL CHECK(cantidad > 0),
        costo_interno_total REAL NOT NULL,
        precio_venta_unitario REAL NOT NULL,
        es_garantia INTEGER DEFAULT 0 CHECK(es_garantia IN (0,1)),
        nro_factura_tercero TEXT DEFAULT NULL,
        monto_total_factura REAL DEFAULT NULL,
        comprobante_path TEXT DEFAULT NULL,
        legajo_cargo TEXT NOT NULL,
        fecha_cargo DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(ot) REFERENCES ordenes(ot) ON DELETE CASCADE ON UPDATE CASCADE,
        FOREIGN KEY(catalogo_id) REFERENCES catalogo_repuestos(id) ON DELETE RESTRICT,
        FOREIGN KEY(legajo_cargo) REFERENCES legajos(legajo) ON DELETE RESTRICT
    )`);

    // Índices de optimización para búsquedas rápidas
    const indices = [
        `CREATE INDEX IF NOT EXISTS idx_catalogo_np ON catalogo_repuestos(np)`,
        `CREATE INDEX IF NOT EXISTS idx_lotes_catalogo ON inventario_lotes(catalogo_id)`,
        `CREATE INDEX IF NOT EXISTS idx_lotes_disponible ON inventario_lotes(cantidad_disponible)`,
        `CREATE INDEX IF NOT EXISTS idx_movimientos_catalogo ON movimientos_stock(catalogo_id)`,
        `CREATE INDEX IF NOT EXISTS idx_movimientos_fecha ON movimientos_stock(fecha_movimiento)`,
        `CREATE INDEX IF NOT EXISTS idx_cargos_ot ON ot_cargos(ot)`
    ];
    for (const sql of indices) await run(sql);
}

module.exports = { up };