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
import { onMounted } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import { useConfigStore } from './stores/useConfigStore';

const configStore = useConfigStore();

onMounted(async () => {
  const isTauri = window.__TAURI_INTERNALS__ !== undefined;
  const modo = localStorage.getItem('app_modo');

  // Si es el ejecutable y es la PC servidor, levantamos el backend silenciosamente
  if (isTauri && modo === 'servidor') {
    try {
      await invoke('start_server');
    } catch (e) {
      console.error('Error al iniciar el servidor de fondo:', e);
    }
  }

  // 2. Bucle de reintento para cargar la configuración global
  // El backend tarda ~1.5 seg en estar listo, así que insistimos hasta que responda
  let intentos = 0;
  const intentarCargar = async () => {
    await configStore.cargarConfig();
    
    // Si sigue diciendo 'Cargando...' es porque la petición falló. Reintentamos en 500ms.
    if (configStore.config.nombre_taller === 'Cargando...' && intentos < 10) {
      intentos++;
      setTimeout(intentarCargar, 500);
    }
  };
  
  // Iniciamos el intento de carga (aplica para todos los dispositivos de la red)
  intentarCargar();
});
</script>