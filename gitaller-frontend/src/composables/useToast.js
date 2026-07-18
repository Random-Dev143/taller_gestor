import { reactive } from 'vue'

// Estado compartido a nivel de módulo: todos los componentes que llamen
// a useToast() leen/escriben la misma lista de notificaciones.
const toasts = reactive([])
let nextId = 1

function push(message, type = 'info', timeout = 4000) {
  const id = nextId++
  toasts.push({ id, message, type })
  if (timeout > 0) {
    setTimeout(() => remove(id), timeout)
  }
  return id
}

function remove(id) {
  const idx = toasts.findIndex(t => t.id === id)
  if (idx !== -1) toasts.splice(idx, 1)
}

export function useToast() {
  return {
    toasts,
    success: (msg, timeout) => push(msg, 'success', timeout),
    error: (msg, timeout) => push(msg, 'error', timeout ?? 6000),
    info: (msg, timeout) => push(msg, 'info', timeout),
    remove
  }
}

// Helper para extraer un mensaje legible de los errores que devuelve fetchJSON
export function errMsg(err) {
  if (!err) return 'Error desconocido'
  return err.error || err.message || 'Ocurrió un error inesperado'
}