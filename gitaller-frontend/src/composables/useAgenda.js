// Composable de dominio para la Agenda de Clientes/Unidades.
//
// Mismo criterio que useUsuarios.js: AgendaClientes.vue solo necesita
// disparar acciones y reaccionar al resultado — el "cómo" de pedir y
// mutar los datos vive acá.
import { ref } from 'vue'
import { useApi } from './useApi'
import { useToast, errMsg } from './useToast'

export function useAgenda() {
  const { fetchJSON } = useApi()
  const toast = useToast()

  const unidadesRaw = ref([])
  const loading = ref(true)

  const cargarAgenda = async () => {
    loading.value = true
    try {
      unidadesRaw.value = await fetchJSON('/unidades')
    } catch (err) {
      toast.error(errMsg(err))
    } finally {
      loading.value = false
    }
  }

  const crearCliente = async (form) => {
    try {
      const payload = { ...form, patente: form.patente.replace(/[^a-zA-Z0-9]/g, '').toUpperCase() }
      await fetchJSON('/unidades', { method: 'POST', body: JSON.stringify(payload) })
      toast.success('Cliente/Unidad agregado')
      await cargarAgenda()
      return true
    } catch (err) {
      toast.error(errMsg(err))
      return false
    }
  }

  const guardarEdicion = async (id, patente, editForm) => {
    try {
      await fetchJSON(`/unidades/${id}`, { method: 'PUT', body: JSON.stringify({ patente, ...editForm }) })
      toast.success('Actualizado')
      await cargarAgenda()
      return true
    } catch (err) {
      toast.error(errMsg(err))
      return false
    }
  }

  return { unidadesRaw, loading, cargarAgenda, crearCliente, guardarEdicion }
}
