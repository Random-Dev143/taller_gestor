'use strict';
// ─── MIGRACIONES ─────────────────────────────────────────────────────
// Cada bloque de acá abajo es un parche idempotente: revisa si la
// instalación YA tiene la columna/tabla/constraint que necesita, y si no,
// la aplica. Corren en orden, una sola vez por arranque (rápido porque
// son puros PRAGMA table_info + ALTER, no reescriben datos salvo que la
// migración lo diga explícitamente).
//
// Regla al agregar una migración nueva: agregarla al FINAL de
// migrarEstructura(), nunca reordenar las existentes (algunas dependen
// de que una anterior ya haya corrido, p. ej. la Gran Migración V2 antes
// que el parche de "Cerrada por Jefe").

async function migrarEstructura({ run, all, get, withTransaction }) {
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

        // Bonificaciones / Descuentos sobre facturación (con trazabilidad de autorización)
        if (!ordenesColsActuales.includes('monto_descuento')) {
            await run(`ALTER TABLE ordenes ADD COLUMN monto_descuento REAL DEFAULT 0`);
            await run(`ALTER TABLE ordenes ADD COLUMN descuento_motivo TEXT DEFAULT ''`);
            // 'ninguno' | 'pendiente' | 'autorizado' | 'rechazado'
            await run(`ALTER TABLE ordenes ADD COLUMN descuento_estado TEXT DEFAULT 'ninguno'`);
            await run(`ALTER TABLE ordenes ADD COLUMN descuento_autorizado_por TEXT`);
            await run(`ALTER TABLE ordenes ADD COLUMN descuento_autorizado_en DATETIME`);
        }

        // Trabajo en equipo independiente: cada mecánico de una actividad tiene su propio
        // estado (Asignada/En Curso/Pausada/Finalizada), su propio acumulado de horas, y
        // puede escribir su propio informe/aporte, sin depender de lo que hagan sus compañeros.
        const actMecCols = (await all(`PRAGMA table_info(actividad_mecanicos)`)).map(c => c.name);
        if (!actMecCols.includes('estado')) {
            await run(`ALTER TABLE actividad_mecanicos ADD COLUMN estado TEXT NOT NULL DEFAULT 'Asignada'`);
            await run(`ALTER TABLE actividad_mecanicos ADD COLUMN tiempo_real REAL NOT NULL DEFAULT 0`);
            await run(`ALTER TABLE actividad_mecanicos ADD COLUMN informe TEXT`);

            // Migración de datos: para las actividades ya existentes, el estado/tiempo_real
            // "de la actividad" en realidad pertenecía a UNA sola persona (el sistema todavía
            // no soportaba equipos independientes). Se lo asignamos al mecánico "representante"
            // (actividades.legajo_mecanico); el resto del equipo, si lo hay, arranca en 0/Asignada
            // porque no hay forma de reconstruir cuánto trabajó cada uno en el pasado.
            await run(`
                UPDATE actividad_mecanicos
                SET estado = (SELECT a.estado FROM actividades a WHERE a.id = actividad_mecanicos.actividad_id),
                    tiempo_real = (SELECT a.tiempo_real FROM actividades a WHERE a.id = actividad_mecanicos.actividad_id)
                WHERE legajo_mecanico = (SELECT a.legajo_mecanico FROM actividades a WHERE a.id = actividad_mecanicos.actividad_id)
            `);
            console.log('✅ Migración de equipo independiente (actividad_mecanicos) completada.');
        }

        // Tareas Internas (ot='0000'): distinción entre rutinas (limpieza,
        // capacitaciones periódicas — no tienen fin, nunca se cierran ni se
        // vuelven a crear) y extraordinarias (reparaciones internas puntuales
        // con un tiempo_estimado real, que sí se cierran cuando terminan y sí
        // cuentan para eficacia/eficiencia). Por defecto 0 (extraordinaria)
        // para no reclasificar silenciosamente tareas ya existentes como
        // rutinas — el Jefe las revisa y marca a mano cuáles corresponden.
        //
        // OJO: la migración V2 de más arriba (la que crea `actividades_new`
        // dentro del bloque de "Normalización & Integrity") reconstruyó la
        // tabla `actividades` con un CHECK incompleto — le falta el estado
        // 'Cerrada por Jefe' en la lista de valores permitidos. Como esa
        // migración ya corrió una vez en instalaciones existentes, el
        // `CREATE TABLE IF NOT EXISTS` de schema.js (que sí tiene el estado
        // completo) nunca llega a aplicarse — es un no-op si la tabla ya
        // existe. Cualquier intento de guardar 'Cerrada por Jefe' rompe con
        // SQLITE_CONSTRAINT hasta reconstruir la tabla una vez más, esta vez
        // con el CHECK correcto. Se aprovecha el mismo paso para agregar
        // es_rutina si hiciera falta, evitando reconstruir la tabla dos veces.
        const actividadesDDL = await get(`SELECT sql FROM sqlite_master WHERE type='table' AND name='actividades'`);
        const faltaEstadoCerradaPorJefe = actividadesDDL && !actividadesDDL.sql.includes('Cerrada por Jefe');
        const actividadesCols = (await all(`PRAGMA table_info(actividades)`)).map(c => c.name);
        const faltaEsRutina = !actividadesCols.includes('es_rutina');

        if (faltaEstadoCerradaPorJefe) {
            await run('PRAGMA foreign_keys=OFF');
            await withTransaction(async () => {
                await run(`CREATE TABLE actividades_new2 (id INTEGER PRIMARY KEY AUTOINCREMENT, ot TEXT NOT NULL, descripcion TEXT NOT NULL, tiempo_estimado REAL NOT NULL, tiempo_real REAL DEFAULT 0, estado TEXT DEFAULT 'Asignada' CHECK(estado IN ('Pendiente', 'Asignada', 'En Curso', 'Pausada', 'Finalizada', 'Cerrada por Jefe')), legajo_mecanico TEXT NOT NULL, auto_pausa INTEGER DEFAULT 0, fecha_inicio DATETIME, fecha_fin DATETIME, es_rutina INTEGER NOT NULL DEFAULT 0, FOREIGN KEY(ot) REFERENCES ordenes(ot) ON DELETE CASCADE ON UPDATE CASCADE, FOREIGN KEY(legajo_mecanico) REFERENCES legajos(legajo) ON DELETE RESTRICT ON UPDATE CASCADE)`);
                await run(`INSERT INTO actividades_new2 (id, ot, descripcion, tiempo_estimado, tiempo_real, estado, legajo_mecanico, auto_pausa, fecha_inicio, fecha_fin) SELECT id, ot, descripcion, tiempo_estimado, tiempo_real, estado, legajo_mecanico, auto_pausa, fecha_inicio, fecha_fin FROM actividades`);
                await run(`DROP TABLE actividades`);
                await run(`ALTER TABLE actividades_new2 RENAME TO actividades`);
            });
            await run('PRAGMA foreign_keys=ON');
            console.log('✅ Migración de actividades completada (CHECK constraint con "Cerrada por Jefe" + columna es_rutina).');
        } else if (faltaEsRutina) {
            await run(`ALTER TABLE actividades ADD COLUMN es_rutina INTEGER NOT NULL DEFAULT 0`);
            console.log('✅ Migración de tareas internas (es_rutina) completada.');
        }

        const tiemposCols = (await all(`PRAGMA table_info(tiempos_actividad)`)).map(c => c.name);
        if (!tiemposCols.includes('legajo_mecanico')) {
            await run(`ALTER TABLE tiempos_actividad ADD COLUMN legajo_mecanico TEXT`);
            // Best-effort: las sesiones viejas se atribuyen al mecánico representante de su actividad
            await run(`
                UPDATE tiempos_actividad
                SET legajo_mecanico = (SELECT legajo_mecanico FROM actividades WHERE id = tiempos_actividad.actividad_id)
                WHERE legajo_mecanico IS NULL
            `);
            console.log('✅ Migración de sesiones de tiempo por mecánico (tiempos_actividad.legajo_mecanico) completada.');
        }

        const configCols = (await all(`PRAGMA table_info(configuracion)`)).map(c => c.name);

        if (!configCols.includes('puerto_servidor')) {
            await run(`ALTER TABLE configuracion ADD COLUMN puerto_servidor INTEGER DEFAULT 5881`);
        }

        if (!configCols.includes('slogan')) {
            await run(`ALTER TABLE configuracion ADD COLUMN slogan TEXT DEFAULT ''`);
            await run(`ALTER TABLE configuracion ADD COLUMN direccion TEXT DEFAULT ''`);
            await run(`ALTER TABLE configuracion ADD COLUMN cuit TEXT DEFAULT ''`);
            await run(`ALTER TABLE configuracion ADD COLUMN telefono TEXT DEFAULT ''`);
            await run(`ALTER TABLE configuracion ADD COLUMN email TEXT DEFAULT ''`);
            console.log('✅ Migración de configuración (datos de membrete) completada.');
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
            `CREATE INDEX IF NOT EXISTS idx_tiempos_actividad_legajo ON tiempos_actividad(legajo_mecanico)`,
            `CREATE INDEX IF NOT EXISTS idx_actividad_mecanicos_legajo ON actividad_mecanicos(legajo_mecanico)`,
            `CREATE INDEX IF NOT EXISTS idx_ordenes_fecha_apertura ON ordenes(fecha_apertura)`,
            `CREATE INDEX IF NOT EXISTS idx_ordenes_fecha_cierre ON ordenes(fecha_cierre)`,
            `CREATE INDEX IF NOT EXISTS idx_ordenes_estado_actual ON ordenes(estado_actual)`,
            `CREATE INDEX IF NOT EXISTS idx_legajos_rol ON legajos(rol)`
        ];
        for (const sql of indices) await run(sql);
    } catch (error) {
        console.error('❌ Error migrando estructura:', error.message);
    }
}

module.exports = { migrarEstructura };
