<template>
  <div class="navbar" :style="customStyle">
    <!-- Botón de Cerrar sesión, ahora donde estaba el de Inicio -->
    <button class="logout" @click="handleLogout">{{ logoutText }}</button>

    <div style="display: flex; align-items: center; gap: 12px; margin-right: auto;">
      <img v-if="configStore.config.logo_path" :src="configStore.getLogoUrl()" style="max-height: 35px; border-radius: 4px;" alt="Logo" />
      <span class="brand" :style="brandStyle">{{ configStore.config.nombre_taller }} | <small style="color:#666;">{{ brand }}</small></span>
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
    
    <!-- Botón de Inicio -->
    <button class="home-btn" @click="goHome" title="Volver al menú principal">🏠</button>
  </div>
</template>

<script setup>
import { useRouter } from 'vue-router'
import { useAuthStore } from '../../stores/useAuthStore'
import { useConfigStore } from '../../stores/useConfigStore'

const router = useRouter()
const authStore = useAuthStore()
const configStore = useConfigStore()

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
    background: white;
    padding: 12px 24px;
    border-radius: 12px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
    margin-bottom: 30px;
}

/* Estilos del botón de inicio */
.navbar .home-btn {
    background: #f4f7fc;
    border: 1px solid #eef3f9;
    padding: 6px 12px;
    border-radius: 8px;
    font-size: 1.2rem;
    cursor: pointer;
    color: #333;
    transition: background 0.2s, transform 0.1s;
    display: flex;
    align-items: center;
    justify-content: center;
}

.navbar .home-btn:hover {
    background: #e9edf4;
    transform: scale(1.05);
}

.navbar .brand {
    font-weight: 700;
    font-size: 1.3rem;
    color: #0056a7;
    margin-right: auto;
}

.navbar button:not(.home-btn):not(.logout) {
    background: transparent;
    border: none;
    padding: 8px 16px;
    border-radius: 8px;
    font-size: 0.95rem;
    cursor: pointer;
    color: #333;
    transition: background 0.2s;
}

.navbar button:not(.home-btn):not(.logout):hover {
    background: #e9edf4;
}

.navbar button.active-tab {
    background: #0056a7;
    color: white;
}

.navbar .logout {
    background: transparent;
    border: none;
    padding: 8px 16px;
    border-radius: 8px;
    font-size: 0.95rem;
    cursor: pointer;
    color: #c00;
    font-weight: 500;
    transition: background 0.2s;
}

.navbar .logout:hover {
    background: #ffe5e5;
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
    .navbar .home-btn {
        align-self: center;
    }
}
</style>
