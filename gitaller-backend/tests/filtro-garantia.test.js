'use strict';
// ─── PARCHE 02: filtro de garantía en GET /ordenes ───────────────────
const { get, post, loginAdmin } = require('./helpers/api');

const sufijo = Date.now().toString().slice(-6);
const OT_G = `7${sufijo}`;
const OT_N = `6${sufijo}`;
let token;

beforeAll(async () => {
    token = await loginAdmin();
    await post('/api/ordenes', { ot: OT_G, cliente: 'Cli Garantia', patente: `GAR${sufijo}`, unidad: 'U', asesor_legajo: 'ADMIN', es_garantia: true }, { token });
    await post('/api/ordenes', { ot: OT_N, cliente: 'Cli Garantia', patente: `NOG${sufijo}`, unidad: 'U', asesor_legajo: 'ADMIN', es_garantia: false }, { token });
});

const otsDe = async (qs) => {
    const { status, data } = await get(`/api/ordenes?busqueda=Cli%20Garantia&limit=100${qs}`, { token });
    expect(status).toBe(200);
    return data.data.map(o => o.ot);
};

test('garantia=1 trae solo las OT que son garantía', async () => {
    const ots = await otsDe('&garantia=1');
    expect(ots).toContain(OT_G);
    expect(ots).not.toContain(OT_N);
});

test('garantia=0 trae solo las OT que NO son garantía', async () => {
    const ots = await otsDe('&garantia=0');
    expect(ots).toContain(OT_N);
    expect(ots).not.toContain(OT_G);
});

test('sin parámetro, o con valor vacío/inválido, trae todas (sin romper)', async () => {
    for (const qs of ['', '&garantia=', '&garantia=todas']) {
        const ots = await otsDe(qs);
        expect(ots).toContain(OT_G);
        expect(ots).toContain(OT_N);
    }
});

test('combina con estado=finalizadas y facturacion sin error', async () => {
    const { status } = await get('/api/ordenes?estado=finalizadas&garantia=1&facturacion=pendientes', { token });
    expect(status).toBe(200);
});
