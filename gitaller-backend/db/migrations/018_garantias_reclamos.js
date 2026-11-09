// Seguimiento del reclamo de garantía de cada OT de garantía.
//
// El "número de garantía" es el número de OT (ordenes.ot), por eso la clave de esta
// tabla es la propia OT: una fila por OT, con los datos del reclamo al fabricante.
//   fecha_reclamo     día en que se presentó el reclamo (YYYY-MM-DD)
//   monto_solicitado  lo que se reclamó
//   monto_pagado      lo que efectivamente se pagó
//   numero_proforma   número de proforma (claim)
//
// Tabla NUEVA: no modifica nada existente. Las filas se crean recién cuando el
// asesor carga un reclamo. ON UPDATE/DELETE CASCADE: sigue a la OT si cambia o se borra.
async function up({ run }) {
    await run(`
        CREATE TABLE IF NOT EXISTS garantias_reclamos (
            ot TEXT PRIMARY KEY REFERENCES ordenes(ot) ON UPDATE CASCADE ON DELETE CASCADE,
            fecha_reclamo TEXT,
            monto_solicitado REAL,
            monto_pagado REAL,
            numero_proforma TEXT,
            actualizado_por TEXT,
            actualizado_en DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);
    await run(`CREATE INDEX IF NOT EXISTS idx_garantias_reclamos_proforma ON garantias_reclamos(numero_proforma)`);
}

module.exports = { up };
