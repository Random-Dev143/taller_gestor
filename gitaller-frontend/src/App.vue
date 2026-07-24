<template>
  <div class="container" id="app">
    <router-view />
    <ToastContainer />
  </div>
</template>

<script setup>
import ToastContainer from './components/common/ToastContainer.vue';
import { onMounted } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import { useConfigStore } from './stores/useConfigStore';
import { useApi } from './composables/useApi'; 

const configStore = useConfigStore();
const { API_BASE } = useApi(); 

onMounted(async () => {
  const temaGuardado = localStorage.getItem('theme');
  if (temaGuardado === 'dark') {
    document.documentElement.classList.add('dark-theme');
  }

  const isTauri = window.__TAURI_INTERNALS__ !== undefined;
  const modo = localStorage.getItem('app_modo');

  if (isTauri && modo === 'servidor') {
    try {
      await invoke('start_server');
    } catch (e) {
      console.error('Error al iniciar el servidor de fondo:', e);
    }

    // --- PERRO GUARDIÁN (Watchdog) DINÁMICO ---
    setInterval(async () => {
      try {
        // 3. Calculamos la ruta de status quitando '/api' de la base
        // Ejemplo: http://127.0.0.1:5881/status
        const pingUrl = API_BASE.replace('/api', '/status'); 
        
        const res = await fetch(pingUrl, { cache: 'no-store' });
        if (!res.ok) throw new Error('Servidor responde con error');
      } catch (err) {
        console.warn('⚠️ Backend no responde. Intentando revivir el subproceso...');
        try {
          await invoke('start_server');
        } catch (invokeErr) {
          console.error('No se pudo revivir el backend:', invokeErr);
        }
      }
    }, 15000);
    // ----------------------------------------
  }

  let intentos = 0;
  const intentarCargar = async () => {
    await configStore.cargarConfig();
    
    if (configStore.config.nombre_taller === 'Cargando...' && intentos < 10) {
      intentos++;
      setTimeout(intentarCargar, 500);
    }
  };
  
  intentarCargar();
});
</script>