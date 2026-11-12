// ─── HORAS: lo que se ve vs. lo que se guarda ────────────────────────────────
import { parseUtc } from './fechas.js'

// Redondea al décimo más cercano (1.2333 -> 1.2). Es SOLO para mostrar: el valor
// con todos sus decimales queda en la base y no se vuelve a enviar si no se toca.
export function redondear1(n) {
  const v = Number(n)
  return Number.isFinite(v) ? Math.round((v + Number.EPSILON) * 10) / 10 : 0
}

// Horas decimales -> "h:mm:ss" (el reloj que ve el mecánico).
export function formatoHoras(horas) {
  const totalSeg = Math.max(0, Math.floor((Number(horas) || 0) * 3600))
  const h = Math.floor(totalSeg / 3600)
  const m = Math.floor((totalSeg % 3600) / 60)
  const s = totalSeg % 60
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

// Horas propias de una tarea del mecánico, sumando la sesión que está corriendo.
export function horasVivas(tarea, ahoraMs) {
  let horas = Number(tarea.mi_tiempo_real) || 0
  const inicio = tarea.mi_sesion_inicio ? parseUtc(tarea.mi_sesion_inicio) : null
  if (inicio) horas += Math.max(0, ahoraMs - inicio.getTime()) / 3600000
  return horas
}
