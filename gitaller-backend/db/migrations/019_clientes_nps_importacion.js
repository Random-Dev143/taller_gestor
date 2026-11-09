// db/migrations/019_clientes_nps_importacion.js
//
// Soporte para la planilla de NPS (informe quincenal) y para la carga
// masiva de clientes desde planillas Excel. Todo es ADITIVO: no se toca ni
// se borra ningún dato existente.
//   clientes.cuit                        -> IDCliente de la planilla
//   unidades.chasis                      -> Chasis de la planilla
//   ordenes.anulada (+ auditoría)        -> el jefe de taller puede anular OTs
//   ordenes.motivo_descarte_manual       -> "Otros" cargado a mano
//   configuracion.*                      -> concesionario/sede, carpeta de informes
//   importaciones / importacion_items    -> staging de la carga masiva (aprobación)
//   informes_generados                   -> registro de planillas generadas
async function up({ run, all }) {
    const cols = async (t) => (await all(`PRAGMA table_info(${t})`)).map(c => c.name);
    const addCol = async (tabla, col, def) => {
        if (!(await cols(tabla)).includes(col)) await run(`ALTER TABLE ${tabla} ADD COLUMN ${col} ${def}`);
    };

    await addCol('clientes', 'cuit', `TEXT DEFAULT ''`);
    await addCol('unidades', 'chasis', `TEXT DEFAULT ''`);

    await addCol('ordenes', 'anulada', 'INTEGER DEFAULT 0');
    await addCol('ordenes', 'anulada_motivo', `TEXT DEFAULT ''`);
    await addCol('ordenes', 'anulada_por', `TEXT DEFAULT ''`);
    await addCol('ordenes', 'anulada_en', 'DATETIME');
    await addCol('ordenes', 'motivo_descarte_manual', `TEXT DEFAULT ''`);

    await addCol('configuracion', 'nps_concesionario', `TEXT DEFAULT '7'`);
    await addCol('configuracion', 'nps_sede', `TEXT DEFAULT '20'`);
    await addCol('configuracion', 'carpeta_informes', `TEXT DEFAULT ''`);
    await addCol('configuracion', 'informe_auto_activo', 'INTEGER DEFAULT 1');

    await run(`CREATE INDEX IF NOT EXISTS idx_clientes_cuit ON clientes(cuit)`);

    await run(`CREATE TABLE IF NOT EXISTS informes_generados (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tipo TEXT NOT NULL DEFAULT 'nps',
        desde TEXT NOT NULL,
        hasta TEXT NOT NULL,
        origen TEXT NOT NULL DEFAULT 'manual',
        ruta TEXT DEFAULT '',
        filas INTEGER DEFAULT 0,
        error TEXT DEFAULT '',
        generado_en DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    await run(`CREATE TABLE IF NOT EXISTS importaciones (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        creada_en DATETIME DEFAULT CURRENT_TIMESTAMP,
        usuario TEXT DEFAULT '',
        archivos TEXT DEFAULT '[]',
        resumen TEXT DEFAULT '{}',
        estado TEXT NOT NULL DEFAULT 'pendiente' CHECK(estado IN ('pendiente','cerrada','cancelada')),
        backup_hecho INTEGER DEFAULT 0
    )`);

    await run(`CREATE TABLE IF NOT EXISTS importacion_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        importacion_id INTEGER NOT NULL,
        tipo TEXT NOT NULL CHECK(tipo IN ('completar','conflicto','cliente_distinto','alta')),
        entidad TEXT NOT NULL,
        ref TEXT NOT NULL,
        campo TEXT DEFAULT '',
        valor_actual TEXT DEFAULT '',
        valor_propuesto TEXT DEFAULT '',
        valor_final TEXT DEFAULT '',
        payload TEXT DEFAULT '{}',
        origen TEXT DEFAULT '',
        estado TEXT NOT NULL DEFAULT 'pendiente' CHECK(estado IN ('pendiente','aplicado','rechazado','omitido','error')),
        detalle TEXT DEFAULT '',
        FOREIGN KEY(importacion_id) REFERENCES importaciones(id) ON DELETE CASCADE
    )`);
    await run(`CREATE INDEX IF NOT EXISTS idx_imp_items ON importacion_items(importacion_id, tipo, estado)`);
}

module.exports = { up };
