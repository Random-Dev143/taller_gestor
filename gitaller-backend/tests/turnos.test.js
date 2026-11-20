'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { get, post, put, del, loginAdmin, baseURL } = require('./helpers/api');

const sufijo = 'T' + Date.now().toString().slice(-6);
const OT = `7${Date.now().toString().slice(-7)}`;
let token;

// Hoy + N días a las 12:00 locales, en ISO (UTC), como lo manda el frontend.
const enDias = (n) => { const d = new Date(); d.setDate(d.getDate() + n); d.setHours(12, 0, 0, 0); return d.toISOString(); };
const turnoBase = (extra = {}) => ({
    fecha_hora: enDias(5), cliente: `Cliente ${sufijo}`, patente: `TU${sufijo}`, unidad: 'Daily 70C16',
    contacto_nombre: 'Juan Pérez', telefono: '+5491122334455', correo: 'juan@test.com',
    motivo: 'Service 40.000 km', horas_estimadas: 3, ...extra
});

beforeAll(async () => { token = await loginAdmin(); });

describe('turnos', () => {
    let idLejano, idManana;

    test('un turno con antelación queda "sin confirmar"', async () => {
        const { status, data } = await post('/api/turnos', turnoBase(), { token });
        expect(status).toBe(200);
        expect(data.estado).toBe('sin_confirmar');
        idLejano = data.id;
    });

    test('un turno otorgado con 1 día de antelación nace confirmado (no necesita recordatorio)', async () => {
        const { status, data } = await post('/api/turnos', turnoBase({ fecha_hora: enDias(1), patente: `TM${sufijo}` }), { token });
        expect(status).toBe(200);
        expect(data.estado).toBe('confirmado');
        idManana = data.id;
    });

    test('faltan datos obligatorios -> 400', async () => {
        const r = await post('/api/turnos', turnoBase({ cliente: '' }), { token });
        expect(r.status).toBe(400);
        const r2 = await post('/api/turnos', turnoBase({ fecha_hora: 'no-es-fecha' }), { token });
        expect(r2.status).toBe(400);
        const r3 = await post('/api/turnos', turnoBase({ tipo: 'inventado' }), { token });
        expect(r3.status).toBe(400);
    });

    test('el confirmado sin OT suma al contador del punto rojo', async () => {
        const { status, data } = await get('/api/turnos/resumen', { token });
        expect(status).toBe(200);
        expect(data.confirmados_sin_ot).toBeGreaterThanOrEqual(1);
    });

    test('el llamado que confirma deja el turno confirmado y registra el evento', async () => {
        const { status, data } = await post(`/api/turnos/${idLejano}/llamado`, { resultado: 'confirmo', nota: 'Atendió el dueño' }, { token });
        expect(status).toBe(200);
        expect(data.estado).toBe('confirmado');
        const t = await get(`/api/turnos/${idLejano}`, { token });
        expect(t.data.confirmado_via).toBe('llamado');
    });

    test('un llamado sin respuesta no cambia el estado', async () => {
        const nuevo = await post('/api/turnos', turnoBase({ patente: `TN${sufijo}` }), { token });
        const { data } = await post(`/api/turnos/${nuevo.data.id}/llamado`, { resultado: 'no_atiende' }, { token });
        expect(data.estado).toBe('sin_confirmar');
    });

    test('cancelar exige motivo', async () => {
        const nuevo = await post('/api/turnos', turnoBase({ patente: `TC${sufijo}` }), { token });
        const sin = await post(`/api/turnos/${nuevo.data.id}/estado`, { estado: 'cancelado' }, { token });
        expect(sin.status).toBe(400);
        const con = await post(`/api/turnos/${nuevo.data.id}/estado`, { estado: 'cancelado', motivo: 'Vendió la unidad' }, { token });
        expect(con.status).toBe(200);
        const edit = await put(`/api/turnos/${nuevo.data.id}`, { motivo: 'x' }, { token });
        expect(edit.status).toBe(409);
    });

    test('reprogramar vuelve a evaluar si requiere confirmación', async () => {
        const nuevo = await post('/api/turnos', turnoBase({ patente: `TR${sufijo}` }), { token });
        const { status, data } = await put(`/api/turnos/${nuevo.data.id}`, { fecha_hora: enDias(1) }, { token });
        expect(status).toBe(200);
        expect(data.estado).toBe('confirmado');
    });

    test('lista por rango y capacidad', async () => {
        const l = await get('/api/turnos?desde=2000-01-01&hasta=2100-01-01', { token });
        expect(l.status).toBe(200);
        expect(l.data.some(t => t.id === idLejano)).toBe(true);
        const c = await get('/api/turnos/capacidad', { token });
        expect(c.status).toBe(200);
        expect(c.data.dias).toHaveLength(7);
        expect(c.data.dias[0]).toHaveProperty('horas_disponibles');
    });

    test('sugerencia de número de OT y último km', async () => {
        const s = await get('/api/turnos/siguiente-ot', { token });
        expect(s.status).toBe(200);
        expect(typeof s.data.siguiente).toBe('string');
        const k = await get(`/api/turnos/ultimo-km/NOEXISTE${sufijo}`, { token });
        expect(k.data.km).toBeNull();
    });

    test('generar la OT: valida OT y km, crea la OT, vincula el turno y completa la unidad', async () => {
        const sinOt = await post(`/api/turnos/${idLejano}/generar-ot`, { kilometraje: '45000' }, { token });
        expect(sinOt.status).toBe(400);
        const sinKm = await post(`/api/turnos/${idLejano}/generar-ot`, { ot: OT }, { token });
        expect(sinKm.status).toBe(400);

        const ok = await post(`/api/turnos/${idLejano}/generar-ot`, { ot: OT, kilometraje: '45.000 km', asesor_legajo: 'ADMIN' }, { token });
        expect(ok.status).toBe(200);
        expect(ok.data.ot).toBe(OT);

        const ot = await get(`/api/ordenes/${OT}`, { token });
        expect(ot.status).toBe(200);
        expect(ot.data.kilometraje).toBe('45000');
        expect(ot.data.tiempo_asignado_horas).toBe(3);

        const t = await get(`/api/turnos/${idLejano}`, { token });
        expect(t.data.estado).toBe('ot_creada');
        expect(t.data.ot).toBe(OT);

        const unidad = await get(`/api/unidades/${encodeURIComponent(`TU${sufijo}`)}`, { token });
        expect(unidad.data.telefono).toBe('+5491122334455');

        const otra = await post(`/api/turnos/${idLejano}/generar-ot`, { ot: `${OT}1`, kilometraje: '1' }, { token });
        expect(otra.status).toBe(409);
        const edit = await put(`/api/turnos/${idLejano}`, { motivo: 'x' }, { token });
        expect(edit.status).toBe(409);
    });

    test('una OT duplicada es rechazada con 409 y un turno de retrabajo marca la OT', async () => {
        const nuevo = await post('/api/turnos', turnoBase({ tipo: 'retrabajo', patente: `TU${sufijo}` }), { token });
        const dup = await post(`/api/turnos/${nuevo.data.id}/generar-ot`, { ot: OT, kilometraje: '46000' }, { token });
        expect(dup.status).toBe(409);
        const otRetra = `${OT}9`;
        const r = await post(`/api/turnos/${nuevo.data.id}/generar-ot`, { ot: otRetra, kilometraje: '46000', ot_retrabajo_origen: OT, asesor_legajo: 'ADMIN' }, { token });
        expect(r.status).toBe(200);
        const ot = await get(`/api/ordenes/${otRetra}`, { token });
        expect(ot.data.es_retrabajo).toBe(1);
        expect(ot.data.ot_retrabajo_origen).toBe(OT);
        const malOrigen = await post('/api/ordenes', {
            ot: `${OT}8`, cliente: `Cliente ${sufijo}`, patente: `TU${sufijo}`, unidad: 'x', asesor_legajo: 'ADMIN',
            es_retrabajo: true, ot_retrabajo_origen: 'NO-EXISTE'
        }, { token });
        expect(malOrigen.status).toBe(400);
    });
});

describe('legajo digital: documentos PDF', () => {
    const carpeta = fs.mkdtempSync(path.join(os.tmpdir(), 'gitaller-docs-'));
    let idDoc;

    const subir = async (campos, { nombre = 'presupuesto.pdf', contenido = '%PDF-1.4\n%test\n', tipo = 'application/pdf' } = {}) => {
        const fd = new FormData();
        for (const [k, v] of Object.entries(campos)) fd.append(k, v);
        fd.append('archivo', new Blob([contenido], { type: tipo }), nombre);
        const res = await fetch(`${baseURL()}/api/ot-documentos/${OT}`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd });
        return { status: res.status, data: await res.json() };
    };

    afterAll(() => { fs.rmSync(carpeta, { recursive: true, force: true }); });

    test('sin carpeta configurada no se puede subir', async () => {
        const r = await subir({ tipo: 'presupuesto' });
        expect(r.status).toBe(409);
        expect(r.data.error).toMatch(/carpeta/i);
    });

    test('la carpeta se configura desde el panel y no es pública', async () => {
        const r = await put('/api/configuracion/documentos', { carpeta_documentos: carpeta }, { token });
        expect(r.status).toBe(200);
        const g = await get('/api/configuracion/documentos', { token });
        expect(g.data.carpeta_documentos).toBe(carpeta);
        const publica = await get('/api/configuracion');
        expect(publica.data.carpeta_documentos).toBeUndefined();
    });

    test('rechaza archivos que no son PDF (por extensión y por contenido)', async () => {
        const txt = await subir({ tipo: 'presupuesto' }, { nombre: 'nota.txt', contenido: 'hola', tipo: 'text/plain' });
        expect(txt.status).toBe(400);
        const falso = await subir({ tipo: 'presupuesto' }, { nombre: 'falso.pdf', contenido: 'esto no es un pdf' });
        expect(falso.status).toBe(400);
    });

    test('sube un presupuesto; un segundo exige marcarlo como nueva versión', async () => {
        const r = await subir({ tipo: 'presupuesto', monto: '150000' });
        expect(r.status).toBe(200);
        expect(r.data.version).toBe(1);
        idDoc = r.data.id;
        expect(fs.existsSync(path.join(carpeta, `OT-${OT}`))).toBe(true);

        const dup = await subir({ tipo: 'presupuesto' });
        expect(dup.status).toBe(409);
        const v2 = await subir({ tipo: 'presupuesto', es_revision: 'true', revision_motivo: 'Se agregó cambio de embrague', monto: '210000' });
        expect(v2.status).toBe(200);
        expect(v2.data.version).toBe(2);
    });

    test('el asesor registra estado y monto del presupuesto', async () => {
        const r = await put(`/api/ot-documentos/item/${idDoc}`, { estado_presupuesto: 'aprobado_parcial', monto: 120000 }, { token });
        expect(r.status).toBe(200);
        const mal = await put(`/api/ot-documentos/item/${idDoc}`, { estado_presupuesto: 'quizas' }, { token });
        expect(mal.status).toBe(400);
    });

    test('se descarga el PDF subido', async () => {
        const res = await fetch(`${baseURL()}/api/ot-documentos/item/${idDoc}/archivo`, { headers: { Authorization: `Bearer ${token}` } });
        expect(res.status).toBe(200);
        expect(res.headers.get('content-type')).toMatch(/pdf/);
        expect((await res.text()).startsWith('%PDF-')).toBe(true);
    });

    test('el legajo reúne turno, eventos y documentos de la OT', async () => {
        const { status, data } = await get(`/api/turnos/legajo/${OT}`, { token });
        expect(status).toBe(200);
        expect(data.orden.ot).toBe(OT);
        expect(data.turno.ot).toBe(OT);
        expect(data.eventos.map(e => e.tipo)).toEqual(expect.arrayContaining(['creado', 'llamado', 'confirmado', 'ot_creada']));
        expect(data.documentos.length).toBe(2);
    });

    test('dar de baja un documento exige causa y queda registrado; el archivo no se borra', async () => {
        const sin = await del(`/api/ot-documentos/item/${idDoc}`, { token });
        expect(sin.status).toBe(400);
        const res = await fetch(`${baseURL()}/api/ot-documentos/item/${idDoc}`, {
            method: 'DELETE', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ motivo: 'Subido a la OT equivocada' })
        });
        expect(res.status).toBe(200);

        const lista = await get(`/api/ot-documentos/${OT}`, { token });
        const borrado = lista.data.find(d => d.id === idDoc);
        expect(borrado.borrado_motivo).toBe('Subido a la OT equivocada');
        expect(borrado.borrado_por).toBeTruthy();
        const descarga = await fetch(`${baseURL()}/api/ot-documentos/item/${idDoc}/archivo`, { headers: { Authorization: `Bearer ${token}` } });
        expect(descarga.status).toBe(404);
        const archivos = fs.readdirSync(path.join(carpeta, `OT-${OT}`));
        expect(archivos.length).toBe(2);
    });
});
