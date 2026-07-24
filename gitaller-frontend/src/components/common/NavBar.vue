<template>
  <div class="navbar" :style="customStyle">
    <!-- Botón de Cerrar sesión, ahora donde estaba el de Inicio -->
    <button class="logout" @click="handleLogout">{{ logoutText }}</button>

    <div style="display: flex; align-items: center; gap: 12px; margin-right: auto;">
      <img v-if="configStore.config.logo_path" :src="configStore.getLogoUrl()" style="max-height: 35px; border-radius: 4px;" alt="Logo" />
      <span class="brand" :style="brandStyle">{{ configStore.config.nombre_taller }} | <small style="color: var(--text-soft);">{{ brand }}</small></span>
    </div>
    
    <!-- Pestañas dinámicas -->
    <button
      v-for="tab in tabs"
      :key="tab.id"
      :class="{ 'active-tab': activeTab === tab.id }"
      @click="$emit('update:activeTab', tab.id)"
    >
      {{ tab.label }}
    </button>
    
    <!-- Espacio para inyectar elementos extra -->
    <slot name="extra"></slot>
    
    <!-- Controles de la derecha -->
    <div style="display: flex; gap: 10px;">
      <button class="theme-toggle-btn" @click="toggleTheme" :title="isDark ? 'Cambiar a Modo Claro' : 'Cambiar a Modo Oscuro'">
        {{ isDark ? '☀️' : '🌙' }}
      </button>
      <button class="home-btn" @click="goHome" title="Volver al menú principal">🏠</button>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
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
.navbar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px 20px;
    background: var(--surface);
    padding: 12px 24px;
    border-radius: 12px;
    box-shadow: var(--shadow-sm);
    margin-bottom: 30px;
}

/* Estilos del botón de inicio */
.navbar .home-btn {
    background: var(--border-soft);
    border: 1px solid var(--border);
    padding: 6px 12px;
    border-radius: 8px;
    font-size: 1.2rem;
    cursor: pointer;
    color: var(--text);
    transition: background 0.2s, transform 0.1s;
    display: flex;
    align-items: center;
    justify-content: center;
}

.navbar .home-btn:hover {
    background: var(--primary-light);
    transform: scale(1.05);
}

/* Estilos del botón de tema */
.navbar .theme-toggle-btn {
    background: var(--border-soft);
    border: 1px solid var(--border);
    padding: 6px 12px;
    border-radius: 8px;
    font-size: 1.2rem;
    cursor: pointer;
    color: var(--text);
    transition: background 0.2s, transform 0.1s;
    display: flex;
    align-items: center;
    justify-content: center;
}

.navbar .theme-toggle-btn:hover {
    background: var(--primary-light);
    transform: scale(1.05);
}

.navbar .brand {
    font-weight: 700;
    font-size: 1.3rem;
    color: var(--primary);
    margin-right: auto;
}

.navbar button:not(.home-btn):not(.theme-toggle-btn):not(.logout) {
    background: transparent;
    border: none;
    padding: 8px 16px;
    border-radius: 8px;
    font-size: 0.95rem;
    cursor: pointer;
    color: var(--text);
    transition: background 0.2s;
}

.navbar button:not(.home-btn):not(.theme-toggle-btn):not(.logout):hover {
    background: var(--primary-light);
}

.navbar button.active-tab {
    background: var(--primary);
    color: white;
}

.navbar .logout {
    background: transparent;
    border: none;
    padding: 8px 16px;
    border-radius: 8px;
    font-size: 0.95rem;
    cursor: pointer;
    color: var(--danger);
    font-weight: 500;
    transition: background 0.2s;
}

.navbar .logout:hover {
    background: var(--danger-light);
}

@media (max-width: 768px) {
    .navbar {
        flex-direction: column;
        align-items: stretch;
    }
    .navbar .brand {
        margin-right: 0;
        text-align: center;
        margin-top: 10px;
    }
    .navbar button {
        text-align: center;
        padding: 10px;
    }
    .navbar .home-btn, .navbar .theme-toggle-btn {
        align-self: center;
    }
}
</style>
