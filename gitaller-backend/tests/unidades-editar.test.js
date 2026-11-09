'use strict';
// ─── PARCHE 06: PUT /unidades/:id (corregir patente / cliente / unidad) ───
const { get, post, put, loginAdmin } = require('./helpers/api');

const s = Date.now().toString().slice(-6);
let token;
const crearOT = (ot, patente, cliente = `CLI EDIT ${s}`) =>
    post('/api/ordenes', { ot, cliente, patente, unidad: 'Unidad original', asesor_legajo: 'ADMIN' }, { token });
const unidadDe = async (patente) => (await get(`/api/unidades/${patente}`, { token })).data;

beforeAll(async () => { token = await loginAdmin(); });

test('corregir la patente se propaga a TODAS las OT de la unidad', async () => {
    await crearOT(`71${s}`, `ERR${s}`);
    await crearOT(`72${s}`, `ERR${s}`);
    const u = await unidadDe(`ERR${s}`);

    const r = await put(`/api/unidades/${u.id}`, { patente: `ok ${s}-x`, cliente: u.cliente, unidad: u.unidad }, { token });
    expect(r.status).toBe(200);
    expect(r.data.patente).toBe(`OK${s}X`);            // normalizada: mayúsculas y sin símbolos
    expect(r.data.patente_cambiada).toBe(true);
    expect(r.data.ordenes_de_la_unidad).toBe(2);

    for (const ot of [`71${s}`, `72${s}`]) {
        expect((await get(`/api/ordenes/${ot}`, { token })).data.patente).toBe(`OK${s}X`);
    }
    expect((await get(`/api/unidades/ERR${s}`, { token })).status).toBe(404);   // la vieja ya no existe
});

test('corregir cliente y unidad (el "tipeo"), dejando la patente igual', async () => {
    await crearOT(`73${s}`, `TIP${s}`, `CLIENTE MAL ESCRITO ${s}`);
    const u = await unidadDe(`TIP${s}`);
    const r = await put(`/api/unidades/${u.id}`, { patente: u.patente, cliente: `Cliente Bien ${s}`, unidad: 'Iveco Daily 55', contacto_nombre: 'Ana' }, { token });
    expect(r.status).toBe(200);
    expect(r.data.patente_cambiada).toBe(false);
    const despues = await unidadDe(`TIP${s}`);
    expect(despues.cliente).toBe(`CLIENTE BIEN ${s}`);
    expect(despues.unidad).toBe('Iveco Daily 55');
    expect(despues.contacto_nombre).toBe('Ana');
});

test('si la patente enviada es idéntica a la guardada, no se toca (aunque tenga formato raro)', async () => {
    // dato "viejo" con guion: antes se podía cargar así por la API
    await post('/api/unidades', { patente: `VIE-${s}`, cliente: `CLI VIEJO ${s}`, unidad: 'U' }, { token });
    const u = await unidadDe(`VIE-${s}`);
    const r = await put(`/api/unidades/${u.id}`, { patente: `VIE-${s}`, cliente: u.cliente, unidad: 'U corregida' }, { token });
    expect(r.status).toBe(200);
    expect(r.data.patente).toBe(`VIE-${s}`);
    expect(r.data.patente_cambiada).toBe(false);
});

test('escribir la misma patente con otro formato ("ab-123 cd") normaliza a la misma y no cuenta como cambio', async () => {
    await crearOT(`77${s}`, `FMT${s}`);
    const u = await unidadDe(`FMT${s}`);
    const r = await put(`/api/unidades/${u.id}`, { patente: `fmt-${s.slice(0, 3)} ${s.slice(3)}`, cliente: u.cliente, unidad: u.unidad }, { token });
    expect(r.status).toBe(200);
    expect(r.data.patente).toBe(`FMT${s}`);
    expect(r.data.patente_cambiada).toBe(false);
});

test('patente que ya pertenece a OTRA unidad: 409 con mensaje claro y sin cambios', async () => {
    await crearOT(`74${s}`, `UNO${s}`);
    await crearOT(`75${s}`, `DOS${s}`);
    const dos = await unidadDe(`DOS${s}`);
    const r = await put(`/api/unidades/${dos.id}`, { patente: `UNO${s}`, cliente: dos.cliente, unidad: dos.unidad }, { token });
    expect(r.status).toBe(409);
    expect(r.data.error).toMatch(/Ya existe una unidad con la patente/);
    expect((await get(`/api/ordenes/75${s}`, { token })).data.patente).toBe(`DOS${s}`);   // intacta
});

test('validaciones: cliente/unidad vacíos → 400 (antes era un 500 con error de JavaScript)', async () => {
    await crearOT(`76${s}`, `VAL${s}`);
    const u = await unidadDe(`VAL${s}`);
    for (const body of [{ patente: u.patente, unidad: 'x' }, { patente: u.patente, cliente: '   ', unidad: 'x' }, { patente: u.patente, cliente: 'A' }, { patente: u.patente, cliente: 'A', unidad: '  ' }]) {
        const r = await put(`/api/unidades/${u.id}`, body, { token });
        expect(r.status).toBe(400);
        expect(r.data.error).not.toMatch(/undefined|toUpperCase/);
    }
    const r = await put(`/api/unidades/${u.id}`, { patente: '!!', cliente: 'A', unidad: 'x' }, { token });
    expect(r.status).toBe(400);   // patente que queda vacía/corta tras normalizar
});

test('id inexistente → 404 (antes respondía 200 y creaba un cliente de la nada)', async () => {
    const r = await put('/api/unidades/99999999', { patente: 'ZZZ999', cliente: `FANTASMA ${s}`, unidad: 'x' }, { token });
    expect(r.status).toBe(404);
    const busq = await get(`/api/unidades/clientes/buscar?q=FANTASMA ${s}`, { token });
    expect(busq.data).toEqual([]);
});

test('la unidad interna del sistema INT000 no puede cambiar de patente, pero sí otros datos', async () => {
    const u = await unidadDe('INT000');
    const r = await put(`/api/unidades/${u.id}`, { patente: 'OTRAINT', cliente: u.cliente, unidad: u.unidad }, { token });
    expect(r.status).toBe(400);
    expect((await get('/api/unidades/INT000', { token })).status).toBe(200);   // sigue existiendo

    // ...pero editar otros datos manteniendo la patente sí está permitido
    const ok = await put(`/api/unidades/${u.id}`, { patente: 'INT000', cliente: u.cliente, unidad: u.unidad, contacto_nombre: 'Taller' }, { token });
    expect(ok.status).toBe(200);
    expect(ok.data.patente).toBe('INT000');
});
