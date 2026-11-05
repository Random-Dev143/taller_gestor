'use strict';
// ─── PARCHE 01: GET /ordenes/:ot/explicacion devuelve tiempos_mecanicos ───
// El PDF de explicación necesita las horas REALES por mecánico. aportes.horas
// se guarda siempre en 0, así que el endpoint ahora suma actividad_mecanicos.tiempo_real.

const { get, post, loginAdmin } = require('./helpers/api');

const sufijo = Date.now().toString().slice(-6);
const L1 = `PA${sufijo}`;
const L2 = `PB${sufijo}`;
const OT = `8${sufijo}`;
const PATENTE = `PDF${sufijo}`;

let token;
let actividadId;
const fmt = (d) => d.toISOString().replace('T', ' ').substring(0, 19);

beforeAll(async () => {
    token = await loginAdmin();
    await post('/api/legajos', { legajo: L1, nombre: 'Mecanico Uno', rol: 'mecanico' }, { token });
    await post('/api/legajos', { legajo: L2, nombre: 'Mecanico Dos', rol: 'mecanico' }, { token });
    await post('/api/ordenes', {
        ot: OT, cliente: 'Cliente PDF', patente: PATENTE, unidad: 'Unidad PDF', asesor_legajo: 'ADMIN'
    }, { token });
    await post(`/api/actividades/orden/${OT}`, {
        descripcion: 'Tarea en equipo', tiempo_estimado: 3, legajos_mecanicos: [L1, L2]
    }, { token });
    const det = await get(`/api/ordenes/${OT}`, { token });
    actividadId = det.data.actividades[0].id;
});

test('sin tiempo cargado, cada mecánico figura con 0 horas', async () => {
    const { status, data } = await get(`/api/ordenes/${OT}/explicacion`, { token });
    expect(status).toBe(200);
    expect(Array.isArray(data.tiempos_mecanicos)).toBe(true);
    expect(data.tiempos_mecanicos).toHaveLength(2);
    data.tiempos_mecanicos.forEach(t => expect(t.horas).toBe(0));
});

test('devuelve las horas reales de cada mecánico (1h30 y 2h)', async () => {
    const fin = new Date();
    const r1 = await post(`/api/actividades/${actividadId}/tiempos`, {
        legajo_mecanico: L1, inicio: fmt(new Date(fin.getTime() - 90 * 60000)), fin: fmt(fin)
    }, { token });
    const r2 = await post(`/api/actividades/${actividadId}/tiempos`, {
        legajo_mecanico: L2, inicio: fmt(new Date(fin.getTime() - 120 * 60000)), fin: fmt(fin)
    }, { token });
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);

    const { data } = await get(`/api/ordenes/${OT}/explicacion`, { token });
    const porLegajo = Object.fromEntries(data.tiempos_mecanicos.map(t => [t.legajo, t]));
    expect(porLegajo[L1].horas).toBeCloseTo(1.5, 2);
    expect(porLegajo[L2].horas).toBeCloseTo(2, 2);
    expect(porLegajo[L1].nombre).toBe('Mecanico Uno');
});

test('los campos que ya existían siguen presentes (compatibilidad)', async () => {
    const { data } = await get(`/api/ordenes/${OT}/explicacion`, { token });
    ['orden', 'aportes', 'jefe', 'controlada'].forEach(k => expect(data).toHaveProperty(k));
    expect(data.orden.ot).toBe(OT);
    // 'explicacion' solo viaja si la OT ya tiene causa cargada (comportamiento previo)
});
