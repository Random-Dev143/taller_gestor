// Composable de dominio para la gestión de usuarios (Admin).
//
// Antes, AdminUsuarios.vue hacía los fetchJSON directamente en el
// componente visual, mezclando la lógica de "cómo se piden/mutan los
// datos" con la de "cómo se dibuja la pantalla". Acá se separan: este
// composable expone el estado (usuarios, legajos, rolesLista, loading) y
// las acciones (cargarDatos, guardarCambios, suspenderUsuario,
// reactivarUsuario); el componente solo se encarga de renderizar y de
// reaccionar a los clics, delegando la comunicación con el backend acá.
import { ref } from 'vue'
import { useApi } from './useApi'
import { useToast, errMsg } from './useToast'

export function useUsuarios() {
  const { fetchJSON } = useApi()
  const toast = useToast()

  const usuarios = ref([])
  const legajos = ref([])
  const rolesLista = ref([])
  const loading = ref(true)

  const cargarDatos = async (filtroEstado = '') => {
    loading.value = true
    try {
      const params = new URLSearchParams()
      if (filtroEstado) params.set('estado', filtroEstado)

      // Traemos usuarios, legajos y roles en paralelo
      const [resUsuarios, resLegajos, resRoles] = await Promise.all([
        fetchJSON(`/usuarios?${params.toString()}`),
        fetchJSON('/legajos'),
        fetchJSON('/roles')
      ])

      usuarios.value = resUsuarios
      legajos.value = resLegajos
      rolesLista.value = resRoles
    } catch (err) {
      toast.error('Error cargando datos: ' + errMsg(err))
    } finally {
      loading.value = false
    }
  }

  const guardarCambios = async (id, { estado, rol_id, legajo }) => {
    if (!rol_id) {
      toast.error('Debe asignar un perfil al usuario.')
      return false
    }
    try {
      await fetchJSON(`/usuarios/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ estado, rol_id, legajo: legajo || null })
      })
      toast.success('Usuario actualizado correctamente')
      return true
    } catch (err) {
      toast.error('Error al actualizar: ' + errMsg(err))
      return false
    }
  }

  const suspenderUsuario = async (id) => {
    try {
      await fetchJSON(`/usuarios/${id}`, { method: 'DELETE' })
      toast.success('Usuario suspendido')
      return true
    } catch (err) {
      toast.error(errMsg(err))
      return false
    }
  }

  const reactivarUsuario = async (id) => {
    try {
      await fetchJSON(`/usuarios/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ estado: 'aprobado' })
      })
      toast.success('Usuario reactivado')
      return true
    } catch (err) {
      toast.error(errMsg(err))
      return false
    }
  }

  return {
    usuarios, legajos, rolesLista, loading,
    cargarDatos, guardarCambios, suspenderUsuario, reactivarUsuario
  }
}
