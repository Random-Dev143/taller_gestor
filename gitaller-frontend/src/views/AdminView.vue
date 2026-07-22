<template>
  <div class="view-admin">
    <NavBar brand="⚙️ Administración" :tabs="tabs" v-model:activeTab="activeTab" />

    <div v-if="activeTab === 'admin-config'" class="tab-content">
      <AdminConfiguracion />
    </div>
    <div v-if="activeTab === 'admin-usuarios'" class="tab-content">
      <AdminUsuarios />
    </div>
    <div v-if="activeTab === 'admin-roles'" class="tab-content">
      <AdminRoles />
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import NavBar from '../components/common/NavBar.vue'
import AdminUsuarios from '../components/asesor/AdminUsuarios.vue'
import AdminRoles from '../components/asesor/AdminRoles.vue'
import AdminConfiguracion from '../components/asesor/AdminConfiguracion.vue' // Importado

const activeTab = ref('admin-config') // Hacemos que sea la primera en abrir

const tabs = [
  { id: 'admin-config', label: 'Configuración General' }, // Nueva Pestaña
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
