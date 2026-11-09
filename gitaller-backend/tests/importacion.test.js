'use strict';
// Importación de clientes/unidades desde planillas de NPS (con aprobación de cambios).
const ExcelJS = require('exceljs');
const { get, post, put, loginAdmin, baseURL } = require('./helpers/api');

const suf = Date.now().toString().slice(-6);
const P = { A: `PA${suf}`, B: `PB${suf}`, C: `PC${suf}`, D: `PD${suf}`, X: `PX${suf}`, N: `PN${suf}` };
const OT = { A: `71${suf}`, B: `72${suf}`, C: `73${suf}`, D: `74${suf}` };
const MODELO = 'Iveco LIGEROS, DAILY';
let token;

const ENCAB = ['Orden', 'Concesionario', 'Sede', 'Nombre', 'IDCliente', 'NPS', 'Contacto', 'Telefono', 'Celular', 'Mail', 'Modelo', 'Patente', 'Chasis', 'Garantia', 'Mes', 'MotivoDescarte', 'Observaciones'];
const NA = { error: '#N/A' };

async function planilla(nombreHoja, mes, filas) {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(nombreHoja);
    ws.addRow(ENCAB);
    for (const f of filas) {
        ws.addRow([f.ot ? Number(f.ot) : null, 7, 20, f.nombre, f.cuit ?? NA, null, f.contacto ?? NA, f.tel ?? NA, null, f.mail ?? NA,
            f.modelo ?? MODELO, f.patente, f.chasis ?? 'X111111', 'NO', mes, null, null]);
    }
    wb.addWorksheet('Hoja1').addRow(['terceros']);
    return Buffer.from(await wb.xlsx.writeBuffer());
}

async function subir(archivos, tk = token) {
    const fd = new FormData();
    for (const [nombre, buf] of archivos) fd.append('archivos', new Blob([buf]), nombre);
    const res = await fetch(`${baseURL()}/api/importacion/analizar`, { method: 'POST', headers: tk ? { Authorization: `Bearer ${tk}` } : {}, body: fd });
    return { status: res.status, data: await res.json() };
}

const items = async (id, qs = '') => (await get(`/api/importacion/${id}/items?limit=200${qs}`, { token })).data.data;
const unidad = async (patente) => (await get(`/api/unidades/${patente}`, { token })).data;

async function crearOt(ot, cliente, patente, extra = {}) {
    await post('/api/unidades', { patente, cliente, unidad: MODELO, ...extra }, { token });
    const r = await post('/api/ordenes', { ot, cliente, patente, unidad: MODELO, asesor_legajo: 'ADMIN' }, { token });
    expect(r.status).toBe(200);
}

let archivos, importacionId;

beforeAll(async () => {
    token = await loginAdmin();
    await crearOt(OT.A, `CLIENTE UNO ${suf}`, P.A);
    await crearOt(OT.B, `CLIENTE DOS ${suf}`, P.B, { telefono: '02664-000000' });
    await crearOt(OT.C, `CLIENTE TRES ${suf}`, P.C);
    await crearOt(OT.D, `CLIENTE CUATRO ${suf}`, P.D);

    const agosto = new Date(Date.UTC(2026, 7, 1)), septiembre = new Date(Date.UTC(2026, 8, 1));
    archivos = [
        // el archivo más nuevo se pasa primero a propósito: el orden lo decide la columna Mes
        ['septiembre.xlsx', await planilla('SEPT', septiembre, [
            { patente: P.A, nombre: `CLIENTE UNO ${suf}`, tel: '02664-333333' }
        ])],
        ['agosto.xlsx', await planilla('AGO', agosto, [
            { ot: OT.A, patente: P.A, nombre: `CLIENTE UNO ${suf}`, cuit: '30-71111111-1', contacto: 'SR. UNO', tel: '02664-111111', mail: 'UNO@X.COM', chasis: '8ATA01PF0TX135202' },
            { ot: OT.B, patente: P.B, nombre: `CLIENTE DOS ${suf}`, tel: '02664-222222' },
            { ot: OT.C, patente: P.C, nombre: `OTRO NOMBRE ${suf}`, cuit: '30-70000001-9' },
            { ot: OT.D, patente: P.X, nombre: `CLIENTE CUATRO ${suf}` },
            { patente: P.N, nombre: `CLIENTE NUEVO ${suf}`, cuit: '33-70000002-9', contacto: 'SRA. NUEVA', tel: '02664-444444', mail: 'nueva@x.com', chasis: '93ZC135AZS8509875' }
        ])]
    ];
});

describe('análisis (nada se escribe todavía)', () => {
    let resumen;
    test('lee las planillas, ordena por Mes y detecta los cambios', async () => {
        const r = await subir(archivos);
        expect(r.status).toBe(200);
        importacionId = r.data.id; resumen = r.data.resumen;
        expect(resumen.archivos.map(a => a.nombre).sort()).toEqual(['agosto.xlsx', 'septiembre.xlsx']);
        expect(resumen.items).toEqual({ completar: 5, alta: 1, conflicto: 1, cliente_distinto: 1 });
    });
    test('pasada 1: si la OT existe con otra patente, la fila se omite y se avisa', () => {
        const adv = resumen.advertencias.find(a => a.tipo === 'patente_distinta');
        expect(adv.ot).toBe(OT.D);
        expect(resumen.filas_por_ot).toBe(3);       // A, B y C (la D se omite)
        expect(resumen.filas_por_patente).toBe(2);  // N (sin OT) y la fila de septiembre de A (sin OT)
    });
    test('el dato más reciente gana (teléfono de septiembre), y #N/A / X111111 no generan cambios', async () => {
        const tel = (await items(importacionId, '&tipo=completar')).find(i => i.ref === P.A && i.campo === 'telefono');
        expect(tel.valor_propuesto).toBe('02664-333333');
        const todos = await items(importacionId);
        expect(todos.some(i => i.ref === P.B && i.campo === 'chasis')).toBe(false);
        expect(todos.some(i => i.ref === P.B && i.campo === 'correo')).toBe(false);
    });
    test('no modificó la base', async () => {
        expect((await unidad(P.A)).chasis).toBe('');
        expect(await get(`/api/unidades/${P.N}`, { token }).then(r => r.status)).toBe(404);
    });
});

describe('aprobación', () => {
    test('aprobar completados y altas aplica 6 cambios', async () => {
        const r = await post(`/api/importacion/${importacionId}/aprobar-automaticos`, {}, { token });
        expect(r.status).toBe(200);
        expect(r.data).toMatchObject({ aplicado: 6, omitido: 0, error: 0, cerrada: false });
        const a = await unidad(P.A);
        expect(a.chasis).toBe('8ATA01PF0TX135202');
        expect(a.cliente_cuit).toBe('30-71111111-1');
        expect(a.telefono).toBe('02664-333333');
        expect(a.correo).toBe('uno@x.com');
        const n = await unidad(P.N);
        expect(n.cliente).toBe(`CLIENTE NUEVO ${suf}`);
        expect(n.cliente_cuit).toBe('33-70000002-9');
        expect(n.chasis).toBe('93ZC135AZS8509875');
    });
    test('un conflicto se resuelve editando el valor final y aprobando', async () => {
        const c = (await items(importacionId, '&tipo=conflicto'))[0];
        expect(c).toMatchObject({ ref: P.B, campo: 'telefono', valor_actual: '02664-000000', valor_propuesto: '02664-222222' });
        const r = await post(`/api/importacion/items/${c.id}/resolver`, { accion: 'aprobar', valor: '02664-999999' }, { token });
        expect(r.status).toBe(200);
        expect((await unidad(P.B)).telefono).toBe('02664-999999');
        expect((await post(`/api/importacion/items/${c.id}/resolver`, { accion: 'aprobar' }, { token })).status).toBe(409);
    });
    test('valor inválido en un conflicto se rechaza con 400 y no cambia nada', async () => {
        const reimp = await subir([archivos[1]]);               // vuelve a proponer el teléfono de B
        const c = (await items(reimp.data.id, '&tipo=conflicto')).find(i => i.ref === P.B);
        const r = await post(`/api/importacion/items/${c.id}/resolver`, { accion: 'aprobar', valor: 'abc' }, { token });
        expect(r.status).toBe(400);
        expect((await unidad(P.B)).telefono).toBe('02664-999999');
        await post(`/api/importacion/items/${c.id}/resolver`, { accion: 'rechazar' }, { token });
        await post(`/api/importacion/${reimp.data.id}/cancelar`, {}, { token });
    });
    test('cliente distinto: al aprobar se corrige el cliente de la unidad y sus OT lo siguen', async () => {
        const c = (await items(importacionId, '&tipo=cliente_distinto'))[0];
        expect(c).toMatchObject({ ref: P.C, valor_actual: `CLIENTE TRES ${suf}`, valor_propuesto: `OTRO NOMBRE ${suf}` });
        const r = await post(`/api/importacion/items/${c.id}/resolver`, { accion: 'aprobar' }, { token });
        expect(r.status).toBe(200);
        const u = await unidad(P.C);
        expect(u.cliente).toBe(`OTRO NOMBRE ${suf}`);
        expect(u.cliente_cuit).toBe('30-70000001-9');
        const { data: ot } = await get(`/api/ordenes/${OT.C}`, { token });
        expect(ot.cliente).toBe(`OTRO NOMBRE ${suf}`);
    });
    test('al resolver todo, la importación se cierra', async () => {
        const { data } = await get(`/api/importacion/${importacionId}`, { token });
        expect(data.estado).toBe('cerrada');
    });
});

describe('reimportar es idempotente', () => {
    test('las mismas planillas ya no proponen completar/alta/cliente (solo el conflicto editado)', async () => {
        const r = await subir(archivos);
        expect(r.data.resumen.items).toEqual({ completar: 0, alta: 0, conflicto: 1, cliente_distinto: 0 });
        const cancel = await post(`/api/importacion/${r.data.id}/cancelar`, {}, { token });
        expect(cancel.status).toBe(200);
        expect((await get(`/api/importacion/${r.data.id}`, { token })).data.estado).toBe('cancelada');
    });
});

describe('validaciones y permisos', () => {
    test('sin token 401; archivo que no es .xlsx 400; planilla sin columnas esperadas informa el error', async () => {
        expect((await subir(archivos, null)).status).toBe(401);
        const fd = new FormData();
        fd.append('archivos', new Blob(['hola']), 'datos.csv');
        const r1 = await fetch(`${baseURL()}/api/importacion/analizar`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd });
        expect(r1.status).toBe(400);
        const wb = new ExcelJS.Workbook(); wb.addWorksheet('X').addRow(['a', 'b']);
        const r2 = await subir([['vacia.xlsx', Buffer.from(await wb.xlsx.writeBuffer())]]);
        expect(r2.status).toBe(400);
    });
});
