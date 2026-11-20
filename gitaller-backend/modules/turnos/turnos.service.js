'use strict';
// ─── SERVICE DE TURNOS ──────────────────────────────────────────────
// Agenda del asesor: programar turnos, registrar la confirmación del cliente
// (por llamado por ahora), ver la capacidad del día y convertir el turno en OT.
// El turno que se convierte en OT queda vinculado (turnos.ot) y alimenta el
// legajo digital de esa OT.

const { run, all, get } = require('../../config/database');
const ordenesService = require('../ordenes/ordenes.service');

const TIPOS = ['normal', 'garantia', 'retrabajo'];
const ESTADOS_MANUALES = ['sin_confirmar', 'confirmado', 'reprogramar', 'cancelado', 'no_asistio'];
const RESULTADOS_LLAMADO = { confirmo: 'confirmado', reprogramar: 'reprogramar', cancelo: 'cancelado', no_atiende: null, otro: null };

// Un turno otorgado con 1 día o menos de antelación no necesita recordatorio ni
// confirmación: nace confirmado. El resto queda "sin confirmar" hasta que el cliente confirme.
const DIAS_SIN_CONFIRMACION = 1;
// Los confirmados sin OT aparecen en la alerta (punto rojo) desde el día anterior al turno.
const DIAS_ALERTA_ANTICIPADA = 1;

const fail = (status, message) => Object.assign(new Error(message), { status });
const txt = (v) => (v === undefined || v === null) ? '' : String(v).trim();
const normalizarPatente = (p) => txt(p).replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
const soloDigitos = (v) => String(v ?? '').replace(/[^\d]/g, '');
const fechaValida = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(Date.parse(v));
const pad = (n) => String(n).padStart(2, '0');

// Cualquier fecha de entrada (ISO con Z o "YYYY-MM-DD HH:MM:SS" UTC) -> "YYYY-MM-DD HH:MM:SS" UTC.
function aUtcSql(valor) {
    const t = txt(valor).replace(' ', 'T');
    if (!t) return null;
    const d = new Date(/(Z|[+-]\d{2}:?\d{2})$/i.test(t) ? t : `${t}Z`);
    return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 19).replace('T', ' ');
}

async function evento(turnoId, tipo, detalle, usuario) {
    await run(`INSERT INTO turno_eventos (turno_id, tipo, detalle, usuario) VALUES (?, ?, ?, ?)`,
        [turnoId, tipo, txt(detalle), txt(usuario)]);
}

const nombreUsuario = (u) => (u && (u.nombre_completo || u.email)) || '';

// Días (calendario local) entre hoy y la fecha del turno.
async function diasDeAntelacion(fechaHoraUtc) {
    const r = await get(`SELECT CAST(julianday(date(?, 'localtime')) - julianday(date('now', 'localtime')) AS INTEGER) AS dias`, [fechaHoraUtc]);
    return r.dias;
}

function leerDatos(body, parcial = false) {
    const d = {};
    const set = (k, v) => { if (!parcial || body[k] !== undefined) d[k] = v; };

    if (!parcial || body.fecha_hora !== undefined) {
        const f = aUtcSql(body.fecha_hora);
        if (!f) throw fail(400, 'La fecha y hora del turno no es válida.');
        d.fecha_hora = f;
    }
    if (!parcial || body.tipo !== undefined) {
        const tipo = txt(body.tipo) || 'normal';
        if (!TIPOS.includes(tipo)) throw fail(400, 'Tipo de turno inválido (normal, garantia o retrabajo).');
        d.tipo = tipo;
    }
    set('cliente', txt(body.cliente).toUpperCase());
    set('patente', normalizarPatente(body.patente));
    set('unidad', txt(body.unidad));
    set('chasis', txt(body.chasis));
    set('contacto_nombre', txt(body.contacto_nombre));
    set('telefono', txt(body.telefono));
    set('correo', txt(body.correo));
    set('motivo', txt(body.motivo));
    if (!parcial || body.horas_estimadas !== undefined) {
        const h = Number(body.horas_estimadas);
        d.horas_estimadas = Number.isFinite(h) && h > 0 ? h : 0;
    }
    if (!parcial || body.km_estimado !== undefined) {
        const km = soloDigitos(body.km_estimado);
        d.km_estimado = km ? parseInt(km, 10) : null;
    }
    if (!parcial) {
        for (const campo of ['cliente', 'patente', 'unidad']) {
            if (!d[campo]) throw fail(400, `Falta completar: ${campo}.`);
        }
    } else {
        for (const campo of ['cliente', 'patente', 'unidad']) {
            if (campo in d && !d[campo]) throw fail(400, `Falta completar: ${campo}.`);
        }
    }
    return d;
}

async function crear(body, usuario) {
    const d = leerDatos(body);
    const dias = await diasDeAntelacion(d.fecha_hora);
    const nace_confirmado = dias <= DIAS_SIN_CONFIRMACION;
    const asesor = txt(body.asesor_legajo) || (usuario && usuario.legajo) || null;

    const r = await run(
        `INSERT INTO turnos (fecha_hora, tipo, estado, cliente, patente, unidad, chasis, contacto_nombre, telefono, correo,
                             motivo, horas_estimadas, km_estimado, asesor_legajo, confirmado_via, confirmado_en, creado_por)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ${nace_confirmado ? 'CURRENT_TIMESTAMP' : 'NULL'}, ?)`,
        [d.fecha_hora, d.tipo, nace_confirmado ? 'confirmado' : 'sin_confirmar', d.cliente, d.patente, d.unidad, d.chasis,
         d.contacto_nombre, d.telefono, d.correo, d.motivo, d.horas_estimadas, d.km_estimado, asesor,
         nace_confirmado ? 'otorgado_con_antelacion' : null, nombreUsuario(usuario)]
    );
    const id = r.lastID;
    await evento(id, 'creado', nace_confirmado ? 'Turno otorgado con poca antelación: no requiere confirmación.' : 'Turno programado.', nombreUsuario(usuario));
    return { status: 'Turno creado', id, estado: nace_confirmado ? 'confirmado' : 'sin_confirmar' };
}

async function obtener(id) {
    const turno = await get(`SELECT t.*, o.estado_actual AS ot_estado FROM turnos t LEFT JOIN ordenes o ON o.ot = t.ot WHERE t.id = ?`, [id]);
    if (!turno) throw fail(404, 'Turno no encontrado.');
    turno.eventos = await all(`SELECT id, tipo, detalle, usuario, ts FROM turno_eventos WHERE turno_id = ? ORDER BY ts, id`, [id]);
    return turno;
}

async function actualizar(id, body, usuario) {
    const turno = await obtener(id);
    if (turno.ot) throw fail(409, 'El turno ya generó la OT y no se puede modificar.');
    if (turno.estado === 'cancelado') throw fail(409, 'El turno está cancelado.');

    const d = leerDatos(body, true);
    const campos = Object.keys(d);
    if (campos.length === 0) return { status: 'Sin cambios', id: turno.id, estado: turno.estado };

    let estado = turno.estado;
    let detalle = 'Datos del turno modificados.';
    if (d.fecha_hora && d.fecha_hora !== turno.fecha_hora) {
        // Reprogramación: se vuelve a evaluar si necesita confirmación con la nueva fecha.
        const dias = await diasDeAntelacion(d.fecha_hora);
        estado = dias <= DIAS_SIN_CONFIRMACION ? 'confirmado' : 'sin_confirmar';
        detalle = `Reprogramado: ${turno.fecha_hora} → ${d.fecha_hora} (UTC).`;
        await run(`UPDATE turnos SET estado = ?, confirmado_via = ?, confirmado_en = ${estado === 'confirmado' ? 'CURRENT_TIMESTAMP' : 'NULL'} WHERE id = ?`,
            [estado, estado === 'confirmado' ? 'otorgado_con_antelacion' : null, id]);
    }
    await run(`UPDATE turnos SET ${campos.map(c => `${c} = ?`).join(', ')}, actualizado_en = CURRENT_TIMESTAMP WHERE id = ?`,
        [...campos.map(c => d[c]), id]);
    await evento(id, d.fecha_hora && d.fecha_hora !== turno.fecha_hora ? 'reprogramado' : 'editado', detalle, nombreUsuario(usuario));
    return { status: 'Turno actualizado', id, estado };
}

async function cambiarEstado(id, { estado, motivo, via, detalle } = {}, usuario) {
    const turno = await obtener(id);
    if (turno.ot) throw fail(409, 'El turno ya generó la OT.');
    if (!ESTADOS_MANUALES.includes(estado)) throw fail(400, 'Estado inválido.');
    if (estado === 'cancelado' && !txt(motivo)) throw fail(400, 'Indicá el motivo de la cancelación.');

    if (estado === 'confirmado') {
        await run(`UPDATE turnos SET estado = 'confirmado', confirmado_via = ?, confirmado_en = CURRENT_TIMESTAMP, actualizado_en = CURRENT_TIMESTAMP WHERE id = ?`,
            [txt(via) || 'asesor', id]);
    } else if (estado === 'cancelado') {
        await run(`UPDATE turnos SET estado = 'cancelado', cancelado_motivo = ?, actualizado_en = CURRENT_TIMESTAMP WHERE id = ?`, [txt(motivo), id]);
    } else {
        await run(`UPDATE turnos SET estado = ?, confirmado_via = NULL, confirmado_en = NULL, actualizado_en = CURRENT_TIMESTAMP WHERE id = ?`, [estado, id]);
    }
    await evento(id, estado, detalle || txt(motivo), nombreUsuario(usuario));
    return { status: 'Estado actualizado', id, estado };
}

// Registro manual del llamado de confirmación (queda en el legajo).
async function registrarLlamado(id, { resultado, nota } = {}, usuario) {
    if (!(resultado in RESULTADOS_LLAMADO)) throw fail(400, 'Resultado del llamado inválido.');
    const turno = await obtener(id);
    if (turno.ot) throw fail(409, 'El turno ya generó la OT.');

    await evento(id, 'llamado', `${resultado}${txt(nota) ? ` — ${txt(nota)}` : ''}`, nombreUsuario(usuario));
    const nuevoEstado = RESULTADOS_LLAMADO[resultado];
    if (nuevoEstado) {
        return cambiarEstado(id, {
            estado: nuevoEstado, via: 'llamado',
            motivo: nuevoEstado === 'cancelado' ? (txt(nota) || 'Canceló el cliente por llamado.') : '',
            detalle: `Por llamado${txt(nota) ? `: ${txt(nota)}` : ''}`
        }, usuario);
    }
    return { status: 'Llamado registrado', id, estado: turno.estado };
}

async function listar({ desde, hasta, estado } = {}) {
    const hoy = (await get(`SELECT date('now', 'localtime') AS d`)).d;
    const d1 = fechaValida(desde) ? desde : hoy;
    const d2 = fechaValida(hasta) ? hasta : (await get(`SELECT date(?, '+6 day') AS d`, [d1])).d;
    const params = [d1, d2];
    let filtro = '';
    if (estado) { filtro = ' AND t.estado = ?'; params.push(estado); }
    return all(
        `SELECT t.*, o.estado_actual AS ot_estado, date(t.fecha_hora, 'localtime') AS dia
         FROM turnos t LEFT JOIN ordenes o ON o.ot = t.ot
         WHERE date(t.fecha_hora, 'localtime') BETWEEN ? AND ?${filtro}
         ORDER BY t.fecha_hora, t.id`, params);
}

// Cantidad que muestra el punto rojo: turnos confirmados a los que todavía no se les generó la OT
// (hoy, mañana y los atrasados que nadie resolvió).
async function resumen() {
    const r = await get(
        `SELECT COUNT(*) AS n FROM turnos
         WHERE estado = 'confirmado' AND ot IS NULL
           AND date(fecha_hora, 'localtime') <= date('now', 'localtime', '+${DIAS_ALERTA_ANTICIPADA} day')`);
    return { confirmados_sin_ot: r.n };
}

// Próximo número de OT sugerido: último numérico + 1 (se ignora la OT interna '0000'). Es solo una sugerencia editable.
async function siguienteOt() {
    const r = await get(`SELECT MAX(CAST(ot AS INTEGER)) AS m FROM ordenes WHERE ot != '0000' AND ot NOT GLOB '*[^0-9]*'`);
    return { siguiente: r && r.m ? String(r.m + 1) : '' };
}

// Último kilometraje registrado de la unidad (para advertir, sin bloquear, si el nuevo es menor).
async function ultimoKm(patente) {
    const filas = await all(
        `SELECT ot, kilometraje FROM ordenes WHERE patente = ? AND ot != '0000' AND kilometraje != '' ORDER BY fecha_apertura DESC LIMIT 10`,
        [normalizarPatente(patente)]);
    for (const f of filas) {
        const km = soloDigitos(f.kilometraje);
        if (km) return { km: parseInt(km, 10), ot: f.ot };
    }
    return { km: null, ot: null };
}

async function generarOt(id, body, usuario) {
    const turno = await obtener(id);
    if (turno.ot) throw fail(409, `El turno ya generó la OT ${turno.ot}.`);
    if (turno.estado === 'cancelado') throw fail(409, 'El turno está cancelado.');

    const ot = txt(body.ot);
    if (!ot) throw fail(400, 'Ingresá el número de OT.');
    const km = soloDigitos(body.kilometraje);
    if (!km) throw fail(400, 'Ingresá el kilometraje exacto de la unidad.');
    if (await get(`SELECT 1 AS x FROM ordenes WHERE ot = ?`, [ot])) throw fail(409, `Ya existe la OT ${ot}.`);

    const asesor = txt(body.asesor_legajo) || turno.asesor_legajo || (usuario && usuario.legajo);
    if (!asesor) throw fail(400, 'Indicá el legajo del asesor.');

    await ordenesService.crear({
        ot,
        cliente: turno.cliente,
        patente: turno.patente,
        unidad: turno.unidad,
        kilometraje: String(parseInt(km, 10)),
        asesor_legajo: asesor,
        es_garantia: turno.tipo === 'garantia',
        es_retrabajo: turno.tipo === 'retrabajo',
        ot_retrabajo_origen: body.ot_retrabajo_origen,
        es_no_iveco: !!body.es_no_iveco,
        tiempo_asignado_horas: turno.horas_estimadas || 0
    });

    // crear() ya hizo su propia transacción; el vínculo con el turno y los datos de contacto van aparte.
    await run(`UPDATE turnos SET ot = ?, estado = 'ot_creada', actualizado_en = CURRENT_TIMESTAMP WHERE id = ?`, [ot, id]);
    await evento(id, 'ot_creada', `OT ${ot} · ${parseInt(km, 10)} km`, nombreUsuario(usuario));

    // Los datos de contacto cargados en el turno completan la ficha de la unidad (sin pisar lo que ya tenga).
    await run(
        `UPDATE unidades SET
            telefono = CASE WHEN COALESCE(telefono, '') = '' THEN ? ELSE telefono END,
            correo = CASE WHEN COALESCE(correo, '') = '' THEN ? ELSE correo END,
            contacto_nombre = CASE WHEN COALESCE(contacto_nombre, '') = '' THEN ? ELSE contacto_nombre END,
            chasis = CASE WHEN COALESCE(chasis, '') = '' THEN ? ELSE chasis END
         WHERE patente = ?`,
        [turno.telefono || '', turno.correo || '', turno.contacto_nombre || '', turno.chasis || '', turno.patente]);

    return { status: 'OT creada desde el turno', ot, turno_id: id };
}

// ─── Capacidad ───────────────────────────────────────────────────────
// Horas disponibles = mecánicos × horas de jornada − ausencias (excepciones_mecanicos).
// Horas comprometidas = horas estimadas de los turnos vigentes del día. Es un indicador de ayuda:
// no incluye las OT que ya están en el taller, ni bloquea. Garantías y retrabajos se informan
// aparte porque se pueden dar como sobreturno.
async function capacidad({ desde, hasta } = {}) {
    const hoy = (await get(`SELECT date('now', 'localtime') AS d`)).d;
    const d1 = fechaValida(desde) ? desde : hoy;
    const d2 = fechaValida(hasta) ? hasta : (await get(`SELECT date(?, '+6 day') AS d`, [d1])).d;
    if ((new Date(d2) - new Date(d1)) / 86400000 > 62) throw fail(400, 'El rango máximo es de 62 días.');

    const cfg = (await get(`SELECT * FROM configuracion WHERE id = 1`)) || {};
    const mecanicos = (await get(`SELECT COUNT(*) AS n FROM legajos WHERE rol = 'mecanico'`)).n;
    const feriados = new Set((await all(`SELECT fecha FROM feriados WHERE fecha BETWEEN ? AND ?`, [d1, d2])).map(f => f.fecha));
    const ausencias = await all(`SELECT fecha, horas_descontadas FROM excepciones_mecanicos WHERE fecha BETWEEN ? AND ?`, [d1, d2]);
    const turnos = await all(
        `SELECT date(fecha_hora, 'localtime') AS dia, tipo, horas_estimadas FROM turnos
         WHERE estado IN ('sin_confirmar','confirmado','ot_creada') AND date(fecha_hora, 'localtime') BETWEEN ? AND ?`, [d1, d2]);

    const horasDeJornada = (dow) => {
        if (dow === 0) return 0;
        if (dow === 6) return cfg.trabaja_sabados ? Math.max(0, (cfg.sabado_hora_cierre ?? 13) - (cfg.sabado_hora_apertura ?? 8)) : 0;
        const bruto = (cfg.hora_cierre ?? 18) - (cfg.hora_apertura ?? 8);
        const almuerzo = cfg.trabaja_corrido ? 0 : Math.max(0, (cfg.hora_almuerzo_fin ?? 14) - (cfg.hora_almuerzo_inicio ?? 13));
        return Math.max(0, bruto - almuerzo);
    };

    const dias = [];
    const cursor = new Date(`${d1}T12:00:00`);
    const fin = new Date(`${d2}T12:00:00`);
    while (cursor <= fin) {
        const fecha = `${cursor.getFullYear()}-${pad(cursor.getMonth() + 1)}-${pad(cursor.getDate())}`;
        const jornada = feriados.has(fecha) ? 0 : horasDeJornada(cursor.getDay());
        const descuento = ausencias.filter(a => a.fecha === fecha)
            .reduce((acc, a) => acc + Math.min(Number(a.horas_descontadas) || 0, jornada), 0);
        const delDia = turnos.filter(t => t.dia === fecha);
        dias.push({
            fecha,
            abierto: jornada > 0,
            horas_disponibles: Math.max(0, mecanicos * jornada - descuento),
            horas_comprometidas: delDia.filter(t => t.tipo === 'normal').reduce((a, t) => a + (t.horas_estimadas || 0), 0),
            horas_prioritarias: delDia.filter(t => t.tipo !== 'normal').reduce((a, t) => a + (t.horas_estimadas || 0), 0),
            turnos: delDia.length
        });
        cursor.setDate(cursor.getDate() + 1);
    }
    return { mecanicos, dias };
}

// ─── Legajo digital de una OT ────────────────────────────────────────
async function legajo(ot) {
    const orden = await get(
        `SELECT o.ot, o.patente, o.kilometraje, o.fecha_apertura, o.fecha_cierre, o.estado_actual, o.es_garantia,
                o.es_retrabajo, o.ot_retrabajo_origen, o.asesor_legajo, u.unidad, c.nombre AS cliente
         FROM ordenes o JOIN unidades u ON o.patente = u.patente JOIN clientes c ON u.cliente_id = c.id WHERE o.ot = ?`, [ot]);
    if (!orden) throw fail(404, 'OT no encontrada.');

    const turno = await get(`SELECT * FROM turnos WHERE ot = ?`, [ot]);
    const eventos = turno ? await all(`SELECT * FROM turno_eventos WHERE turno_id = ? ORDER BY ts, id`, [turno.id]) : [];
    const documentos = await all(`SELECT * FROM ot_documentos WHERE ot = ? ORDER BY subido_en, id`, [ot]);
    const explicacion = await get(`SELECT causa FROM explicaciones WHERE ot = ?`, [ot]);
    const aportes = await all(
        `SELECT ap.actividades, ap.horas, ap.fecha_aporte, l.nombre FROM aportes ap JOIN legajos l ON ap.legajo = l.legajo WHERE ap.ot = ? ORDER BY ap.fecha_aporte`, [ot]);

    return { orden, turno, eventos, documentos, explicacion: explicacion ? explicacion.causa : '', aportes };
}

module.exports = {
    crear, obtener, actualizar, cambiarEstado, registrarLlamado, listar, resumen,
    siguienteOt, ultimoKm, generarOt, capacidad, legajo
};
