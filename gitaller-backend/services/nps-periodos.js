'use strict';
// Funciones puras de fechas/períodos de la planilla de NPS (sin base de datos:
// se pueden testear sin tocar la base real).
const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto',
    'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

const FECHA_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
function parseFecha(s) {
    const m = FECHA_RE.exec(String(s || ''));
    if (!m) return null;
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    const dt = new Date(Date.UTC(y, mo - 1, d));
    if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
    return { y, mo, d };
}

// "Octubre 1ro al 15", "Octubre 16 al 31", "Octubre 28 al Noviembre 5".
function tituloPeriodo(desde, hasta) {
    const a = parseFecha(desde), b = parseFecha(hasta);
    if (!a || !b) throw Object.assign(new Error('Fechas inválidas (use AAAA-MM-DD).'), { status: 400 });
    if (desde > hasta) throw Object.assign(new Error('La fecha "desde" no puede ser posterior a "hasta".'), { status: 400 });
    const dia = (x) => (x.d === 1 ? '1ro' : String(x.d));
    if (desde === hasta) return `${MESES[a.mo - 1]} ${dia(a)}`;
    if (a.y === b.y && a.mo === b.mo) return `${MESES[a.mo - 1]} ${dia(a)} al ${b.d}`;
    return `${MESES[a.mo - 1]} ${dia(a)} al ${MESES[b.mo - 1]} ${b.d}`;
}

const pad = (n) => String(n).padStart(2, '0');
const iso = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;

// Último período quincenal COMPLETO a la fecha dada (hora local):
//   del 16 en adelante -> 1 al 15 del mes en curso
//   del 1 al 15        -> 16 a fin de mes del mes anterior
function periodoCerradoReciente(hoy = new Date()) {
    const y = hoy.getFullYear(), m = hoy.getMonth() + 1, d = hoy.getDate();
    if (d >= 16) return { desde: iso(y, m, 1), hasta: iso(y, m, 15) };
    const py = m === 1 ? y - 1 : y, pm = m === 1 ? 12 : m - 1;
    return { desde: iso(py, pm, 16), hasta: iso(py, pm, new Date(py, pm, 0).getDate()) };
}

module.exports = { MESES, parseFecha, tituloPeriodo, periodoCerradoReciente };
