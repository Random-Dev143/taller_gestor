import { ref } from 'vue'
import { useApi } from './useApi'

// Contador compartido de turnos confirmados que esperan su OT (el punto rojo del menú).
// Lo refresca el layout cada minuto y las pantallas de turnos cuando algo cambia.
const confirmadosSinOt = ref(0)

export function useResumen() {
  const { fetchJSON } = useApi()
  const refrescarResumen = async () => {
    try { confirmadosSinOt.value = (await fetchJSON('/turnos/resumen')).confirmados_sin_ot || 0 }
    catch (e) { confirmadosSinOt.value = 0 } // sin permiso de turnos o sin conexión: no se muestra
  }
  return { confirmadosSinOt, refrescarResumen }
}
