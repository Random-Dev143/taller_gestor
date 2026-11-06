// Utilidades de fechas para el filtro de OTs Finalizadas.
// Todo en hora LOCAL (no UTC): la persona elige "desde el 5/10" mirando su
// calendario, y toISOString() devolvería otro día después de las 21hs en Argentina.

export const DIAS_POR_DEFECTO = 30

const pad = (n) => String(n).padStart(2, '0')

// Fecha local de hace N días, como 'YYYY-MM-DD' (N=0 es hoy).
export const fechaLocalISO = (diasAtras = 0) => {
  const d = new Date()
  d.setDate(d.getDate() - diasAtras)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
