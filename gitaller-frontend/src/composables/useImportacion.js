// Composable de dominio para la importación de clientes/unidades desde
// planillas Excel (ver backend: modules/importacion).
import { useApi } from './useApi'

export function useImportacion() {
  const { fetchJSON, API_BASE, getToken } = useApi()

  // Subida multipart: no se puede usar fetchJSON (fuerza Content-Type JSON y
  // el navegador necesita poner el boundary del multipart por su cuenta).
  const analizar = async (archivos) => {
    const fd = new FormData()
    for (const f of archivos) fd.append('archivos', f, f.name)
    let res
    try {
      res = await fetch(`${API_BASE}/importacion/analizar`, {
        method: 'POST',
        headers: getToken() ? { Authorization: `Bearer ${getToken()}` } : {},
        body: fd
      })
    } catch {
      return Promise.reject({ error: 'No se pudo conectar con el servidor.' })
    }
    const body = await res.json().catch(() => ({}))
    if (!res.ok) return Promise.reject(body)
    return body
  }

  const listar = () => fetchJSON('/importacion')
  const obtener = (id) => fetchJSON(`/importacion/${id}`)
  const items = (id, { tipo = '', estado = '', page = 1, limit = 25 } = {}) => {
    const q = new URLSearchParams({ page, limit })
    if (tipo) q.set('tipo', tipo)
    if (estado) q.set('estado', estado)
    return fetchJSON(`/importacion/${id}/items?${q.toString()}`)
  }
  const aprobarAutomaticos = (id) => fetchJSON(`/importacion/${id}/aprobar-automaticos`, { method: 'POST', body: '{}' })
  const cancelar = (id) => fetchJSON(`/importacion/${id}/cancelar`, { method: 'POST', body: '{}' })
  const resolver = (itemId, accion, valor) =>
    fetchJSON(`/importacion/items/${itemId}/resolver`, { method: 'POST', body: JSON.stringify({ accion, valor }) })

  return { analizar, listar, obtener, items, aprobarAutomaticos, cancelar, resolver }
}
