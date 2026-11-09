'use strict';
// Informe NPS automático: períodos quincenales (puro) + carpeta configurable y guardado (API).
const fs = require('fs');
const os = require('os');
const path = require('path');
const { periodoCerradoReciente } = require('../services/nps-periodos');
const { validarCarpeta, rutaLibre } = require('../services/carpeta-informes');
const { get, put, post, loginAdmin } = require('./helpers/api');

describe('período quincenal cerrado más reciente', () => {
    // new Date(año, mes0, día): mes base 0 (9 = octubre)
    test('del 16 en adelante corresponde al 1 al 15 del mismo mes', () => {
        expect(periodoCerradoReciente(new Date(2026, 9, 16))).toEqual({ desde: '2026-10-01', hasta: '2026-10-15' });
        expect(periodoCerradoReciente(new Date(2026, 9, 31))).toEqual({ desde: '2026-10-01', hasta: '2026-10-15' });
    });
    test('del 1 al 15 corresponde al 16 a fin de mes del mes anterior', () => {
        expect(periodoCerradoReciente(new Date(2026, 10, 1))).toEqual({ desde: '2026-10-16', hasta: '2026-10-31' });
        expect(periodoCerradoReciente(new Date(2026, 10, 15))).toEqual({ desde: '2026-10-16', hasta: '2026-10-31' });
    });
    test('cambio de año y febrero (con y sin bisiesto)', () => {
        expect(periodoCerradoReciente(new Date(2027, 0, 3))).toEqual({ desde: '2026-12-16', hasta: '2026-12-31' });
        expect(periodoCerradoReciente(new Date(2026, 2, 1))).toEqual({ desde: '2026-02-16', hasta: '2026-02-28' });
        expect(periodoCerradoReciente(new Date(2028, 2, 1))).toEqual({ desde: '2028-02-16', hasta: '2028-02-29' });
    });
});

describe('carpeta de informes', () => {
    test('se crea si no existe, se valida que se pueda escribir y no se pisan archivos', () => {
        const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'nps-')), 'sub', 'informes');
        expect(validarCarpeta(dir)).toBe(path.resolve(dir));
        fs.writeFileSync(path.join(dir, 'Octubre 1ro al 15.xlsx'), 'x');
        expect(path.basename(rutaLibre(dir, 'Octubre 1ro al 15.xlsx'))).toBe('Octubre 1ro al 15 (2).xlsx');
    });
    test('carpeta vacía es inválida', () => {
        expect(() => validarCarpeta('  ')).toThrow();
    });
});

describe('API de configuración e informe guardado', () => {
    let token;
    const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'nps-api-')), 'Informes NPS');
    beforeAll(async () => { token = await loginAdmin(); });

    test('la ruta de la carpeta NO se expone en la configuración pública', async () => {
        const { data } = await get('/api/configuracion');
        expect(data.carpeta_informes).toBeUndefined();
    });
    test('sin carpeta configurada, guardar informe responde 400', async () => {
        const r = await post('/api/reporte-nps/guardar', { desde: '2026-10-01', hasta: '2026-10-15' }, { token });
        expect(r.status).toBe(400);
    });
    test('configurar carpeta (la crea) y códigos de concesionario/sede', async () => {
        const r = await put('/api/configuracion/informes', { nps_concesionario: '7', nps_sede: '20', carpeta_informes: dir, informe_auto_activo: true }, { token });
        expect(r.status).toBe(200);
        expect(fs.existsSync(dir)).toBe(true);
        const { data } = await get('/api/configuracion/informes', { token });
        expect(data.carpeta_informes).toBe(dir);
        expect(data.informe_auto_activo).toBe(true);
    });
    test('carpeta inválida se rechaza con 400', async () => {
        const archivo = path.join(os.tmpdir(), `no-es-carpeta-${Date.now()}`);
        fs.writeFileSync(archivo, 'x');
        const r = await put('/api/configuracion/informes', { nps_concesionario: '7', nps_sede: '20', carpeta_informes: path.join(archivo, 'x') }, { token });
        expect(r.status).toBe(400);
    });
    test('guarda el .xlsx del período en la carpeta y queda en el historial', async () => {
        const r = await post('/api/reporte-nps/guardar', { desde: '2026-10-01', hasta: '2026-10-15' }, { token });
        expect(r.status).toBe(200);
        expect(path.basename(r.data.ruta)).toBe('Octubre 1ro al 15.xlsx');
        expect(fs.existsSync(r.data.ruta)).toBe(true);
        const estado = await get('/api/reporte-nps/estado', { token });
        expect(estado.data.historial.some(h => h.ruta === r.data.ruta)).toBe(true);
    });
    test('los ajustes de informes exigen permiso de administración', async () => {
        expect((await get('/api/configuracion/informes')).status).toBe(401);
    });
});
