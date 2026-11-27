<template>
  <div class="shell" :class="{ 'shell--menu': menuAbierto }">
    <!-- ═══ Barra lateral ═══ -->
    <aside class="side" aria-label="Navegación principal">
      <div class="side__brand">
        <img v-if="configStore.config.logo_path" :src="configStore.getLogoUrl()" class="side__logo" alt="" />
        <span v-else class="side__mark" aria-hidden="true">G</span>
        <span class="side__name">{{ configStore.config.nombre_taller }}</span>
      </div>

      <router-link v-if="puede(['ot_crear'])" to="/nueva-ot" class="side__cta" @click="cerrarMenu">
        <AppIcon name="plus" /> Nueva OT
      </router-link>

      <nav class="side__nav">
        <template v-for="grupo in gruposVisibles" :key="grupo.titulo">
          <div v-if="grupo.titulo" class="side__group">{{ grupo.titulo }}</div>
          <router-link v-for="it in grupo.items" :key="it.to" :to="it.to" class="side__item"
            :class="{ 'side__item--on': esActivo(it) }" @click="cerrarMenu">
            <AppIcon :name="it.icon" />
            <span class="side__text">{{ it.texto }}</span>
            <span v-if="it.badge === 'turnos' && confirmadosSinOt" class="side__badge" :title="`${confirmadosSinOt} turno(s) confirmado(s) esperando OT`">{{ confirmadosSinOt }}</span>
          </router-link>
        </template>
      </nav>

      <div class="side__foot">
        <router-link v-if="puede(['tarea_ver_propias'])" to="/mecanico" class="side__mini" @click="cerrarMenu"><AppIcon name="wrench" /> Vista del mecánico</router-link>
        <router-link to="/sala" class="side__mini" target="_blank"><AppIcon name="tv" /> Sala de espera</router-link>
        <div class="side__user">
          <span class="side__avatar" aria-hidden="true">{{ iniciales }}</span>
          <span class="side__who">
            <strong>{{ authStore.usuario?.nombre_completo || authStore.usuario?.email }}</strong>
            <small>{{ authStore.usuario?.rol || '' }}</small>
          </span>
          <button type="button" class="side__icon-btn" @click="cerrarSesion" title="Cerrar sesión" aria-label="Cerrar sesión"><AppIcon name="logout" /></button>
        </div>
      </div>
    </aside>
    <div v-if="menuAbierto" class="shell__scrim" @click="cerrarMenu"></div>

    <!-- ═══ Contenido ═══ -->
    <div class="main">
      <header class="top">
        <button type="button" class="top__burger" @click="menuAbierto = true" aria-label="Abrir menú"><AppIcon name="menu" /></button>
        <h1 class="top__title">{{ $route.meta.title || '' }}</h1>

        <form class="top__search search" role="search" @submit.prevent="buscar">
          <AppIcon name="search" />
          <input ref="inputBusqueda" v-model="termino" type="text" class="form-control" placeholder="Buscar OT, patente o cliente  ( / )" aria-label="Buscar órdenes de trabajo" />
        </form>

        <button type="button" class="top__btn" @click="toggleTheme" :title="isDark ? 'Modo claro' : 'Modo oscuro'" :aria-label="isDark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'">
          <AppIcon :name="isDark ? 'sun' : 'moon'" />
        </button>
      </header>

      <main class="content">
        <router-view :key="$route.path" />
      </main>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '../../stores/useAuthStore'
import { useConfigStore } from '../../stores/useConfigStore'
import { useResumen } from '../../composables/useResumen'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const configStore = useConfigStore()
const { confirmadosSinOt, refrescarResumen } = useResumen()

// Cada ítem se muestra solo si el usuario tiene alguno de los permisos indicados (el servidor igual los valida).
const GRUPOS = [
  { titulo: '', items: [
    { to: '/', icon: 'home', texto: 'Inicio', exacto: true, permisos: ['ot_ver_lista', 'turno_ver', 'tarea_gestionar_todas', 'usuario_gestionar'] }
  ] },
  { titulo: 'Taller', items: [
    { to: '/ordenes', icon: 'wrench', texto: 'En taller', permisos: ['ot_ver_lista'] },
    { to: '/finalizadas', icon: 'check', texto: 'Finalizadas', permisos: ['ot_ver_lista'] }
  ] },
  { titulo: 'Agenda', items: [
    { to: '/turnos', icon: 'calendar', texto: 'Turnos', permisos: ['turno_ver', 'turno_gestionar'], badge: 'turnos' },
    { to: '/clientes', icon: 'user', texto: 'Clientes y unidades', permisos: ['ot_ver_lista'] }
  ] },
  { titulo: 'Análisis', items: [
    { to: '/informes', icon: 'bar-chart', texto: 'Informes', permisos: ['informe_financiero', 'informe_operativo', 'informe_taller'] },
    { to: '/rendimiento', icon: 'target', texto: 'Rendimiento', permisos: ['tarea_gestionar_todas'] }
  ] },
  { titulo: 'Equipo', items: [
    { to: '/equipo', icon: 'users', texto: 'Legajos', permisos: ['ot_ver_lista'] }
  ] },
  { titulo: 'Administración', items: [
    { to: '/admin/usuarios', icon: 'lock', texto: 'Usuarios y accesos', permisos: ['usuario_gestionar'] },
    { to: '/admin/perfiles', icon: 'shield', texto: 'Perfiles y permisos', permisos: ['usuario_gestionar'] },
    { to: '/admin/configuracion', icon: 'sliders', texto: 'Configuración', permisos: ['usuario_gestionar'] }
  ] }
]

const permisosUsuario = computed(() => authStore.usuario?.permisos || [])
const puede = (lista) => lista.some(p => permisosUsuario.value.includes(p))
const gruposVisibles = computed(() =>
  GRUPOS.map(g => ({ ...g, items: g.items.filter(i => puede(i.permisos)) })).filter(g => g.items.length > 0))

const esActivo = (it) => it.exacto ? route.path === it.to : route.path === it.to || route.path.startsWith(it.to + '/')

const iniciales = computed(() => {
  const n = authStore.usuario?.nombre_completo || authStore.usuario?.email || '?'
  return n.split(/[\s@.]+/).filter(Boolean).slice(0, 2).map(x => x[0].toUpperCase()).join('')
})

// ─── Menú en pantallas chicas ───
const menuAbierto = ref(false)
const cerrarMenu = () => { menuAbierto.value = false }

// ─── Tema ───
const isDark = ref(false)
const toggleTheme = () => {
  isDark.value = !isDark.value
  document.documentElement.classList.toggle('dark-theme', isDark.value)
  localStorage.setItem('theme', isDark.value ? 'dark' : 'light')
}

// ─── Búsqueda global: lleva a la lista de OT con el texto ya cargado ───
const termino = ref('')
const inputBusqueda = ref(null)
const buscar = () => {
  const q = termino.value.trim()
  if (!q) return
  router.push({ path: '/ordenes', query: { q } })
  inputBusqueda.value?.blur()
}
const atajo = (e) => {
  const escribiendo = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)
  if (e.key === '/' && !escribiendo && !e.ctrlKey && !e.metaKey) { e.preventDefault(); inputBusqueda.value?.focus() }
}

const cerrarSesion = async () => {
  await authStore.logout()
  router.push({ name: 'login' })
}

let timer = null
onMounted(() => {
  isDark.value = document.documentElement.classList.contains('dark-theme')
  refrescarResumen()
  timer = setInterval(refrescarResumen, 60000)
  document.addEventListener('keydown', atajo)
})
onBeforeUnmount(() => { clearInterval(timer); document.removeEventListener('keydown', atajo) })
</script>

<style scoped>
.shell { display: grid; grid-template-columns: 244px minmax(0, 1fr); min-height: 100vh; }

/* ── Barra lateral (grafito en ambos temas) ── */
.side {
  position: sticky; top: 0; height: 100vh; z-index: 200;
  display: flex; flex-direction: column; gap: 4px; padding: 14px 12px;
  background: var(--ink); color: var(--ink-text); border-right: 1px solid var(--ink-border); overflow-y: auto;
}
.side__brand { display: flex; align-items: center; gap: 10px; padding: 4px 8px 12px; min-width: 0; }
.side__logo { max-height: 30px; max-width: 150px; border-radius: 4px; }
.side__mark { width: 30px; height: 30px; flex-shrink: 0; border-radius: 8px; display: inline-flex; align-items: center; justify-content: center; background: var(--primary); color: var(--on-primary); font-weight: 800; }
.side__name { font-weight: 650; font-size: 0.98rem; letter-spacing: -0.01em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.side__cta {
  display: flex; align-items: center; justify-content: center; gap: 8px;
  margin: 0 4px 10px; min-height: 38px; border-radius: 8px; text-decoration: none;
  background: var(--primary); color: var(--on-primary); font-weight: 650; font-size: 0.9rem;
}
.side__cta:hover { background: var(--primary-dark); }

.side__nav { display: flex; flex-direction: column; gap: 2px; flex: 1; }
.side__group { margin: 14px 10px 4px; font-size: 0.68rem; font-weight: 650; letter-spacing: 0.09em; text-transform: uppercase; color: var(--ink-soft); }
.side__item {
  position: relative; display: flex; align-items: center; gap: 11px;
  min-height: 38px; padding: 0 10px; border-radius: 8px; text-decoration: none;
  color: var(--ink-soft); font-size: 0.9rem; font-weight: 500;
  transition: background-color 0.12s, color 0.12s;
}
.side__item .icon { font-size: 1.15rem; }
.side__item:hover { background: var(--ink-hover); color: var(--ink-text); }
.side__item--on { background: rgba(255, 255, 255, 0.1); color: var(--ink-text); font-weight: 600; }
.side__item--on::before { content: ''; position: absolute; left: -12px; top: 8px; bottom: 8px; width: 3px; border-radius: 0 3px 3px 0; background: var(--primary-text); }
.side__item:focus-visible, .side__cta:focus-visible, .side__mini:focus-visible { outline: 2px solid var(--primary-text); outline-offset: 1px; }
.side__text { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.side__badge { min-width: 20px; padding: 0 6px; border-radius: 10px; background: #e5484d; color: #fff; font-size: 0.72rem; font-weight: 700; line-height: 20px; text-align: center; }

.side__foot { display: flex; flex-direction: column; gap: 2px; padding-top: 10px; border-top: 1px solid var(--ink-border); }
.side__mini { display: flex; align-items: center; gap: 10px; padding: 7px 10px; border-radius: 8px; color: var(--ink-soft); font-size: 0.82rem; text-decoration: none; }
.side__mini:hover { background: var(--ink-hover); color: var(--ink-text); }
.side__user { display: flex; align-items: center; gap: 10px; padding: 10px 6px 2px; }
.side__avatar { width: 32px; height: 32px; flex-shrink: 0; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; background: var(--ink-hover); color: var(--ink-text); font-size: 0.78rem; font-weight: 700; }
.side__who { display: grid; min-width: 0; flex: 1; line-height: 1.25; }
.side__who strong { font-size: 0.84rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.side__who small { color: var(--ink-soft); font-size: 0.74rem; }
.side__icon-btn { display: inline-flex; align-items: center; justify-content: center; width: 34px; height: 34px; border: none; border-radius: 8px; background: transparent; color: var(--ink-soft); cursor: pointer; font-size: 1.1rem; }
.side__icon-btn:hover { background: var(--ink-hover); color: var(--ink-text); }

/* ── Columna principal ── */
.main { min-width: 0; display: flex; flex-direction: column; }
.top {
  position: sticky; top: 0; z-index: 100; height: var(--topbar-h);
  display: flex; align-items: center; gap: 14px; padding: 0 var(--gutter);
  background: var(--surface); border-bottom: 1px solid var(--border-soft);
}
.top__title { margin: 0; font-size: 1.05rem; font-weight: 650; white-space: nowrap; }
.top__search { margin-left: auto; flex: 0 1 380px; min-width: 160px; }
.top__btn, .top__burger { display: inline-flex; align-items: center; justify-content: center; width: 36px; height: 36px; border: none; border-radius: 8px; background: transparent; color: var(--text-soft); cursor: pointer; font-size: 1.15rem; }
.top__btn:hover, .top__burger:hover { background: var(--hover-row); color: var(--text); }
.top__burger { display: none; }
.content { padding: 24px var(--gutter) 56px; max-width: 1480px; width: 100%; margin: 0 auto; }

/* ── Pantallas chicas: la barra lateral pasa a ser un panel deslizable ── */
@media (max-width: 900px) {
  .shell { grid-template-columns: minmax(0, 1fr); }
  .side { position: fixed; left: 0; top: 0; width: 264px; transform: translateX(-100%); transition: transform 0.2s; box-shadow: var(--shadow-md); }
  .shell--menu .side { transform: translateX(0); }
  .shell__scrim { position: fixed; inset: 0; z-index: 150; background: var(--overlay); }
  .top__burger { display: inline-flex; }
  .top__title { display: none; }
  .top__search { flex: 1 1 auto; margin-left: 0; }
}
@media (prefers-reduced-motion: reduce) { .side { transition: none; } }
</style>
