<template>
  <div class="container" id="app">
    <!-- Aquí se inyecta HomeView, AsesorView, etc., según la URL -->
    <router-view />
    <ToastContainer />
  </div>
</template>

<script setup>
import ToastContainer from './components/common/ToastContainer.vue'
</script>
