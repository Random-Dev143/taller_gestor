import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '../stores/useAuthStore'

// Quien tenga alguno de estos permisos usa el layout de oficina; el resto (solo mecánico) va a su tablero.
const STAFF = ['ot_ver_lista', 'turno_ver', 'tarea_gestionar_todas', 'usuario_gestionar']

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
    // Todo el personal de oficina (asesor, jefe de taller, administración) comparte este
    // layout con barra lateral. Cada pantalla se muestra según los permisos del usuario.
    path: '/',
    component: () => import('../components/layout/AppLayout.vue'),
    meta: { requiresAuth: true },
    children: [
      { path: '', name: 'home', component: () => import('../views/InicioView.vue'),
        meta: { title: 'Inicio', anyPermission: STAFF } },
      { path: 'ordenes', name: 'ordenes', component: () => import('../views/OrdenesView.vue'), props: { modo: 'activas' },
        meta: { title: 'Órdenes en taller', anyPermission: ['ot_ver_lista'] } },
      { path: 'finalizadas', name: 'finalizadas', component: () => import('../views/OrdenesView.vue'), props: { modo: 'finalizadas' },
        meta: { title: 'Órdenes finalizadas', anyPermission: ['ot_ver_lista'] } },
      { path: 'nueva-ot', name: 'nueva-ot', component: () => import('../views/NuevaOTView.vue'),
        meta: { title: 'Nueva orden de trabajo', anyPermission: ['ot_crear'] } },
      { path: 'turnos', name: 'turnos', component: () => import('../views/TurnosView.vue'),
        meta: { title: 'Turnos', anyPermission: ['turno_ver', 'turno_gestionar'] } },
      { path: 'clientes', name: 'clientes', component: () => import('../components/asesor/AgendaClientes.vue'),
        meta: { title: 'Clientes y unidades', anyPermission: ['ot_ver_lista'] } },
      { path: 'informes', name: 'informes', component: () => import('../views/InformesView.vue'),
        meta: { title: 'Informes', anyPermission: ['informe_financiero', 'informe_operativo', 'informe_taller'] } },
      { path: 'rendimiento', name: 'rendimiento', component: () => import('../components/jefe/TableroRendimiento.vue'),
        meta: { title: 'Rendimiento del taller', anyPermission: ['tarea_gestionar_todas'] } },
      { path: 'equipo', name: 'equipo', component: () => import('../components/asesor/AdminLegajos.vue'),
        meta: { title: 'Legajos del personal', anyPermission: ['ot_ver_lista'] } },
      { path: 'admin/usuarios', name: 'admin-usuarios', component: () => import('../components/asesor/AdminUsuarios.vue'),
        meta: { title: 'Usuarios y accesos', anyPermission: ['usuario_gestionar'] } },
      { path: 'admin/perfiles', name: 'admin-perfiles', component: () => import('../components/asesor/AdminRoles.vue'),
        meta: { title: 'Perfiles y permisos', anyPermission: ['usuario_gestionar'] } },
      { path: 'admin/configuracion', name: 'admin-configuracion', component: () => import('../components/asesor/AdminConfiguracion.vue'),
        meta: { title: 'Configuración', anyPermission: ['usuario_gestionar'] } }
    ]
  },
  // Direcciones de las versiones anteriores (marcadores y accesos directos que ya existan)
  { path: '/asesor', redirect: '/ordenes' },
  { path: '/jefe', redirect: '/ordenes' },
  { path: '/admin', redirect: '/admin/configuracion' },
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
  if (!authStore.isReady) {
      await authStore.checkSession();
  }

  // 2. Control principal: ¿La ruta exige estar dentro del sistema?
  if (to.meta.requiresAuth) {
      if (!authStore.isAuthenticated) {
          return next({ name: 'login' });
      }

      // 3. Control granular: ¿la ruta exige algún permiso (o uno de varios)?
      const permisosUsuario = authStore.usuario?.permisos || [];
      const exigidos = to.meta.anyPermission || (to.meta.requiredPermission ? [to.meta.requiredPermission] : null);
      if (exigidos && !exigidos.some(p => permisosUsuario.includes(p))) {
          console.warn(`Acceso bloqueado. Permiso faltante: ${exigidos.join(' / ')}`);
          // Quien solo tiene permisos de mecánico no tiene "Inicio": va directo a su tablero.
          const soloMecanico = !STAFF.some(p => permisosUsuario.includes(p)) && permisosUsuario.includes('tarea_ver_propias');
          if (soloMecanico) return next({ path: '/mecanico' });
          if (to.name === 'home') { await authStore.logout(); return next({ name: 'login' }); }
          return next({ name: 'home' });
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
