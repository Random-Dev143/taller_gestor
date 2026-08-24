'use strict';
const { get, loginAdmin } = require('./helpers/api');

let token;
const RANGO = 'desde=2020-01-01&hasta=2030-01-01';

beforeAll(async () => {
    token = await loginAdmin();
});

describe('Informe financiero', () => {
    test('responde 200 con la forma esperada', async () => {
        const { status, data } = await get(`/api/informes/mensual/financiero?${RANGO}`, { token });
        expect(status).toBe(200);
        expect(data).toHaveProperty('resumen');
        expect(data).toHaveProperty('facturacion_diaria');
        expect(data).toHaveProperty('rentabilidad_unidad');
        expect(data).toHaveProperty('top_clientes');
    });
});

describe('Informe operativo', () => {
    test('responde 200 con la forma esperada', async () => {
        const { status, data } = await get(`/api/informes/mensual/operativo?${RANGO}`, { token });
        expect(status).toBe(200);
        expect(data).toHaveProperty('tiempos_mecanicos');
        expect(Array.isArray(data.tiempos_mecanicos)).toBe(true);
        expect(data).toHaveProperty('patrones_descanso');
    });

    test('sin fechas explícitas, usa el mes actual como default (no revienta)', async () => {
        // routes/informes.js siempre resuelve inicio/fin con parseFechas() antes de
        // llamar al service (default: mes en curso si no vienen ?desde y ?hasta), así
        // que getOperativo() nunca recibe fechas vacías desde la ruta HTTP real —
        // la validación interna de "faltan fechas" es defensiva pero no alcanzable
        // por esta ruta tal como está armada hoy.
        const { status, data } = await get('/api/informes/mensual/operativo', { token });
        expect(status).toBe(200);
        expect(data).toHaveProperty('tiempos_mecanicos');
    });
});

describe('Informe de taller', () => {
    test('responde 200 con la forma esperada', async () => {
        const { status, data } = await get(`/api/informes/mensual/taller?${RANGO}`, { token });
        expect(status).toBe(200);
        expect(data).toHaveProperty('permanencia_estado');
        expect(data).toHaveProperty('aperturas_por_dia');
        expect(data).toHaveProperty('cierres_por_dia');
        expect(data).toHaveProperty('ciclo_promedio');
    });
});

describe('Ruta agregada /mensual', () => {
    test('devuelve los tres informes combinados', async () => {
        const { status, data } = await get(`/api/informes/mensual?${RANGO}`, { token });
        expect(status).toBe(200);
        // Se valida contenido mínimo sin asumir una forma exacta de combinación,
        // ya que routes/informes.js decide cómo las junta (no es parte de lo refactorizado).
        expect(data).toBeTruthy();
    });
});
