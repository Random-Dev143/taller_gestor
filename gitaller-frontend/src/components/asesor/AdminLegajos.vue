<template>
  <div class="card">
    <div class="header-row">
      <h2>Administrar Legajos</h2>
      <button class="btn btn-secondary btn-sm" @click="cargarLegajos">↻ Actualizar</button>
    </div>

    <div v-if="loading" class="loading-state"><div class="spinner"></div>Cargando legajos...</div>
    <div v-else class="table-wrapper">
      <table>
        <thead>
          <tr>
            <th>Legajo</th>
            <th>Nombre</th>
            <th>Rol</th>
            <th>Firma</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="legajos.length === 0">
            <td colspan="5" class="empty-state">No hay legajos registrados</td>
          </tr>
          <tr v-for="l in legajos" :key="l.legajo">
            <td><strong>{{ l.legajo }}</strong></td>
            <td>{{ l.nombre }}</td>
            <td><span class="badge">{{ l.rol }}</span></td>
            <td>
              <img v-if="l.firma_path" :src="getFirmaUrl(l.firma_path)" alt="Firma" class="firma-img" />
              <span v-else class="text-muted">Sin firma</span>
            </td>
            <td>
              <button class="btn btn-sm" v-can="'legajo_gestionar'" @click="subirFirma(l.legajo)">Subir firma</button>
              <button class="btn btn-danger btn-sm" v-can="'legajo_gestionar'" @click="eliminarLegajo(l.legajo)">Eliminar</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <hr style="margin: 25px 0;" />

    <h3>Crear nuevo legajo</h3>
    <form @submit.prevent="crearLegajo">
      <div class="form-grid">
        <div class="form-group">
          <label>Legajo *</label>
          <input type="text" v-model="form.legajo" required placeholder="Ej: MEC01" />
        </div>
        <div class="form-group">
          <label>Nombre *</label>
          <input type="text" v-model="form.nombre" required />
        </div>
        <div class="form-group">
          <label>Rol *</label>
          <select v-model="form.rol">
            <option value="asesor">Asesor</option>
            <option value="jefe">Jefe</option>
            <option value="mecanico">Mecánico</option>
          </select>
        </div>
      </div>
      <button type="submit" class="btn" :disabled="enviando">{{ enviando ? 'Creando...' : 'Crear legajo' }}</button>
    </form>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useApi } from '../../composables/useApi'
import { useToast, errMsg } from '../../composables/useToast'

const { fetchJSON, API_BASE } = useApi()
const toast = useToast()

const legajos = ref([])
const loading = ref(true)
const enviando = ref(false)

const formBase = { legajo: '', nombre: '', rol: 'mecanico' }
const form = ref({ ...formBase })

// Calcula la URL absoluta para la imagen de la firma (quita el '/api' y apunta a la raíz del server)
const getFirmaUrl = (path) => `${API_BASE.replace('/api', '')}${path}`

const cargarLegajos = async () => {
  loading.value = true
  try {
    legajos.value = await fetchJSON('/legajos')
  } catch (err) {
    toast.error('Error cargando legajos: ' + errMsg(err))
  } finally {
    loading.value = false
  }
}

const crearLegajo = async () => {
  enviando.value = true
  try {
    await fetchJSON('/legajos', {
      method: 'POST',
      body: JSON.stringify(form.value)
    })
    toast.success('Legajo creado correctamente')
    form.value = { ...formBase }
    cargarLegajos()
  } catch (err) {
    toast.error('Error: ' + errMsg(err))
  } finally {
    enviando.value = false
  }
}

const eliminarLegajo = async (legajo) => {
  if (!confirm(`¿Estás seguro de eliminar el legajo ${legajo}?`)) return
  try {
    await fetchJSON(`/legajos/${legajo}`, { method: 'DELETE' })
    toast.success('Legajo eliminado')
    cargarLegajos()
  } catch (err) {
    toast.error('Error al eliminar: ' + errMsg(err))
  }
}

// Subida de imagen saltándose el fetchJSON para poder usar FormData
const subirFirma = (legajo) => {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = 'image/png'

  input.onchange = async () => {
    const file = input.files[0]
    if (!file) return

    const formData = new FormData()
    formData.append('firma', file)

    try {
      const response = await fetch(`${API_BASE}/legajos/${legajo}/firma`, {
        method: 'POST',
        body: formData // No le ponemos Content-Type, el navegador lo calcula con el Boundary de FormData
      })
      if (!response.ok) throw new Error('Error al subir la firma')
      toast.success('Firma actualizada')
      cargarLegajos()
    } catch (err) {
      toast.error(err.message)
    }
  }

  input.click()
}

onMounted(cargarLegajos)
</script>

<style scoped>
.header-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; }
.header-row h2 { margin: 0; }
.firma-img { max-height: 40px; border-radius: 4px; border: 1px solid #eee; }
.text-muted { color: var(--muted); font-style: italic; font-size: 0.85rem; }
</style>