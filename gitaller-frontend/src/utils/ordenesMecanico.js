// ─── VISTA DEL MECÁNICO: una tarjeta por OT ──────────────────────────────────
import { parseUtc } from './fechas.js'
import { horasVivas } from './horas.js'

const EN_CURSO = 'En Curso'

const msApertura = (fecha) => {
  const d = parseUtc(fecha)
  return d ? d.getTime() : Number.MAX_SAFE_INTEGER // sin fecha: al final
}

// Agrupa las tareas del mecánico por OT.
//  · La OT donde está trabajando ahora (alguna tarea "En Curso") va PRIMERA.
//  · El resto, de la OT más vieja a la más nueva (fecha de apertura).
//  · Dentro de cada OT, la tarea en curso primero y luego por orden de asignación.
export function agruparOrdenes(tareas) {
  const mapa = new Map()
  for (const t of tareas) {
    if (!mapa.has(t.ot)) {
      mapa.set(t.ot, { ot: t.ot, patente: t.patente, unidad: t.unidad, cliente: t.cliente, fechaApertura: t.fecha_apertura, estadoOt: t.estado_ot || '', tareas: [] })
    }
    mapa.get(t.ot).tareas.push(t)
  }

  const ordenes = Array.from(mapa.values())
  for (const o of ordenes) {
    o.activa = o.tareas.some(t => t.mi_estado === EN_CURSO)
    o.tareas.sort((a, b) => (b.mi_estado === EN_CURSO) - (a.mi_estado === EN_CURSO) || a.id - b.id)
    o.asignado = o.tareas.reduce((acc, t) => acc + (Number(t.tiempo_estimado) || 0), 0)
  }

  return ordenes.sort((a, b) =>
    (b.activa - a.activa) ||
    (msApertura(a.fechaApertura) - msApertura(b.fechaApertura)) ||
    String(a.ot).localeCompare(String(b.ot), undefined, { numeric: true }))
}

// Horas ocupadas en la OT (suma de las propias, incluyendo la sesión en curso).
export const horasOcupadasOrden = (orden, ahoraMs) =>
  orden.tareas.reduce((acc, t) => acc + horasVivas(t, ahoraMs), 0)

// ─── Estado visual de la OT (punto de color de la lista lateral) ─────────────
// Un solo estado por OT, con este orden de prioridad:
//  activa > repuestos / terceros (estado de la OT) > pausada > pendiente
export const ESTADOS_VISUALES = {
  activa:    { texto: 'Trabajando',           ayuda: 'Tenés una tarea en curso' },
  pendiente: { texto: 'Por iniciar',          ayuda: 'Asignada, todavía sin empezar' },
  pausada:   { texto: 'Pausada',              ayuda: 'Pausaste tu tarea' },
  repuestos: { texto: 'Esperando repuestos',  ayuda: 'La OT quedó en espera de repuestos' },
  terceros:  { texto: 'Trabajos de terceros', ayuda: 'La OT depende de trabajos de terceros' }
}

export function estadoVisualOrden(orden) {
  if (orden.activa) return 'activa'
  if (orden.estadoOt === 'Espera de Repuestos') return 'repuestos'
  if (orden.estadoOt === 'Trabajos de Terceros') return 'terceros'
  if (orden.tareas.some(t => t.mi_estado === 'Pausada')) return 'pausada'
  return 'pendiente'
}
