'use strict';
// ─── LÓGICA DE DECISIÓN DEL CRON DIARIO (pura, sin efectos de lado) ───
// Separada de utils/cron.js a propósito: cron.js importa config/database,
// que conecta y migra la base apenas se lo requiere (efecto de lado al
// cargar el módulo). Esta función no necesita nada de eso — solo mira una
// fecha + la configuración del taller y decide qué acción corresponde —
// así que vive en su propio archivo sin dependencias, para poder
// testearla sin arrancar ninguna base de datos.

// Historial de este archivo, para entender por qué está armado así:
//   1. Originalmente el cron tenía las horas 13/14/18 hardcodeadas, igual
//      todos los días de la semana (incluido sábado).
//   2. Se detectó que los sábados a las 14hs "reanudaba" tareas que en
//      realidad debían quedar pausadas hasta el lunes (el taller cierra
//      al mediodía el sábado). Se corrigió agregando un caso especial
//      para sábado, pero TODAVÍA hardcodeado (sábado siempre cierra a
//      las 13hs, sin importar lo que diga la Configuración del taller).
//   3. Esta versión saca el hardcodeo por completo: toda hora relevante
//      (apertura/cierre/almuerzo de lunes a viernes, si el taller trabaja
//      los sábados y su propio horario) sale de la tabla `configuracion`,
//      la misma que ya se edita desde la pantalla de Configuración.
//
// Parámetro `config` esperado (fila de la tabla `configuracion`):
//   hora_apertura, hora_cierre, hora_almuerzo_inicio, hora_almuerzo_fin,
//   trabaja_corrido (0/1 — si es 1, de lunes a viernes no hay pausa de
//   almuerzo, solo el cierre), trabaja_sabados (0/1), sabado_hora_apertura,
//   sabado_hora_cierre.
function decidirAccionCron(fecha, config) {
    const diaSemana = fecha.getDay(); // 0=Domingo ... 6=Sábado
    const hora = fecha.getHours();

    if (diaSemana === 0) {
        // Domingo: no hay campo de configuración para esto todavía — se
        // asume taller cerrado, igual que siempre. Si en algún momento
        // hace falta hacerlo configurable también, es el mismo patrón
        // que trabaja_sabados.
        return null;
    }

    if (diaSemana === 6) {
        if (!config || !config.trabaja_sabados) return null;
        // Sábado: se asume media jornada sin corte de almuerzo (no hay
        // campos sabado_hora_almuerzo_inicio/fin en la Configuración
        // actual) — el único corte automático es el cierre, a la hora
        // configurada para el sábado.
        if (hora === Number(config.sabado_hora_cierre)) return 'cierre';
        return null;
    }

    // Lunes a viernes.
    if (!config) return null;

    if (config.trabaja_corrido) {
        // Sin pausa de almuerzo: el único corte automático es el cierre.
        if (hora === Number(config.hora_cierre)) return 'cierre';
        return null;
    }

    if (hora === Number(config.hora_almuerzo_inicio)) return 'almuerzo';
    if (hora === Number(config.hora_almuerzo_fin)) return 'reanudacion';
    if (hora === Number(config.hora_cierre)) return 'cierre';
    return null;
}

module.exports = { decidirAccionCron };
