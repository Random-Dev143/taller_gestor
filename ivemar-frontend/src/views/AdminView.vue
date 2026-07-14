<template>
  <div class="view-admin">
    <NavBar brand="⚙️ Administración" :tabs="tabs" v-model:activeTab="activeTab" />

    <div v-if="activeTab === 'admin-usuarios'" class="tab-content">
      <AdminUsuarios />
    </div>
    
    <!-- Aquí agregaremos futuras pestañas de configuración -->
  </div>
</template>

<script setup>
import { ref } from 'vue'
import NavBar from '../components/common/NavBar.vue'
import AdminUsuarios from '../components/asesor/AdminUsuarios.vue'

const activeTab = ref('admin-usuarios')

const tabs = [
  { id: 'admin-usuarios', label: 'Usuarios y Accesos' }
]
</script>

<style scoped>
.view-admin {
  animation: fadeIn 0.3s ease-in-out;
}
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(5px); }
  to { opacity: 1; transform: translateY(0); }
}
</style>