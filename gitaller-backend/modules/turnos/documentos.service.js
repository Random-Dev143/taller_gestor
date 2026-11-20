'use strict';
// ─── LEGAJO DIGITAL: DOCUMENTOS (PDF) DE LA OT ─────────────────────
// Los archivos viven en la carpeta configurada (configuracion.carpeta_documentos),
// ordenados por OT: <carpeta>/OT-<ot>/<tipo>_v<n>_<fecha>.pdf. En la base solo va la
// ruta RELATIVA, para poder mover la carpeta sin romper nada. Nunca se borra un archivo:
// la baja es lógica y queda quién, cuándo y por qué.

const fs = require('fs');
const path = require('path');
const { run, all, get } = require('../../config/database');
const { validarCarpeta, rutaLibre } = require('../../services/carpeta-informes');

const TIPOS = ['presupuesto', 'otro'];
const ESTADOS_PRESUPUESTO = ['pendiente', 'aprobado', 'aprobado_parcial', 'rechazado'];

const fail = (status, message) => Object.assign(new Error(message), { status });
const txt = (v) => (v === undefined || v === null) ? '' : String(v).trim();
const pad = (n) => String(n).padStart(2, '0');
const nombreUsuario = (u) => (u && (u.nombre_completo || u.email)) || '';

async function carpetaBase() {
    const c = await get(`SELECT carpeta_documentos FROM configuracion WHERE id = 1`);
    const carpeta = c && c.carpeta_documentos;
    if (!carpeta || !carpeta.trim()) throw fail(409, 'Falta configurar la carpeta de documentos (Configuración).');
    try { return validarCarpeta(carpeta); }
    catch (e) { throw fail(409, `La carpeta de documentos no está disponible: ${e.message}`); }
}

function montoValido(v) {
    if (v === undefined || v === null || v === '') return null;
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0) throw fail(400, 'El monto del presupuesto no es válido.');
    return n;
}

async function listar(ot, { incluirBorrados = false } = {}) {
    return all(`SELECT * FROM ot_documentos WHERE ot = ? ${incluirBorrados ? '' : 'AND borrado_en IS NULL'} ORDER BY subido_en, id`, [ot]);
}

async function subir(ot, archivo, datos, usuario) {
    if (!archivo || !archivo.buffer) throw fail(400, 'Adjuntá un archivo PDF.');
    // Se verifica el contenido real y no solo la extensión: un PDF empieza con "%PDF".
    if (archivo.buffer.subarray(0, 5).toString('latin1') !== '%PDF-') throw fail(400, 'El archivo no es un PDF válido.');
    if (!(await get(`SELECT 1 AS x FROM ordenes WHERE ot = ?`, [ot]))) throw fail(404, 'OT no encontrada.');

    const tipo = txt(datos.tipo) || 'presupuesto';
    if (!TIPOS.includes(tipo)) throw fail(400, 'Tipo de documento inválido.');
    const esRevision = datos.es_revision === true || datos.es_revision === 'true' || datos.es_revision === '1' || datos.es_revision === 1;
    const monto = tipo === 'presupuesto' ? montoValido(datos.monto) : null;

    const existentes = (await get(`SELECT COUNT(*) AS n FROM ot_documentos WHERE ot = ? AND tipo = ? AND borrado_en IS NULL`, [ot, tipo])).n;
    if (tipo === 'presupuesto' && existentes > 0 && !esRevision) {
        throw fail(409, 'Esta OT ya tiene un presupuesto. Si es una ampliación o nueva versión, marcalo como tal.');
    }
    const version = (await get(`SELECT COALESCE(MAX(version), 0) + 1 AS v FROM ot_documentos WHERE ot = ? AND tipo = ?`, [ot, tipo])).v;

    const base = await carpetaBase();
    const dir = path.join(base, `OT-${ot.replace(/[^A-Za-z0-9_-]/g, '_')}`);
    fs.mkdirSync(dir, { recursive: true });
    const d = new Date();
    const sello = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
    const destino = rutaLibre(dir, `${tipo}_v${version}_${sello}.pdf`);
    fs.writeFileSync(destino, archivo.buffer);
    const rutaRelativa = path.relative(base, destino).split(path.sep).join('/');

    try {
        const r = await run(
            `INSERT INTO ot_documentos (ot, tipo, version, es_revision, revision_motivo, nombre_original, ruta_relativa, tamano, monto, estado_presupuesto, subido_por)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [ot, tipo, version, esRevision ? 1 : 0, esRevision ? txt(datos.revision_motivo) : '',
             txt(archivo.originalname).slice(0, 200), rutaRelativa, archivo.buffer.length, monto,
             tipo === 'presupuesto' ? 'pendiente' : null, nombreUsuario(usuario)]);
        return { status: 'Documento subido', id: r.lastID, version };
    } catch (e) {
        try { fs.unlinkSync(destino); } catch (_) { /* nada que limpiar */ }
        throw e;
    }
}

// El asesor registra cómo respondió el cliente al presupuesto y por cuánto.
async function actualizarPresupuesto(id, datos, usuario) {
    const doc = await get(`SELECT * FROM ot_documentos WHERE id = ?`, [id]);
    if (!doc || doc.borrado_en) throw fail(404, 'Documento no encontrado.');
    if (doc.tipo !== 'presupuesto') throw fail(400, 'Solo los presupuestos tienen estado y monto.');

    const estado = datos.estado_presupuesto !== undefined ? txt(datos.estado_presupuesto) : doc.estado_presupuesto;
    if (!ESTADOS_PRESUPUESTO.includes(estado)) throw fail(400, 'Estado de presupuesto inválido.');
    const monto = datos.monto !== undefined ? montoValido(datos.monto) : doc.monto;
    const motivo = datos.revision_motivo !== undefined && doc.es_revision ? txt(datos.revision_motivo) : doc.revision_motivo;

    await run(`UPDATE ot_documentos SET estado_presupuesto = ?, monto = ?, revision_motivo = ?, estado_actualizado_en = CURRENT_TIMESTAMP WHERE id = ?`,
        [estado, monto, motivo, id]);
    return { status: 'Presupuesto actualizado', id, estado_presupuesto: estado, monto };
}

async function borrar(id, motivo, usuario) {
    if (txt(motivo).length < 3) throw fail(400, 'Indicá la causa por la que se da de baja el documento.');
    const doc = await get(`SELECT id, borrado_en FROM ot_documentos WHERE id = ?`, [id]);
    if (!doc) throw fail(404, 'Documento no encontrado.');
    if (doc.borrado_en) throw fail(409, 'El documento ya fue dado de baja.');
    await run(`UPDATE ot_documentos SET borrado_en = CURRENT_TIMESTAMP, borrado_por = ?, borrado_motivo = ? WHERE id = ?`,
        [nombreUsuario(usuario), txt(motivo), id]);
    return { status: 'Documento dado de baja', id };
}

// Ruta absoluta del archivo, verificando que no se salga de la carpeta configurada.
async function rutaArchivo(id) {
    const doc = await get(`SELECT * FROM ot_documentos WHERE id = ?`, [id]);
    if (!doc || doc.borrado_en) throw fail(404, 'Documento no encontrado.');
    const base = await carpetaBase();
    const abs = path.resolve(base, doc.ruta_relativa);
    if (abs !== base && !abs.startsWith(base + path.sep)) throw fail(400, 'Ruta de archivo inválida.');
    if (!fs.existsSync(abs)) throw fail(404, 'El archivo no está en la carpeta de documentos (¿se movió o se borró?).');
    return { abs, nombre: doc.nombre_original || `${doc.tipo}_v${doc.version}.pdf` };
}

module.exports = { listar, subir, actualizarPresupuesto, borrar, rutaArchivo, TIPOS, ESTADOS_PRESUPUESTO };
