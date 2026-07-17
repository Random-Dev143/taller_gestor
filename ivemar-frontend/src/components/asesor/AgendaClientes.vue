<template>
  <div class="card">
    <div class="header-row">
      <h2>Agenda de Clientes y Unidades</h2>
      <input type="text" v-model="busqueda" placeholder="🔍 Buscar por patente, cliente o unidad..." class="form-control search-input" />
      <button class="btn btn-secondary btn-sm" @click="cargarAgenda">↻ Actualizar</button>
    </div>

    <div v-if="loading" class="loading-state"><div class="spinner"></div>Cargando agenda...</div>
    <div v-else class="agenda-list" style="max-height: 550px; overflow-y: auto; padding-right: 5px;">
      <div v-if="clientesFiltrados.length === 0" class="empty-state">No se encontraron resultados.</div>
      
      <div v-for="grupo in clientesFiltrados" :key="grupo.id" class="client-group">
        <div class="client-header" @click="toggleExpand(grupo.id)">
          <div class="client-title">
            <span class="expand-icon">{{ expandedClients.has(grupo.id) ? '▼' : '▶' }}</span>
            <span class="client-name">{{ grupo.nombre }}</span>
            <span class="badge-sm">{{ grupo.unidades.length }} unidad{{ grupo.unidades.length !== 1 ? 'es' : '' }}</span>
          </div>
        </div>
        
        <div v-show="expandedClients.has(grupo.id)" class="client-body table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Patente</th>
                <th>Unidad</th>
                <th>Contacto Principal</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="u in grupo.unidades" :key="u.id">
                <td><strong>{{ u.patente }}</strong></td>
                <td>
                  <div v-if="editandoId === u.id" class="edit-group">
                    <label class="edit-label">Cliente (Transferir):</label>
                    <input v-model="editForm.cliente" class="edit-input mb-1" />
                    <label class="edit-label">Unidad:</label>
                    <input v-model="editForm.unidad" class="edit-input" />
                  </div>
                  <span v-else>{{ u.unidad }}</span>
                </td>
                <td>
                  <template v-if="editandoId === u.id">
                    <input v-model="editForm.contacto_nombre" placeholder="Nombre" class="edit-input mb-1" />
                    <input v-model="editForm.contacto_apellido" placeholder="Apellido" class="edit-input mb-1" />
                    <input v-model="editForm.telefono" placeholder="Teléfono" class="edit-input mb-1" />
                    <input v-model="editForm.correo" placeholder="Correo" class="edit-input" />
                  </template>
                  <template v-else>
                    <strong>{{ u.contacto_nombre }} {{ u.contacto_apellido }}</strong>
                    <div v-if="u.telefono">📞 {{ u.telefono }}</div>
                    <div v-if="u.correo">📧 {{ u.correo }}</div>
                  </template>
                </td>
                <td style="white-space: nowrap; vertical-align: top;">
                  <template v-if="editandoId === u.id">
                    <button class="btn btn-success btn-sm mb-1 w-100" v-can="'agenda_gestionar'" @click="guardarEdicion(u.id, u.patente)">Guardar</button>
                    <button class="btn btn-secondary btn-sm w-100" @click="cancelarEdicion">Cancelar</button>
                  </template>
                  <template v-else>
                    <button class="btn btn-sm" v-can="'agenda_gestionar'" @click="iniciarEdicion(u)">Editar</button>
                    <button class="btn btn-outline btn-sm" v-can="'agenda_ver'" @click="verHistorial(u)">🕓 Historial</button>
                  </template>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <hr style="margin:20px 0;" />

    <h3>Agregar Registro Manual</h3>
    <form @submit.prevent="crearCliente">
      <div class="form-grid">
        <div class="form-group"><label>Patente *</label><input type="text" v-model="form.patente" required /></div>
        <div class="form-group"><label>Cliente *</label><input type="text" v-model="form.cliente" required /></div>
        <div class="form-group"><label>Unidad *</label><input type="text" v-model="form.unidad" required /></div>
        <div class="form-group"><label>Nombre del Contacto</label><input type="text" v-model="form.contacto_nombre" /></div>
        <div class="form-group"><label>Apellido del Contacto</label><input type="text" v-model="form.contacto_apellido" /></div>
        <div class="form-group"><label>Teléfono</label><input type="text" v-model="form.telefono" /></div>
        <div class="form-group"><label>Correo Electrónico</label><input type="email" v-model="form.correo" /></div>
      </div>
      <button type="submit" class="btn btn-success" v-can="'agenda_gestionar'" :disabled="enviando">Guardar en agenda</button>
    </form>

    <ModalHistorialCliente
      v-if="historialSeleccionado"
      :patente="historialSeleccionado.patente"
      :cliente="historialSeleccionado.cliente"
      :unidad="historialSeleccionado.unidad"
      @close="historialSeleccionado = null"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useApi } from '../../composables/useApi'
import { useToast, errMsg } from '../../composables/useToast'
import ModalHistorialCliente from './ModalHistorialCliente.vue'

const { fetchJSON } = useApi()
const toast = useToast()

const historialSeleccionado = ref(null)
const verHistorial = (u) => { historialSeleccionado.value = u }

const unidadesRaw = ref([])
const busqueda = ref('')
const loading = ref(true)
const enviando = ref(false)
const form = ref({ patente: '', cliente: '', unidad: '', telefono: '', correo: '', contacto_nombre: '', contacto_apellido: '' })
const editandoId = ref(null)
const editForm = ref({ cliente: '', unidad: '', telefono: '', correo: '', contacto_nombre: '', contacto_apellido: '' })

const expandedClients = ref(new Set())

const toggleExpand = (id) => {
  const newSet = new Set(expandedClients.value)
  if (newSet.has(id)) newSet.delete(id)
  else newSet.add(id)
  expandedClients.value = newSet
}

// Agrupamos las unidades planas por Cliente
const clientesAgrupados = computed(() => {
  const map = new Map()
  unidadesRaw.value.forEach(u => {
    const key = u.cliente_id || u.cliente.toUpperCase()
    if (!map.has(key)) {
      map.set(key, {
        id: key,
        nombre: u.cliente,
        unidades: []
      })
    }
    map.get(key).unidades.push(u)
  })
  return Array.from(map.values()).sort((a, b) => a.nombre.localeCompare(b.nombre))
})

// Filtramos clientes y expandimos automáticamente si hay búsqueda
const clientesFiltrados = computed(() => {
  const q = busqueda.value.toLowerCase()
  if (!q) return clientesAgrupados.value
  
  return clientesAgrupados.value.filter(g => {
    const matchCliente = g.nombre.toLowerCase().includes(q)
    const matchUnidad = g.unidades.some(u => 
      u.patente.toLowerCase().includes(q) || 
      u.unidad.toLowerCase().includes(q) ||
      (u.contacto_nombre && u.contacto_nombre.toLowerCase().includes(q)) ||
      (u.contacto_apellido && u.contacto_apellido.toLowerCase().includes(q))
    )
    return matchCliente || matchUnidad
  })
})

watch(busqueda, (val) => {
  if (val.trim().length > 0) {
    const newSet = new Set(expandedClients.value)
    clientesFiltrados.value.forEach(g => newSet.add(g.id))
    expandedClients.value = newSet
  }
})

const cargarAgenda = async () => {
  loading.value = true
  try { unidadesRaw.value = await fetchJSON('/unidades') } 
  catch (err) { toast.error(errMsg(err)) } 
  finally { loading.value = false }
}

const crearCliente = async () => {
  enviando.value = true
  try {
    const payload = { ...form.value, patente: form.value.patente.replace(/[^a-zA-Z0-9]/g, '').toUpperCase() }
    await fetchJSON('/unidades', { method: 'POST', body: JSON.stringify(payload) })
    toast.success('Cliente/Unidad agregado')
    form.value = { patente: '', cliente: '', unidad: '', telefono: '', correo: '', contacto_nombre: '', contacto_apellido: '' }
    cargarAgenda()
  } catch (err) { toast.error(errMsg(err)) } 
  finally { enviando.value = false }
}

const iniciarEdicion = (u) => {
  editandoId.value = u.id
  editForm.value = { cliente: u.cliente, unidad: u.unidad, telefono: u.telefono, correo: u.correo, contacto_nombre: u.contacto_nombre, contacto_apellido: u.contacto_apellido }
}
const cancelarEdicion = () => { editandoId.value = null }

const guardarEdicion = async (id, patente) => {
  try {
    await fetchJSON(`/unidades/${id}`, { method: 'PUT', body: JSON.stringify({ patente, ...editForm.value }) })
    toast.success('Actualizado')
    cancelarEdicion()
    cargarAgenda()
  } catch (err) { toast.error(errMsg(err)) }
}

onMounted(cargarAgenda)
</script>

<style scoped>
.header-row { display: flex; gap: 15px; align-items: center; margin-bottom: 15px; }
.search-input { max-width: 300px; }
.edit-input { padding: 4px; border: 1px solid var(--primary); border-radius: 4px; width: 100%; }
.mb-1 { margin-bottom: 4px; }

/* Estilos del Acordeón Agrupado */
.client-group {
  margin-bottom: 12px;
  border: 1px solid var(--border-soft);
  border-radius: var(--radius-sm);
  background: white;
  overflow: hidden;
  box-shadow: 0 1px 3px rgba(0,0,0,0.02);
}
.client-header {
  padding: 14px 16px;
  background: #f8fafc;
  cursor: pointer;
  transition: background 0.2s;
  user-select: none;
}
.client-header:hover { background: #e9edf4; }
.client-title { display: flex; align-items: center; gap: 12px; }
.client-name { font-weight: 700; font-size: 1.05rem; color: var(--primary-dark); flex: 1; text-transform: uppercase; }
.expand-icon { font-size: 0.8rem; color: var(--muted); width: 16px; text-align: center; }

.client-body { border-top: 1px solid var(--border-soft); padding: 0; }
.client-body table { margin: 0; }
.client-body th { background: white; border-bottom: 2px solid var(--border-soft); }

.edit-group { display: flex; flex-direction: column; gap: 2px; }
.edit-label { font-size: 0.75rem; color: var(--muted); font-weight: 600; margin-top: 4px; }
</style>