import { defineStore } from 'pinia'
import { ref } from 'vue'
import { useApi } from '../composables/useApi'

export const useConfigStore = defineStore('config', () => {
  const { fetchJSON, API_BASE } = useApi()
  const config = ref({ nombre_taller: 'Cargando...', trabaja_corrido: 0, puerto_servidor: 5881, logo_path: '' })

  const cargarConfig = async () => {
    try {
      const data = await fetchJSON('/configuracion')
      config.value = data
      // Cambiar el título de la pestaña del navegador dinámicamente
      if (data.nombre_taller) {
        document.title = data.nombre_taller + ' - Gestión'
      }
    } catch (err) {
      console.error('Error cargando configuración')
    }
  }

  const getLogoUrl = () => {
    if (!config.value.logo_path) return ''
    return `${API_BASE.replace('/api', '')}${config.value.logo_path}`
  }

  return { config, cargarConfig, getLogoUrl }
})
