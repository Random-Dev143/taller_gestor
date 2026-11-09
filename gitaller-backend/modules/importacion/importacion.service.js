'use strict';
// ─── IMPORTACIÓN DE CLIENTES Y UNIDADES DESDE PLANILLAS DE NPS ──────
// Flujo (nada se escribe en clientes/unidades hasta que alguien lo aprueba):
//   1. analizar(): lee las planillas y arma un listado de cambios propuestos
//      (tabla importacion_items) comparando contra la base actual, en dos pasadas:
//        Pasada 1 — filas cuya OT ya existe: se verifica que la patente coincida
//                   con la de la OT; si no coincide la fila se descarta y se avisa.
//        Pasada 2 — filas cuya OT no existe: se busca la unidad por patente.
//      Para cada patente se toma el dato más reciente de las planillas
//      (se procesan de la más vieja a la más nueva; un vacío/#N/A nunca pisa un dato).
//   2. Cada cambio es de uno de estos tipos:
//        completar        dato faltante en la base que la planilla sí trae
//        alta             unidad (y cliente si hace falta) que no existe todavía
//        conflicto        la base ya tiene otro valor: lo decide una persona
//        cliente_distinto la unidad está a nombre de otro cliente: lo decide una persona
//   3. aprobarAutomaticos() aplica altas y completados; los conflictos y cambios
//      de cliente se resuelven de a uno con resolverItem() (aceptar / rechazar,
//      pudiendo editar el valor final).
const { run, get, all, withTransaction } = require('../../config/database');
const N = require('./normalizacion');
const { parsearPlanilla } = require('./planilla-parser');

const CAMPOS_UNIDAD = ['unidad', 'chasis', 'contacto', 'telefono', 'correo'];
const ETIQUETAS = { cuit: 'CUIT', unidad: 'Modelo', chasis: 'Chasis', contacto: 'Contacto', telefono: 'Teléfono', correo: 'Mail' };

const err = (status, msg) => Object.assign(new Error(msg), { status });

// ─── Lectura de datos actuales ──────────────────────────────────────
async function cargarBase() {
    const clientes = await all(`SELECT id, nombre, COALESCE(cuit,'') AS cuit FROM clientes`);
    const unidades = await all(`
        SELECT u.id, u.patente, u.cliente_id, COALESCE(u.unidad,'') AS unidad, COALESCE(u.chasis,'') AS chasis,
               COALESCE(u.contacto_nombre,'') AS contacto_nombre, COALESCE(u.contacto_apellido,'') AS contacto_apellido,
               COALESCE(u.telefono,'') AS telefono, COALESCE(u.correo,'') AS correo,
               c.nombre AS cliente_nombre, COALESCE(c.cuit,'') AS cliente_cuit
        FROM unidades u LEFT JOIN clientes c ON u.cliente_id = c.id`);
    const ots = await all(`SELECT ot, patente FROM ordenes`);
    return {
        clientes, unidades,
        unidadPorPatente: new Map(unidades.map(u => [u.patente, u])),
        patentePorOt: new Map(ots.map(o => [String(o.ot), o.patente]))
    };
}

// Busca un cliente por CUIT (si hay) y si no por nombre (tolerando nombres recortados a 30).
function buscarCliente(clientes, { nombre, cuit }, { usarCuit = true } = {}) {
    if (usarCuit && cuit) {
        const d = N.soloDigitos(cuit);
        const porCuit = clientes.find(c => c.cuit && N.soloDigitos(c.cuit) === d);
        if (porCuit) return porCuit;
    }
    const n = N.norm(nombre);
    if (!n) return null;
    const exacto = clientes.find(c => N.norm(c.nombre) === n);
    if (exacto) return exacto;
    const candidatos = clientes.filter(c => N.esRecorteDe(nombre, c.nombre));
    return candidatos.length === 1 ? candidatos[0] : null;
}

const valorBase = (unidad, campo) => (campo === 'contacto'
    ? `${unidad.contacto_nombre} ${unidad.contacto_apellido}`.trim()
    : unidad[campo]);

// ─── Análisis ───────────────────────────────────────────────────────
async function analizar(archivos, usuario) {
    const resumen = { archivos: [], filas: 0, filas_por_ot: 0, filas_por_patente: 0, patentes: 0,
        advertencias: [], items: { completar: 0, alta: 0, conflicto: 0, cliente_distinto: 0 } };

    // 1. Leer y ordenar cronológicamente (más viejo primero).
    const parseadas = [];
    for (const a of archivos) {
        const p = await parsearPlanilla(a.buffer, a.originalname);
        resumen.archivos.push({ nombre: a.originalname, hoja: p.hoja || '', filas: p.filas.length, error: p.error || '' });
        if (!p.error) parseadas.push(p);
    }
    const fechaDe = (p) => Math.max(0, ...p.filas.map(f => (f.mes ? f.mes.getTime() : 0)));
    parseadas.sort((x, y) => fechaDe(x) - fechaDe(y) || x.archivo.localeCompare(y.archivo));
    const filas = [];
    parseadas.forEach((p, idx) => p.filas.forEach(f => filas.push({ ...f, _arch: idx })));
    filas.sort((a, b) => (a.mes ? a.mes.getTime() : 0) - (b.mes ? b.mes.getTime() : 0) || a._arch - b._arch || a.fila - b.fila);
    resumen.filas = filas.length;
    if (!filas.length) throw err(400, 'Las planillas no tienen filas con patente para importar.');

    const base = await cargarBase();

    // 2. Dos pasadas.
    const validas = [];
    for (const f of filas) {                                  // Pasada 1: OT existente
        const patenteOt = f.ot ? base.patentePorOt.get(f.ot) : undefined;
        if (patenteOt !== undefined) {
            if (patenteOt === f.patente) { resumen.filas_por_ot++; validas.push({ ...f, via: 'ot' }); }
            else resumen.advertencias.push({ tipo: 'patente_distinta', archivo: f.archivo, fila: f.fila, ot: f.ot,
                detalle: `La OT ${f.ot} tiene la patente ${patenteOt} en el sistema y ${f.patente} en la planilla. Fila omitida.` });
        }
    }
    for (const f of filas) {                                  // Pasada 2: OT inexistente -> por patente
        if (f.ot && base.patentePorOt.has(f.ot)) continue;
        resumen.filas_por_patente++; validas.push({ ...f, via: 'patente' });
    }
    validas.sort((a, b) => (a.mes ? a.mes.getTime() : 0) - (b.mes ? b.mes.getTime() : 0) || a._arch - b._arch || a.fila - b.fila);

    // 3. Consolidar por patente (gana el dato más reciente no vacío).
    const porPatente = new Map();
    for (const f of validas) {
        let a = porPatente.get(f.patente);
        if (!a) { a = { patente: f.patente, nombre: '', cuit: '', contacto: '', telefono: '', correo: '', unidad: '', chasis: '', filas: 0, ultima: null }; porPatente.set(f.patente, a); }
        a.filas++; a.ultima = f;
        if (f.nombre) {
            if (!a.nombre || !N.iguales('nombre', a.nombre, f.nombre)) { a.nombre = f.nombre; a.cuit = f.cuit; }
            else { if (f.nombre.length > a.nombre.length) a.nombre = f.nombre; if (f.cuit) a.cuit = f.cuit; }
        }
        for (const c of ['contacto', 'telefono', 'correo', 'unidad', 'chasis']) if (f[c]) a[c] = f[c];
    }
    resumen.patentes = porPatente.size;

    // 4. Comparar contra la base y generar los cambios.
    const items = new Map(); // clave -> item (el último propuesto reemplaza al anterior)
    const origenDe = (a) => `${a.ultima.archivo} · fila ${a.ultima.fila}${a.ultima.ot ? ` · OT ${a.ultima.ot}` : ''}${a.filas > 1 ? ` (+${a.filas - 1} fila/s más)` : ''}`;
    const agregar = (it) => items.set(`${it.tipo}|${it.entidad}|${it.ref}|${it.campo}`, it);

    for (const a of [...porPatente.values()].sort((x, y) => (x.ultima.mes ? x.ultima.mes.getTime() : 0) - (y.ultima.mes ? y.ultima.mes.getTime() : 0))) {
        const u = base.unidadPorPatente.get(a.patente);
        const origen = origenDe(a);

        if (!u) {
            const existente = a.nombre ? buscarCliente(base.clientes, a, {}) : null;
            agregar({ tipo: 'alta', entidad: 'unidad', ref: a.patente, campo: '', valor_actual: existente ? existente.nombre : '',
                valor_propuesto: a.nombre, payload: { ...a, ultima: undefined, cliente_id: existente ? existente.id : null }, origen });
            continue;
        }

        // Cliente
        let clienteIgual = true;
        if (a.nombre && !N.iguales('nombre', u.cliente_nombre || '', a.nombre)) {
            clienteIgual = false;
            agregar({ tipo: 'cliente_distinto', entidad: 'unidad', ref: a.patente, campo: 'cliente', valor_actual: u.cliente_nombre || '',
                valor_propuesto: a.nombre, payload: { cuit: a.cuit, nombre: a.nombre }, origen });
        }
        if (clienteIgual && a.cuit && u.cliente_id) {
            if (!u.cliente_cuit) agregar({ tipo: 'completar', entidad: 'cliente', ref: String(u.cliente_id), campo: 'cuit', valor_actual: '', valor_propuesto: a.cuit, origen });
            else if (!N.iguales('cuit', u.cliente_cuit, a.cuit)) agregar({ tipo: 'conflicto', entidad: 'cliente', ref: String(u.cliente_id), campo: 'cuit', valor_actual: u.cliente_cuit, valor_propuesto: a.cuit, origen });
        }
        // Campos de la unidad
        for (const campo of CAMPOS_UNIDAD) {
            const propuesto = a[campo];
            if (!propuesto) continue;
            const actual = valorBase(u, campo);
            if (!actual) agregar({ tipo: 'completar', entidad: 'unidad', ref: a.patente, campo, valor_actual: '', valor_propuesto: propuesto, origen });
            else if (!N.iguales(campo, actual, propuesto)) agregar({ tipo: 'conflicto', entidad: 'unidad', ref: a.patente, campo, valor_actual: actual, valor_propuesto: propuesto, origen });
        }
    }

    // 5. Persistir.
    const lista = [...items.values()];
    for (const it of lista) resumen.items[it.tipo]++;
    resumen.advertencias = resumen.advertencias.slice(0, 200);
    const imp = await run(`INSERT INTO importaciones (usuario, archivos, resumen) VALUES (?, ?, ?)`,
        [usuario || '', JSON.stringify(resumen.archivos.map(x => x.nombre)), JSON.stringify(resumen)]);
    const id = imp.lastID;
    await withTransaction(async () => {
        for (const it of lista) {
            await run(`INSERT INTO importacion_items (importacion_id, tipo, entidad, ref, campo, valor_actual, valor_propuesto, payload, origen) VALUES (?,?,?,?,?,?,?,?,?)`,
                [id, it.tipo, it.entidad, it.ref, it.campo || '', it.valor_actual || '', it.valor_propuesto || '', JSON.stringify(it.payload || {}), it.origen || '']);
        }
    });
    return { id, resumen };
}

// ─── Aplicación ─────────────────────────────────────────────────────
async function asegurarBackup(importacionId) {
    const imp = await get(`SELECT backup_hecho FROM importaciones WHERE id = ?`, [importacionId]);
    if (imp && !imp.backup_hecho) {
        try { await require('../../utils/cron').hacerBackupDB(); }
        catch (e) { console.error('[IMPORTACIÓN] No se pudo hacer el backup previo:', e.message); }
        await run(`UPDATE importaciones SET backup_hecho = 1 WHERE id = ?`, [importacionId]);
    }
}

async function resolverClienteDestino({ nombre, cuit, usarCuit }) {
    const clientes = await all(`SELECT id, nombre, COALESCE(cuit,'') AS cuit FROM clientes`);
    const cuitOk = N.limpiar('cuit', cuit);
    let cli = buscarCliente(clientes, { nombre, cuit: cuitOk }, { usarCuit });
    if (!cli) {
        const nombreFinal = N.limpiar('nombre', nombre);
        if (!nombreFinal) throw err(400, 'Falta el nombre del cliente.');
        await run(`INSERT INTO clientes (nombre, cuit) VALUES (?, ?)`, [nombreFinal, cuitOk]);
        cli = await get(`SELECT id, nombre, COALESCE(cuit,'') AS cuit FROM clientes WHERE nombre = ?`, [nombreFinal]);
    } else if (cuitOk && !cli.cuit) {
        await run(`UPDATE clientes SET cuit = ? WHERE id = ?`, [cuitOk, cli.id]);
    }
    return cli;
}

async function escribirCampo(item, valor) {
    const v = N.limpiar(item.campo, valor);
    if (!v) throw err(400, `El valor de ${ETIQUETAS[item.campo] || item.campo} no es válido.`);
    if (item.entidad === 'cliente') {
        await run(`UPDATE clientes SET cuit = ? WHERE id = ?`, [v, Number(item.ref)]);
    } else if (item.campo === 'contacto') {
        await run(`UPDATE unidades SET contacto_nombre = ?, contacto_apellido = '' WHERE patente = ?`, [v, item.ref]);
    } else {
        const col = { unidad: 'unidad', chasis: 'chasis', telefono: 'telefono', correo: 'correo' }[item.campo];
        await run(`UPDATE unidades SET ${col} = ? WHERE patente = ?`, [v, item.ref]);
    }
}

async function valorActualEnBase(item) {
    if (item.entidad === 'cliente') {
        const c = await get(`SELECT COALESCE(cuit,'') AS cuit FROM clientes WHERE id = ?`, [Number(item.ref)]);
        return c ? c.cuit : null;
    }
    const u = await get(`SELECT * FROM unidades WHERE patente = ?`, [item.ref]);
    return u ? valorBase({ ...u, contacto_nombre: u.contacto_nombre || '', contacto_apellido: u.contacto_apellido || '' }, item.campo) || '' : null;
}

// Aplica un item. Devuelve { estado, detalle }.
async function aplicarItem(item, valorFinal) {
    const valor = (valorFinal != null && String(valorFinal).trim() !== '') ? String(valorFinal).trim() : item.valor_propuesto;

    if (item.tipo === 'completar' || item.tipo === 'conflicto') {
        const actual = await valorActualEnBase(item);
        if (actual === null) return { estado: 'omitido', detalle: 'El registro ya no existe.' };
        if (item.tipo === 'completar' && actual) return { estado: 'omitido', detalle: 'Ya tenía un valor cargado; no se modificó.' };
        await escribirCampo(item, valor);
        return { estado: 'aplicado', detalle: '' };
    }

    if (item.tipo === 'cliente_distinto') {
        const unidad = await get(`SELECT id FROM unidades WHERE patente = ?`, [item.ref]);
        if (!unidad) return { estado: 'omitido', detalle: 'La unidad ya no existe.' };
        const payload = JSON.parse(item.payload || '{}');
        const editado = N.norm(valor) !== N.norm(item.valor_propuesto);
        let detalle = '';
        await withTransaction(async () => {
            const cli = await resolverClienteDestino({ nombre: valor, cuit: editado ? '' : payload.cuit, usarCuit: !editado });
            await run(`UPDATE unidades SET cliente_id = ? WHERE patente = ?`, [cli.id, item.ref]);
            detalle = `Unidad reasignada a "${cli.nombre}" (las OT de ${item.ref} siguen a la unidad).`;
        });
        return { estado: 'aplicado', detalle };
    }

    if (item.tipo === 'alta') {
        if (await get(`SELECT id FROM unidades WHERE patente = ?`, [item.ref])) return { estado: 'omitido', detalle: 'La unidad ya existe.' };
        const p = JSON.parse(item.payload || '{}');
        const nombre = valor || p.nombre;
        if (!nombre) return { estado: 'error', detalle: 'La planilla no trae el nombre del cliente.' };
        const editado = N.norm(nombre) !== N.norm(item.valor_propuesto);
        await withTransaction(async () => {
            const cli = await resolverClienteDestino({ nombre, cuit: editado ? '' : p.cuit, usarCuit: !editado });
            await run(`INSERT INTO unidades (patente, cliente_id, unidad, chasis, contacto_nombre, contacto_apellido, telefono, correo) VALUES (?,?,?,?,?,?,?,?)`,
                [item.ref, cli.id, p.unidad || '', p.chasis || '', p.contacto || '', '', p.telefono || '', p.correo || '']);
        });
        return { estado: 'aplicado', detalle: '' };
    }
    return { estado: 'error', detalle: 'Tipo de cambio desconocido.' };
}

async function marcar(item, estado, detalle, valorFinal) {
    await run(`UPDATE importacion_items SET estado = ?, detalle = ?, valor_final = ? WHERE id = ?`, [estado, detalle || '', valorFinal || '', item.id]);
}

async function cerrarSiTermino(importacionId) {
    const { n } = await get(`SELECT COUNT(*) AS n FROM importacion_items WHERE importacion_id = ? AND estado = 'pendiente'`, [importacionId]);
    if (n === 0) await run(`UPDATE importaciones SET estado = 'cerrada' WHERE id = ? AND estado = 'pendiente'`, [importacionId]);
    return n === 0;
}

async function resolverItem(itemId, accion, valor) {
    const item = await get(`SELECT * FROM importacion_items WHERE id = ?`, [itemId]);
    if (!item) throw err(404, 'Cambio no encontrado.');
    if (item.estado !== 'pendiente') throw err(409, 'Este cambio ya fue resuelto.');
    const imp = await get(`SELECT estado FROM importaciones WHERE id = ?`, [item.importacion_id]);
    if (imp.estado !== 'pendiente') throw err(409, 'La importación ya está cerrada.');
    if (accion === 'rechazar') {
        await marcar(item, 'rechazado', '', '');
    } else if (accion === 'aprobar') {
        await asegurarBackup(item.importacion_id);
        try {
            const r = await aplicarItem(item, valor);
            await marcar(item, r.estado, r.detalle, valor || item.valor_propuesto);
        } catch (e) {
            if (e.status === 400) throw e;                       // valor inválido: que lo corrija la persona
            await marcar(item, 'error', e.message, '');
        }
    } else throw err(400, 'Acción inválida (use "aprobar" o "rechazar").');
    await cerrarSiTermino(item.importacion_id);
    return get(`SELECT * FROM importacion_items WHERE id = ?`, [itemId]);
}

async function aprobarAutomaticos(importacionId) {
    const imp = await get(`SELECT * FROM importaciones WHERE id = ?`, [importacionId]);
    if (!imp) throw err(404, 'Importación no encontrada.');
    if (imp.estado !== 'pendiente') throw err(409, 'La importación ya está cerrada.');
    await asegurarBackup(importacionId);
    const items = await all(`SELECT * FROM importacion_items WHERE importacion_id = ? AND estado = 'pendiente' AND tipo IN ('alta','completar') ORDER BY CASE tipo WHEN 'alta' THEN 0 ELSE 1 END, id`, [importacionId]);
    const cuenta = { aplicado: 0, omitido: 0, error: 0 };
    for (const item of items) {
        try {
            const r = await aplicarItem(item, null);
            await marcar(item, r.estado, r.detalle, item.valor_propuesto);
            cuenta[r.estado]++;
        } catch (e) {
            await marcar(item, 'error', e.message, '');
            cuenta.error++;
        }
    }
    const cerrada = await cerrarSiTermino(importacionId);
    return { ...cuenta, cerrada };
}

async function cancelar(importacionId) {
    const imp = await get(`SELECT estado FROM importaciones WHERE id = ?`, [importacionId]);
    if (!imp) throw err(404, 'Importación no encontrada.');
    if (imp.estado !== 'pendiente') throw err(409, 'La importación ya está cerrada.');
    await run(`UPDATE importacion_items SET estado = 'rechazado' WHERE importacion_id = ? AND estado = 'pendiente'`, [importacionId]);
    await run(`UPDATE importaciones SET estado = 'cancelada' WHERE id = ?`, [importacionId]);
    return { status: 'Importación cancelada' };
}

// ─── Consultas ──────────────────────────────────────────────────────
async function listar() {
    return all(`
        SELECT i.id, i.creada_en, i.usuario, i.archivos, i.estado,
               (SELECT COUNT(*) FROM importacion_items WHERE importacion_id = i.id AND estado = 'pendiente') AS pendientes,
               (SELECT COUNT(*) FROM importacion_items WHERE importacion_id = i.id AND estado = 'aplicado') AS aplicados
        FROM importaciones i ORDER BY i.id DESC LIMIT 30`);
}

async function obtener(id) {
    const imp = await get(`SELECT * FROM importaciones WHERE id = ?`, [id]);
    if (!imp) throw err(404, 'Importación no encontrada.');
    const conteo = await all(`SELECT tipo, estado, COUNT(*) AS n FROM importacion_items WHERE importacion_id = ? GROUP BY tipo, estado`, [id]);
    return { ...imp, archivos: JSON.parse(imp.archivos || '[]'), resumen: JSON.parse(imp.resumen || '{}'), conteo };
}

async function items(id, { tipo, estado, page = 1, limit = 50 } = {}) {
    const p = Math.max(1, parseInt(page) || 1), l = Math.min(200, Math.max(1, parseInt(limit) || 50));
    let where = 'WHERE importacion_id = ?'; const params = [id];
    if (tipo) { where += ' AND tipo = ?'; params.push(tipo); }
    if (estado) { where += ' AND estado = ?'; params.push(estado); }
    const { total } = await get(`SELECT COUNT(*) AS total FROM importacion_items ${where}`, params);
    const data = await all(`SELECT * FROM importacion_items ${where} ORDER BY id LIMIT ? OFFSET ?`, [...params, l, (p - 1) * l]);
    return { data: data.map(d => ({ ...d, payload: JSON.parse(d.payload || '{}') })), total, page: p, limit: l, totalPages: Math.max(1, Math.ceil(total / l)) };
}

module.exports = { analizar, aprobarAutomaticos, resolverItem, cancelar, listar, obtener, items, buscarCliente, ETIQUETAS };
