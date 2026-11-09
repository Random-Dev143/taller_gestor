// Mecánico "auxiliar": cuando dos o más mecánicos trabajan en la misma actividad,
// uno de ellos puede cerrar su parte marcándose como auxiliar, lo que le permite
// finalizar SIN escribir un aporte (el informe lo escribe el otro mecánico).
//
// El flag vive en actividad_mecanicos (por mecánico y por actividad) y sirve para:
//   - habilitar el cierre sin aporte en la pantalla del mecánico,
//   - mostrarlo como "(auxiliar)" junto a su tiempo en el PDF de la OT.
//
// Default 0: ninguna actividad existente cambia de comportamiento.
async function up({ run, all }) {
    const cols = (await all(`PRAGMA table_info(actividad_mecanicos)`)).map(c => c.name);
    if (!cols.includes('es_auxiliar')) {
        await run(`ALTER TABLE actividad_mecanicos ADD COLUMN es_auxiliar INTEGER NOT NULL DEFAULT 0`);
    }
}

module.exports = { up };
