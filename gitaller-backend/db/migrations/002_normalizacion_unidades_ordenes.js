// Solo aplica a instalaciones viejas que todavía tenían la columna `cliente`
// suelta en `ordenes` (previo a la normalización con cliente_id + FKs).
// En una instalación nueva (creada por 001), `ordenes` ya nace normalizada,
// así que esto es no-op.
async function up({ run, all, withTransaction }) {
    const ordenesCols = (await all(`PRAGMA table_info(ordenes)`)).map(c => c.name);
    if (!ordenesCols.includes('cliente')) return;

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

module.exports = { up };
