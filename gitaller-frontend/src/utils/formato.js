// Formatos de número usados en tableros y tarjetas (es-AR).
export const moneda = (n) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(Number(n) || 0)
export const numero = (n, dec = 0) => new Intl.NumberFormat('es-AR', { minimumFractionDigits: dec, maximumFractionDigits: dec }).format(Number(n) || 0)
export const porcentaje = (n, dec = 0) => (n === null || n === undefined) ? '—' : `${numero(n, dec)}%`
// Variación porcentual entre dos períodos. null si no hay base de comparación.
export const variacion = (actual, anterior) => {
  const a = Number(actual) || 0; const b = Number(anterior) || 0
  if (b === 0) return null
  return Math.round(((a - b) / Math.abs(b)) * 1000) / 10
}
