'use strict';
// ─── MOTIVO DE DESCARTE PARA LA PLANILLA DE NPS ─────────────────────
// Función pura (sin base de datos) para poder probarla fácil. Las reglas
// salen del criterio definido por el taller. Si dos reglas coinciden gana
// la primera de esta lista (el orden es parte de la regla):
//
//   1. Otros          -> lo cargó el usuario a mano en la OT (siempre gana)
//   2. Anulada        -> la OT fue anulada por el jefe de taller
//   3. Otra marca     -> es_no_iveco = 1
//   4. Abierta        -> la OT no tiene fecha de cierre
//   5. Empresa propia -> es garantía Y el cliente es IVEMAR o DIRECTORIO
//   6. Interna        -> el cliente es IVEMAR o DIRECTORIO
//   7. Pre entrega    -> es garantía Y tiene tarea "PDI" o "Pre entrega de unidad"
//   8. Saneamientos   -> es garantía Y tiene tarea "Campaña + <NC>"
//   9. Seguros        -> es garantía Y tiene tarea "Poliza + <N> + [texto]"
//  10. Usados         -> es garantía Y tiene tarea "Garantía repuestos + <texto>"
//
// "Empresa propia" va antes que "Interna" porque es más específica (si no,
// la regla 6 la taparía siempre: toda OT de IVEMAR en garantía es interna).

// Lista cerrada: es la misma que el desplegable de la planilla (S2:S11).
const MOTIVOS = ['Abierta', 'Anulada', 'Interna', 'Otra marca', 'Pre entrega',
    'Saneamientos', 'Seguros', 'Empresa propia', 'Usados', 'Otros'];

const norm = (s) => String(s == null ? '' : s)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/\s+/g, ' ').trim();

const CLIENTES_INTERNOS = /\b(ivemar|directorio)\b/;
// Cada patrón exige que después de la palabra clave venga algo más (el NC,
// el número de póliza, el texto) salvo PDI, que se acepta solo.
const SEP = '[\\s:+\\-]*';
const TAREA_PRE_ENTREGA = new RegExp(`^(pdi\\b|pre${SEP}entrega de unidad\\b)`);
const TAREA_CAMPANA = new RegExp(`^campana\\b${SEP}\\S`);
const TAREA_POLIZA = new RegExp(`^poliza\\b${SEP}\\S`);
const TAREA_GARANTIA_REPUESTOS = new RegExp(`^garantia repuestos\\b${SEP}\\S`);

const esClienteInterno = (nombre) => CLIENTES_INTERNOS.test(norm(nombre));

function calcularMotivo({ orden, cliente, tareas = [] }) {
    const descripciones = tareas.map(norm);
    const algunaTarea = (re) => descripciones.some(d => re.test(d));
    const garantia = !!orden.es_garantia;
    const interno = esClienteInterno(cliente);

    if (norm(orden.motivo_descarte_manual) === 'otros') return 'Otros';
    if (orden.anulada) return 'Anulada';
    if (orden.es_no_iveco) return 'Otra marca';
    if (!orden.fecha_cierre) return 'Abierta';
    if (garantia && interno) return 'Empresa propia';
    if (interno) return 'Interna';
    if (garantia && algunaTarea(TAREA_PRE_ENTREGA)) return 'Pre entrega';
    if (garantia && algunaTarea(TAREA_CAMPANA)) return 'Saneamientos';
    if (garantia && algunaTarea(TAREA_POLIZA)) return 'Seguros';
    if (garantia && algunaTarea(TAREA_GARANTIA_REPUESTOS)) return 'Usados';
    return '';
}

module.exports = { MOTIVOS, calcularMotivo, esClienteInterno, norm };
