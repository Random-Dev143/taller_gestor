'use strict';
// Edición de una actividad desde el modal del Jefe:
//  · el tiempo real (calculado, con decimales) NO debe pisarse si no se envía;
//  · si se envía un valor, sí se aplica;
//  · la vista del mecánico trae la fecha de apertura y ordena de la OT más vieja a la más nueva.
const { get, post, put, loginAdmin } = require('./helpers/api');

const sufijo = Date.now().toString().slice(-6);
const LEGAJO = `R${sufijo}`;
const OT_VIEJA = `61${sufijo}`;
const OT_NUEVA = `62${sufijo}`;
let token, actividadVieja;

const actividad = async (ot) => (await get(`/api/ordenes/${ot}`, { token })).data.actividades[0];
const editar = (id, extra) => put(`/api/actividades/${id}`, { legajos_mecanicos: [LEGAJO], descripcion: 'Tarea editada', tiempo_estimado: 2, ...extra }, { token });

beforeAll(async () => {
    token = await loginAdmin();
    await post('/api/legajos', { legajo: LEGAJO, nombre: 'Mecánico Tiempo', rol: 'mecanico' }, { token });
    // La OT "nueva" se crea primero a propósito, pero con apertura POSTERIOR: el orden lo da la fecha, no el id.
    await post('/api/ordenes', { ot: OT_NUEVA, cliente: 'CLI TIEMPO', patente: `TN${sufijo}`, unidad: 'U', asesor_legajo: 'ADMIN', fecha_apertura: '2026-10-10T12:00:00Z' }, { token });
    await post('/api/ordenes', { ot: OT_VIEJA, cliente: 'CLI TIEMPO', patente: `TV${sufijo}`, unidad: 'U', asesor_legajo: 'ADMIN', fecha_apertura: '2026-10-01T12:00:00Z' }, { token });
    for (const ot of [OT_NUEVA, OT_VIEJA]) {
        await post(`/api/actividades/orden/${ot}`, { descripcion: 'Tarea', tiempo_estimado: 1, legajos_mecanicos: [LEGAJO] }, { token });
    }
    actividadVieja = (await actividad(OT_VIEJA)).id;
});

test('un valor con muchos decimales se guarda tal cual al enviarlo', async () => {
    expect((await editar(actividadVieja, { tiempo_real: 1.2345678 })).status).toBe(200);
    expect((await actividad(OT_VIEJA)).tiempo_real).toBeCloseTo(1.2345678, 6);
});

test('editar SIN enviar tiempo_real (cambio de descripción/mecánicos) conserva los decimales', async () => {
    const r = await editar(actividadVieja, { descripcion: 'Otra descripción' });
    expect(r.status).toBe(200);
    const a = await actividad(OT_VIEJA);
    expect(a.descripcion).toBe('Otra descripción');
    expect(a.tiempo_real).toBeCloseTo(1.2345678, 6);
});

test('si la persona sí lo modifica, se aplica el valor nuevo', async () => {
    await editar(actividadVieja, { tiempo_real: 2.5 });
    expect((await actividad(OT_VIEJA)).tiempo_real).toBeCloseTo(2.5, 6);
});

test('fecha_inicio/fecha_fin no enviadas no se modifican; enviadas se guardan en UTC tal cual', async () => {
    await editar(actividadVieja, { fecha_inicio: '2026-10-05 15:00:00', fecha_fin: '2026-10-05 17:30:00' });
    let a = await actividad(OT_VIEJA);
    expect([a.fecha_inicio, a.fecha_fin]).toEqual(['2026-10-05 15:00:00', '2026-10-05 17:30:00']);
    await editar(actividadVieja, { descripcion: 'Sin tocar fechas' });   // no se reenvían
    a = await actividad(OT_VIEJA);
    expect([a.fecha_inicio, a.fecha_fin]).toEqual(['2026-10-05 15:00:00', '2026-10-05 17:30:00']);
});

test('la vista del mecánico incluye la apertura de la OT y ordena de la más vieja a la más nueva', async () => {
    const { status, data } = await get(`/api/actividades/mecanico/${LEGAJO}`, { token });
    expect(status).toBe(200);
    expect(data.map(t => t.ot)).toEqual([OT_VIEJA, OT_NUEVA]);
    expect(data[0].fecha_apertura).toBe('2026-10-01 12:00:00');
});
