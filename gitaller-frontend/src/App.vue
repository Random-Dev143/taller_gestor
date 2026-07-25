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
import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
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

  // --- CHEQUEO DE ACTUALIZACIONES ---
  // Antes el plugin estaba instalado y configurado pero nunca se invocaba
  // desde el frontend, por eso la app nunca detectaba versiones nuevas.
  if (isTauri) {
    try {
      const update = await check();
      if (update) {
        console.log(`🔄 Actualización disponible: ${update.version} (actual: ${update.currentVersion})`);
        // Descarga e instala. onEvent es opcional, útil para loguear progreso.
        await update.downloadAndInstall((event) => {
          switch (event.event) {
            case 'Started':
              console.log(`Descargando actualización (${event.data.contentLength} bytes)...`);
              break;
            case 'Progress':
              console.log(`Progreso: ${event.data.chunkLength} bytes`);
              break;
            case 'Finished':
              console.log('Descarga finalizada, instalando...');
              break;
          }
        });
        console.log('✅ Actualización instalada. Reiniciando...');
        await relaunch();
      } else {
        console.log('No hay actualizaciones disponibles.');
      }
    } catch (err) {
      console.error('Error al chequear actualizaciones:', err);
    }
  }
  // ----------------------------------

  if (isTauri && modo === 'servidor') {
    try {
      await invoke('start_server');
    } catch (e) {
      console.error('Error al iniciar el servidor de fondo:', e);
    }

    // --- PERRO GUARDIÁN (Watchdog) DINÁMICO ---
    // Bajamos el intervalo de 15s a 8s para detectar/revivir más rápido.
    setInterval(async () => {
      try {
        // Calculamos la ruta de status quitando '/api' de la base
        // Ejemplo: http://127.0.0.1:5881/status
        const pingUrl = API_BASE.replace('/api', '/status'); 
        
        const res = await fetch(pingUrl, { cache: 'no-store' });
        if (!res.ok) throw new Error('Servidor responde con error');
      } catch (err) {
        console.warn('⚠️ Backend no responde. Intentando revivir el subproceso...');
        try {
          // start_server ahora mata cualquier proceso backend anterior
          // (colgado o no) antes de lanzar uno nuevo, evitando conflictos de puerto.
          await invoke('start_server');
        } catch (invokeErr) {
          console.error('No se pudo revivir el backend:', invokeErr);
        }
      }
    }, 8000);
    // ----------------------------------------
  }

  // --- CARGA DE CONFIGURACIÓN CON BACKOFF SIN LÍMITE DE INTENTOS ---
  // Antes se abandonaba tras 10 intentos (5s), lo cual era insuficiente si el
  // backend tardaba más en levantar (migraciones de DB, antivirus escaneando
  // el .exe la primera vez, etc). Ahora reintenta indefinidamente mientras la
  // app esté abierta, con un backoff progresivo hasta un máximo de 3s entre
  // intentos, para no saturar de pedidos mientras el backend arranca.
  let intentos = 0;
  const intentarCargar = async () => {
    await configStore.cargarConfig();

    if (configStore.config.nombre_taller === 'Cargando...') {
      intentos++;
      const espera = Math.min(500 * intentos, 3000);
      setTimeout(intentarCargar, espera);
    }
  };

  intentarCargar();
});
</script>
