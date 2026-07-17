<template>
  <div class="view-admin">
    <NavBar brand="⚙️ Administración" :tabs="tabs" v-model:activeTab="activeTab" />

    <div v-if="activeTab === 'admin-usuarios'" class="tab-content">
      <AdminUsuarios />
    </div>
    <div v-if="activeTab === 'admin-roles'" class="tab-content">
      <AdminRoles />
    </div>
    <!-- Aquí agregaremos futuras pestañas de configuración -->
  </div>
</template>

<script setup>
import { ref } from 'vue'
import NavBar from '../components/common/NavBar.vue'
import AdminUsuarios from '../components/asesor/AdminUsuarios.vue'
import AdminRoles from '../components/asesor/AdminRoles.vue'

const activeTab = ref('admin-usuarios')

const tabs = [
  { id: 'admin-usuarios', label: 'Usuarios y Accesos' },
  { id: 'admin-roles', label: 'Perfiles y Permisos' }
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