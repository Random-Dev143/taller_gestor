'use strict';
// ─── PARCHE 07: corrección de aportes habilitada por el Jefe ─────────
const { get, post, put, loginAdmin } = require('./helpers/api');

const s = Date.now().toString().slice(-6);
const L1 = `CA${s}`;          // autor del aporte
const L2 = `CB${s}`;          // otro mecánico
const OT = `66${s}`;
let admin, mecToken, aporteId;

// Usuario SIN tarea_gestionar_todas (como un mecánico): puede llamar a /api/ordenes pero no habilitar.
async function loginMecanico() {
    const nombreRol = `Rol Mecanico ${s}`;
    await post('/api/roles', { nombre: nombreRol, permisos: ['ot_ver_lista', 'tarea_ver_propias', 'tarea_operar'] }, { token: admin });
    const rol = (await get('/api/roles', { token: admin })).data.find(r => r.nombre === nombreRol);
    const email = `mec${s}@test.com`;
    await post('/api/usuarios', { email, password: 'clave1234', nombre_completo: 'Mec Test', rol: 'mecanico' }, { token: admin });
    const usr = (await get('/api/usuarios', { token: admin })).data.find(u => u.email === email);
    await put(`/api/usuarios/${usr.id}`, { estado: 'aprobado', rol_id: rol.id, legajo: L1 }, { token: admin });
    const r = await post('/api/auth/login', { email, password: 'clave1234' });
    expect(r.status).toBe(200);
    return r.data.token;
}

const habilitar = (id, habilitar, token = admin) => put(`/api/ordenes/aportes/${id}/habilitar`, { habilitar }, { token });
const corregir = (id, legajo, actividades) => put(`/api/ordenes/aportes/${id}/corregir`, { legajo, actividades }, { token: admin });
const detalleAporte = async () => (await get(`/api/ordenes/${OT}`, { token: admin })).data.aportes.find(a => a.id === aporteId);
const pendientes = async (legajo) => (await get(`/api/ordenes/aportes/habilitados/${legajo}`, { token: admin })).data;

beforeAll(async () => {
    admin = await loginAdmin();
    await post('/api/legajos', { legajo: L1, nombre: 'Autor Aporte', rol: 'mecanico' }, { token: admin });
    await post('/api/legajos', { legajo: L2, nombre: 'Otro Mecanico', rol: 'mecanico' }, { token: admin });
    await post('/api/ordenes', { ot: OT, cliente: `CLI APORTE ${s}`, patente: `APO${s}`, unidad: 'U', asesor_legajo: 'ADMIN' }, { token: admin });
    await post(`/api/ordenes/${OT}/aportes`, { legajo: L1, actividades: 'Texto original con error', horas: 0 }, { token: admin });
    aporteId = (await get(`/api/ordenes/${OT}`, { token: admin })).data.aportes[0].id;
    mecToken = await loginMecanico();
});

test('por defecto un aporte NO se puede corregir (bloqueado) y no aparece como pendiente', async () => {
    const r = await corregir(aporteId, L1, 'Intento sin permiso');
    expect(r.status).toBe(403);
    expect(r.data.error).toMatch(/no habilitó/i);
    expect(await pendientes(L1)).toEqual([]);
    const ap = await detalleAporte();
    expect(ap.actividades).toBe('Texto original con error');
    expect(ap.correccion_habilitada).toBe(0);
});

test('un usuario sin tarea_gestionar_todas NO puede habilitar (403), aunque llegue a la ruta', async () => {
    const r = await habilitar(aporteId, true, mecToken);
    expect(r.status).toBe(403);
    expect(r.data.error).toMatch(/Jefe de Taller/);
    expect((await detalleAporte()).correccion_habilitada).toBe(0);
});

test('validaciones al habilitar: aporte inexistente 404, cuerpo inválido 400', async () => {
    expect((await habilitar(99999999, true)).status).toBe(404);
    const r = await put(`/api/ordenes/aportes/${aporteId}/habilitar`, { habilitar: 'si' }, { token: admin });
    expect(r.status).toBe(400);
});

test('el Jefe habilita: el aporte aparece en la lista del autor (y solo del autor)', async () => {
    const r = await habilitar(aporteId, true);
    expect(r.status).toBe(200);
    expect(r.data.correccion_habilitada).toBe(1);
    const lista = await pendientes(L1);
    expect(lista).toHaveLength(1);
    expect(lista[0]).toMatchObject({ id: aporteId, ot: OT, actividades: 'Texto original con error', patente: `APO${s}` });
    expect(await pendientes(L2)).toEqual([]);
});

test('otro mecánico NO puede corregir un aporte ajeno aunque esté habilitado', async () => {
    const r = await corregir(aporteId, L2, 'Me meto en el aporte de otro');
    expect(r.status).toBe(403);
    expect(r.data.error).toMatch(/propios/);
    expect((await detalleAporte()).actividades).toBe('Texto original con error');
});

test('texto vacío o sin cambios se rechaza y NO gasta la habilitación', async () => {
    expect((await corregir(aporteId, L1, '   ')).status).toBe(400);
    const igual = await corregir(aporteId, L1, '  Texto original con error ');
    expect(igual.status).toBe(400);
    expect((await detalleAporte()).correccion_habilitada).toBe(1);   // sigue habilitado
});

test('el Jefe puede cancelar la habilitación antes de que se use', async () => {
    expect((await habilitar(aporteId, false)).status).toBe(200);
    expect(await pendientes(L1)).toEqual([]);
    expect((await corregir(aporteId, L1, 'Ya no debería poder')).status).toBe(403);
    await habilitar(aporteId, true);   // se vuelve a habilitar para el siguiente test
});

test('el autor corrige: se guarda, queda el original, se registra y se vuelve a BLOQUEAR (un solo uso)', async () => {
    const r = await corregir(aporteId, L1, 'Texto corregido sin errores');
    expect(r.status).toBe(200);

    const ap = await detalleAporte();
    expect(ap.actividades).toBe('Texto corregido sin errores');
    expect(ap.texto_original).toBe('Texto original con error');
    expect(ap.corregido_en).toBeTruthy();
    expect(ap.correccion_habilitada).toBe(0);
    expect(await pendientes(L1)).toEqual([]);

    // segundo intento sin nueva habilitación -> bloqueado
    const otra = await corregir(aporteId, L1, 'Otro cambio más');
    expect(otra.status).toBe(403);
    expect((await detalleAporte()).actividades).toBe('Texto corregido sin errores');
});

test('una segunda corrección (con nueva habilitación) conserva el texto_original de la PRIMERA', async () => {
    await habilitar(aporteId, true);
    expect((await corregir(aporteId, L1, 'Tercera versión')).status).toBe(200);
    const ap = await detalleAporte();
    expect(ap.actividades).toBe('Tercera versión');
    expect(ap.texto_original).toBe('Texto original con error');
});

test('corregir NO toca las horas ni los demás datos de la OT, y el PDF (explicacion) ve el texto nuevo', async () => {
    const { data } = await get(`/api/ordenes/${OT}/explicacion`, { token: admin });
    expect(data.aportes.find(a => a.id === aporteId).actividades).toBe('Tercera versión');
    expect(data.aportes.find(a => a.id === aporteId).horas).toBe(0);
});
