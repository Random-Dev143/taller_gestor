<template>
  <header class="topbar" :style="customStyle">
    <div class="topbar__inner">
      <div class="topbar__brand">
        <img v-if="configStore.config.logo_path" :src="configStore.getLogoUrl()" class="topbar__logo" alt="Logo" />
        <span v-else class="topbar__mark" aria-hidden="true">G</span>
        <span class="topbar__name" :style="brandStyle">{{ configStore.config.nombre_taller }}</span>
        <span class="topbar__role">{{ brandLabel }}</span>
      </div>

      <nav class="topbar__tabs" aria-label="Secciones">
        <button
          v-for="tab in tabs"
          :key="tab.id"
          type="button"
          class="tb-tab"
          :class="{ 'tb-tab--active': activeTab === tab.id }"
          :aria-current="activeTab === tab.id ? 'page' : null"
          @click="$emit('update:activeTab', tab.id)"
        >
          {{ tab.label }}
          <span v-if="tab.badge" class="tab-badge" :title="tab.badgeTitle || ''" :aria-label="tab.badgeTitle || `${tab.badge} pendientes`">{{ tab.badge }}</span>
        </button>
      </nav>

      <!-- Espacio para inyectar elementos extra -->
      <slot name="extra"></slot>

      <div class="topbar__actions">
        <button type="button" class="tb-btn" @click="toggleTheme" :title="isDark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'" :aria-label="isDark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'">
          <AppIcon :name="isDark ? 'sun' : 'moon'" />
        </button>
        <button type="button" class="tb-btn" @click="goHome" title="Volver al menú principal" aria-label="Volver al menú principal">
          <AppIcon name="home" />
        </button>
        <button type="button" class="tb-btn tb-btn--text" @click="handleLogout">
          <AppIcon name="logout" /><span class="tb-btn__label">{{ logoutText }}</span>
        </button>
      </div>
    </div>
  </header>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../../stores/useAuthStore'
import { useConfigStore } from '../../stores/useConfigStore'

const router = useRouter()
const authStore = useAuthStore()
const configStore = useConfigStore()

// --- LÓGICA DE MODO OSCURO ---
const isDark = ref(false)

onMounted(() => {
  isDark.value = document.documentElement.classList.contains('dark-theme');
})

const toggleTheme = () => {
  isDark.value = !isDark.value;
  if (isDark.value) {
    document.documentElement.classList.add('dark-theme');
    localStorage.setItem('theme', 'dark');
  } else {
    document.documentElement.classList.remove('dark-theme');
    localStorage.setItem('theme', 'light');
  }
}
// -----------------------------

const props = defineProps({
  brand: { type: String, required: true },
  tabs: { type: Array, default: () => [] },
  activeTab: { type: String, default: '' },
  logoutText: { type: String, default: 'Cerrar sesión' },
  customStyle: { type: Object, default: () => ({}) },
  brandStyle: { type: Object, default: () => ({}) },
  customLogout: { type: Boolean, default: false }
})

const emit = defineEmits(['update:activeTab', 'logout'])

// El rol viene con un emoji decorativo en algunas vistas ("👔 Asesor"): se muestra solo el texto.
const brandLabel = computed(() => props.brand.replace(/^[\p{Extended_Pictographic}\uFE0F\s]+/u, '').trim())

// Función para volver al menú principal
const goHome = () => {
  router.push({ name: 'home' })
}

const handleLogout = async () => {
  if (props.customLogout) {
    emit('logout')
  } else {
    await authStore.logout()
    emit('logout')
    router.push({ name: 'login' })
  }
}
</script>

<style scoped>
.topbar {
  position: sticky; top: 0; z-index: 100;
  background: var(--ink);
  color: var(--ink-text);
  border-bottom: 1px solid var(--ink-border);
}
.topbar__inner {
  max-width: 1480px; margin: 0 auto;
  min-height: var(--topbar-h);
  padding: 0 var(--gutter);
  display: flex; align-items: center; gap: 8px 20px;
}

.topbar__brand { display: flex; align-items: center; gap: 10px; flex-shrink: 0; min-width: 0; }
.topbar__logo { max-height: 28px; max-width: 120px; border-radius: 4px; }
.topbar__mark {
  width: 28px; height: 28px; border-radius: 7px;
  display: inline-flex; align-items: center; justify-content: center;
  background: var(--primary); color: var(--on-primary); font-weight: 800; font-size: 0.95rem;
}
.topbar__name { font-weight: 650; font-size: 0.98rem; letter-spacing: -0.01em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 240px; }
.topbar__role {
  padding-left: 10px; margin-left: 2px; border-left: 1px solid var(--ink-border);
  color: var(--ink-soft); font-size: 0.85rem; white-space: nowrap;
}

.topbar__tabs {
  display: flex; align-items: stretch; gap: 2px; flex: 1 1 auto; min-width: 0;
  align-self: stretch;
  overflow-x: auto; scrollbar-width: none;
}
.topbar__tabs::-webkit-scrollbar { display: none; }

.tb-tab {
  position: relative; display: inline-flex; align-items: center; gap: 6px;
  padding: 0 14px; border: none; background: transparent; cursor: pointer;
  font: inherit; font-size: 0.9rem; font-weight: 500; white-space: nowrap;
  color: var(--ink-soft);
  transition: color 0.15s, background-color 0.15s;
}
.tb-tab:hover { color: var(--ink-text); background: var(--ink-hover); }
.tb-tab--active { color: var(--ink-text); font-weight: 600; }
.tb-tab--active::after {
  content: ''; position: absolute; left: 10px; right: 10px; bottom: 0; height: 3px;
  border-radius: 3px 3px 0 0; background: var(--primary-text);
}
.tb-tab:focus-visible { outline: 2px solid var(--primary-text); outline-offset: -2px; border-radius: 4px; }

.tab-badge {
  display: inline-block; min-width: 18px; padding: 0 6px; border-radius: 9px;
  background: #e5484d; color: #fff; font-size: 0.7rem; font-weight: 700; line-height: 18px; text-align: center;
}

.topbar__actions { display: flex; align-items: center; gap: 4px; margin-left: auto; flex-shrink: 0; }
.tb-btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 7px;
  min-width: 36px; height: 36px; padding: 0 9px;
  border: none; border-radius: 8px; background: transparent; cursor: pointer;
  color: var(--ink-soft); font: inherit; font-size: 0.85rem; font-weight: 500;
  transition: background-color 0.15s, color 0.15s;
}
.tb-btn .icon { font-size: 1.15rem; }
.tb-btn:hover { background: var(--ink-hover); color: var(--ink-text); }
.tb-btn:focus-visible { outline: 2px solid var(--primary-text); outline-offset: 1px; }

@media (max-width: 900px) {
  .topbar__name { display: none; }
  .tb-btn__label { display: none; }
}
@media (max-width: 640px) {
  .topbar__inner { flex-wrap: wrap; padding-top: 6px; row-gap: 0; }
  .topbar__tabs { order: 3; flex-basis: 100%; min-height: 42px; }
  .topbar__actions { margin-left: auto; }
}
</style>
