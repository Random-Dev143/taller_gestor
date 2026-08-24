'use strict';
// ─── FLUJO DE NEGOCIO: OT + ACTIVIDAD ────────────────────────────────
// Reproduce automáticamente la prueba manual que veníamos haciendo con curl
// durante el refactor: crear OT -> asignar actividad -> operarla -> verificar
// que la OT sincroniza su estado sola y que el tiempo se calcula bien.
// Cubre modules/ordenes + modules/actividades
// + services/ordenes-estado.service.js
// (sincronizarEstadoOT / sincronizarEstadoActividad) todos juntos, de punta a punta.

const { get, post, put, loginAdmin } = require('./helpers/api');

// legajo/OT únicos por corrida para poder re-ejecutar la suite sin chocar
// con datos de una corrida anterior sobre la misma DB de test.
const sufijo = Date.now().toString().slice(-6);
const LEGAJO = `T${sufijo}`;
const OT = `9${sufijo}`;
const PATENTE = `TST${sufijo}`;

let token;
let actividadId;

beforeAll(async () => {
    token = await loginAdmin();
});

test('crear legajo mecánico', async () => {
    const { status, data } = await post('/api/legajos', {
        legajo: LEGAJO, nombre: 'Mecánico de Test', rol: 'mecanico'
    }, { token });
    expect(status).toBe(200);
    expect(data.status).toMatch(/creado/i);
});

test('crear OT nueva queda en "En Espera"', async () => {
    const { status } = await post('/api/ordenes', {
        ot: OT, cliente: 'Cliente de Test', patente: PATENTE,
        unidad: 'Camión de Test', asesor_legajo: 'ADMIN'
    }, { token });
    expect(status).toBe(200);

    const detalle = await get(`/api/ordenes/${OT}`, { token });
    expect(detalle.status).toBe(200);
    expect(detalle.data.estado_actual).toBe('En Espera');
});

test('asignar actividad al equipo crea la tarea en estado "Asignada"', async () => {
    const { status, data } = await post(`/api/actividades/orden/${OT}`, {
        descripcion: 'Tarea de test', tiempo_estimado: 1,
        legajos_mecanicos: [LEGAJO]
    }, { token });
    expect(status).toBe(200);
    expect(data.status).toMatch(/asignada/i);

    const detalle = await get(`/api/ordenes/${OT}`, { token });
    expect(detalle.data.actividades).toHaveLength(1);
    expect(detalle.data.actividades[0].estado).toBe('Asignada');
    actividadId = detalle.data.actividades[0].id;
});

test('poner la actividad "En Curso" sincroniza la OT a "En Proceso"', async () => {
    const { status } = await post(`/api/actividades/${actividadId}/estado`, {
        nuevo_estado: 'En Curso', legajo_mecanico: LEGAJO
    }, { token });
    expect(status).toBe(200);

    const detalle = await get(`/api/ordenes/${OT}`, { token });
    expect(detalle.data.estado_actual).toBe('En Proceso');
    expect(detalle.data.actividades[0].estado).toBe('En Curso');
});

test('finalizar la actividad sincroniza la OT de vuelta a "En Espera" y registra tiempo real', async () => {
    // pequeña espera para que el tiempo_real medido no dé exactamente 0 en el
    // registro crudo de actividades[0].tiempo_real (no redondeado). El agregado
    // de la OT sí redondea a 1 decimal de hora (ver test siguiente, que usa una
    // duración determinística en vez de depender del reloj real).
    await new Promise(r => setTimeout(r, 50));

    const { status } = await post(`/api/actividades/${actividadId}/estado`, {
        nuevo_estado: 'Finalizada', legajo_mecanico: LEGAJO
    }, { token });
    expect(status).toBe(200);

    const detalle = await get(`/api/ordenes/${OT}`, { token });
    expect(detalle.data.estado_actual).toBe('En Espera');
    expect(detalle.data.actividades[0].estado).toBe('Finalizada');
    expect(detalle.data.actividades[0].tiempo_real).toBeGreaterThan(0);
});

test('corregir el tiempo de una sesión recalcula tiempo_empleado_horas de la OT', async () => {
    // ordenes.tiempo_empleado_horas se redondea a 1 decimal de hora
    // (recalcularTiempoEmpleado -> ROUND(..., 1)), así que una duración real
    // de milisegundos siempre da 0.0 ahí — no es un bug, es el redondeo
    // esperado. Para verificar el recálculo de forma determinística, se fuerza
    // una sesión de EXACTAMENTE 2 horas con el endpoint de corrección manual
    // (el mismo que usaría un Jefe para arreglar un olvido de pausa).
    const detalleAntes = await get(`/api/ordenes/${OT}`, { token });
    const tiempoId = detalleAntes.data.tiempos_actividad[0].id;

    const fin = new Date();
    const inicio = new Date(fin.getTime() - 2 * 3600000); // 2 horas antes
    const fmt = (d) => d.toISOString().replace('T', ' ').substring(0, 19);

    const { status } = await put(`/api/actividades/tiempos/${tiempoId}`, {
        inicio: fmt(inicio), fin: fmt(fin)
    }, { token });
    expect(status).toBe(200);

    const detalle = await get(`/api/ordenes/${OT}`, { token });
    expect(detalle.data.actividades[0].tiempo_real).toBeCloseTo(2, 1);
    // Antes del fix en modules/actividades/actividades.service.js (cambiarEstadoMiembro),
    // este valor podía quedar en 0 aun con horas reales cargadas, porque el
    // endpoint de play/pausa/finalizar nunca llamaba a recalcularTiempoEmpleado.
    // corregirTiempo() sí lo llamaba desde siempre; este test fija el escenario
    // determinístico para blindar el flujo completo.
    expect(detalle.data.tiempo_empleado_horas).toBeCloseTo(2, 1);
});

test('rechaza un mecánico que no pertenece al equipo de la actividad', async () => {
    const { status, data } = await post(`/api/actividades/${actividadId}/estado`, {
        nuevo_estado: 'En Curso', legajo_mecanico: 'LEGAJO-INEXISTENTE'
    }, { token });
    expect(status).toBeGreaterThanOrEqual(400);
    expect(JSON.stringify(data)).toMatch(/no forma parte del equipo/i);
});

test('la OT creada aparece en el listado paginado', async () => {
    const { status, data } = await get(`/api/ordenes?busqueda=${OT}&limit=5`, { token });
    expect(status).toBe(200);
    expect(data.data.some(o => o.ot === OT)).toBe(true);
});

test('el historial por patente incluye la OT creada', async () => {
    const { status, data } = await get(`/api/ordenes/historial/${PATENTE}`, { token });
    expect(status).toBe(200);
    expect(data.some(o => o.ot === OT)).toBe(true);
});
