'use strict';
// ─── PARCHE 05: mecánico "auxiliar" ──────────────────────────────────
const { get, post, put, loginAdmin } = require('./helpers/api');

const sufijo = Date.now().toString().slice(-5);
const L = (n) => `AX${n}${sufijo}`;
let token;
let seq = 0;

const nuevaActividad = async (legajos) => {
    seq += 1;
    const ot = `9${seq}${sufijo}`;
    await post('/api/ordenes', { ot, cliente: 'Cliente Aux', patente: `AUX${seq}${sufijo}`, unidad: 'U', asesor_legajo: 'ADMIN' }, { token });
    await post(`/api/actividades/orden/${ot}`, { descripcion: 'Tarea', tiempo_estimado: 2, legajos_mecanicos: legajos }, { token });
    const det = await get(`/api/ordenes/${ot}`, { token });
    return { ot, id: det.data.actividades[0].id };
};
const finalizar = (id, legajo, extra = {}) =>
    post(`/api/actividades/${id}/estado`, { nuevo_estado: 'Finalizada', legajo_mecanico: legajo, ...extra }, { token });
const miTarea = async (legajo, id) => {
    const { data } = await get(`/api/actividades/mecanico/${legajo}`, { token });
    return data.find(t => t.id === id);
};

beforeAll(async () => {
    token = await loginAdmin();
    for (const n of [1, 2, 3]) await post('/api/legajos', { legajo: L(n), nombre: `Mecanico Aux ${n}`, rol: 'mecanico' }, { token });
});

test('sin el flag, finalizar funciona exactamente como antes (es_auxiliar queda en 0)', async () => {
    const { id } = await nuevaActividad([L(1), L(2)]);
    const r = await finalizar(id, L(1));
    expect(r.status).toBe(200);
    const t = await miTarea(L(2), id);
    expect(t.soy_auxiliar).toBe(0);
    expect(t.otros_no_auxiliares).toBe(1);
});

test('un mecánico NO puede ser auxiliar si trabaja solo en la actividad', async () => {
    const { id } = await nuevaActividad([L(1)]);
    const t = await miTarea(L(1), id);
    expect(t.otros_no_auxiliares).toBe(0);
    const r = await finalizar(id, L(1), { es_auxiliar: true });
    expect(r.status).toBe(400);
    expect(r.data.error).toMatch(/auxiliar/i);
    // y la tarea NO quedó finalizada (la validación frena todo)
    expect((await miTarea(L(1), id)).mi_estado).not.toBe('Finalizada');
});

test('con 2 mecánicos, uno se marca auxiliar y cierra; el otro ya no puede serlo', async () => {
    const { id } = await nuevaActividad([L(1), L(2)]);
    const r1 = await finalizar(id, L(2), { es_auxiliar: true });
    expect(r1.status).toBe(200);

    // L2 ya no ve la tarea (Finalizada). L1 ve que no quedan otros no-auxiliares.
    const tL1 = await miTarea(L(1), id);
    expect(tL1.otros_no_auxiliares).toBe(0);

    const r2 = await finalizar(id, L(1), { es_auxiliar: true });
    expect(r2.status).toBe(400);               // alguien tiene que escribir el aporte
    const r3 = await finalizar(id, L(1), { es_auxiliar: false });
    expect(r3.status).toBe(200);               // y L1 sí puede cerrar normalmente
});

test('con 3 mecánicos pueden ser auxiliares 2, pero no los 3', async () => {
    const { id } = await nuevaActividad([L(1), L(2), L(3)]);
    expect((await finalizar(id, L(1), { es_auxiliar: true })).status).toBe(200);
    expect((await finalizar(id, L(2), { es_auxiliar: true })).status).toBe(200);
    expect((await finalizar(id, L(3), { es_auxiliar: true })).status).toBe(400);
});

test('el tiempo del auxiliar cuenta y figura como auxiliar en /explicacion (para el PDF)', async () => {
    const { id, ot } = await nuevaActividad([L(1), L(2)]);
    const fin = new Date();
    const fmt = (d) => d.toISOString().replace('T', ' ').substring(0, 19);
    await post(`/api/actividades/${id}/tiempos`, { legajo_mecanico: L(1), inicio: fmt(new Date(fin - 60 * 60000)), fin: fmt(fin) }, { token });
    await post(`/api/actividades/${id}/tiempos`, { legajo_mecanico: L(2), inicio: fmt(new Date(fin - 30 * 60000)), fin: fmt(fin) }, { token });
    expect((await finalizar(id, L(2), { es_auxiliar: true })).status).toBe(200);

    const { data } = await get(`/api/ordenes/${ot}/explicacion`, { token });
    const por = Object.fromEntries(data.tiempos_mecanicos.map(t => [t.legajo, t]));
    expect(por[L(2)].es_auxiliar).toBe(1);
    expect(por[L(2)].horas).toBeCloseTo(0.5, 2);   // su tiempo SÍ cuenta
    expect(por[L(1)].es_auxiliar).toBe(0);
    expect(por[L(1)].horas).toBeCloseTo(1, 2);
});

test('si se reasigna el equipo y solo quedan auxiliares, se limpia el flag', async () => {
    const { id, ot } = await nuevaActividad([L(1), L(2)]);
    expect((await finalizar(id, L(2), { es_auxiliar: true })).status).toBe(200);

    const antes = await get(`/api/ordenes/${ot}/explicacion`, { token });
    expect(antes.data.tiempos_mecanicos.find(t => t.legajo === L(2)).es_auxiliar).toBe(1);

    // El Jefe saca al mecánico que escribía el aporte (L1): L2, auxiliar, queda solo.
    const r = await put(`/api/actividades/${id}`, { descripcion: 'Tarea', tiempo_estimado: 2, legajos_mecanicos: [L(2)] }, { token });
    expect(r.status).toBe(200);

    // Nadie quedaría escribiendo el aporte -> el flag se limpia.
    const despues = await get(`/api/ordenes/${ot}/explicacion`, { token });
    expect(despues.data.tiempos_mecanicos).toHaveLength(1);
    expect(despues.data.tiempos_mecanicos[0].legajo).toBe(L(2));
    expect(despues.data.tiempos_mecanicos[0].es_auxiliar).toBe(0);
});

test('si se reasigna el equipo y sigue habiendo un no-auxiliar, el flag se conserva', async () => {
    const { id, ot } = await nuevaActividad([L(1), L(2), L(3)]);
    expect((await finalizar(id, L(2), { es_auxiliar: true })).status).toBe(200);
    // se saca a L3; quedan L1 (no aux) y L2 (aux)
    await put(`/api/actividades/${id}`, { descripcion: 'Tarea', tiempo_estimado: 2, legajos_mecanicos: [L(1), L(2)] }, { token });
    const { data } = await get(`/api/ordenes/${ot}/explicacion`, { token });
    expect(data.tiempos_mecanicos.find(t => t.legajo === L(2)).es_auxiliar).toBe(1);
});
