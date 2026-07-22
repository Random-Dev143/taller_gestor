<template>
  <div class="container" id="app">
    <!-- Aquí se inyecta HomeView, AsesorView, etc., según la URL -->
    <router-view />
    <ToastContainer />
  </div>
</template>

<script setup>
// 1. Importamos el contenedor de alertas para que puedas ver los errores de login
import ToastContainer from './components/common/ToastContainer.vue';

// 2. ¡ELIMINAMOS EL CÓDIGO DEL SIDECAR AQUÍ! 
// Dejamos que Rust (lib.rs) se encargue de encender y apagar el backend.
</script>