'use strict';
// Interacción entre la edición de unidades (corregir patente, parche 06) y los
// campos nuevos CUIT/chasis (carga de clientes / planilla NPS).
const { get, post, put, loginAdmin } = require('./helpers/api');

const suf = Date.now().toString().slice(-6);
let token, id;
const patente = `CC${suf}`;
const base = { cliente: `CLIENTE CC ${suf}`, unidad: 'Iveco LIGEROS, DAILY' };
const unidad = async (p) => (await get(`/api/unidades/${p}`, { token })).data;

beforeAll(async () => {
    token = await loginAdmin();
    const r = await post('/api/unidades', { patente, ...base, chasis: '8ATA01PF0TX135202', cuit: '30-71234567-8' }, { token });
    expect(r.status).toBe(200);
    id = (await unidad(patente)).id;
});

test('el alta guarda CUIT (en el cliente) y chasis (en la unidad)', async () => {
    const u = await unidad(patente);
    expect(u.cliente_cuit).toBe('30-71234567-8');
    expect(u.chasis).toBe('8ATA01PF0TX135202');
});

test('editar sin enviar chasis/CUIT NO los borra (clientes viejos de la app)', async () => {
    const r = await put(`/api/unidades/${id}`, { ...base, telefono: '02664-123456' }, { token });
    expect(r.status).toBe(200);
    const u = await unidad(patente);
    expect(u.telefono).toBe('02664-123456');
    expect(u.chasis).toBe('8ATA01PF0TX135202');
    expect(u.cliente_cuit).toBe('30-71234567-8');
});

test('corregir la patente y a la vez el chasis/CUIT funciona y la patente se propaga', async () => {
    const nueva = `CD${suf}`;
    const r = await put(`/api/unidades/${id}`, { ...base, patente: nueva, chasis: ' 93zc135azs8509875 ', cuit: '30-71234567-8' }, { token });
    expect(r.status).toBe(200);
    expect(r.data.patente).toBe(nueva);
    expect(r.data.patente_cambiada).toBe(true);
    const u = await unidad(nueva);
    expect(u.chasis).toBe('93ZC135AZS8509875');     // mayúsculas y sin espacios
    expect(u.cliente_cuit).toBe('30-71234567-8');
});

test('CUIT inválido se rechaza con 400 y no cambia nada (ni la patente)', async () => {
    const actual = await unidad(`CD${suf}`);
    const r = await put(`/api/unidades/${id}`, { ...base, patente: `CE${suf}`, cuit: '123' }, { token });
    expect(r.status).toBe(400);
    expect((await unidad(actual.patente)).patente).toBe(actual.patente);
});

test('"X111111" se guarda como chasis vacío y CUIT vacío lo borra', async () => {
    const r = await put(`/api/unidades/${id}`, { ...base, chasis: 'x111111', cuit: '' }, { token });
    expect(r.status).toBe(200);
    const u = await unidad(`CD${suf}`);
    expect(u.chasis).toBe('');
    expect(u.cliente_cuit).toBe('');
});
