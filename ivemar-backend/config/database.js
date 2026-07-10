const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'taller.db');
const db = new sqlite3.Database(DB_PATH);

const run = (sql, params = []) => new Promise((resolve, reject) => {
    db.run(sql, params, function (err) { if (err) reject(err); else resolve(this); });
});
const all = (sql, params = []) => new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => { if (err) reject(err); else resolve(rows); });
});
const get = (sql, params = []) => new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => { if (err) reject(err); else resolve(row); });
});

const withTransaction = async (callback) => {
    await run('BEGIN TRANSACTION');
    try {
        const result = await callback();
        await run('COMMIT');
        return result;
    } catch (error) {
        await run('ROLLBACK');
        console.error('⚠️ Transacción revertida:', error.message);
        throw error;
    }
};

async function migrarEstructura() {
    try {
        const ordenesCols = (await all(`PRAGMA table_info(ordenes)`)).map(c => c.name);
        
        if (ordenesCols.includes('cliente')) {
            console.log('⚠️ Ejecutando Gran Migración V2 (Normalización y Claves Foráneas)...');
            await run('PRAGMA foreign_keys=OFF'); 
            
            await withTransaction(async () => {
                await run(`CREATE TABLE unidades_new (
                    id INTEGER PRIMARY KEY AUTOINCREMENT, patente TEXT NOT NULL UNIQUE, cliente_id INTEGER,
                    unidad TEXT NOT NULL, telefono TEXT DEFAULT '', correo TEXT DEFAULT '', 
                    contacto_nombre TEXT DEFAULT '', contacto_apellido TEXT DEFAULT '',
                    FOREIGN KEY(cliente_id) REFERENCES clientes(id) ON DELETE RESTRICT ON UPDATE CASCADE
                )`);
                await run(`INSERT INTO unidades_new (id, patente, cliente_id, unidad, telefono, correo, contacto_nombre, contacto_apellido)
                           SELECT id, patente, cliente_id, unidad, telefono, correo, contacto_nombre, contacto_apellido FROM unidades`);
                await run(`DROP TABLE unidades`);
                await run(`ALTER TABLE unidades_new RENAME TO unidades`);

                await run(`CREATE TABLE ordenes_new (
                    ot TEXT PRIMARY KEY, patente TEXT NOT NULL, asesor_legajo TEXT NOT NULL,
                    kilometraje TEXT DEFAULT '',
                    fecha_apertura DATETIME NOT NULL, fecha_cierre DATETIME, es_garantia INTEGER NOT NULL DEFAULT 0,
                    estado_actual TEXT NOT NULL DEFAULT 'En Espera' CHECK(estado_actual IN ('En Proceso','En Espera','Trabajos de Terceros','Espera de Repuestos','Finalizada')),
                    tiempo_asignado_horas REAL DEFAULT 0, tiempo_empleado_horas REAL DEFAULT 0, tiempo_facturado_horas REAL DEFAULT 0,
                    jefe_legajo TEXT, controlada INTEGER DEFAULT 0, es_no_iveco INTEGER DEFAULT 0, monto_repuestos REAL DEFAULT 0, monto_mano_obra REAL DEFAULT 0,
                    FOREIGN KEY(patente) REFERENCES unidades(patente) ON DELETE RESTRICT ON UPDATE CASCADE,
                    FOREIGN KEY(asesor_legajo) REFERENCES legajos(legajo) ON DELETE RESTRICT ON UPDATE CASCADE,
                    FOREIGN KEY(jefe_legajo) REFERENCES legajos(legajo) ON DELETE SET NULL ON UPDATE CASCADE
                )`);
                
                const columnasViejas = ordenesCols.includes('kilometraje') ? 'kilometraje,' : '';
                await run(`INSERT INTO ordenes_new (ot, patente, asesor_legajo, ${columnasViejas} fecha_apertura, fecha_cierre, es_garantia, estado_actual, tiempo_asignado_horas, tiempo_empleado_horas, tiempo_facturado_horas, jefe_legajo, controlada, es_no_iveco, monto_repuestos, monto_mano_obra) 
                           SELECT ot, patente, asesor_legajo, ${columnasViejas} fecha_apertura, fecha_cierre, es_garantia, estado_actual, tiempo_asignado_horas, tiempo_empleado_horas, tiempo_facturado_horas, jefe_legajo, controlada, es_no_iveco, monto_repuestos, monto_mano_obra FROM ordenes`);
                await run(`DROP TABLE ordenes`);
                await run(`ALTER TABLE ordenes_new RENAME TO ordenes`);

                await run(`CREATE TABLE estados_historial_new (id INTEGER PRIMARY KEY AUTOINCREMENT, ot TEXT NOT NULL, estado TEXT NOT NULL, ts_desde DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, ts_hasta DATETIME, minutos REAL, FOREIGN KEY(ot) REFERENCES ordenes(ot) ON DELETE CASCADE ON UPDATE CASCADE)`);
                await run(`INSERT INTO estados_historial_new SELECT id, ot, estado, ts_desde, ts_hasta, minutos FROM estados_historial`);
                await run(`DROP TABLE estados_historial`);
                await run(`ALTER TABLE estados_historial_new RENAME TO estados_historial`);

                await run(`CREATE TABLE asignaciones_new (id INTEGER PRIMARY KEY AUTOINCREMENT, ot TEXT NOT NULL, legajo_mecanico TEXT NOT NULL, fecha_asignacion DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(ot) REFERENCES ordenes(ot) ON DELETE CASCADE ON UPDATE CASCADE, FOREIGN KEY(legajo_mecanico) REFERENCES legajos(legajo) ON DELETE RESTRICT ON UPDATE CASCADE)`);
                await run(`INSERT INTO asignaciones_new SELECT id, ot, legajo_mecanico, fecha_asignacion FROM asignaciones`);
                await run(`DROP TABLE asignaciones`);
                await run(`ALTER TABLE asignaciones_new RENAME TO asignaciones`);

                await run(`CREATE TABLE explicaciones_new (id INTEGER PRIMARY KEY AUTOINCREMENT, ot TEXT NOT NULL UNIQUE, causa TEXT, FOREIGN KEY(ot) REFERENCES ordenes(ot) ON DELETE CASCADE ON UPDATE CASCADE)`);
                await run(`INSERT INTO explicaciones_new SELECT id, ot, causa FROM explicaciones`);
                await run(`DROP TABLE explicaciones`);
                await run(`ALTER TABLE explicaciones_new RENAME TO explicaciones`);

                await run(`CREATE TABLE aportes_new (id INTEGER PRIMARY KEY AUTOINCREMENT, ot TEXT NOT NULL, legajo TEXT NOT NULL, actividades TEXT NOT NULL, horas REAL DEFAULT 0, fecha_aporte DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(ot) REFERENCES ordenes(ot) ON DELETE CASCADE ON UPDATE CASCADE, FOREIGN KEY(legajo) REFERENCES legajos(legajo) ON DELETE RESTRICT ON UPDATE CASCADE)`);
                await run(`INSERT INTO aportes_new SELECT id, ot, legajo, actividades, horas, fecha_aporte FROM aportes`);
                await run(`DROP TABLE aportes`);
                await run(`ALTER TABLE aportes_new RENAME TO aportes`);

                await run(`CREATE TABLE actividades_new (id INTEGER PRIMARY KEY AUTOINCREMENT, ot TEXT NOT NULL, descripcion TEXT NOT NULL, tiempo_estimado REAL NOT NULL, tiempo_real REAL DEFAULT 0, estado TEXT DEFAULT 'Asignada' CHECK(estado IN ('Pendiente', 'Asignada', 'En Curso', 'Pausada', 'Finalizada')), legajo_mecanico TEXT NOT NULL, auto_pausa INTEGER DEFAULT 0, fecha_inicio DATETIME, fecha_fin DATETIME, FOREIGN KEY(ot) REFERENCES ordenes(ot) ON DELETE CASCADE ON UPDATE CASCADE, FOREIGN KEY(legajo_mecanico) REFERENCES legajos(legajo) ON DELETE RESTRICT ON UPDATE CASCADE)`);
                await run(`INSERT INTO actividades_new SELECT id, ot, descripcion, tiempo_estimado, tiempo_real, estado, legajo_mecanico, auto_pausa, fecha_inicio, fecha_fin FROM actividades`);
                await run(`DROP TABLE actividades`);
                await run(`ALTER TABLE actividades_new RENAME TO actividades`);

                await run(`CREATE TABLE tiempos_actividad_new (id INTEGER PRIMARY KEY AUTOINCREMENT, actividad_id INTEGER NOT NULL, inicio DATETIME NOT NULL, fin DATETIME, FOREIGN KEY(actividad_id) REFERENCES actividades(id) ON DELETE CASCADE ON UPDATE CASCADE)`);
                await run(`INSERT INTO tiempos_actividad_new SELECT id, actividad_id, inicio, fin FROM tiempos_actividad`);
                await run(`DROP TABLE tiempos_actividad`);
                await run(`ALTER TABLE tiempos_actividad_new RENAME TO tiempos_actividad`);
            });
            await run('PRAGMA foreign_keys=ON');
            console.log('✅ Migración V2 completada (Normalización & Integrity).');
        }

        const ordenesColsActuales = (await all(`PRAGMA table_info(ordenes)`)).map(c => c.name);
        
        if (!ordenesColsActuales.includes('kilometraje')) {
            await run(`ALTER TABLE ordenes ADD COLUMN kilometraje TEXT DEFAULT ''`);
        }

        if (!ordenesColsActuales.includes('monto_repuestos_garantia')) {
            await run(`ALTER TABLE ordenes ADD COLUMN monto_repuestos_garantia REAL DEFAULT 0`);
            await run(`ALTER TABLE ordenes ADD COLUMN monto_mano_obra_garantia REAL DEFAULT 0`);
            // Mover montos a garantía y dejar los facturables en 0 si era garantía total antigua
            await run(`UPDATE ordenes SET monto_repuestos_garantia = monto_repuestos, monto_mano_obra_garantia = monto_mano_obra, monto_repuestos = 0, monto_mano_obra = 0 WHERE es_garantia = 1`);
        }

        await run(`UPDATE actividades SET estado = 'Asignada' WHERE estado = 'Pendiente'`);
        await run(`UPDATE actividades SET tiempo_real = 0 WHERE tiempo_real < 0`);
        await run(`UPDATE ordenes SET tiempo_empleado_horas = 0 WHERE tiempo_empleado_horas < 0`);
        await run(`UPDATE aportes SET horas = 0 WHERE horas < 0`);

        const indices = [
            `CREATE INDEX IF NOT EXISTS idx_actividades_ot ON actividades(ot)`,
            `CREATE INDEX IF NOT EXISTS idx_actividades_legajo ON actividades(legajo_mecanico)`,
            `CREATE INDEX IF NOT EXISTS idx_actividades_estado ON actividades(estado)`,
            `CREATE INDEX IF NOT EXISTS idx_asignaciones_ot ON asignaciones(ot)`,
            `CREATE INDEX IF NOT EXISTS idx_estados_historial_ot ON estados_historial(ot)`,
            `CREATE INDEX IF NOT EXISTS idx_aportes_ot ON aportes(ot)`,
            `CREATE INDEX IF NOT EXISTS idx_tiempos_actividad_actividad_id ON tiempos_actividad(actividad_id)`,
            `CREATE INDEX IF NOT EXISTS idx_ordenes_fecha_apertura ON ordenes(fecha_apertura)`,
            `CREATE INDEX IF NOT EXISTS idx_ordenes_fecha_cierre ON ordenes(fecha_cierre)`,
            `CREATE INDEX IF NOT EXISTS idx_ordenes_estado_actual ON ordenes(estado_actual)`,
            `CREATE INDEX IF NOT EXISTS idx_legajos_rol ON legajos(rol)`
        ];
        for (const sql of indices) await run(sql);
    } catch (error) { console.error('❌ Error migrando estructura:', error.message); }
}

db.serialize(async () => {
    db.run('PRAGMA foreign_keys = ON');
    db.run('PRAGMA journal_mode = WAL');
    db.run('PRAGMA busy_timeout = 5000');

    db.run(`CREATE TABLE IF NOT EXISTS legajos (legajo TEXT PRIMARY KEY, nombre TEXT NOT NULL, rol TEXT NOT NULL CHECK(rol IN ('asesor','jefe','mecanico')), firma_path TEXT)`);
    db.run(`CREATE TABLE IF NOT EXISTS clientes (id INTEGER PRIMARY KEY AUTOINCREMENT, nombre TEXT NOT NULL UNIQUE, telefono TEXT DEFAULT '', correo TEXT DEFAULT '')`);
    db.run(`CREATE TABLE IF NOT EXISTS unidades (id INTEGER PRIMARY KEY AUTOINCREMENT, patente TEXT NOT NULL UNIQUE, cliente_id INTEGER, unidad TEXT NOT NULL, telefono TEXT DEFAULT '', correo TEXT DEFAULT '', contacto_nombre TEXT DEFAULT '', contacto_apellido TEXT DEFAULT '', FOREIGN KEY(cliente_id) REFERENCES clientes(id) ON DELETE RESTRICT ON UPDATE CASCADE)`);
    db.run(`CREATE TABLE IF NOT EXISTS ordenes (ot TEXT PRIMARY KEY, patente TEXT NOT NULL, kilometraje TEXT DEFAULT '', asesor_legajo TEXT NOT NULL, fecha_apertura DATETIME NOT NULL, fecha_cierre DATETIME, es_garantia INTEGER NOT NULL DEFAULT 0, estado_actual TEXT NOT NULL DEFAULT 'En Espera' CHECK(estado_actual IN ('En Proceso','En Espera','Trabajos de Terceros','Espera de Repuestos','Finalizada')), tiempo_asignado_horas REAL DEFAULT 0, tiempo_empleado_horas REAL DEFAULT 0, tiempo_facturado_horas REAL DEFAULT 0, jefe_legajo TEXT, controlada INTEGER DEFAULT 0, es_no_iveco INTEGER DEFAULT 0, monto_repuestos REAL DEFAULT 0, monto_mano_obra REAL DEFAULT 0, monto_repuestos_garantia REAL DEFAULT 0, monto_mano_obra_garantia REAL DEFAULT 0, FOREIGN KEY(patente) REFERENCES unidades(patente) ON DELETE RESTRICT ON UPDATE CASCADE, FOREIGN KEY(asesor_legajo) REFERENCES legajos(legajo) ON DELETE RESTRICT ON UPDATE CASCADE, FOREIGN KEY(jefe_legajo) REFERENCES legajos(legajo) ON DELETE SET NULL ON UPDATE CASCADE)`);
    db.run(`CREATE TABLE IF NOT EXISTS estados_historial (id INTEGER PRIMARY KEY AUTOINCREMENT, ot TEXT NOT NULL, estado TEXT NOT NULL, ts_desde DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, ts_hasta DATETIME, minutos REAL, FOREIGN KEY(ot) REFERENCES ordenes(ot) ON DELETE CASCADE ON UPDATE CASCADE)`);
    db.run(`CREATE TABLE IF NOT EXISTS asignaciones (id INTEGER PRIMARY KEY AUTOINCREMENT, ot TEXT NOT NULL, legajo_mecanico TEXT NOT NULL, fecha_asignacion DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(ot) REFERENCES ordenes(ot) ON DELETE CASCADE ON UPDATE CASCADE, FOREIGN KEY(legajo_mecanico) REFERENCES legajos(legajo) ON DELETE RESTRICT ON UPDATE CASCADE)`);
    db.run(`CREATE TABLE IF NOT EXISTS explicaciones (id INTEGER PRIMARY KEY AUTOINCREMENT, ot TEXT NOT NULL UNIQUE, causa TEXT, FOREIGN KEY(ot) REFERENCES ordenes(ot) ON DELETE CASCADE ON UPDATE CASCADE)`);
    db.run(`CREATE TABLE IF NOT EXISTS aportes (id INTEGER PRIMARY KEY AUTOINCREMENT, ot TEXT NOT NULL, legajo TEXT NOT NULL, actividades TEXT NOT NULL, horas REAL DEFAULT 0, fecha_aporte DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(ot) REFERENCES ordenes(ot) ON DELETE CASCADE ON UPDATE CASCADE, FOREIGN KEY(legajo) REFERENCES legajos(legajo) ON DELETE RESTRICT ON UPDATE CASCADE)`);
    db.run(`CREATE TABLE IF NOT EXISTS actividades (id INTEGER PRIMARY KEY AUTOINCREMENT, ot TEXT NOT NULL, descripcion TEXT NOT NULL, tiempo_estimado REAL NOT NULL, tiempo_real REAL DEFAULT 0, estado TEXT DEFAULT 'Asignada' CHECK(estado IN ('Pendiente', 'Asignada', 'En Curso', 'Pausada', 'Finalizada')), legajo_mecanico TEXT NOT NULL, auto_pausa INTEGER DEFAULT 0, fecha_inicio DATETIME, fecha_fin DATETIME, FOREIGN KEY(ot) REFERENCES ordenes(ot) ON DELETE CASCADE ON UPDATE CASCADE, FOREIGN KEY(legajo_mecanico) REFERENCES legajos(legajo) ON DELETE RESTRICT ON UPDATE CASCADE)`);
    db.run(`CREATE TABLE IF NOT EXISTS tiempos_actividad (id INTEGER PRIMARY KEY AUTOINCREMENT, actividad_id INTEGER NOT NULL, inicio DATETIME NOT NULL, fin DATETIME, FOREIGN KEY(actividad_id) REFERENCES actividades(id) ON DELETE CASCADE ON UPDATE CASCADE)`);

    setTimeout(() => migrarEstructura(), 500);
});

async function cambiarEstado(ot, nuevoEstado) {
    const ahora = new Date().toISOString().replace('T', ' ').substring(0, 19);
    const abierto = await get(`SELECT id, ts_desde FROM estados_historial WHERE ot = ? AND ts_hasta IS NULL ORDER BY id DESC LIMIT 1`, [ot]);
    if (abierto) {
        const minutos = (Date.now() - new Date(abierto.ts_desde + 'Z').getTime()) / 60000;
        await run(`UPDATE estados_historial SET ts_hasta = ?, minutos = ? WHERE id = ?`, [ahora, minutos, abierto.id]);
    }
    await run(`INSERT INTO estados_historial (ot, estado, ts_desde) VALUES (?, ?, CURRENT_TIMESTAMP)`, [ot, nuevoEstado]);
    await run(`UPDATE ordenes SET estado_actual = ? WHERE ot = ?`, [nuevoEstado, ot]);
}

async function sincronizarEstadoOT(ot) {
    const acts = await all(`SELECT estado FROM actividades WHERE ot = ?`, [ot]);
    const orden = await get(`SELECT estado_actual FROM ordenes WHERE ot = ?`, [ot]);
    if (!orden || orden.estado_actual === 'Finalizada') return; 

    let estadoCalculado = orden.estado_actual;
    const enCurso = acts.filter(a => a.estado === 'En Curso').length;
    const finalizadas = acts.filter(a => a.estado === 'Finalizada').length;

    if (enCurso > 0) {
        estadoCalculado = 'En Proceso';
    } else if (acts.length > 0 && finalizadas === acts.length) {
        estadoCalculado = 'En Espera';
    } else {
        if (estadoCalculado === 'En Proceso') estadoCalculado = 'En Espera';
    }

    if (estadoCalculado !== orden.estado_actual) await cambiarEstado(ot, estadoCalculado);
}

async function recalcularTiempoEmpleado(ot) {
    await run(`UPDATE ordenes SET tiempo_empleado_horas = (COALESCE((SELECT SUM(tiempo_real) FROM actividades WHERE ot = ?), 0) + COALESCE((SELECT SUM(horas) FROM aportes WHERE ot = ?), 0)) WHERE ot = ?`, [ot, ot, ot]);
}

module.exports = { db, run, all, get, cambiarEstado, sincronizarEstadoOT, recalcularTiempoEmpleado, DB_PATH, withTransaction };