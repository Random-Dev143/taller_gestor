import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '../views/HomeView.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: HomeView
    },
    {
      path: '/asesor',
      name: 'asesor',
      component: () => import('../views/AsesorView.vue')
    },
    {
      path: '/jefe',
      name: 'jefe',
      component: () => import('../views/JefeView.vue')
    },
    {
      // Antes esta ruta llevaba directo a MecanicoView, saltándose por
      // completo la identificación por legajo (LoginMecanico nunca se
      // llegaba a mostrar desde el menú principal). Ahora redirige según
      // si ya hay una sesión de mecánico guardada.
      path: '/mecanico',
      name: 'mecanico',
      redirect: () => (localStorage.getItem('legajoMecanico') ? '/mecanico/tareas' : '/mecanico/login')
    },
    {
      path: '/sala',
      name: 'sala',
      component: () => import('../views/SalaEsperaView.vue')
    },
    {
      path: '/mecanico/login',
      name: 'mecanico-login',
      component: () => import('../views/LoginMecanico.vue')
    },
    {
      path: '/mecanico/tareas',
      name: 'mecanico-tareas',
      component: () => import('../views/MecanicoView.vue'),
      meta: { requiresLegajo: true }
    }
  ]
})

// Protege la vista de tareas: si no hay legajo guardado, vuelve al login
// en vez de dejar que la vista falle al pedir datos sin identificación.
router.beforeEach((to) => {
  if (to.meta.requiresLegajo && !localStorage.getItem('legajoMecanico')) {
    return { name: 'mecanico-login' }
  }
})

export default router
