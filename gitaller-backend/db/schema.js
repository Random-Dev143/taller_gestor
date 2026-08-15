'use strict';
// ─── ESQUEMA ─────────────────────────────────────────────────────────
// Define el estado "objetivo" del esquema vía CREATE TABLE IF NOT EXISTS.
// En una instalación nueva, esto es lo único que corre. En una instalación
// existente que arrastra un esquema viejo, migrations.js se encarga de
// llevarla hasta acá con ALTER/CREATE-INSERT-DROP-RENAME.
//
// IMPORTANTE: si cambiás una definición acá, una instalación existente
// NO se entera sola (CREATE TABLE IF NOT EXISTS es un no-op si la tabla
// ya existe) — hace falta agregar el parche correspondiente en migrations.js.

function crearEsquema(db) {
    db.run(`CREATE TABLE IF NOT EXISTS legajos (legajo TEXT PRIMARY KEY, nombre TEXT NOT NULL, rol TEXT NOT NULL CHECK(rol IN ('asesor','jefe','mecanico')), firma_path TEXT)`);
    db.run(`CREATE TABLE IF NOT EXISTS clientes (id INTEGER PRIMARY KEY AUTOINCREMENT, nombre TEXT NOT NULL UNIQUE, telefono TEXT DEFAULT '', correo TEXT DEFAULT '')`);
    db.run(`CREATE TABLE IF NOT EXISTS unidades (id INTEGER PRIMARY KEY AUTOINCREMENT, patente TEXT NOT NULL UNIQUE, cliente_id INTEGER, unidad TEXT NOT NULL, telefono TEXT DEFAULT '', correo TEXT DEFAULT '', contacto_nombre TEXT DEFAULT '', contacto_apellido TEXT DEFAULT '', FOREIGN KEY(cliente_id) REFERENCES clientes(id) ON DELETE RESTRICT ON UPDATE CASCADE)`);
    db.run(`CREATE TABLE IF NOT EXISTS ordenes (ot TEXT PRIMARY KEY, patente TEXT NOT NULL, kilometraje TEXT DEFAULT '', asesor_legajo TEXT NOT NULL, fecha_apertura DATETIME NOT NULL, fecha_cierre DATETIME, es_garantia INTEGER NOT NULL DEFAULT 0, estado_actual TEXT NOT NULL DEFAULT 'En Espera' CHECK(estado_actual IN ('En Proceso','En Espera','Trabajos de Terceros','Espera de Repuestos','Finalizada')), tiempo_asignado_horas REAL DEFAULT 0, tiempo_empleado_horas REAL DEFAULT 0, tiempo_facturado_horas REAL DEFAULT 0, jefe_legajo TEXT, controlada INTEGER DEFAULT 0, es_no_iveco INTEGER DEFAULT 0, monto_repuestos REAL DEFAULT 0, monto_mano_obra REAL DEFAULT 0, monto_repuestos_garantia REAL DEFAULT 0, monto_mano_obra_garantia REAL DEFAULT 0, monto_descuento REAL DEFAULT 0, descuento_motivo TEXT DEFAULT '', descuento_estado TEXT DEFAULT 'ninguno' CHECK(descuento_estado IN ('ninguno','pendiente','autorizado','rechazado')), descuento_autorizado_por TEXT, descuento_autorizado_en DATETIME, FOREIGN KEY(patente) REFERENCES unidades(patente) ON DELETE RESTRICT ON UPDATE CASCADE, FOREIGN KEY(asesor_legajo) REFERENCES legajos(legajo) ON DELETE RESTRICT ON UPDATE CASCADE, FOREIGN KEY(jefe_legajo) REFERENCES legajos(legajo) ON DELETE SET NULL ON UPDATE CASCADE)`);
    db.run(`CREATE TABLE IF NOT EXISTS estados_historial (id INTEGER PRIMARY KEY AUTOINCREMENT, ot TEXT NOT NULL, estado TEXT NOT NULL, ts_desde DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, ts_hasta DATETIME, minutos REAL, FOREIGN KEY(ot) REFERENCES ordenes(ot) ON DELETE CASCADE ON UPDATE CASCADE)`);
    db.run(`CREATE TABLE IF NOT EXISTS asignaciones (id INTEGER PRIMARY KEY AUTOINCREMENT, ot TEXT NOT NULL, legajo_mecanico TEXT NOT NULL, fecha_asignacion DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(ot) REFERENCES ordenes(ot) ON DELETE CASCADE ON UPDATE CASCADE, FOREIGN KEY(legajo_mecanico) REFERENCES legajos(legajo) ON DELETE RESTRICT ON UPDATE CASCADE)`);
    db.run(`CREATE TABLE IF NOT EXISTS explicaciones (id INTEGER PRIMARY KEY AUTOINCREMENT, ot TEXT NOT NULL UNIQUE, causa TEXT, FOREIGN KEY(ot) REFERENCES ordenes(ot) ON DELETE CASCADE ON UPDATE CASCADE)`);
    db.run(`CREATE TABLE IF NOT EXISTS aportes (id INTEGER PRIMARY KEY AUTOINCREMENT, ot TEXT NOT NULL, legajo TEXT NOT NULL, actividades TEXT NOT NULL, horas REAL DEFAULT 0, fecha_aporte DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(ot) REFERENCES ordenes(ot) ON DELETE CASCADE ON UPDATE CASCADE, FOREIGN KEY(legajo) REFERENCES legajos(legajo) ON DELETE RESTRICT ON UPDATE CASCADE)`);
    db.run(`CREATE TABLE IF NOT EXISTS actividades (id INTEGER PRIMARY KEY AUTOINCREMENT, ot TEXT NOT NULL, descripcion TEXT NOT NULL, tiempo_estimado REAL NOT NULL, tiempo_real REAL DEFAULT 0, estado TEXT DEFAULT 'Asignada' CHECK(estado IN ('Pendiente', 'Asignada', 'En Curso', 'Pausada', 'Finalizada', 'Cerrada por Jefe')), legajo_mecanico TEXT NOT NULL, auto_pausa INTEGER DEFAULT 0, fecha_inicio DATETIME, fecha_fin DATETIME, es_rutina INTEGER NOT NULL DEFAULT 0, FOREIGN KEY(ot) REFERENCES ordenes(ot) ON DELETE CASCADE ON UPDATE CASCADE, FOREIGN KEY(legajo_mecanico) REFERENCES legajos(legajo) ON DELETE RESTRICT ON UPDATE CASCADE)`);
    db.run(`CREATE TABLE IF NOT EXISTS tiempos_actividad (id INTEGER PRIMARY KEY AUTOINCREMENT, actividad_id INTEGER NOT NULL, legajo_mecanico TEXT, inicio DATETIME NOT NULL, fin DATETIME, FOREIGN KEY(actividad_id) REFERENCES actividades(id) ON DELETE CASCADE ON UPDATE CASCADE)`);
    db.run(`CREATE TABLE IF NOT EXISTS actividad_mecanicos (
    actividad_id INTEGER NOT NULL, 
    legajo_mecanico TEXT NOT NULL, 
    estado TEXT NOT NULL DEFAULT 'Asignada' CHECK(estado IN ('Asignada','En Curso','Pausada','Finalizada')),
    tiempo_real REAL NOT NULL DEFAULT 0,
    informe TEXT,
    PRIMARY KEY(actividad_id, legajo_mecanico),
    FOREIGN KEY(actividad_id) REFERENCES actividades(id) ON DELETE CASCADE, 
    FOREIGN KEY(legajo_mecanico) REFERENCES legajos(legajo) ON DELETE RESTRICT
)`);

    // Rescata las actividades históricas y las inserta en la tabla de equipo
    db.run(`INSERT OR IGNORE INTO actividad_mecanicos (actividad_id, legajo_mecanico) 
            SELECT id, legajo_mecanico FROM actividades 
            WHERE legajo_mecanico IS NOT NULL AND legajo_mecanico != 'EQUIPO'`);

    db.run(`CREATE TABLE IF NOT EXISTS excepciones_mecanicos (id INTEGER PRIMARY KEY AUTOINCREMENT, legajo TEXT NOT NULL, fecha DATE NOT NULL, motivo TEXT NOT NULL, horas_descontadas REAL DEFAULT 10, FOREIGN KEY(legajo) REFERENCES legajos(legajo) ON DELETE CASCADE ON UPDATE CASCADE)`);
    db.run(`CREATE TABLE IF NOT EXISTS feriados (fecha DATE PRIMARY KEY, descripcion TEXT DEFAULT '')`);
    db.run(`CREATE TABLE IF NOT EXISTS usuarios (
        id TEXT PRIMARY KEY, 
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL, 
        nombre_completo TEXT NOT NULL,
        estado TEXT DEFAULT 'pendiente' CHECK(estado IN ('pendiente', 'aprobado', 'suspendido')),
        rol TEXT CHECK(rol IN ('admin', 'asesor', 'jefe', 'mecanico')),
        legajo TEXT,
        fecha_registro DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(legajo) REFERENCES legajos(legajo) ON DELETE SET NULL ON UPDATE CASCADE
    )`);
    // TABLAS DE PERMISOS DINÁMICOS
    db.run(`CREATE TABLE IF NOT EXISTS permisos (
        clave TEXT PRIMARY KEY, 
        modulo TEXT NOT NULL, 
        descripcion TEXT NOT NULL
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS roles (
        id TEXT PRIMARY KEY, 
        nombre TEXT UNIQUE NOT NULL, 
        es_sistema INTEGER DEFAULT 0
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS rol_permisos (
        rol_id TEXT NOT NULL, 
        permiso_clave TEXT NOT NULL, 
        PRIMARY KEY (rol_id, permiso_clave),
        FOREIGN KEY(rol_id) REFERENCES roles(id) ON DELETE CASCADE ON UPDATE CASCADE,
        FOREIGN KEY(permiso_clave) REFERENCES permisos(clave) ON DELETE CASCADE ON UPDATE CASCADE
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS configuracion (
        id INTEGER PRIMARY KEY CHECK (id = 1), 
        nombre_taller TEXT DEFAULT 'GITaller', 
        logo_path TEXT, 
        hora_apertura INTEGER DEFAULT 8, 
        hora_cierre INTEGER DEFAULT 18, 
        hora_almuerzo_inicio INTEGER DEFAULT 13, 
        hora_almuerzo_fin INTEGER DEFAULT 14, 
        trabaja_corrido INTEGER DEFAULT 0,
        puerto_servidor INTEGER DEFAULT 5881,
        slogan TEXT DEFAULT 'tu slogan aqui',
        direccion TEXT DEFAULT 'tu dirección aqui',
        cuit TEXT DEFAULT '',
        telefono TEXT DEFAULT '134-123456',
        email TEXT DEFAULT 'taller@taller.com'
    )`);

    // Columna agregada después de la creación original de `usuarios`; se
    // mantiene acá (y no en migrations.js) porque ALTER...ADD COLUMN con
    // callback que ignora el error si ya existe es, en la práctica, tan
    // idempotente como un CREATE TABLE IF NOT EXISTS.
    db.run(`ALTER TABLE usuarios ADD COLUMN rol_id TEXT REFERENCES roles(id) ON DELETE SET NULL`, (err) => { /* Ignorar si ya existe */ });
}

module.exports = { crearEsquema };
