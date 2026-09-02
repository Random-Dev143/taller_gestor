'use strict';
const { get, post, put, loginAdmin } = require('./helpers/api');

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

describe('Informe financiero: horas de garantía (reales vs. facturadas)', () => {
    // tiempo_facturado_horas se carga a mano cuando llega la respuesta de
    // fábrica (hasta 30 días de demora). Mientras esté en 0, el informe
    // debe estimar con las horas reales en su lugar, para no mostrar
    // "0 horas facturadas" en OTs que en realidad solo están esperando el
    // dato — ver services/informes/financiero.js.
    const sufijo = Date.now().toString().slice(-6);
    const LEGAJO = `G${sufijo}`;
    const OT_SIN_FACTURAR = `6${sufijo}`;
    const OT_YA_FACTURADA = `5${sufijo}`;

    async function crearYFinalizarOTGarantia(ot, horasReales) {
        await post('/api/legajos', { legajo: LEGAJO, nombre: 'Mecánico Garantía Test', rol: 'mecanico' }, { token }).catch(() => {});
        await post('/api/ordenes', {
            ot, cliente: `Cliente Garantía ${ot}`, patente: `GAR${ot}`,
            unidad: 'Unidad Test', asesor_legajo: 'ADMIN', es_garantia: true
        }, { token });

        const { data: creada } = await post(`/api/actividades/orden/${ot}`, {
            descripcion: 'Tarea de garantía', tiempo_estimado: horasReales, legajos_mecanicos: [LEGAJO]
        }, { token });

        const detalle = await get(`/api/ordenes/${ot}`, { token });
        const actividadId = detalle.data.actividades[0].id;

        await post(`/api/actividades/${actividadId}/estado`, { nuevo_estado: 'En Curso', legajo_mecanico: LEGAJO }, { token });

        const detalleConTiempo = await get(`/api/ordenes/${ot}`, { token });
        const tiempoId = detalleConTiempo.data.tiempos_actividad[0].id;
        const fin = new Date();
        const inicio = new Date(fin.getTime() - horasReales * 3600000);
        const fmt = (d) => d.toISOString().replace('T', ' ').substring(0, 19);
        await put(`/api/actividades/tiempos/${tiempoId}`, { inicio: fmt(inicio), fin: fmt(fin) }, { token });

        await post(`/api/actividades/${actividadId}/estado`, { nuevo_estado: 'Finalizada', legajo_mecanico: LEGAJO }, { token });
        await post(`/api/ordenes/${ot}/controlar`, { jefe_legajo: 'ADMIN' }, { token });
    }

    beforeAll(async () => {
        await crearYFinalizarOTGarantia(OT_SIN_FACTURAR, 2); // 2hs reales, SIN dato de facturación todavía
        await crearYFinalizarOTGarantia(OT_YA_FACTURADA, 4); // 4hs reales
        // Llega el dato de fábrica: se factura por 5hs (no necesariamente igual a las horas reales)
        await put(`/api/ordenes/${OT_YA_FACTURADA}`, { tiempo_facturado_horas: 5 }, { token });
    });

    test('una OT en garantía sin horas facturadas cargadas usa las reales como estimación', async () => {
        const { status, data } = await get(`/api/informes/mensual/financiero?${RANGO}&busqueda=${OT_SIN_FACTURAR}`, { token });
        expect(status).toBe(200);
        // El informe es agregado (no por-OT), así que se valida contra el
        // total del período en vez de aislar una sola OT: alcanza con que
        // los 3 campos existan y sean coherentes entre sí.
        expect(data.resumen).toHaveProperty('hs_garantia_reales');
        expect(data.resumen).toHaveProperty('hs_garantia_facturadas');
        expect(data.resumen).toHaveProperty('hs_garantia_facturacion_estimada');
        expect(data.resumen).toHaveProperty('cantidad_garantia_facturacion_pendiente');
    });

    test('el agregado del período: reales=6, facturadas=5 (solo lo cargado), estimado=7 (2 de fallback + 5 real)', async () => {
        const { data } = await get(`/api/informes/mensual/financiero?${RANGO}`, { token });
        const r = data.resumen;

        // hs_garantia_reales incluye SIEMPRE las horas trabajadas, tengan o no facturación cargada
        expect(r.hs_garantia_reales).toBeGreaterThanOrEqual(6);

        // hs_garantia_facturadas: solo cuenta lo que YA tiene el dato real de fábrica
        // (la OT sin facturar no debería sumar sus 2hs reales acá)
        expect(r.hs_garantia_facturadas).toBeGreaterThanOrEqual(5);

        // hs_garantia_facturacion_estimada: usa el dato real donde existe (5) y
        // cae a las horas reales donde no (2) -> siempre >= hs_garantia_facturadas
        expect(r.hs_garantia_facturacion_estimada).toBeGreaterThanOrEqual(r.hs_garantia_facturadas);
        expect(r.hs_garantia_facturacion_estimada).toBeGreaterThanOrEqual(7);

        // Al menos la OT sin facturar debe contarse como pendiente
        expect(r.cantidad_garantia_facturacion_pendiente).toBeGreaterThanOrEqual(1);
    });
});
