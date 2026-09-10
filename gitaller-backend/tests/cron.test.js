'use strict';
// ─── LÓGICA DE DECISIÓN DEL CRON DIARIO ──────────────────────────────
// Cubre utils/cronSchedule.js -> decidirAccionCron(), una función pura sin
// efectos de lado (no toca la base ni el filesystem), así que se testea
// directo, sin levantar el servidor.
//
// Historia: primero el cron tenía las horas hardcodeadas (13/14/18 todos
// los días); después se detectó y corrigió el bug de que el sábado a las
// 14hs "reanudaba" tareas que debían quedar pausadas hasta el lunes, pero
// la corrección seguía hardcodeada (sábado siempre cierra a las 13hs). En
// esta versión, todo sale de la configuración del taller (la misma tabla
// que se edita desde la pantalla de Configuración) — nada queda fijo.

const { decidirAccionCron } = require('../utils/cronSchedule');

// Helper: arma una fecha para un día de la semana (0=Dom..6=Sáb) y hora
// dados, sin depender del día actual real en que corra la suite.
function fechaPara(diaSemana, hora) {
    // 2024-01-07 fue domingo -> 2024-01-07 + diaSemana días cae en el día de semana pedido.
    const base = new Date(2024, 0, 7); // domingo
    base.setDate(base.getDate() + diaSemana);
    base.setHours(hora, 0, 0, 0);
    return base;
}

const CONFIG_ESTANDAR = {
    hora_apertura: 8, hora_cierre: 18, hora_almuerzo_inicio: 13, hora_almuerzo_fin: 14,
    trabaja_corrido: 0, trabaja_sabados: 1, sabado_hora_apertura: 8, sabado_hora_cierre: 13
};

describe('decidirAccionCron — Lunes a Viernes, config estándar (con almuerzo)', () => {
    for (let dia = 1; dia <= 5; dia++) {
        test(`día ${dia}: a la hora de almuerzo_inicio corresponde 'almuerzo'`, () => {
            expect(decidirAccionCron(fechaPara(dia, 13), CONFIG_ESTANDAR)).toBe('almuerzo');
        });
        test(`día ${dia}: a la hora de almuerzo_fin corresponde 'reanudacion'`, () => {
            expect(decidirAccionCron(fechaPara(dia, 14), CONFIG_ESTANDAR)).toBe('reanudacion');
        });
        test(`día ${dia}: a la hora de cierre corresponde 'cierre'`, () => {
            expect(decidirAccionCron(fechaPara(dia, 18), CONFIG_ESTANDAR)).toBe('cierre');
        });
        test(`día ${dia}: a media mañana no corresponde ninguna acción`, () => {
            expect(decidirAccionCron(fechaPara(dia, 10), CONFIG_ESTANDAR)).toBeNull();
        });
    }
});

describe('decidirAccionCron — Lunes a Viernes, horario personalizado', () => {
    const CONFIG_CUSTOM = { ...CONFIG_ESTANDAR, hora_almuerzo_inicio: 12, hora_almuerzo_fin: 13, hora_cierre: 19 };

    test('respeta el horario de almuerzo configurado, no el default', () => {
        expect(decidirAccionCron(fechaPara(2, 12), CONFIG_CUSTOM)).toBe('almuerzo');
        expect(decidirAccionCron(fechaPara(2, 13), CONFIG_CUSTOM)).toBe('reanudacion');
        expect(decidirAccionCron(fechaPara(2, 13), CONFIG_ESTANDAR)).toBe('almuerzo'); // el estándar sigue igual
    });

    test('respeta la hora de cierre configurada', () => {
        expect(decidirAccionCron(fechaPara(2, 19), CONFIG_CUSTOM)).toBe('cierre');
        expect(decidirAccionCron(fechaPara(2, 18), CONFIG_CUSTOM)).toBeNull(); // ya no es la hora de cierre configurada
    });
});

describe('decidirAccionCron — trabaja_corrido (sin pausa de almuerzo)', () => {
    const CONFIG_CORRIDO = { ...CONFIG_ESTANDAR, trabaja_corrido: 1 };

    test('a la hora que sería almuerzo, NO pausa (trabaja corrido)', () => {
        expect(decidirAccionCron(fechaPara(3, 13), CONFIG_CORRIDO)).toBeNull();
    });

    test('a la hora que sería reanudación, tampoco hace nada', () => {
        expect(decidirAccionCron(fechaPara(3, 14), CONFIG_CORRIDO)).toBeNull();
    });

    test('el cierre sigue funcionando igual', () => {
        expect(decidirAccionCron(fechaPara(3, 18), CONFIG_CORRIDO)).toBe('cierre');
    });
});

describe('decidirAccionCron — Sábado, configurable', () => {
    test('con trabaja_sabados=1, cierra a la hora configurada (sábado_hora_cierre)', () => {
        expect(decidirAccionCron(fechaPara(6, 13), CONFIG_ESTANDAR)).toBe('cierre');
    });

    test('con trabaja_sabados=1, NO reanuda nada a la hora de almuerzo semanal — este era el bug original', () => {
        expect(decidirAccionCron(fechaPara(6, 14), CONFIG_ESTANDAR)).toBeNull();
    });

    test('respeta un sabado_hora_cierre personalizado (ej: 12hs)', () => {
        const config = { ...CONFIG_ESTANDAR, sabado_hora_cierre: 12 };
        expect(decidirAccionCron(fechaPara(6, 12), config)).toBe('cierre');
        expect(decidirAccionCron(fechaPara(6, 13), config)).toBeNull(); // ya no es la hora configurada
    });

    test('con trabaja_sabados=0, ninguna hora dispara ninguna acción', () => {
        const config = { ...CONFIG_ESTANDAR, trabaja_sabados: 0 };
        for (const hora of [8, 12, 13, 14, 18]) {
            expect(decidirAccionCron(fechaPara(6, hora), config)).toBeNull();
        }
    });
});

describe('decidirAccionCron — Domingo', () => {
    test('ninguna hora dispara ninguna acción (taller cerrado, no configurable todavía)', () => {
        for (const hora of [8, 13, 14, 18, 20]) {
            expect(decidirAccionCron(fechaPara(0, hora), CONFIG_ESTANDAR)).toBeNull();
        }
    });
});

describe('decidirAccionCron — sin configuración (config null/undefined)', () => {
    test('no revienta y no dispara ninguna acción', () => {
        expect(() => decidirAccionCron(fechaPara(2, 13), null)).not.toThrow();
        expect(decidirAccionCron(fechaPara(2, 13), null)).toBeNull();
        expect(decidirAccionCron(fechaPara(6, 13), undefined)).toBeNull();
    });
});
