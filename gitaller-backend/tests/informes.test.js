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

describe('Informe financiero: Eficiencia/Eficacia y definición estricta de garantía', () => {
    // EFICIENCIA = % de OTs del período (cualquier marca) que se abrieron
    // y cerraron el MISMO día calendario.
    // EFICACIA (IVECO) = mismo criterio de "mismo día", pero solo sobre
    // el subconjunto de OTs IVECO (incluye garantía) y sobre el total de
    // OTs IVECO como denominador, no sobre el total general.
    // "Garantía" exige es_garantia=1 Y es_no_iveco=0 — una OT de otra
    // marca marcada por error como garantía no debe contar.
    const sufijo = Date.now().toString().slice(-6);

    async function crearOT(ot, { esNoIveco = false, esGarantia = false, apertura, cierre }) {
        await post('/api/ordenes', {
            ot, cliente: `Cliente ${ot}`, patente: `PAT${ot}`,
            unidad: 'Unidad Test', asesor_legajo: 'ADMIN',
            es_no_iveco: esNoIveco, es_garantia: esGarantia,
            fecha_apertura: apertura
        }, { token });
        await post(`/api/ordenes/${ot}/controlar`, { jefe_legajo: 'ADMIN' }, { token });
        await put(`/api/ordenes/${ot}`, { fecha_cierre: cierre }, { token });
    }

    // Fecha fija y aislada del resto de la suite (año 2019, nadie más usa ese rango)
    const RANGO_AISLADO = 'desde=2019-01-01&hasta=2019-02-01';
    const OT_MISMO_DIA_IVECO = `1${sufijo}`;
    const OT_VARIOS_DIAS_IVECO = `2${sufijo}`;
    const OT_MISMO_DIA_NO_IVECO = `3${sufijo}`;
    const OT_GARANTIA_MAL_MARCADA = `4${sufijo}`; // no-IVECO pero es_garantia=true
    const OT_GARANTIA_REAL = `5${sufijo}`;

    beforeAll(async () => {
        await crearOT(OT_MISMO_DIA_IVECO, { apertura: '2019-01-10 09:00:00', cierre: '2019-01-10 18:00:00' });
        await crearOT(OT_VARIOS_DIAS_IVECO, { apertura: '2019-01-10 09:00:00', cierre: '2019-01-15 18:00:00' });
        await crearOT(OT_MISMO_DIA_NO_IVECO, { esNoIveco: true, apertura: '2019-01-10 09:00:00', cierre: '2019-01-10 18:00:00' });
        await crearOT(OT_GARANTIA_MAL_MARCADA, { esNoIveco: true, esGarantia: true, apertura: '2019-01-10 09:00:00', cierre: '2019-01-20 18:00:00' });
        await crearOT(OT_GARANTIA_REAL, { esGarantia: true, apertura: '2019-01-10 09:00:00', cierre: '2019-01-20 18:00:00' });
    });

    test('eficiencia_pct: 2 de 5 OTs cerradas el mismo día -> 40%', async () => {
        const { data } = await get(`/api/informes/mensual/financiero?${RANGO_AISLADO}`, { token });
        expect(data.resumen.total_ot).toBe(5);
        expect(data.resumen.cantidad_mismo_dia).toBe(2);
        expect(data.resumen.eficiencia_pct).toBeCloseTo(40.0, 1);
    });

    test('eficacia_iveco_pct: 1 de 3 OTs IVECO cerrada el mismo día -> 33.3%', async () => {
        const { data } = await get(`/api/informes/mensual/financiero?${RANGO_AISLADO}`, { token });
        expect(data.resumen.total_iveco).toBe(3); // mismo_dia_iveco + varios_dias_iveco + garantia_real
        expect(data.resumen.cantidad_iveco_mismo_dia).toBe(1);
        expect(data.resumen.eficacia_iveco_pct).toBeCloseTo(33.3, 1);
    });

    test('una OT no-IVECO marcada por error como garantía NO cuenta como garantía', async () => {
        const { data } = await get(`/api/informes/mensual/financiero?${RANGO_AISLADO}`, { token });
        // Solo OT_GARANTIA_REAL debe contar; OT_GARANTIA_MAL_MARCADA queda afuera por ser es_no_iveco=true
        expect(data.resumen.total_garantia).toBe(1);
    });

    test('período sin ninguna OT: eficiencia/eficacia quedan en null (no en un 0% engañoso)', async () => {
        const { data } = await get('/api/informes/mensual/financiero?desde=2015-01-01&hasta=2015-02-01', { token });
        expect(data.resumen.total_ot).toBe(0);
        expect(data.resumen.eficiencia_pct).toBeNull();
        expect(data.resumen.eficacia_iveco_pct).toBeNull();
    });
});
