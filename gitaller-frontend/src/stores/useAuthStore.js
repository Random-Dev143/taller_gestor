import { defineStore } from 'pinia'
import { ref } from 'vue'
import { useApi } from '../composables/useApi'

export const useAuthStore = defineStore('auth', () => {
  const { fetchJSON, setToken, clearToken } = useApi()

  const usuario = ref(null)
  const isAuthenticated = ref(false)
  const isReady = ref(false) // Indica si ya verificamos la sesión al cargar la app

  // Consulta al backend si el token guardado es válido
  const checkSession = async () => {
    try {
      const res = await fetchJSON('/auth/me')
      if (res.loggedIn) {
        usuario.value = res.usuario
        isAuthenticated.value = true
      } else {
        usuario.value = null
        isAuthenticated.value = false
      }
    } catch (err) {
      usuario.value = null
      isAuthenticated.value = false
    } finally {
      isReady.value = true
    }
  }

  const login = async (email, password) => {
    const res = await fetchJSON('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    })
    if (res.token) {
      setToken(res.token) // Guarda el token para reenviarlo en cada request
    }
    await checkSession() // Refresca el estado tras un login exitoso
    return res
  }

  const register = async (email, password, nombre_completo) => {
    return await fetchJSON('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, nombre_completo })
    })
  }

  const logout = async () => {
    try {
      await fetchJSON('/auth/logout', { method: 'POST' })
    } finally {
      clearToken()
      usuario.value = null
      isAuthenticated.value = false
    }
  }

  return {
    usuario,
    isAuthenticated,
    isReady,
    checkSession,
    login,
    register,
    logout
  }
})