import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '../stores/useAuthStore'

const routes = [
  {
    path: '/setup',
    name: 'setup',
    component: () => import('../views/SetupView.vue'),
    meta: { requiresAuth: false }
  },
  {
    path: '/login',
    name: 'login',
    component: () => import('../views/LoginView.vue'),
    meta: { requiresAuth: false }
  },
  {
    path: '/',
    name: 'home',
    component: () => import('../views/HomeView.vue'),
    // El menú principal es el concentrador. Solo exige estar logueado, sin permiso específico.
    meta: { requiresAuth: true } 
  },
  {
    path: '/admin',
    name: 'admin',
    component: () => import('../views/AdminView.vue'),
    meta: { requiresAuth: true, requiredPermission: 'usuario_gestionar' } 
  },
  {
    path: '/asesor',
    name: 'asesor',
    component: () => import('../views/AsesorView.vue'),
    meta: { requiresAuth: true, requiredPermission: 'ot_ver_lista' }
  },
  {
    path: '/jefe',
    name: 'jefe',
    component: () => import('../views/JefeView.vue'),
    meta: { requiresAuth: true, requiredPermission: 'tarea_gestionar_todas' }
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
    meta: { requiresAuth: true, requiredPermission: 'tarea_ver_propias' }
  },
  {
    path: '/mecanico/tareas',
    name: 'mecanico-tareas',
    component: () => import('../views/MecanicoView.vue'),
    meta: { requiresAuth: true, requiredPermission: 'tarea_ver_propias' }
  },
  {
    path: '/sala',
    name: 'sala',
    component: () => import('../views/SalaEsperaView.vue'),
    // Usualmente la sala de espera es pública para abrirla en las pantallas/TVs del taller
    meta: { requiresAuth: false } 
  },
  {
    // Ruta comodín: Si tipean cualquier URL inexistente, los mandamos al inicio
    path: '/:pathMatch(.*)*',
    redirect: '/'
  }
]

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes
})

// --- GUARDIA DE NAVEGACIÓN GLOBAL ---
router.beforeEach(async (to, from, next) => {
  const authStore = useAuthStore();
  
  // 1. Validar que el estado de sesión esté cargado en la memoria de Pinia
  if (!authStore.isVerified) {
      await authStore.checkSession();
  }

  // 2. Control principal: ¿La ruta exige estar dentro del sistema?
  if (to.meta.requiresAuth) {
      if (!authStore.isAuthenticated) {
          return next({ name: 'login' });
      }

      // 3. Control granular: ¿La ruta exige una llave/permiso particular?
      if (to.meta.requiredPermission) {
          const permisosUsuario = authStore.usuario?.permisos || [];
          const tienePermiso = permisosUsuario.includes(to.meta.requiredPermission);
          
          if (!tienePermiso) {
              console.warn(`🔒 Acceso bloqueado. Permiso faltante: ${to.meta.requiredPermission}`);
              return next({ name: 'home' }); // Expulsado al menú central
          }
      }
  }

  // --- CONTROL DE CONFIGURACIÓN INICIAL (TAURI) ---
  const isTauri = window.__TAURI_INTERNALS__ !== undefined;
  const appModo = localStorage.getItem('app_modo');

  if (isTauri && !appModo && to.name !== 'setup') {
      return next({ name: 'setup' });
  }
  // Si pasa todos los filtros, o la ruta es pública, avanza
  next();
});

export default router