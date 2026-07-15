import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '../stores/useAuthStore'
import HomeView from '../views/HomeView.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: () => import('../views/LoginView.vue'),
      meta: { requiresGuest: true } // Solo accesible si NO estás logueado
    },
    {
      path: '/',
      name: 'home',
      component: HomeView,
      meta: { requiresAuth: true }
    },
    {
      path: '/asesor',
      name: 'asesor',
      component: () => import('../views/AsesorView.vue'),
      meta: { requiresAuth: true, allowedRoles: ['admin', 'asesor'] }
    },
    {
      path: '/jefe',
      name: 'jefe',
      component: () => import('../views/JefeView.vue'),
      meta: { requiresAuth: true, allowedRoles: ['admin', 'jefe'] }
    },
    {
      path: '/admin',
      name: 'admin',
      component: () => import('../views/AdminView.vue'),
      meta: { requiresAuth: true, allowedRoles: ['admin'] } // Bloqueo estricto
    },
    {
      path: '/mecanico',
      name: 'mecanico',
      // Evalúa si hay un tablero seleccionado en memoria, si no, va al buscador
      redirect: () => (localStorage.getItem('legajoMecanico') ? '/mecanico/tareas' : '/mecanico/login')
    },
    {
      path: '/mecanico/login',
      name: 'mecanico-login',
      component: () => import('../views/LoginMecanico.vue'),
      // La pantalla para tipear el legajo requiere que ya estés dentro del sistema
      meta: { requiresAuth: true, allowedRoles: ['admin', 'jefe', 'mecanico'] }
    },
    {
      path: '/mecanico/tareas',
      name: 'mecanico-tareas',
      component: () => import('../views/MecanicoView.vue'),
      meta: { requiresAuth: true, allowedRoles: ['admin', 'jefe', 'mecanico'] }
    },
    {
      path: '/sala',
      name: 'sala',
      component: () => import('../views/SalaEsperaView.vue') // Pública
    }
  ]
})

// Interceptor global de navegación
router.beforeEach(async (to, from, next) => {
  const authStore = useAuthStore()

  // Si es la primera carga de la app, verificamos la cookie silenciosamente
  if (!authStore.isReady) {
    await authStore.checkSession()
  }

  const isAuth = authStore.isAuthenticated
  const userRole = authStore.usuario?.rol

  // 1. Ruta requiere ser invitado (ej. Pantalla de Login)
  if (to.meta.requiresGuest && isAuth) {
    return next({ name: 'home' })
  }

  // 2. Ruta requiere autenticación
  if (to.meta.requiresAuth) {
    if (!isAuth) return next({ name: 'login' })
    
    // Validar roles específicos si la ruta lo exige
    if (to.meta.allowedRoles && !to.meta.allowedRoles.includes(userRole)) {
      // Si el rol no coincide, lo devolvemos al menú principal
      return next({ name: 'home' }) 
    }
  }

  next()
})

export default router