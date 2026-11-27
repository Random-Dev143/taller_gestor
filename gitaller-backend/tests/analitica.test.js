'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { get, post, put, loginAdmin, baseURL } = require('./helpers/api');

const sufijo = 'A' + Date.now().toString().slice(-6);
const OT = `8${Date.now().toString().slice(-7)}`;
let token;

const enDias = (n, h = 12) => { const d = new Date(); d.setDate(d.getDate() + n); d.setHours(h, 0, 0, 0); return d.toISOString(); };
const hoyLocal = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const turno = (extra = {}) => ({ fecha_hora: enDias(5), cliente: `Cliente ${sufijo}`, patente: `AN${sufijo}`, unidad: 'Iveco PESADOS, CURSOR 450E33', horas_estimadas: 3, ...extra });
const RANGO = () => `desde=${hoyLocal()}&hasta=${hoyLocal()}`;

beforeAll(async () => { token = await loginAdmin(); });

describe('analítica: panel de inicio', () => {
    test('devuelve KPIs del taller, de los turnos de hoy y los pendientes', async () => {
        const { status, data } = await get('/api/analitica/panel', { token });
        expect(status).toBe(200);
        expect(data.taller).toEqual(expect.objectContaining({ en_taller: expect.any(Number), estancadas: expect.any(Number), listas_para_controlar: expect.any(Number) }));
        expect(data.turnos_hoy).toEqual(expect.objectContaining({ total: expect.any(Number), horas_disponibles: expect.any(Number) }));
        expect(data.pendientes).toEqual(expect.objectContaining({ turnos_confirmados_sin_ot: expect.any(Number), presupuestos_sin_respuesta: expect.any(Number), falta_facturar: expect.any(Number) }));
        expect(data.atencion.turnos_confirmados.length).toBeLessThanOrEqual(5);
    });

    test('el administrador ve el resumen del mes (misma fuente que Informes)', async () => {
        const { data } = await get('/api/analitica/panel', { token });
        expect(data.mes).not.toBeNull();
        expect(data.mes).toEqual(expect.objectContaining({ finalizadas: expect.any(Number), facturado: expect.any(Number) }));
        expect(data.mes.anterior).toBeDefined();
    });

    test('un turno confirmado sin OT suma a pendientes y aparece en "requiere atención"', async () => {
        const antes = (await get('/api/analitica/panel', { token })).data;
        const t = await post('/api/turnos', turno({ fecha_hora: enDias(1), patente: `AC${sufijo}` }), { token });
        expect(t.data.estado).toBe('confirmado');
        const despues = (await get('/api/analitica/panel', { token })).data;
        expect(despues.pendientes.turnos_confirmados_sin_ot).toBe(antes.pendientes.turnos_confirmados_sin_ot + 1);
    });

    test('exige sesión', async () => {
        const { status } = await get('/api/analitica/panel');
        expect([401, 403]).toContain(status);
    });
});

describe('analítica: cruce de turnos, OT y presupuestos', () => {
    const carpeta = fs.mkdtempSync(path.join(os.tmpdir(), 'gitaller-an-'));
    let base;

    const subirPdf = async (campos) => {
        const fd = new FormData();
        for (const [k, v] of Object.entries(campos)) fd.append(k, v);
        fd.append('archivo', new Blob(['%PDF-1.4\n%x\n'], { type: 'application/pdf' }), 'presupuesto.pdf');
        const res = await fetch(`${baseURL()}/api/ot-documentos/${OT}`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd });
        return { status: res.status, data: await res.json() };
    };

    beforeAll(async () => {
        await put('/api/configuracion/documentos', { carpeta_documentos: carpeta }, { token });
        base = (await get(`/api/analitica/turnos-presupuestos?${RANGO()}`, { token })).data;
    });
    // La carpeta de documentos es un valor global del servidor de pruebas: se deja como estaba (vacía)
    // para que otros archivos de test no dependan del orden en que corren.
    afterAll(async () => {
        await put('/api/configuracion/documentos', { carpeta_documentos: '' }, { token });
        fs.rmSync(carpeta, { recursive: true, force: true });
    });

    test('valida el rango de fechas', async () => {
        const r = await get('/api/analitica/turnos-presupuestos?desde=2026-12-31&hasta=2026-01-01', { token });
        expect(r.status).toBe(400);
        const r2 = await get('/api/analitica/turnos-presupuestos?desde=2020-01-01&hasta=2026-01-01', { token });
        expect(r2.status).toBe(400);
    });

    test('el embudo refleja turnos agendados, confirmados y que llegaron con OT', async () => {
        // Dos turnos de hoy: uno llega (OT), otro no se presenta.
        const hoy = { fecha_hora: new Date().toISOString() };
        const a = await post('/api/turnos', turno({ ...hoy, patente: `AA${sufijo}` }), { token });
        const b = await post('/api/turnos', turno({ ...hoy, patente: `AB${sufijo}` }), { token });
        expect(a.data.estado).toBe('confirmado');
        const ot = await post(`/api/turnos/${a.data.id}/generar-ot`, { ot: OT, kilometraje: '45000', asesor_legajo: 'ADMIN' }, { token });
        expect(ot.status).toBe(200);
        await post(`/api/turnos/${b.data.id}/estado`, { estado: 'no_asistio' }, { token });

        const { data } = await get(`/api/analitica/turnos-presupuestos?${RANGO()}`, { token });
        const etapa = (d, k) => d.embudo.find(e => e.clave === k).n;
        expect(etapa(data, 'agendados')).toBe(etapa(base, 'agendados') + 2);
        expect(etapa(data, 'llegaron')).toBe(etapa(base, 'llegaron') + 1);
        expect(data.embudo[0].pct_total).toBe(100);
        // Cada etapa se compara con su base (finalizadas contra las que llegaron, no contra los presupuestos)
        expect(data.embudo.find(e => e.clave === 'finalizadas').base).toBe('llegaron');
        expect(data.embudo.every(e => e.pct_base === null || e.pct_base <= 100)).toBe(true);
        expect(data.origen_ots.con_turno).toBe(base.origen_ots.con_turno + 1);
        expect(data.puntualidad.con_ot).toBe(base.puntualidad.con_ot + 1);
        expect(data.por_dia).toHaveLength(7);
        expect(data.por_tipo.length).toBeGreaterThan(0);
    });

    test('los presupuestos se cuentan, se aprueban y se cruzan con la OT', async () => {
        const subido = await subirPdf({ tipo: 'presupuesto', monto: '150000' });
        expect(subido.status).toBe(200);
        const ampl = await subirPdf({ tipo: 'presupuesto', es_revision: 'true', revision_motivo: 'Se agregó embrague', monto: '210000' });
        expect(ampl.status).toBe(200);

        let { data } = await get(`/api/analitica/turnos-presupuestos?${RANGO()}`, { token });
        expect(data.presupuestos.cantidad).toBe(base.presupuestos.cantidad + 2);
        const pend = (d) => d.presupuestos.por_estado.find(e => e.estado === 'pendiente');
        expect(pend(data).cantidad).toBe(pend(base).cantidad + 2);
        expect(data.presupuestos.pct_revisiones).toBeGreaterThan(0);

        // El asesor registra la respuesta del cliente.
        await put(`/api/ot-documentos/item/${subido.data.id}`, { estado_presupuesto: 'rechazado' }, { token });
        await put(`/api/ot-documentos/item/${ampl.data.id}`, { estado_presupuesto: 'aprobado', monto: 210000 }, { token });
        ({ data } = await get(`/api/analitica/turnos-presupuestos?${RANGO()}`, { token }));
        const estado = (d, e) => d.presupuestos.por_estado.find(x => x.estado === e);
        expect(estado(data, 'rechazado').cantidad).toBe(estado(base, 'rechazado').cantidad + 1);
        expect(estado(data, 'aprobado').cantidad).toBe(estado(base, 'aprobado').cantidad + 1);
        expect(data.presupuestos.respondidos).toBe(base.presupuestos.respondidos + 2);
        expect(data.presupuestos.pct_aprobacion).not.toBeNull();
        expect(data.presupuestos.horas_respuesta_promedio).not.toBeNull();
        // La OT con presupuesto aprobado figura en el embudo.
        const etapaPres = (d, k) => d.embudo.find(e => e.clave === k).n;
        expect(etapaPres(data, 'con_presupuesto')).toBe(etapaPres(base, 'con_presupuesto') + 1);
        expect(etapaPres(data, 'presupuesto_aprobado')).toBe(etapaPres(base, 'presupuesto_aprobado') + 1);
    });
});
