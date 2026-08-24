'use strict';
const { get, post, put, loginAdmin } = require('./helpers/api');

const sufijo = 'V' + Date.now().toString().slice(-6);
const OT = `8${Date.now().toString().slice(-6)}`;

let token;

beforeAll(async () => {
    token = await loginAdmin();
});

test('crear una OT con descuento pero sin motivo es rechazado', async () => {
    const { status, data } = await post('/api/ordenes', {
        ot: OT, cliente: `Cliente ${sufijo}`, patente: `PAT${sufijo}`,
        unidad: 'Unidad Test', asesor_legajo: 'ADMIN',
        monto_descuento: 500, descuento_motivo: ''
    }, { token });

    expect(status).toBe(400);
    expect(data.error).toMatch(/motivo/i);
});

test('crear una OT con descuento y motivo queda en estado "pendiente" de autorización', async () => {
    const { status } = await post('/api/ordenes', {
        ot: OT, cliente: `Cliente ${sufijo}`, patente: `PAT${sufijo}`,
        unidad: 'Unidad Test', asesor_legajo: 'ADMIN',
        monto_descuento: 500, descuento_motivo: 'Cliente frecuente'
    }, { token });
    expect(status).toBe(200);

    const detalle = await get(`/api/ordenes/${OT}`, { token });
    expect(detalle.data.descuento_estado).toBe('pendiente');
    expect(detalle.data.monto_descuento).toBe(500);
});

test('PUT /:ot/descuento/autorizar con aprobado=true autoriza el descuento', async () => {
    const { status } = await put(`/api/ordenes/${OT}/descuento/autorizar`, { aprobado: true }, { token });
    expect(status).toBe(200);

    const detalle = await get(`/api/ordenes/${OT}`, { token });
    expect(detalle.data.descuento_estado).toBe('autorizado');
    expect(detalle.data.descuento_autorizado_por).toBeTruthy();
});

test('autorizar sin indicar "aprobado" es rechazado con 400', async () => {
    const { status, data } = await put(`/api/ordenes/${OT}/descuento/autorizar`, {}, { token });
    expect(status).toBe(400);
    expect(data.error).toMatch(/aprueba o se rechaza/i);
});

test('autorizar descuento en una OT inexistente responde 404', async () => {
    const { status } = await put(`/api/ordenes/OT-QUE-NO-EXISTE/descuento/autorizar`, { aprobado: true }, { token });
    expect(status).toBe(404);
});
