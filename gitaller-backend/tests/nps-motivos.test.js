'use strict';
// Reglas del motivo de descarte (función pura, sin servidor).
const { calcularMotivo, MOTIVOS } = require('../services/nps-motivos');

const cerrada = (extra = {}) => ({ fecha_cierre: '2026-10-02 10:00:00', ...extra });
const motivo = (orden, cliente = 'CLIENTE X', tareas = []) => calcularMotivo({ orden, cliente, tareas });

test('"Otra marca" cuando es_no_iveco = 1', () => {
    expect(motivo(cerrada({ es_no_iveco: 1 }))).toBe('Otra marca');
});
test('"Abierta" si no tiene fecha de cierre', () => {
    expect(motivo({ es_garantia: 0 })).toBe('Abierta');
});
test('"Anulada" gana sobre el resto (incluso Otra marca y Abierta)', () => {
    expect(motivo({ anulada: 1, es_no_iveco: 1 })).toBe('Anulada');
});
test('"Interna" para clientes IVEMAR o DIRECTORIO', () => {
    expect(motivo(cerrada(), 'IVEMAR SERVICIOS S.A.')).toBe('Interna');
    expect(motivo(cerrada(), 'Directorio')).toBe('Interna');
});
test('"Empresa propia" si además es garantía (más específica que Interna)', () => {
    expect(motivo(cerrada({ es_garantia: 1 }), 'IVEMAR')).toBe('Empresa propia');
});
test('"Pre entrega": garantía + tarea PDI o "Pre entrega de unidad"', () => {
    expect(motivo(cerrada({ es_garantia: 1 }), 'X', ['PDI'])).toBe('Pre entrega');
    expect(motivo(cerrada({ es_garantia: 1 }), 'X', ['Pre entrega de unidad'])).toBe('Pre entrega');
    expect(motivo(cerrada({ es_garantia: 0 }), 'X', ['PDI'])).toBe('');
});
test('"Saneamientos": garantía + "Campaña <NC>"', () => {
    expect(motivo(cerrada({ es_garantia: 1 }), 'X', ['Campaña NC-123'])).toBe('Saneamientos');
    expect(motivo(cerrada({ es_garantia: 1 }), 'X', ['Campaña'])).toBe('');
});
test('"Seguros": garantía + "Póliza <N> <texto>" (con o sin tilde)', () => {
    expect(motivo(cerrada({ es_garantia: 1 }), 'X', ['Póliza 55 Rivadavia'])).toBe('Seguros');
    expect(motivo(cerrada({ es_garantia: 1 }), 'X', ['poliza 9'])).toBe('Seguros');
});
test('"Usados": garantía + "Garantía repuestos <texto>"', () => {
    expect(motivo(cerrada({ es_garantia: 1 }), 'X', ['Garantía repuestos filtro de aceite'])).toBe('Usados');
});
test('"Otros" lo carga el usuario y gana siempre', () => {
    expect(motivo(cerrada({ motivo_descarte_manual: 'Otros', anulada: 1 }))).toBe('Otros');
});
test('sin ninguna regla aplicable queda vacío (se encuesta al cliente)', () => {
    expect(motivo(cerrada(), 'CLIENTE X', ['Cambio de aceite'])).toBe('');
});
test('todo motivo devuelto pertenece a la lista del desplegable', () => {
    const casos = [cerrada({ es_no_iveco: 1 }), { }, cerrada({ anulada: 1 }), cerrada({ es_garantia: 1 })];
    for (const o of casos) { const m = motivo(o, 'IVEMAR'); expect(m === '' || MOTIVOS.includes(m)).toBe(true); }
});
