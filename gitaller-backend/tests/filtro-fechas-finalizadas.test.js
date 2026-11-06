'use strict';
// ─── PARCHE 04: rango de fechas (desde/hasta) en GET /ordenes ────────
const { get, post, put, loginAdmin } = require('./helpers/api');

const sufijo = Date.now().toString().slice(-6);
const CLIENTE = `CLI FECHAS ${sufijo}`;
const OTS = { hoy: `51${sufijo}`, hace10: `52${sufijo}`, hace45: `53${sufijo}`, hace200: `54${sufijo}` };
let token;

// Fecha local de hace N días, en YYYY-MM-DD y en formato de la base (mediodía para evitar bordes de huso)
const diaLocal = (n) => {
    const d = new Date(); d.setDate(d.getDate() - n);
    const p = (x) => String(x).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

beforeAll(async () => {
    token = await loginAdmin();
    for (const [clave, ot] of Object.entries(OTS)) {
        await post('/api/ordenes', { ot, cliente: CLIENTE, patente: `FEC${clave.toUpperCase()}${sufijo}`.slice(0, 12), unidad: 'U', asesor_legajo: 'ADMIN' }, { token });
        await put(`/api/ordenes/${ot}/estado`, { estado: 'Finalizada' }, { token });
    }
    // Fechas de cierre controladas (12:00 local ~ evita que el huso cambie el día)
    const fijar = (ot, dias) => put(`/api/ordenes/${ot}`, { fecha_cierre: `${diaLocal(dias)} 15:00:00` }, { token });
    await fijar(OTS.hoy, 0); await fijar(OTS.hace10, 10); await fijar(OTS.hace45, 45); await fijar(OTS.hace200, 200);
});

const listar = async (qs) => {
    const { status, data } = await get(`/api/ordenes?estado=finalizadas&busqueda=${encodeURIComponent(CLIENTE)}&limit=100${qs}`, { token });
    expect(status).toBe(200);
    return data.data.map(o => o.ot);
};

test('sin desde/hasta trae todas las finalizadas (comportamiento anterior intacto)', async () => {
    const ots = await listar('');
    Object.values(OTS).forEach(ot => expect(ots).toContain(ot));
});

test('desde = hace 30 días: excluye las más antiguas', async () => {
    const ots = await listar(`&desde=${diaLocal(30)}`);
    expect(ots).toContain(OTS.hoy);
    expect(ots).toContain(OTS.hace10);
    expect(ots).not.toContain(OTS.hace45);
    expect(ots).not.toContain(OTS.hace200);
});

test('rango desde/hasta para ver órdenes antiguas', async () => {
    const ots = await listar(`&desde=${diaLocal(60)}&hasta=${diaLocal(30)}`);
    expect(ots).toEqual([OTS.hace45]);
});

test('los bordes son inclusivos', async () => {
    const ots = await listar(`&desde=${diaLocal(10)}&hasta=${diaLocal(10)}`);
    expect(ots).toEqual([OTS.hace10]);
});

test('solo "hasta" funciona; desde > hasta devuelve vacío sin error', async () => {
    const ots = await listar(`&hasta=${diaLocal(100)}`);
    expect(ots).toEqual([OTS.hace200]);
    expect(await listar(`&desde=${diaLocal(0)}&hasta=${diaLocal(10)}`)).toEqual([]);
});

test('formato inválido se ignora (no rompe ni filtra mal)', async () => {
    for (const qs of ['&desde=ayer', '&desde=2026-13-45', '&hasta=;DROP TABLE ordenes', '&desde=']) {
        const ots = await listar(qs);
        Object.values(OTS).forEach(ot => expect(ots).toContain(ot));
    }
});

test('una OT finalizada SIN fecha_cierre (dato viejo) se filtra por su fecha de apertura', async () => {
    // La API no permite dejar fecha_cierre en NULL en una OT finalizada, así que el
    // "dato viejo" se simula directo sobre la base descartable de la suite de tests.
    const fs = require('fs'), path = require('path'), sqlite3 = require('sqlite3');
    const { STATE_FILE } = require('./setup/globalSetup');
    const { tmpAppData } = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    const dbPath = path.join(tmpAppData, process.env.GITALLER_APPDATA_FOLDER || 'GITaller', 'taller.db');

    const viejo = `55${sufijo}`, reciente = `56${sufijo}`;
    for (const ot of [viejo, reciente]) {
        await post('/api/ordenes', { ot, cliente: CLIENTE, patente: `FN${ot}`, unidad: 'U', asesor_legajo: 'ADMIN' }, { token });
        await put(`/api/ordenes/${ot}/estado`, { estado: 'Finalizada' }, { token });
    }
    await new Promise((resolve, reject) => {
        const db = new sqlite3.Database(dbPath, (err) => {
            if (err) return reject(err);
            db.run(`UPDATE ordenes SET fecha_cierre = NULL, fecha_apertura = ? WHERE ot = ?`, [`${diaLocal(200)} 15:00:00`, viejo], (e1) => {
                if (e1) return reject(e1);
                db.run(`UPDATE ordenes SET fecha_cierre = NULL, fecha_apertura = ? WHERE ot = ?`, [`${diaLocal(5)} 15:00:00`, reciente], (e2) => {
                    db.close(); e2 ? reject(e2) : resolve();
                });
            });
        });
    });

    const ots = await listar(`&desde=${diaLocal(30)}`);
    expect(ots).toContain(reciente);   // apertura hace 5 días -> entra
    expect(ots).not.toContain(viejo);  // apertura hace 200 días -> queda fuera
});
