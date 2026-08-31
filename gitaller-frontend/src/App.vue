<template>
  <div class="container" id="app">
    <router-view />
    <ToastContainer />
    <SessionExpiryModal />
  </div>
</template>

<script setup>
import ToastContainer from './components/common/ToastContainer.vue';
import SessionExpiryModal from './components/common/SessionExpiryModal.vue';
import { onMounted } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import { getVersion } from '@tauri-apps/api/app';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { useConfigStore } from './stores/useConfigStore';
import { useApi } from './composables/useApi'; 
import { useToast } from './composables/useToast'; 

const configStore = useConfigStore();
const { API_BASE, fetchJSON } = useApi(); 
const toast = useToast(); 

onMounted(async () => {
  const temaGuardado = localStorage.getItem('theme');
  if (temaGuardado === 'dark') {
    document.documentElement.classList.add('dark-theme');
  }

  const isTauri = window.__TAURI_INTERNALS__ !== undefined;
  const modo = localStorage.getItem('app_modo');

  // --- MOSTRAR VERSIÓN INSTALADA EN EL TÍTULO ---
  if (isTauri) {
    try {
      const version = await getVersion();
      await getCurrentWindow().setTitle(`GITaller v${version}`);
    } catch (err) {
      console.error('No se pudo obtener/setear la versión en el título:', err);
    }
  }

  // --- CHEQUEO DE ACTUALIZACIONES VISUAL ---
  if (isTauri) {
    try {
      const update = await check();
      if (update) {
        // Alerta visual de que el proceso arrancó
        toast.info(`Descargando actualización v${update.version}... No cierre la aplicación.`, 10000);
        
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
        
        // Alerta visual de éxito y reinicio
        toast.success('Actualización instalada. Reiniciando en 3 segundos...', 3000);
        setTimeout(async () => {
          await relaunch();
        }, 3000);

      } else {
        console.log('No hay actualizaciones disponibles.');
      }
    } catch (err) {
      // Capturamos cualquier fallo silencioso (firma inválida, red caída, etc.) y lo mostramos en pantalla
      toast.error(`Error al actualizar: ${err.message || err}`, 15000);
      console.error('Error detallado al chequear actualizaciones:', err);
    }
  }

  if (isTauri && modo === 'servidor') {
    try {
      await invoke('start_server');
    } catch (e) {
      console.error('Error al iniciar el servidor de fondo:', e);
    }

    // --- CIERRE SEGURO ---
    // Cerrar la ventana (o que Windows apague la PC) termina en un
    // `child.kill()` forzado del sidecar de Node, sin darle chance de
    // cerrar limpio (ver src-tauri/src/lib.rs). Antes de dejar cerrar,
    // le pedimos al backend un checkpoint del WAL + backup consistente
    // (ver routes/sistema.js), para achicar la ventana de riesgo de dejar
    // el .db principal desactualizado respecto al -wal/-shm.
    getCurrentWindow().onCloseRequested(async (event) => {
      event.preventDefault();
      try {
        await fetchJSON('/sistema/checkpoint-seguro', { method: 'POST' });
      } catch (err) {
        console.error('No se pudo hacer el checkpoint seguro antes de cerrar:', err);
        // Igual dejamos cerrar: preferimos cerrar con un WAL posiblemente
        // pendiente de checkpoint (SQLite lo recupera solo al reabrir)
        // antes que dejar la app trabada sin poder cerrarse.
      } finally {
        await getCurrentWindow().destroy();
      }
    });

    // --- PERRO GUARDIÁN (Watchdog) DINÁMICO ---
    setInterval(async () => {
      try {
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
    }, 8000);
  }

  // --- CARGA DE CONFIGURACIÓN CON BACKOFF ---
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