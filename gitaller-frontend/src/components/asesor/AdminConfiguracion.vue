<template>
  <div class="config">
    <!-- 1. Datos del taller -->
    <section class="card config-block">
      <header class="config-block__head">
        <h3>Datos del taller</h3>
        <p>Se muestran en la pantalla de inicio, en los informes y en los PDF. Se guardan junto con los horarios, con el botón de la sección siguiente.</p>
      </header>
      <form @submit.prevent="guardarConfig" id="form-config">
        <div class="form-grid">
          <div class="form-group span-full">
            <label>Nombre del taller / empresa</label>
            <input type="text" v-model="form.nombre_taller" required />
          </div>
          <div class="form-group span-full">
            <label>Eslogan o descripción corta</label>
            <input type="text" v-model="form.slogan" placeholder="Ej: Concesionario oficial" />
          </div>
          <div class="form-group span-full">
            <label>Dirección</label>
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
          <div class="form-group">
            <label>Correo de contacto</label>
            <input type="email" v-model="form.email" placeholder="Ej: info@mitaller.com" />
          </div>
        </div>
      </form>
    </section>

    <!-- 2. Horarios y servidor -->
    <section class="card config-block">
      <header class="config-block__head">
        <h3>Horarios y servidor</h3>
        <p>Los horarios definen la pausa y el cierre automático de tareas, y la capacidad diaria de los turnos.</p>
      </header>
      <div class="form-grid">
        <div class="form-group">
          <label>Apertura (hora, 0-23)</label>
          <input type="number" form="form-config" v-model="form.hora_apertura" min="0" max="23" required />
        </div>
        <div class="form-group">
          <label>Cierre (hora, 0-23)</label>
          <input type="number" form="form-config" v-model="form.hora_cierre" min="0" max="23" required />
        </div>
        <div class="form-group span-full">
          <label class="check"><input type="checkbox" form="form-config" v-model="form.trabaja_corrido" /> El taller trabaja de corrido (sin pausa de almuerzo)</label>
        </div>
        <template v-if="!form.trabaja_corrido">
          <div class="form-group">
            <label>Inicio de almuerzo (hora)</label>
            <input type="number" form="form-config" v-model="form.hora_almuerzo_inicio" min="0" max="23" />
          </div>
          <div class="form-group">
            <label>Fin de almuerzo (hora)</label>
            <input type="number" form="form-config" v-model="form.hora_almuerzo_fin" min="0" max="23" />
          </div>
        </template>
        <div class="form-group span-full">
          <label class="check"><input type="checkbox" form="form-config" v-model="form.trabaja_sabados" /> El taller abre los sábados</label>
          <small class="hint">Se asume media jornada, sin corte de almuerzo.</small>
        </div>
        <template v-if="form.trabaja_sabados">
          <div class="form-group">
            <label>Sábado: apertura (hora)</label>
            <input type="number" form="form-config" v-model="form.sabado_hora_apertura" min="0" max="23" />
          </div>
          <div class="form-group">
            <label>Sábado: cierre (hora)</label>
            <input type="number" form="form-config" v-model="form.sabado_hora_cierre" min="0" max="23" />
          </div>
        </template>
        <div class="form-group">
          <label>Puerto del servidor</label>
          <input type="number" form="form-config" v-model="form.puerto_servidor" required />
          <small class="hint hint--warn"><AppIcon name="alert" /> Si lo modificás, hay que reiniciar el servidor.</small>
        </div>
      </div>
      <div class="config-block__actions">
        <button type="submit" form="form-config" class="btn" :disabled="guardando">
          {{ reiniciandoBackend ? 'Reiniciando servidor...' : (guardando ? 'Guardando...' : 'Guardar datos y horarios') }}
        </button>
      </div>
    </section>

    <!-- 3. Informe NPS -->
    <section class="card config-block">
      <header class="config-block__head">
        <h3>Informe NPS (planilla quincenal)</h3>
        <p>Cada 1 y 16 el sistema genera la planilla del período anterior y la <strong>guarda</strong> en esta carpeta. No se envía a nadie.</p>
      </header>
      <form @submit.prevent="guardarInformes">
        <div class="form-grid">
          <div class="form-group span-full">
            <label>Carpeta donde se guardan los informes</label>
            <div class="folder-row">
              <input type="text" v-model="informes.carpeta_informes" placeholder="Ej: C:\Informes\NPS" />
              <button type="button" class="btn btn-sm btn-secondary" @click="elegirCarpeta">Examinar...</button>
            </div>
            <small class="hint">La ruta debe existir en la PC donde corre el servidor. Si no existe, se crea.</small>
          </div>
          <div class="form-group"><label>Código de concesionario</label><input type="text" v-model="informes.nps_concesionario" required /></div>
          <div class="form-group"><label>Código de sede</label><input type="text" v-model="informes.nps_sede" required /></div>
          <div class="form-group span-full">
            <label class="check"><input type="checkbox" v-model="informes.informe_auto_activo" /> Generar el informe automáticamente cada quincena</label>
          </div>
        </div>
        <div class="config-block__actions">
          <button type="submit" class="btn" :disabled="guardandoInformes">{{ guardandoInformes ? 'Guardando...' : 'Guardar ajustes del informe' }}</button>
        </div>
      </form>
    </section>

    <!-- 4. Documentos del legajo digital -->
    <section class="card config-block">
      <header class="config-block__head">
        <h3>Documentos de las OT (legajo digital)</h3>
        <p>Acá se guardan los PDF (presupuestos y otros) que se suben al legajo de cada OT, en una subcarpeta por OT. Incluí esta carpeta en tu copia de seguridad: la base de datos solo guarda la ruta de cada archivo.</p>
      </header>
      <form @submit.prevent="guardarDocumentos">
        <div class="form-grid">
          <div class="form-group span-full">
            <label>Carpeta donde se guardan los documentos</label>
            <div class="folder-row">
              <input type="text" v-model="documentos.carpeta_documentos" placeholder="Ej: D:\Taller\Documentos" />
              <button type="button" class="btn btn-sm btn-secondary" @click="elegirCarpetaDocumentos">Examinar...</button>
            </div>
            <small class="hint">La ruta debe existir en la PC donde corre el servidor. Si no existe, se crea.</small>
          </div>
        </div>
        <div class="config-block__actions">
          <button type="submit" class="btn" :disabled="guardandoDocumentos">{{ guardandoDocumentos ? 'Guardando...' : 'Guardar carpeta de documentos' }}</button>
        </div>
      </form>
    </section>

    <!-- 5. Logotipo -->
    <section class="card config-block">
      <header class="config-block__head">
        <h3>Logotipo</h3>
        <p>Se muestra en la barra superior y en la pantalla de ingreso. Recomendado: PNG con fondo transparente.</p>
      </header>
      <div class="logo-row">
        <div class="logo-preview">
          <img v-if="configStore.config.logo_path" :src="configStore.getLogoUrl()" alt="Logotipo actual" />
          <span v-else>Sin logo</span>
        </div>
        <button type="button" class="btn btn-sm btn-secondary" @click="subirLogo">Examinar y subir logo</button>
      </div>
    </section>
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
  cargarDocumentos()
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

// ─── Carpeta de documentos del legajo digital ───
const guardandoDocumentos = ref(false)
const documentos = ref({ carpeta_documentos: '' })

const cargarDocumentos = async () => {
  try { documentos.value = await fetchJSON('/configuracion/documentos') } catch (err) { toast.error(errMsg(err)) }
}

const elegirCarpetaDocumentos = async () => {
  const isTauri = typeof window !== 'undefined' && window.__TAURI_INTERNALS__ !== undefined
  if (!isTauri) { toast.info('Escriba la ruta de la carpeta en el campo de texto.'); return }
  try {
    const { open } = await import('@tauri-apps/plugin-dialog')
    const carpeta = await open({ directory: true, multiple: false })
    if (carpeta) documentos.value.carpeta_documentos = carpeta
  } catch (err) { toast.error(errMsg(err)) }
}

const guardarDocumentos = async () => {
  guardandoDocumentos.value = true
  try {
    await fetchJSON('/configuracion/documentos', { method: 'PUT', body: JSON.stringify(documentos.value) })
    toast.success('Carpeta de documentos guardada')
  } catch (err) { toast.error(errMsg(err)) }
  finally { guardandoDocumentos.value = false }
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


<style scoped>
.config { display: grid; gap: 16px; max-width: 920px; margin: 0 auto; }
.config .card { margin-bottom: 0; }
.config-block__head { margin-bottom: 16px; }
.config-block__head h3 { margin: 0 0 4px; }
.config-block__head p { margin: 0; font-size: 0.86rem; color: var(--text-soft); }
.config-block__actions { display: flex; justify-content: flex-end; margin-top: 4px; }
.check { display: flex; align-items: center; gap: 9px; font-size: 0.92rem; font-weight: 500; color: var(--text); cursor: pointer; }
.hint { color: var(--muted); font-size: 0.8rem; }
.hint--warn { display: flex; align-items: center; gap: 5px; color: var(--warning); }
.folder-row { display: flex; gap: 8px; }
.folder-row input { flex: 1; }
.logo-row { display: flex; align-items: center; gap: 20px; flex-wrap: wrap; }
.logo-preview {
  width: 160px; height: 80px; display: flex; align-items: center; justify-content: center;
  border: 1px dashed var(--border); border-radius: var(--radius); background: var(--surface-sub);
  color: var(--muted); font-size: 0.82rem;
}
.logo-preview img { max-width: 100%; max-height: 100%; }
</style>
