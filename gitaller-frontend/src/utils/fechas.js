// ─── FECHAS: la base guarda UTC, la persona ve y edita su hora local ─────────
// Convención de TODA la app: las fechas viajan y se guardan en UTC con el
// formato "YYYY-MM-DD HH:MM:SS" (sin zona). Para mostrarlas hay que tratarlas
// como UTC (agregando la "Z"); si se hace `new Date("2026-10-05 15:00:00")`
// el navegador las toma como hora LOCAL y todo se corre el huso (3 h en GMT-3).
const pad = (n) => String(n).padStart(2, '0')

const TIENE_ZONA = /(Z|[+-]\d{2}:?\d{2})$/i

// "2026-10-05 15:00:00" (UTC)  ->  Date. Devuelve null si no hay fecha o es inválida.
export function parseUtc(valor) {
  if (!valor) return null
  const t = String(valor).trim().replace(' ', 'T')
  const d = new Date(TIENE_ZONA.test(t) ? t : `${t}Z`)
  return Number.isNaN(d.getTime()) ? null : d
}

// UTC de la base -> valor para <input type="datetime-local"> en HORA LOCAL ("YYYY-MM-DDTHH:mm").
export function utcAInputLocal(valor) {
  const d = parseUtc(valor)
  if (!d) return ''
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// Valor de <input type="datetime-local"> (hora local) -> UTC para la base ("YYYY-MM-DD HH:MM:SS").
export function inputLocalAUtc(valor) {
  if (!valor) return ''
  const d = new Date(valor) // sin zona: el navegador lo interpreta como hora local
  if (Number.isNaN(d.getTime())) return ''
  return d.toISOString().slice(0, 19).replace('T', ' ')
}

// Qué mandar al guardar. Si la persona NO tocó el campo se reenvía el valor
// original tal cual (así no se pierden los segundos ni se acumulan corrimientos);
// si lo cambió, se convierte de hora local a UTC. Sin valor -> undefined (no se modifica).
export function fechaParaGuardar(valorInput, originalUtc) {
  if (!valorInput) return undefined
  if (originalUtc && valorInput === utcAInputLocal(originalUtc)) return originalUtc
  return inputLocalAUtc(valorInput) || undefined
}

// Días transcurridos desde una fecha UTC de la base.
export function diasDesde(valorUtc, ahora = new Date()) {
  const d = parseUtc(valorUtc)
  if (!d) return 0
  return Math.floor((ahora.getTime() - d.getTime()) / 86400000)
}
