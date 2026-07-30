<template>
  <div class="card">
    <div class="header-row">
      <h2>Catálogo de Materiales</h2>
      <div style="display: flex; gap: 10px;">
        <input type="text" v-model="busqueda" placeholder="🔍 Buscar por NP o descripción..." class="form-control" style="width: 250px;" />
        <button class="btn btn-primary btn-sm" v-can="'repuesto_gestionar'" @click="abrirFormulario()">➕ Nuevo Repuesto</button>
        <button class="btn btn-secondary btn-sm" @click="cargarCatalogo">↻ Actualizar</button>
      </div>
    </div>

    <div v-if="loading" class="loading-state"><div class="spinner"></div>Cargando catálogo...</div>
    <div v-else class="table-wrapper mt-15">
      <table>
        <thead>
          <tr>
            <th>NP / Alternativo</th>
            <th>Descripción y Categoría</th>
            <th>Ubicación</th>
            <th>Stock</th>
            <th>Costo</th>
            <th>Venta Sugerida</th>
            <th v-if="puedeGestionar">Acciones</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="repuestosFiltrados.length === 0">
            <td colspan="7" class="empty-state">No se encontraron repuestos.</td>
          </tr>
          <tr v-for="r in repuestosFiltrados" :key="r.id">
            <td>
              <strong>{{ r.np }}</strong>
              <div v-if="r.np_alternativo" style="font-size: 0.8rem; color: var(--text-soft);">Alt: {{ r.np_alternativo }}</div>
            </td>
            <td>
              {{ r.descripcion }}
              <div style="font-size: 0.8rem; color: var(--muted);">{{ r.categoria || 'Sin categoría' }} {{ r.marca ? `· ${r.marca}` : '' }}</div>
            </td>
            <td><span class="badge-sm" style="background: var(--muted);">{{ r.ubicacion_fisica || 'N/A' }}</span></td>
            <td>
              <strong :class="r.stock_actual <= r.stock_minimo ? 'text-danger' : 'text-success'">
                {{ r.stock_actual }}
              </strong>
            </td>
            <td>{{ formatCurrency(r.costo_actual) }}</td>
            <td>
              <strong>{{ formatCurrency(r.precio_venta_actual) }}</strong>
              <div style="font-size: 0.75rem; color: var(--text-soft);">Margen: {{ r.margen_ganancia }}%</div>
            </td>
            <td v-if="puedeGestionar" style="white-space: nowrap;">
              <button class="btn btn-sm" @click="abrirFormulario(r)">✏️ Editar</button>
              <button class="btn btn-danger btn-sm" @click="desactivar(r.id)">🗑️</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- MODAL FORMULARIO -->
    <div v-if="mostrarModal" class="modal-overlay" @click.self="cerrarFormulario">
      <div class="modal-content modal-large">
        <button class="close-btn" @click="cerrarFormulario">&times;</button>
        <h2>{{ form.id ? 'Editar Repuesto' : 'Crear Repuesto' }}</h2>
        
        <form @submit.prevent="guardarRepuesto">
          <div class="form-grid mt-15">
            <div class="form-group">
              <label>Number Part (NP) *</label>
              <input type="text" v-model="form.np" required :disabled="!!form.id" />
            </div>
            <div class="form-group">
              <label>NP Alternativo</label>
              <input type="text" v-model="form.np_alternativo" />
            </div>
            <div class="form-group" style="grid-column: span 2;">
              <label>Descripción detallada *</label>
              <input type="text" v-model="form.descripcion" required placeholder="Ej: Filtro de Aceite Sintético..." />
            </div>
            <div class="form-group">
              <label>Marca</label>
              <input type="text" v-model="form.marca" />
            </div>
            <div class="form-group">
              <label>Categoría</label>
              <input type="text" v-model="form.categoria" list="categorias-list" />
              <datalist id="categorias-list">
                <option value="Filtros" /><option value="Frenos" /><option value="Lubricantes" /><option value="Suspensión" />
              </datalist>
            </div>
            <div class="form-group">
              <label>Costo Actual de Reposición ($)</label>
              <input type="number" step="0.01" min="0" v-model="form.costo_actual" />
            </div>
            <div class="form-group">
              <label>Margen de Ganancia (%)</label>
              <input type="number" step="0.1" min="0" v-model="form.margen_ganancia" />
            </div>
            <div class="form-group">
              <label>Precio Venta Resultante ($)</label>
              <input type="text" :value="formatCurrency(precioCalculado)" disabled />
            </div>
            <div class="form-group">
              <label>Ubicación Física (Pañol)</label>
              <input type="text" v-model="form.ubicacion_fisica" placeholder="Ej: Pasillo 2 - Estante B" />
            </div>
            <div class="form-group">
              <label>Proveedor Habitual</label>
              <input type="text" v-model="form.proveedor_habitual" />
            </div>
          </div>
          <div class="form-actions" style="display: flex; justify-content: flex-end; gap: 10px;">
            <button type="button" class="btn btn-secondary" @click="cerrarFormulario">Cancelar</button>
            <button type="submit" class="btn btn-success" :disabled="guardando">
              {{ guardando ? 'Guardando...' : 'Guardar Repuesto' }}
            </button>
          </div>
        </form>
      </div>
    </div>

  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useApi } from '../../composables/useApi'
import { useToast, errMsg } from '../../composables/useToast'
import { useAuthStore } from '../../stores/useAuthStore'

const { fetchJSON } = useApi()
const toast = useToast()
const authStore = useAuthStore()

const formatCurrency = (val) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(val || 0)

const puedeGestionar = computed(() => (authStore.usuario?.permisos || []).includes('repuesto_gestionar'))

const catalogo = ref([])
const loading = ref(true)
const busqueda = ref('')

const mostrarModal = ref(false)
const guardando = ref(false)
const formBase = { id: null, np: '', np_alternativo: '', descripcion: '', marca: '', categoria: '', costo_actual: 0, margen_ganancia: 40, ubicacion_fisica: '', proveedor_habitual: '' }
const form = ref({ ...formBase })

const precioCalculado = computed(() => {
  const costo = Number(form.value.costo_actual) || 0;
  const margen = Number(form.value.margen_ganancia) || 0;
  return costo * (1 + (margen / 100));
})

const repuestosFiltrados = computed(() => {
  const q = busqueda.value.toLowerCase()
  if (!q) return catalogo.value
  return catalogo.value.filter(r => 
    r.np.toLowerCase().includes(q) || 
    (r.np_alternativo && r.np_alternativo.toLowerCase().includes(q)) ||
    r.descripcion.toLowerCase().includes(q)
  )
})

const cargarCatalogo = async () => {
  loading.value = true
  try {
    catalogo.value = await fetchJSON('/repuestos')
  } catch (err) {
    toast.error('Error cargando catálogo: ' + errMsg(err))
  } finally {
    loading.value = false
  }
}

const abrirFormulario = (item = null) => {
  form.value = item ? { ...item } : { ...formBase }
  mostrarModal.value = true
}

const cerrarFormulario = () => {
  mostrarModal.value = false
}

const guardarRepuesto = async () => {
  guardando.value = true
  try {
    const payload = { ...form.value }
    if (payload.id) {
      await fetchJSON(`/repuestos/${payload.id}`, { method: 'PUT', body: JSON.stringify(payload) })
      toast.success('Repuesto actualizado')
    } else {
      await fetchJSON('/repuestos', { method: 'POST', body: JSON.stringify(payload) })
      toast.success('Repuesto creado')
    }
    cerrarFormulario()
    await cargarCatalogo()
  } catch (err) {
    toast.error(errMsg(err))
  } finally {
    guardando.value = false
  }
}

const desactivar = async (id) => {
  if(!confirm('¿Estás seguro de ocultar este repuesto del catálogo? (Su historial se mantendrá intacto)')) return
  try {
    await fetchJSON(`/repuestos/${id}`, { method: 'DELETE' })
    toast.success('Repuesto desactivado')
    await cargarCatalogo()
  } catch (err) {
    toast.error(errMsg(err))
  }
}

onMounted(cargarCatalogo)
</script>

<style scoped>
.header-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; flex-wrap: wrap; gap: 10px; }
.header-row h2 { margin: 0; }
.text-danger { color: var(--danger); font-weight: bold; }
.text-success { color: var(--success); }
.modal-large { max-width: 800px; }
</style>