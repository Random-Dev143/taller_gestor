'use strict';
// ─── MÓDULO DE REPUESTOS (PAÑOL) ─────────────────────────────────────
// Cubre modules/repuestos/{repository,service,routes}.js — portado desde la
// rama `repuestos`, con 3 bugs corregidos que este archivo blinda explícitamente:
//   1. repuestos.repository.js exportaba solo 3 de 15 funciones ("module.exports
//      = { // ... exports anteriores ..., ... }" quedó como placeholder literal
//      sin completar) -> cualquier operación de catálogo tiraba
//      "repo.obtenerPorNP is not a function".
//   2. repuestos.service.js usaba tipo_movimiento: 'Ingreso_Compra', valor
//      inexistente en el CHECK de movimientos_stock (migración 013) -> todo
//      ingreso de stock tiraba SQLITE_CONSTRAINT.
//   3. Al ingresar stock, actualizarRepuestoMaestro() se llamaba sin
//      margen_ganancia -> precio_venta = costo * (1 + undefined/100) = NaN,
//      grabado como NULL -> cada ingreso borraba el precio de venta vigente.

const { get, post, loginAdmin } = require('./helpers/api');

const sufijo = 'R' + Date.now().toString().slice(-6);
const NP = `NP-${sufijo}`;

let token;
let repuestoId;

beforeAll(async () => {
    token = await loginAdmin();
});

test('crear un repuesto en el catálogo', async () => {
    const { status, data } = await post('/api/repuestos', {
        np: NP, descripcion: 'Repuesto de test', costo_actual: 100, margen_ganancia: 40
    }, { token });
    expect(status).toBe(201); // Created
    expect(data.id).toBeTruthy();
    repuestoId = data.id;
});

test('el repuesto recién creado aparece en el catálogo', async () => {
    const { status, data } = await get(`/api/repuestos/${NP}`, { token });
    expect(status).toBe(200);
    expect(data.np).toBe(NP);
    expect(data.stock_actual).toBe(0);
});

test('ingresar stock no revienta con SQLITE_CONSTRAINT (bug de tipo_movimiento)', async () => {
    const { status, data } = await post(`/api/repuestos/${repuestoId}/ingreso`, {
        cantidad: 15, costo_unitario: 90, referencia: 'Compra de test', legajo_usuario: 'ADMIN'
    }, { token });
    expect(status).toBe(200);
    expect(data.status).toMatch(/ingresado/i);
    expect(data.lote_id).toBeTruthy();
});

test('tras ingresar stock, el catálogo refleja cantidad y costo actualizados', async () => {
    const { data } = await get(`/api/repuestos/${NP}`, { token });
    expect(data.stock_actual).toBe(15);
    expect(data.costo_actual).toBe(90);
});

test('tras ingresar stock, precio_venta_actual se recalcula (no queda en null)', async () => {
    // Bug 3: sin el fix, esto daba `null` porque margen_ganancia no se
    // repropagaba al actualizar el costo. costo=90, margen=40% -> 126.
    const { data } = await get(`/api/repuestos/${NP}`, { token });
    expect(data.precio_venta_actual).not.toBeNull();
    expect(data.precio_venta_actual).toBeCloseTo(126, 1);
});

test('un segundo ingreso de stock acumula cantidad y sigue sin romper el precio', async () => {
    const { status } = await post(`/api/repuestos/${repuestoId}/ingreso`, {
        cantidad: 5, costo_unitario: 100, referencia: 'Segunda compra', legajo_usuario: 'ADMIN'
    }, { token });
    expect(status).toBe(200);

    const { data } = await get(`/api/repuestos/${NP}`, { token });
    expect(data.stock_actual).toBe(20);
    expect(data.precio_venta_actual).not.toBeNull();
});

test('el catálogo completo incluye el repuesto creado', async () => {
    const { status, data } = await get('/api/repuestos', { token });
    expect(status).toBe(200);
    expect(Array.isArray(data)).toBe(true);
    expect(data.some(r => r.np === NP)).toBe(true);
});

test('una ruta de repuestos sin token responde 401', async () => {
    const { status } = await get('/api/repuestos');
    expect(status).toBe(401);
});
