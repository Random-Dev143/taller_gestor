import { defineStore } from 'pinia'
import { ref } from 'vue'
import { useApi } from '../composables/useApi'
import { useSessionExpiry } from '../composables/useSessionExpiry'

export const useAuthStore = defineStore('auth', () => {
  const { fetchJSON, getToken, setToken, clearToken } = useApi()

  const usuario = ref(null)
  const isAuthenticated = ref(false)
  const isReady = ref(false) // Indica si ya verificamos la sesión al cargar la app

  // Pide un token nuevo mientras el actual siga vigente (ver
  // routes/auth.js POST /auth/refresh). Lo usa el modal de "sesión por
  // vencer" cuando la persona confirma que sigue ahí.
  const refrescarToken = async () => {
    const res = await fetchJSON('/auth/refresh', { method: 'POST' })
    if (res.token) setToken(res.token)
    return res
  }

  // Antes de cerrar la sesión por inactividad/expiración, le pedimos al
  // backend un checkpoint del WAL + backup (ver routes/sistema.js), para
  // que si la app queda abierta toda la noche y el token vence sin que
  // nadie la use, la base quede en un estado consistente antes del cierre
  // — en vez de confiar en que el próximo arranque limpio del WAL alcance.
  const cerrarSesionSegura = async () => {
    try {
      await fetchJSON('/sistema/checkpoint-seguro', { method: 'POST' })
    } finally {
      await logout()
    }
  }

  const sessionExpiry = useSessionExpiry({ getToken, refrescarToken, cerrarSesionSegura })

  // Consulta al backend si el token guardado es válido
  const checkSession = async () => {
    try {
      const res = await fetchJSON('/auth/me')
      if (res.loggedIn) {
        usuario.value = res.usuario
        isAuthenticated.value = true
        sessionExpiry.programarAviso()
      } else {
        usuario.value = null
        isAuthenticated.value = false
        sessionExpiry.detener()
      }
    } catch (err) {
      usuario.value = null
      isAuthenticated.value = false
      sessionExpiry.detener()
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
    await checkSession() // Refresca el estado tras un login exitoso (también programa el aviso de expiración)
    return res
  }

  const register = async (email, password, nombre_completo) => {
    return await fetchJSON('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, nombre_completo })
    })
  }

  const logout = async () => {
    sessionExpiry.detener()
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
    logout,
    // Aviso de sesión por vencer (consumido por el modal en App.vue)
    mostrarAvisoExpiracion: sessionExpiry.mostrarAviso,
    minutosRestantesExpiracion: sessionExpiry.minutosRestantes,
    segundosRestantesExpiracion: sessionExpiry.segundosDisplay,
    mantenerSesion: sessionExpiry.mantenerSesion
  }
})