'use strict';
// Planilla NPS: se genera el Excel por la API y se lee de vuelta para verificar formato y reglas.
const ExcelJS = require('exceljs');
const { get, post, put, loginAdmin, baseURL } = require('./helpers/api');
const { tituloPeriodo } = require('../services/nps-periodos');

const sufijo = Date.now().toString().slice(-6);
const OT = { iveco: `81${sufijo}`, ivecoSinChasis: `82${sufijo}`, otraMarca: `83${sufijo}`, interna: `84${sufijo}`, anulada: `85${sufijo}`, otros: `86${sufijo}`, abierta: `87${sufijo}` };
let token, wb, ws;

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const hoy = new Date();
const desde = iso(new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - 1));
const hasta = iso(new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + 1));
const cierre = new Date().toISOString();

const fila = (ot) => {
    for (let r = 2; r <= ws.rowCount; r++) if (String(ws.getCell(`A${r}`).value) === String(ot)) return r;
    throw new Error(`OT ${ot} no está en la planilla`);
};
const relleno = (celda) => (celda.fill && celda.fill.fgColor && celda.fill.fgColor.argb) || null;

async function crearOt({ ot, cliente, patente, unidad = 'Iveco LIGEROS, DAILY', garantia = false, noIveco = false, chasis, cuit, telefono, correo, cerrar = true }) {
    await post('/api/unidades', { patente, cliente, unidad, telefono, correo, chasis, cuit, contacto_nombre: telefono ? 'SR. PRUEBA' : '' }, { token });
    let r = await post('/api/ordenes', { ot, cliente, patente, unidad, asesor_legajo: 'ADMIN', es_garantia: garantia, es_no_iveco: noIveco }, { token });
    expect(r.status).toBe(200);
    if (cerrar) { r = await put(`/api/ordenes/${ot}`, { fecha_cierre: cierre }, { token }); expect(r.status).toBe(200); }
}

beforeAll(async () => {
    token = await loginAdmin();
    await crearOt({ ot: OT.iveco, cliente: `CLI NPS ${sufijo}`, patente: `NP1${sufijo}`, chasis: '8ATA01PF0TX135202', cuit: '30-71234567-8', telefono: '02664-111111', correo: 'x@y.com' });
    await crearOt({ ot: OT.ivecoSinChasis, cliente: `SIN DATOS NPS ${sufijo}`, patente: `NP2${sufijo}` });
    await crearOt({ ot: OT.otraMarca, cliente: `CLI NPS ${sufijo}`, patente: `NP3${sufijo}`, unidad: 'Javal AUTOS, H6', noIveco: true, garantia: true });
    await crearOt({ ot: OT.interna, cliente: `IVEMAR NPS ${sufijo}`, patente: `NP4${sufijo}` });
    await crearOt({ ot: OT.anulada, cliente: `CLI NPS ${sufijo}`, patente: `NP5${sufijo}` });
    await crearOt({ ot: OT.otros, cliente: `CLI NPS ${sufijo}`, patente: `NP6${sufijo}` });
    await crearOt({ ot: OT.abierta, cliente: `CLI NPS ${sufijo}`, patente: `NP7${sufijo}`, cerrar: false });

    // Anular (jefe con permiso) y motivo manual "Otros"
    expect((await post(`/api/ordenes/${OT.anulada}/anular`, { motivo: 'Cargada por error' }, { token })).status).toBe(200);
    expect((await put(`/api/ordenes/${OT.otros}`, { motivo_descarte_manual: 'Otros' }, { token })).status).toBe(200);

    const res = await fetch(`${baseURL()}/api/reporte-nps/xlsx?desde=${desde}&hasta=${hasta}`, { headers: { Authorization: `Bearer ${token}` } });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('spreadsheetml');
    wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(await res.arrayBuffer()));
    ws = wb.worksheets[0];
});

test('el nombre de la pestaña es "Mes + desde al hasta" y se conserva Hoja1', () => {
    expect(ws.name).toBe(tituloPeriodo(desde, hasta));
    expect(wb.worksheets.map(w => w.name)).toContain('Hoja1');
});

test('encabezados idénticos a la planilla original (incluye Celular)', () => {
    expect(ws.getRow(1).values.slice(1, 18)).toEqual(['Orden', 'Concesionario', 'Sede', 'Nombre', 'IDCliente', 'NPS', 'Contacto',
        'Telefono', 'Celular', 'Mail', 'Modelo', 'Patente', 'Chasis', 'Garantia', 'Mes', 'MotivoDescarte', 'Observaciones']);
});

test('Concesionario/Sede salen de la configuración (7 y 20 por defecto) y Mes es el 1° del mes de apertura', () => {
    const r = fila(OT.iveco);
    expect(ws.getCell(`B${r}`).value).toBe(7);
    expect(ws.getCell(`C${r}`).value).toBe(20);
    const mes = ws.getCell(`O${r}`).value;
    expect(mes.getUTCDate()).toBe(1);
    expect(ws.getCell(`O${r}`).numFmt).toBe('mmm-yy');
});

test('datos conocidos se completan sin pintar; Celular siempre vacío y sin pintar', () => {
    const r = fila(OT.iveco);
    expect(ws.getCell(`E${r}`).value).toBe('30-71234567-8');
    expect(ws.getCell(`M${r}`).value).toBe('8ATA01PF0TX135202');
    expect(ws.getCell(`H${r}`).value).toBe('02664-111111');
    expect(relleno(ws.getCell(`E${r}`))).toBeNull();
    expect(ws.getCell(`I${r}`).value).toBeNull();
    expect(relleno(ws.getCell(`I${r}`))).toBeNull();
});

test('dato desconocido => celda vacía pintada de amarillo', () => {
    const r = fila(OT.ivecoSinChasis);
    for (const col of ['E', 'G', 'H', 'J']) {            // CUIT, contacto, teléfono, mail
        expect(ws.getCell(`${col}${r}`).value).toBeNull();
        expect(relleno(ws.getCell(`${col}${r}`))).toBe('FFFFFF00');
    }
});

test('Iveco sin chasis => celda de chasis roja y vacía', () => {
    const r = fila(OT.ivecoSinChasis);
    expect(ws.getCell(`M${r}`).value).toBeNull();
    expect(relleno(ws.getCell(`M${r}`))).toBe('FFFF0000');
});

test('otra marca sin chasis => X111111 sin pintar', () => {
    const r = fila(OT.otraMarca);
    expect(ws.getCell(`M${r}`).value).toBe('X111111');
    expect(relleno(ws.getCell(`M${r}`))).toBeNull();
    expect(ws.getCell(`N${r}`).value).toBe('SI');
});

test('motivos de descarte calculados', () => {
    const motivo = (ot) => ws.getCell(`P${fila(ot)}`).value;
    expect(motivo(OT.otraMarca)).toBe('Otra marca');
    expect(motivo(OT.interna)).toBe('Interna');
    expect(motivo(OT.anulada)).toBe('Anulada');
    expect(motivo(OT.otros)).toBe('Otros');
    expect(motivo(OT.abierta)).toBe('Abierta');
    expect(motivo(OT.iveco)).toBeNull();
});

test('MotivoDescarte solo admite la lista del desplegable (S2:S11) y NPS lleva semáforo', () => {
    const r = fila(OT.iveco);
    const dv = ws.getCell(`P${r}`).dataValidation;
    expect(dv.type).toBe('list');
    expect(dv.formulae).toEqual(['$S$2:$S$11']);
    expect(dv.showErrorMessage).toBe(true);
    expect(ws.getCell('S2').value).toBe('Abierta');
    expect(ws.getCell('S11').value).toBe('Otros');
    const cf = ws.conditionalFormattings.find(c => c.ref.startsWith('F2'));
    expect(cf.rules[0].type).toBe('iconSet');
});

test('filas ordenadas por número de OT', () => {
    const ots = [];
    for (let r = 2; r <= ws.rowCount; r++) { const v = ws.getCell(`A${r}`).value; if (v != null) ots.push(Number(v)); }
    expect(ots).toEqual([...ots].sort((a, b) => a - b));
});

test('fechas inválidas o invertidas responden 400, sin token 401', async () => {
    expect((await get('/api/reporte-nps/xlsx?desde=hola&hasta=2026-10-15', { token })).status).toBe(400);
    expect((await get('/api/reporte-nps/xlsx?desde=2026-10-15&hasta=2026-10-01', { token })).status).toBe(400);
    expect((await get(`/api/reporte-nps/xlsx?desde=${desde}&hasta=${hasta}`)).status).toBe(401);
});

test('anular: no se puede anular dos veces, y reactivar la deja normal', async () => {
    expect((await post(`/api/ordenes/${OT.anulada}/anular`, { motivo: 'x' }, { token })).status).toBe(409);
    expect((await post(`/api/ordenes/${OT.anulada}/reactivar`, {}, { token })).status).toBe(200);
    const { data } = await get(`/api/ordenes/${OT.anulada}`, { token });
    expect(data.anulada).toBe(0);
    expect((await post('/api/ordenes/0000/anular', {}, { token })).status).toBe(400);
});

test('títulos de período', () => {
    expect(tituloPeriodo('2026-10-01', '2026-10-15')).toBe('Octubre 1ro al 15');
    expect(tituloPeriodo('2026-10-16', '2026-10-31')).toBe('Octubre 16 al 31');
    expect(tituloPeriodo('2026-10-28', '2026-11-05')).toBe('Octubre 28 al Noviembre 5');
});
