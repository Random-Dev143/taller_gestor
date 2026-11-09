<template>
  <div class="card">
    <h2>Configuración General del Taller</h2>
    <hr style="margin-bottom: 20px;">

    <form @submit.prevent="guardarConfig">
      <div class="form-grid">
        <div class="form-group" style="grid-column: span 2;">
          <label>Nombre del Taller / Empresa</label>
          <input type="text" v-model="form.nombre_taller" required />
        </div>
        <div class="form-group" style="grid-column: span 2;">
          <label>Slogan o Descripción Corta</label>
          <input type="text" v-model="form.slogan" placeholder="Ej: Concesionario Oficial..." />
        </div>
        <div class="form-group" style="grid-column: span 2;">
          <label>Dirección del Taller</label>
          <input type="text" v-model="form.direccion" placeholder="Ej: Av. Principal 123, Ciudad" />
        </div>
        <div class="form-group">
          <label>CUIT / RUT</label>
          <input type="text" v-model="form.cuit" placeholder="Ej: 30-12345678-9" />
        </div>
        <div class="form-group">
          <label>Teléfono(s)</label>
          <input type="text" v-model="form.telefono" placeholder="Ej: 0800-123-4567" />
        </div>
        <div class="form-group" style="grid-column: span 2;">
          <label>Correo Electrónico (Contacto)</label>
          <input type="email" v-model="form.email" placeholder="Ej: info@mitaller.com" />
        </div>
        <!-- Agrega este bloque debajo del div de nombre_taller -->
        <div class="form-group">
          <label>Puerto del Servidor</label>
          <input type="number" v-model="form.puerto_servidor" required />
          <small style="color: var(--danger); display:block; margin-top:4px;">
            ⚠️ Si modificas este valor, debes reiniciar manualmente la consola del backend.
          </small>
        </div>

        <div class="form-group">
          <label>Hora de Apertura (0-23)</label>
          <input type="number" v-model="form.hora_apertura" min="0" max="23" required />
        </div>
        <div class="form-group">
          <label>Hora de Cierre (0-23)</label>
          <input type="number" v-model="form.hora_cierre" min="0" max="23" required />
        </div>

        <div class="form-group" style="grid-column: span 2;">
          <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; margin-top: 10px;">
            <input type="checkbox" v-model="form.trabaja_corrido" style="width: 20px; height: 20px;" />
            <span style="font-size: 1rem; color: var(--primary); font-weight: bold;">El taller trabaja de corrido (Sin pausa de almuerzo)</span>
          </label>
        </div>

        <template v-if="!form.trabaja_corrido">
          <div class="form-group">
            <label>Inicio de Almuerzo (0-23)</label>
            <input type="number" v-model="form.hora_almuerzo_inicio" min="0" max="23" />
          </div>
          <div class="form-group">
            <label>Fin de Almuerzo (Reanudación)</label>
            <input type="number" v-model="form.hora_almuerzo_fin" min="0" max="23" />
          </div>
        </template>

        <div class="form-group" style="grid-column: span 2;">
          <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; margin-top: 10px;">
            <input type="checkbox" v-model="form.trabaja_sabados" style="width: 20px; height: 20px;" />
            <span style="font-size: 1rem; color: var(--primary); font-weight: bold;">El taller abre los sábados</span>
          </label>
          <small style="color: var(--muted); display:block; margin-top:4px;">
            Controla la pausa/cierre automático de tareas de los sábados (ver módulo de cron). Se asume media jornada, sin corte de almuerzo.
          </small>
        </div>

        <template v-if="form.trabaja_sabados">
          <div class="form-group">
            <label>Sábado — Hora de Apertura (0-23)</label>
            <input type="number" v-model="form.sabado_hora_apertura" min="0" max="23" />
          </div>
          <div class="form-group">
            <label>Sábado — Hora de Cierre (0-23)</label>
            <input type="number" v-model="form.sabado_hora_cierre" min="0" max="23" />
          </div>
        </template>
      </div>

      <button type="submit" class="btn btn-success" :disabled="guardando">
        {{ reiniciandoBackend ? 'Reiniciando servidor...' : (guardando ? 'Guardando...' : 'Guardar Configuración') }}
      </button>
    </form>

    <hr style="margin: 30px 0;">

    <h3>Informe NPS (planilla quincenal)</h3>
    <p class="text-muted" style="font-size: 0.85rem; margin-top: 4px;">
      Cada 1 y 16 el sistema genera solo la planilla del período anterior y la <strong>guarda</strong> en esta carpeta (no la envía a nadie).
    </p>
    <form @submit.prevent="guardarInformes">
      <div class="form-grid">
        <div class="form-group" style="grid-column: span 2;">
          <label>Carpeta donde se guardan los informes</label>
          <div style="display: flex; gap: 8px;">
            <input type="text" v-model="informes.carpeta_informes" placeholder="Ej: C:\Informes\NPS" style="flex: 1;" />
            <button type="button" class="btn btn-sm btn-secondary" @click="elegirCarpeta">Examinar...</button>
          </div>
          <small class="text-muted">La ruta debe existir en la PC donde corre el servidor. Si no existe, se crea.</small>
        </div>
        <div class="form-group"><label>Código de Concesionario</label><input type="text" v-model="informes.nps_concesionario" required /></div>
        <div class="form-group"><label>Código de Sede</label><input type="text" v-model="informes.nps_sede" required /></div>
        <div class="form-group" style="grid-column: span 2;">
          <label style="display: flex; align-items: center; gap: 8px;">
            <input type="checkbox" v-model="informes.informe_auto_activo" style="width: auto;" />
            Generar el informe automáticamente cada quincena
          </label>
        </div>
      </div>
      <button type="submit" class="btn btn-success" :disabled="guardandoInformes">{{ guardandoInformes ? 'Guardando...' : 'Guardar ajustes del informe' }}</button>
    </form>

    <hr style="margin: 30px 0;">

    <h3>Logotipo del Taller</h3>
    <div style="display: flex; align-items: center; gap: 20px; margin-top: 15px;">
      <div style="width: 150px; height: 80px; border: 1px dashed var(--border); display: flex; align-items: center; justify-content: center; background: var(--border-soft); border-radius: 8px;">
        <img v-if="configStore.config.logo_path" :src="configStore.getLogoUrl()" style="max-width: 100%; max-height: 100%;" />
        <span v-else style="color: var(--muted); font-size: 0.8rem;">Sin logo</span>
      </div>
      <div>
        <p style="font-size: 0.85rem; color: var(--text-soft); margin-top: 0;">Suba una imagen en formato PNG (Fondo transparente recomendado).</p>
        <button class="btn btn-sm btn-secondary" @click="subirLogo">Examinar y Subir Logo</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue'
import { useApi } from '../../composables/useApi'
import { useToast, errMsg } from '../../composables/useToast'
import { useConfigStore } from '../../stores/useConfigStore'
import { initRuntimePort } from '../../runtimePort'

const { fetchJSON, API_BASE, getToken } = useApi()
const toast = useToast()
const configStore = useConfigStore()

const guardando = ref(false)
const reiniciandoBackend = ref(false)
const puertoOriginal = ref(5881)
const form = ref({
  nombre_taller: '', hora_apertura: 8, hora_cierre: 18, 
  hora_almuerzo_inicio: 13, hora_almuerzo_fin: 14, trabaja_corrido: false,
  puerto_servidor: 5881,
  slogan: '', direccion: '', cuit: '', telefono: '', email: '',
  trabaja_sabados: true, sabado_hora_apertura: 8, sabado_hora_cierre: 13
})

onMounted(async () => {
  // Obligamos a la vista a esperar la respuesta del backend
  await configStore.cargarConfig(); 
  
  const c = configStore.config;
  form.value = {
    nombre_taller: c.nombre_taller,
    hora_apertura: c.hora_apertura,
    hora_cierre: c.hora_cierre,
    hora_almuerzo_inicio: c.hora_almuerzo_inicio,
    hora_almuerzo_fin: c.hora_almuerzo_fin,
    trabaja_corrido: c.trabaja_corrido === 1,
    puerto_servidor: c.puerto_servidor || 5881,
    slogan: c.slogan || '',         
    direccion: c.direccion || '',   
    cuit: c.cuit || '',             
    telefono: c.telefono || '',     
    email: c.email || '',
    trabaja_sabados: c.trabaja_sabados === undefined ? true : c.trabaja_sabados === 1,
    sabado_hora_apertura: c.sabado_hora_apertura ?? 8,
    sabado_hora_cierre: c.sabado_hora_cierre ?? 13
  }
  puertoOriginal.value = form.value.puerto_servidor
  cargarInformes()
})

// ─── Informe NPS ───
const guardandoInformes = ref(false)
const informes = ref({ carpeta_informes: '', nps_concesionario: '7', nps_sede: '20', informe_auto_activo: true })

const cargarInformes = async () => {
  try { informes.value = await fetchJSON('/configuracion/informes') } catch (err) { toast.error(errMsg(err)) }
}

const elegirCarpeta = async () => {
  const isTauri = typeof window !== 'undefined' && window.__TAURI_INTERNALS__ !== undefined
  if (!isTauri) { toast.info('Escriba la ruta de la carpeta en el campo de texto.'); return }
  try {
    const { open } = await import('@tauri-apps/plugin-dialog')
    const carpeta = await open({ directory: true, multiple: false })
    if (carpeta) informes.value.carpeta_informes = carpeta
  } catch (err) { toast.error(errMsg(err)) }
}

const guardarInformes = async () => {
  guardandoInformes.value = true
  try {
    await fetchJSON('/configuracion/informes', { method: 'PUT', body: JSON.stringify(informes.value) })
    toast.success('Ajustes del informe guardados')
  } catch (err) { toast.error(errMsg(err)) }
  finally { guardandoInformes.value = false }
}

const guardarConfig = async () => {
  guardando.value = true
  const cambioPuerto = Number(form.value.puerto_servidor) !== Number(puertoOriginal.value)

  try {
    await fetchJSON('/configuracion', { method: 'PUT', body: JSON.stringify(form.value) })
    toast.success('Configuración guardada')
    await configStore.cargarConfig() // Recarga global

    // El backend solo lee `puerto_servidor` UNA VEZ, al arrancar. Guardar
    // el valor nuevo en la base no alcanza para que empiece a escuchar
    // ahí: hace falta reiniciar el proceso. En la app de escritorio
    // (Tauri) lo hacemos automáticamente acá; por navegador de red no hay
    // forma de reiniciar el sidecar remotamente.
    const isTauri = typeof window !== 'undefined' && window.__TAURI_INTERNALS__ !== undefined
    if (cambioPuerto && isTauri) {
      reiniciandoBackend.value = true
      toast.info('Puerto cambiado: reiniciando el servidor...')

      const { invoke } = await import('@tauri-apps/api/core')
      await invoke('stop_server')
      // Margen para que el proceso viejo libere el socket antes de
      // levantar uno nuevo, evitando una carrera de EADDRINUSE.
      await new Promise(r => setTimeout(r, 800))
      await invoke('start_server')

      // Le damos tiempo al backend nuevo a migrar/sembrar y bindear el
      // puerto nuevo antes de volver a leer runtime-port.json.
      await new Promise(r => setTimeout(r, 3000))
      await initRuntimePort()

      toast.success('Servidor reiniciado en el nuevo puerto. Recargando la app...')
      setTimeout(() => window.location.reload(), 800)
    } else if (cambioPuerto && !isTauri) {
      toast.info('El puerto se guardó, pero hace falta reiniciar el servidor manualmente en la PC del taller para que tome efecto.', 8000)
    }
  } catch (err) { toast.error(errMsg(err)) }
  finally {
    guardando.value = false
    reiniciandoBackend.value = false
  }
}

const subirLogo = () => {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = 'image/png'
  input.onchange = async () => {
    const file = input.files[0]
    if (!file) return
    const formData = new FormData()
    formData.append('logo', file)
    try {
      const response = await fetch(`${API_BASE}/configuracion/logo`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${getToken()}` },
      body: formData
    })
      
      const data = await response.json() // Parseamos la respuesta para ver el error real si lo hay
      if (!response.ok) throw new Error(data.error || 'Error al subir logo')
      
      toast.success('Logotipo actualizado')
      await configStore.cargarConfig()
    } catch (err) { 
      toast.error(err.message) 
    }
  }
  input.click()
}
</script>
