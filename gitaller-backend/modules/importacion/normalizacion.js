'use strict';
// Funciones puras de limpieza y comparación de datos de planillas.
// "Dato desconocido" (placeholder) => cadena vacía: nunca se importa ni pisa un dato real.

const PLACEHOLDERS = new Set(['#n/a', 'n/a', 'na', '-', '--', 's/d', 'sd', 'sin dato', 'sin datos', 'null', 'undefined']);

const sinAcentos = (s) => String(s == null ? '' : s).normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const norm = (s) => sinAcentos(s).toLowerCase().replace(/\s+/g, ' ').trim();
const soloDigitos = (s) => String(s == null ? '' : s).replace(/\D/g, '');
const colapsar = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
const esPlaceholder = (s) => PLACEHOLDERS.has(norm(s));

// Largo a partir del cual se considera que un texto de la planilla pudo venir
// recortado (la planilla original corta Nombre y Modelo a 30 caracteres).
const LARGO_RECORTE = 28;

function limpiarCuit(v) {
    if (esPlaceholder(v)) return '';
    const d = soloDigitos(v);
    if (d.length !== 11) return '';
    if (/^0+$/.test(d) || d === '00123456780') return '';
    return `${d.slice(0, 2)}-${d.slice(2, 10)}-${d.slice(10)}`;
}
function limpiarMail(v) {
    if (esPlaceholder(v)) return '';
    const m = colapsar(v).replace(/^mailto:/i, '').toLowerCase();
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(m) ? m : '';
}
function limpiarTelefono(v) {
    if (esPlaceholder(v)) return '';
    const t = colapsar(v);
    return soloDigitos(t).length >= 6 && !/^0+$/.test(soloDigitos(t)) ? t : '';
}
function limpiarPatente(v) {
    const p = String(v == null ? '' : v).toUpperCase().replace(/[^A-Z0-9]/g, '');
    return /^[A-Z0-9]{5,8}$/.test(p) ? p : '';
}
function limpiarChasis(v) {
    if (esPlaceholder(v)) return '';
    const c = String(v == null ? '' : v).toUpperCase().replace(/\s+/g, '');
    if (c.length < 6 || c === 'X111111') return '';
    return c;
}
function limpiarTexto(v) { return esPlaceholder(v) ? '' : colapsar(v); }

const LIMPIADORES = {
    cuit: limpiarCuit, correo: limpiarMail, telefono: limpiarTelefono, chasis: limpiarChasis,
    contacto: limpiarTexto, unidad: limpiarTexto, nombre: (v) => limpiarTexto(v).toUpperCase()
};
const limpiar = (campo, valor) => (LIMPIADORES[campo] || limpiarTexto)(valor);

// ¿Es `corto` un recorte de `largo`? (nombres/modelos cortados a 30 caracteres)
function esRecorteDe(corto, largo) {
    const a = norm(corto), b = norm(largo);
    return a.length >= LARGO_RECORTE && b.length > a.length && b.startsWith(a);
}

const sinTratamiento = (s) => norm(s).replace(/^(sr|sra|srta|sres|dr|dra|ing)\.?\s+/, '');

// ¿Dos valores del mismo campo son "lo mismo"?
function iguales(campo, a, b) {
    if (campo === 'cuit') return soloDigitos(a) === soloDigitos(b);
    if (campo === 'telefono') {
        const x = soloDigitos(a), y = soloDigitos(b);
        return x === y || (x.length >= 8 && y.length >= 8 && (x.endsWith(y) || y.endsWith(x)));
    }
    if (campo === 'correo') return norm(a) === norm(b);
    if (campo === 'chasis') return String(a).toUpperCase().replace(/\s+/g, '') === String(b).toUpperCase().replace(/\s+/g, '');
    if (campo === 'contacto') return sinTratamiento(a) === sinTratamiento(b);
    // nombre y unidad (modelo)
    return norm(a) === norm(b) || esRecorteDe(a, b) || esRecorteDe(b, a);
}

module.exports = { limpiar, limpiarCuit, limpiarMail, limpiarTelefono, limpiarPatente, limpiarChasis,
    iguales, esRecorteDe, norm, soloDigitos, colapsar, esPlaceholder, LARGO_RECORTE };
