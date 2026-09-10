// gitaller-backend/db/migrations/015_configuracion_sabados.js
//
// Antes, la pausa/cierre automático de los sábados (utils/cronSchedule.js)
// estaba hardcodeado a "cierra a las 13hs, sin almuerzo" — un supuesto
// razonable pero que cada taller debería poder ajustar desde la pantalla
// de Configuración, igual que ya se puede con el horario de lunes a
// viernes (hora_apertura/hora_cierre/hora_almuerzo_inicio/hora_almuerzo_fin).
//
// Defaults elegidos para que una instalación existente (que ya venía
// operando con el comportamiento hardcodeado) no note ningún cambio hasta
// que alguien entre a Configuración y lo ajuste a mano:
//   trabaja_sabados = 1        (el taller abre los sábados, como antes)
//   sabado_hora_apertura = 8   (mismo horario de apertura que un día hábil)
//   sabado_hora_cierre = 13    (mismo cierre que estaba hardcodeado)
async function up({ run, all }) {
    const cols = (await all(`PRAGMA table_info(configuracion)`)).map(c => c.name);

    if (!cols.includes('trabaja_sabados')) {
        await run(`ALTER TABLE configuracion ADD COLUMN trabaja_sabados INTEGER DEFAULT 1`);
    }
    if (!cols.includes('sabado_hora_apertura')) {
        await run(`ALTER TABLE configuracion ADD COLUMN sabado_hora_apertura INTEGER DEFAULT 8`);
    }
    if (!cols.includes('sabado_hora_cierre')) {
        await run(`ALTER TABLE configuracion ADD COLUMN sabado_hora_cierre INTEGER DEFAULT 13`);
    }
}

module.exports = { up };
