'use strict';
// ─── PARCHE 08: panel de garantías (reclamos) ────────────────────────
const { get, post, put, loginAdmin } = require('./helpers/api');

const s = Date.now().toString().slice(-5);
let admin, sinPermiso;
const otDe = (n) => `8${String(n).padStart(2, '0')}${s}`;          // 8NNxxxxx
const hoyMenos = (d) => { const x = new Date(); x.setDate(x.getDate() - d); return x.toISOString().slice(0, 10); };

async function crearGarantia(ot, { garantia = true, finalizar = true, diasAtras = 0, cliente = `CLI GAR ${s}`, patente } = {}) {
    await post('/api/ordenes', { ot, cliente, patente: patente || `G${ot}`, unidad: 'U', asesor_legajo: 'ADMIN', es_garantia: garantia }, { token: admin });
    if (finalizar) {
        await put(`/api/ordenes/${ot}/estado`, { estado: 'Finalizada' }, { token: admin });
        await put(`/api/ordenes/${ot}`, { fecha_cierre: `${hoyMenos(diasAtras)} 15:00:00` }, { token: admin });
    }
}
const listar = async (qs = '') => (await get(`/api/ordenes/garantias/reclamos${qs}`, { token: admin })).data;
const guardar = (ot, body, token = admin) => put(`/api/ordenes/garantias/reclamos/${ot}`, body, { token });
const fila = async (ot) => (await listar(`?busqueda=${ot}`)).data.find(f => f.ot === ot);

async function loginSinPermiso() {
    const nombre = `Rol Solo Ver ${s}`;
    await post('/api/roles', { nombre, permisos: ['ot_ver_lista'] }, { token: admin });
    const rol = (await get('/api/roles', { token: admin })).data.find(r => r.nombre === nombre);
    const email = `ver${s}@test.com`;
    await post('/api/usuarios', { email, password: 'clave1234', nombre_completo: 'Solo Ver', rol: 'asesor' }, { token: admin });
    const usr = (await get('/api/usuarios', { token: admin })).data.find(u => u.email === email);
    await put(`/api/usuarios/${usr.id}`, { estado: 'aprobado', rol_id: rol.id }, { token: admin });
    const r = await post('/api/auth/login', { email, password: 'clave1234' });
    expect(r.status).toBe(200);
    return r.data.token;
}

beforeAll(async () => {
    admin = await loginAdmin();
    // 32 garantías finalizadas: la n° 1 es la MÁS VIEJA (200 días), la 32 la más nueva
    for (let i = 1; i <= 32; i++) await crearGarantia(otDe(i), { diasAtras: i === 1 ? 200 : 33 - i });
    // distractores: garantía sin finalizar, y finalizada que NO es garantía
    await crearGarantia(otDe(40), { finalizar: false });
    await crearGarantia(otDe(41), { garantia: false });
    sinPermiso = await loginSinPermiso();
});

describe('listado', () => {
    test('solo OT de garantía FINALIZADAS (ni activas ni no-garantía)', async () => {
        const { data } = await listar('?busqueda=' + s);
        const ots = data.map(f => f.ot);
        expect(ots).not.toContain(otDe(40));
        expect(ots).not.toContain(otDe(41));
        expect(ots).toContain(otDe(2));
    });

    test('sin búsqueda trae las últimas 30, de más nueva a más vieja', async () => {
        const r = await listar();
        expect(r.limite).toBe(30);
        expect(r.data.length).toBeLessThanOrEqual(30);
        expect(r.total).toBeGreaterThanOrEqual(32);
        const ots = r.data.map(f => f.ot);
        expect(ots[0]).toBe(otDe(32));                 // la más nueva primero
        expect(ots).not.toContain(otDe(1));            // la de 200 días queda fuera de las 30
        const cierres = r.data.map(f => f.fecha_cierre);
        expect([...cierres].sort().reverse()).toEqual(cierres);
    });

    test('buscando por número de OT se encuentra aunque no esté entre las últimas 30', async () => {
        const r = await listar(`?busqueda=${otDe(1)}`);
        expect(r.data.map(f => f.ot)).toEqual([otDe(1)]);
    });

    test('la búsqueda también funciona por patente y por proforma', async () => {
        await guardar(otDe(5), { numero_proforma: `PF-BUSCAME-${s}` });
        expect((await listar(`?busqueda=G${otDe(7)}`)).data.map(f => f.ot)).toEqual([otDe(7)]);          // patente
        expect((await listar(`?busqueda=BUSCAME-${s}`)).data.map(f => f.ot)).toEqual([otDe(5)]);          // proforma
    });

    test('los comodines % y _ se buscan como texto literal (no devuelven todo)', async () => {
        expect((await listar('?busqueda=%25')).total).toBe(0);
        expect((await listar('?busqueda=_')).total).toBe(0);
    });

    test('una OT sin reclamo cargado viene con los campos en null', async () => {
        const f = await fila(otDe(3));
        expect(f).toMatchObject({ fecha_reclamo: null, monto_solicitado: null, monto_pagado: null, numero_proforma: null });
    });
});

describe('guardar reclamo', () => {
    test('alta completa y lectura en el listado', async () => {
        const r = await guardar(otDe(10), { fecha_reclamo: '2026-10-15', monto_solicitado: 150000.5, monto_pagado: 120000, numero_proforma: ' PF-2026-77 ' });
        expect(r.status).toBe(200);
        expect(r.data).toMatchObject({ fecha_reclamo: '2026-10-15', monto_solicitado: 150000.5, monto_pagado: 120000, numero_proforma: 'PF-2026-77' });
        expect(await fila(otDe(10))).toMatchObject({ fecha_reclamo: '2026-10-15', monto_solicitado: 150000.5, monto_pagado: 120000, numero_proforma: 'PF-2026-77' });
    });

    test('actualización parcial: lo que no se envía se conserva; vacío/null lo borra', async () => {
        await guardar(otDe(11), { fecha_reclamo: '2026-09-01', monto_solicitado: 1000, numero_proforma: 'A1' });
        await guardar(otDe(11), { monto_pagado: 800 });                            // solo suma el pagado
        expect(await fila(otDe(11))).toMatchObject({ fecha_reclamo: '2026-09-01', monto_solicitado: 1000, monto_pagado: 800, numero_proforma: 'A1' });
        await guardar(otDe(11), { fecha_reclamo: '', monto_pagado: null });         // borra esos dos
        expect(await fila(otDe(11))).toMatchObject({ fecha_reclamo: null, monto_solicitado: 1000, monto_pagado: null, numero_proforma: 'A1' });
    });

    test('acepta montos como texto con coma decimal y redondea a 2 decimales', async () => {
        await guardar(otDe(12), { monto_solicitado: '1234,567', monto_pagado: '0' });
        expect(await fila(otDe(12))).toMatchObject({ monto_solicitado: 1234.57, monto_pagado: 0 });
    });

    test('validaciones: fecha inválida, montos negativos/no numéricos, proforma larga → 400', async () => {
        const casos = [
            { fecha_reclamo: '2026-02-30' }, { fecha_reclamo: 'ayer' }, { fecha_reclamo: '15/10/2026' },
            { monto_solicitado: -5 }, { monto_pagado: 'abc' }, { monto_solicitado: 'Infinity' },
            { numero_proforma: 'X'.repeat(61) }
        ];
        for (const c of casos) {
            const r = await guardar(otDe(13), c);
            expect([c, r.status]).toEqual([c, 400]);
        }
        expect(await fila(otDe(13))).toMatchObject({ fecha_reclamo: null, monto_solicitado: null });   // nada se guardó
    });

    test('OT inexistente → 404; OT que no es garantía → 400', async () => {
        expect((await guardar('99999999', { monto_pagado: 1 })).status).toBe(404);
        const r = await guardar(otDe(41), { monto_pagado: 1 });
        expect(r.status).toBe(400);
        expect(r.data.error).toMatch(/garantía/);
    });

    test('un usuario SIN ot_editar no puede cargar reclamos (403) pero sí ver el listado', async () => {
        const r = await guardar(otDe(14), { monto_pagado: 999 }, sinPermiso);
        expect(r.status).toBe(403);
        expect(await fila(otDe(14))).toMatchObject({ monto_pagado: null });
        const ver = await get('/api/ordenes/garantias/reclamos', { token: sinPermiso });
        expect(ver.status).toBe(200);
    });

    test('no interfiere con el listado normal de OT ni con el filtro de garantía (parche 02)', async () => {
        const { status, data } = await get(`/api/ordenes?estado=finalizadas&garantia=1&busqueda=${otDe(10)}`, { token: admin });
        expect(status).toBe(200);
        expect(data.data.map(o => o.ot)).toEqual([otDe(10)]);
        expect((await get(`/api/ordenes/${otDe(10)}`, { token: admin })).status).toBe(200);
    });
});
