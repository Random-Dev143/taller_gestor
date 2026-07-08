<template>
  <div class="navbar" :style="customStyle">
    <span class="brand" :style="brandStyle">{{ brand }}</span>
    
    <!-- Pestañas dinámicas (solo se muestran si se envían) -->
    <button
      v-for="tab in tabs"
      :key="tab.id"
      :class="{ 'active-tab': activeTab === tab.id }"
      @click="$emit('update:activeTab', tab.id)"
    >
      {{ tab.label }}
    </button>
    
    <!-- Espacio para inyectar elementos extra (como el Legajo del mecánico) -->
    <slot name="extra"></slot>
    
    <button class="logout" @click="handleLogout">{{ logoutText }}</button>
  </div>
</template>

<script setup>
import { useRouter } from 'vue-router'

const router = useRouter()

const props = defineProps({
  brand: { type: String, required: true },
  tabs: { type: Array, default: () => [] },
  activeTab: { type: String, default: '' },
  logoutText: { type: String, default: 'Cerrar sesión' },
  customStyle: { type: Object, default: () => ({}) },
  brandStyle: { type: Object, default: () => ({}) },
  // Si es true, el botón sólo emite 'logout' y NO navega automáticamente
  // al inicio (la vista se encarga, ej: MecanicoView limpia su sesión).
  customLogout: { type: Boolean, default: false }
})

const emit = defineEmits(['update:activeTab', 'logout'])

const handleLogout = () => {
  emit('logout')
  if (!props.customLogout) router.push({ name: 'home' })
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

.navbar .brand {
    font-weight: 700;
    font-size: 1.3rem;
    color: #0056a7;
    margin-right: auto;
}

.navbar button {
    background: transparent;
    border: none;
    padding: 8px 16px;
    border-radius: 8px;
    font-size: 0.95rem;
    cursor: pointer;
    color: #333;
    transition: background 0.2s;
}

.navbar button:hover {
    background: #e9edf4;
}

.navbar button.active-tab {
    background: #0056a7;
    color: white;
}

.navbar .logout {
    color: #c00;
    font-weight: 500;
}

@media (max-width: 768px) {
    .navbar {
        flex-direction: column;
        align-items: stretch;
    }
    .navbar .brand {
        margin-right: 0;
        text-align: center;
    }
    .navbar button {
        text-align: center;
        padding: 10px;
    }
}
</style>