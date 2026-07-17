import { defineStore } from 'pinia'
import { ref } from 'vue'
import { useApi } from '../composables/useApi'
import { useToast, errMsg } from '../composables/useToast'

export const useInformesStore = defineStore('informes', () => {
  const { fetchJSON } = useApi()
  const toast = useToast()

  // Fechas por defecto: Inicio del mes actual hasta hoy
  const today = new Date()
  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0]
  const currentDay = today.toISOString().split('T')[0]

  // Estado (Variables compartidas)
  const desde = ref(firstDay)
  const hasta = ref(currentDay)
  const filtroCuellos = ref('')

  const financiero = ref(null)
  const operativo = ref(null)
  const taller = ref(null)
  
  const loading = ref(false)

  // Acción: Cargar datos en paralelo
  const cargarInformes = async () => {
    let params = `?desde=${desde.value}&hasta=${hasta.value}`
    if (filtroCuellos.value) {
      params += `&filtro_cuellos=${filtroCuellos.value.trim().toUpperCase()}`
    }

    loading.value = true
    try {
      const [resFinanciero, resOperativo, resTaller] = await Promise.all([
        fetchJSON(`/informes/mensual/financiero${params}`),
        fetchJSON(`/informes/mensual/operativo${params}`),
        fetchJSON(`/informes/mensual/taller${params}`)
      ])
      
      financiero.value = resFinanciero
      operativo.value = resOperativo
      taller.value = resTaller
    } catch (err) {
      toast.error('Error cargando informes: ' + errMsg(err))
    } finally {
      loading.value = false
    }
  }

  // Resetea los datos para forzar vaciado
  const limpiar = () => {
    financiero.value = null
    operativo.value = null
    taller.value = null
  }

  return {
    desde, hasta, filtroCuellos,
    financiero, operativo, taller,
    loading, cargarInformes, limpiar
  }
})