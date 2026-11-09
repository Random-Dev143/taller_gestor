// Corrección de aportes habilitada por el Jefe de Taller.
//
// Un aporte (lo que el mecánico escribió sobre la reparación) queda bloqueado al
// guardarse. Si el mecánico se equivocó, hasta ahora había que corregirlo por SQL.
// Ahora el Jefe puede habilitar UN aporte puntual para que su autor lo corrija UNA vez:
//   correccion_habilitada     1 mientras la corrección está pendiente (vuelve a 0 al usarse)
//   correccion_habilitada_por quién la habilitó (auditoría)
//   correccion_habilitada_en  cuándo
//   corregido_en              cuándo se corrigió por última vez
//   texto_original            el texto ANTES de la primera corrección (se guarda una sola vez)
//
// Todo con default 0/NULL: los aportes existentes quedan exactamente como están.
async function up({ run, all }) {
    const cols = (await all(`PRAGMA table_info(aportes)`)).map(c => c.name);
    const agregar = [
        ['correccion_habilitada', 'INTEGER NOT NULL DEFAULT 0'],
        ['correccion_habilitada_por', 'TEXT'],
        ['correccion_habilitada_en', 'DATETIME'],
        ['corregido_en', 'DATETIME'],
        ['texto_original', 'TEXT']
    ];
    for (const [nombre, definicion] of agregar) {
        if (!cols.includes(nombre)) await run(`ALTER TABLE aportes ADD COLUMN ${nombre} ${definicion}`);
    }
}

module.exports = { up };
