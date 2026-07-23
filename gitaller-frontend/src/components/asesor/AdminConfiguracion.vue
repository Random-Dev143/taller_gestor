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
          <small style="color: #b22234; display:block; margin-top:4px;">
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
            <span style="font-size: 1rem; color: #0056a7; font-weight: bold;">El taller trabaja de corrido (Sin pausa de almuerzo)</span>
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
      </div>

      <button type="submit" class="btn btn-success" :disabled="guardando">Guardar Configuración</button>
    </form>

    <hr style="margin: 30px 0;">

    <h3>Logotipo del Taller</h3>
    <div style="display: flex; align-items: center; gap: 20px; margin-top: 15px;">
      <div style="width: 150px; height: 80px; border: 1px dashed #ccc; display: flex; align-items: center; justify-content: center; background: #f8fafc; border-radius: 8px;">
        <img v-if="configStore.config.logo_path" :src="configStore.getLogoUrl()" style="max-width: 100%; max-height: 100%;" />
        <span v-else style="color: #999; font-size: 0.8rem;">Sin logo</span>
      </div>
      <div>
        <p style="font-size: 0.85rem; color: #666; margin-top: 0;">Suba una imagen en formato PNG (Fondo transparente recomendado).</p>
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

const { fetchJSON, API_BASE, getToken } = useApi()
const toast = useToast()
const configStore = useConfigStore()

const guardando = ref(false)
const form = ref({
  nombre_taller: '', hora_apertura: 8, hora_cierre: 18, 
  hora_almuerzo_inicio: 13, hora_almuerzo_fin: 14, trabaja_corrido: false,
  puerto_servidor: 5881,
  slogan: '', direccion: '', cuit: '', telefono: '', email: '' 
})

onMounted(() => {
  const c = configStore.config
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
    email: c.email || ''            
  }
})

const guardarConfig = async () => {
  guardando.value = true
  try {
    await fetchJSON('/configuracion', { method: 'PUT', body: JSON.stringify(form.value) })
    toast.success('Configuración guardada')
    await configStore.cargarConfig() // Recarga global
  } catch (err) { toast.error(errMsg(err)) }
  finally { guardando.value = false }
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
