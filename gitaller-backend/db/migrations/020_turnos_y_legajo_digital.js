// Turnos del taller + legajo digital de la OT.
//
//   turnos           Turno programado por el asesor. Al convertirse en OT queda
//                    vinculado (turnos.ot) y ya no se puede editar.
//   turno_eventos    Línea de tiempo del turno: alta, llamados de confirmación,
//                    reprogramaciones, cancelación, OT creada.
//   ot_documentos    PDFs de la OT (presupuestos y otros). El archivo vive en la
//                    carpeta configurada (configuracion.carpeta_documentos); acá
//                    solo se guarda la ruta RELATIVA, así se puede mover la carpeta.
//                    El borrado es lógico: queda quién, cuándo y por qué.
//   ordenes          + es_retrabajo / ot_retrabajo_origen (OT que repite un trabajo anterior)
//   configuracion    + carpeta_documentos
//
// Fechas: UTC "YYYY-MM-DD HH:MM:SS" como en el resto de la app (ver FECHAS_Y_HORAS.md).
// Idempotente: se puede re-evaluar sin romper nada.
async function up({ run, all }) {
    const cols = async (t) => (await all(`PRAGMA table_info(${t})`)).map(c => c.name);
    const addCol = async (tabla, col, def) => {
        if (!(await cols(tabla)).includes(col)) await run(`ALTER TABLE ${tabla} ADD COLUMN ${col} ${def}`);
    };

    await run(`
        CREATE TABLE IF NOT EXISTS turnos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            fecha_hora TEXT NOT NULL,
            tipo TEXT NOT NULL DEFAULT 'normal' CHECK(tipo IN ('normal','garantia','retrabajo')),
            estado TEXT NOT NULL DEFAULT 'sin_confirmar'
                CHECK(estado IN ('sin_confirmar','confirmado','reprogramar','cancelado','no_asistio','ot_creada')),
            cliente TEXT NOT NULL,
            patente TEXT NOT NULL,
            unidad TEXT NOT NULL,
            chasis TEXT DEFAULT '',
            contacto_nombre TEXT DEFAULT '',
            telefono TEXT DEFAULT '',
            correo TEXT DEFAULT '',
            motivo TEXT DEFAULT '',
            horas_estimadas REAL DEFAULT 0,
            km_estimado INTEGER,
            asesor_legajo TEXT,
            confirmado_via TEXT,
            confirmado_en DATETIME,
            cancelado_motivo TEXT DEFAULT '',
            ot TEXT UNIQUE REFERENCES ordenes(ot) ON UPDATE CASCADE ON DELETE SET NULL,
            creado_por TEXT DEFAULT '',
            creado_en DATETIME DEFAULT CURRENT_TIMESTAMP,
            actualizado_en DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);
    await run(`CREATE INDEX IF NOT EXISTS idx_turnos_fecha ON turnos(fecha_hora)`);
    await run(`CREATE INDEX IF NOT EXISTS idx_turnos_estado ON turnos(estado)`);
    await run(`CREATE INDEX IF NOT EXISTS idx_turnos_patente ON turnos(patente)`);

    await run(`
        CREATE TABLE IF NOT EXISTS turno_eventos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            turno_id INTEGER NOT NULL REFERENCES turnos(id) ON DELETE CASCADE ON UPDATE CASCADE,
            tipo TEXT NOT NULL,
            detalle TEXT DEFAULT '',
            usuario TEXT DEFAULT '',
            ts DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);
    await run(`CREATE INDEX IF NOT EXISTS idx_turno_eventos_turno ON turno_eventos(turno_id)`);

    await run(`
        CREATE TABLE IF NOT EXISTS ot_documentos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ot TEXT NOT NULL REFERENCES ordenes(ot) ON UPDATE CASCADE ON DELETE CASCADE,
            tipo TEXT NOT NULL DEFAULT 'presupuesto' CHECK(tipo IN ('presupuesto','otro')),
            version INTEGER NOT NULL DEFAULT 1,
            es_revision INTEGER NOT NULL DEFAULT 0,
            revision_motivo TEXT DEFAULT '',
            nombre_original TEXT DEFAULT '',
            ruta_relativa TEXT NOT NULL,
            tamano INTEGER DEFAULT 0,
            monto REAL,
            estado_presupuesto TEXT DEFAULT 'pendiente'
                CHECK(estado_presupuesto IN ('pendiente','aprobado','aprobado_parcial','rechazado')),
            estado_actualizado_en DATETIME,
            subido_por TEXT DEFAULT '',
            subido_en DATETIME DEFAULT CURRENT_TIMESTAMP,
            borrado_en DATETIME,
            borrado_por TEXT,
            borrado_motivo TEXT
        )
    `);
    await run(`CREATE INDEX IF NOT EXISTS idx_ot_documentos_ot ON ot_documentos(ot)`);

    await addCol('ordenes', 'es_retrabajo', 'INTEGER DEFAULT 0');
    await addCol('ordenes', 'ot_retrabajo_origen', `TEXT DEFAULT ''`);
    await addCol('configuracion', 'carpeta_documentos', `TEXT DEFAULT ''`);
}

module.exports = { up };
