<template>
  <div class="container" id="app">
    <!-- Aquí se inyecta HomeView, AsesorView, etc., según la URL -->
    <router-view />
    <ToastContainer />
  </div>
</template>

<script setup>
import { onMounted } from 'vue'
import ToastContainer from './components/common/ToastContainer.vue'
import { useConfigStore } from './stores/useConfigStore'

const configStore = useConfigStore()

onMounted(() => {
  configStore.cargarConfig()
})
</script>
