<template>
  <div class="view-asesor">
    <NavBar brand="👔 Asesor" :tabs="tabs" v-model:activeTab="activeTab" />

    <div v-if="activeTab === 'asesor-ots-activas' || activeTab === 'asesor-ots-finalizadas'" class="card">
      <div class="header-row">
        <h2>{{ activeTab === 'asesor-ots-activas' ? 'Órdenes en Taller' : 'Histórico Finalizadas' }}</h2>
        <input type="text" v-model="busqueda" placeholder="🔍 Buscar por patente, OT o cliente..." class="form-control search-input" @input="onBuscar" />
        <button class="btn btn-secondary btn-sm" @click="cargarOTs">↻ Actualizar</button>
      </div>

      <div v-if="loading" class="loading-state"><div class="spinner"></div>Cargando órdenes...</div>
      <template v-else>
        <OTTable
          :data="ots"
          @update-status="handleStatusUpdate"
          @view-detail="abrirDetalle"
          @edit-ot="abrirEdicion"
          @export-pdf="generarExplicacionPDF"
        />
        <PaginationBar :page="page" :total-pages="totalPages" :total="total" @cambiar-pagina="irAPagina" />
      </template>
    </div>

    <div v-else-if="activeTab === 'asesor-nueva'" class="tab-content">
      <NuevaOT @ot-creada="handleOTCreada" />
    </div>
    <div v-else-if="activeTab === 'asesor-legajos'" class="tab-content">
      <AdminLegajos />
    </div>
    <div v-else-if="activeTab === 'asesor-clientes'" class="tab-content">
      <AgendaClientes />
    </div>
    <div v-else-if="activeTab === 'asesor-informes'" class="tab-content">
      <InformesMensuales />
    </div>

    <ModalDetalleOT v-if="showModalDetalle" :otId="otSeleccionada" @close="showModalDetalle = false" />
    <ModalEditarOT v-if="showModalEditar" :otId="otSeleccionada" @close="showModalEditar = false" @updated="cerrarModalesYRecargar" />
  </div>
</template>

<script setup>
import { ref, watch, onMounted } from 'vue'
import { useApi } from '../composables/useApi'
import { useToast, errMsg } from '../composables/useToast'
import NavBar from '../components/common/NavBar.vue'
import OTTable from '../components/common/OTTable.vue'
import PaginationBar from '../components/common/PaginationBar.vue'
import NuevaOT from '../components/asesor/NuevaOT.vue'
import AdminLegajos from '../components/asesor/AdminLegajos.vue'
import AgendaClientes from '../components/asesor/AgendaClientes.vue'
import InformesMensuales from '../components/common/InformesMensuales.vue'
import ModalDetalleOT from '../components/asesor/ModalDetalleOT.vue'
import ModalEditarOT from '../components/asesor/ModalEditarOT.vue'
import { usePdfGenerator } from '../composables/usePdfGenerator'

const { generarExplicacionPDF } = usePdfGenerator()
const { fetchJSON } = useApi()
const toast = useToast()

const activeTab = ref('asesor-ots-activas')
const ots = ref([])
const loading = ref(true)
const busqueda = ref('')

// Paginación: antes se traían TODAS las OTs de la base en cada carga y se
// filtraban en el navegador. Ahora el backend pagina y filtra directamente.
const page = ref(1)
const totalPages = ref(1)
const total = ref(0)
const LIMIT = 25
let debounceTimer = null

const showModalDetalle = ref(false)
const showModalEditar = ref(false)
const otSeleccionada = ref(null)

const tabs = [
  { id: 'asesor-ots-activas', label: 'OTs en Taller' },
  { id: 'asesor-ots-finalizadas', label: 'Finalizadas' },
  { id: 'asesor-nueva', label: 'Nueva OT' },
  { id: 'asesor-informes', label: 'Informes' },
  { id: 'asesor-legajos', label: 'Legajos' },
  { id: 'asesor-clientes', label: 'Clientes' }
]

const estadoParaBackend = () => activeTab.value === 'asesor-ots-activas' ? 'activas' : 'finalizadas'

const cargarOTs = async () => {
  if (activeTab.value !== 'asesor-ots-activas' && activeTab.value !== 'asesor-ots-finalizadas') return
  loading.value = true
  try {
    const params = new URLSearchParams({ estado: estadoParaBackend(), page: page.value, limit: LIMIT })
    if (busqueda.value.trim()) params.set('busqueda', busqueda.value.trim())
    const res = await fetchJSON(`/ordenes?${params.toString()}`)
    ots.value = res.data
    total.value = res.total
    totalPages.value = res.totalPages
  } catch (err) {
    toast.error('Error cargando OTs: ' + errMsg(err))
  } finally {
    loading.value = false
  }
}

const irAPagina = (p) => {
  if (p < 1 || p > totalPages.value) return
  page.value = p
  cargarOTs()
}

// Buscar con un pequeño debounce para no disparar una consulta por cada letra
const onBuscar = () => {
  clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    page.value = 1
    cargarOTs()
  }, 350)
}

// Cambiar de pestaña (activas/finalizadas) reinicia a la página 1
watch(activeTab, () => {
  page.value = 1
  busqueda.value = ''
  cargarOTs()
})

const handleStatusUpdate = async ({ ot, estado }) => {
  try {
    await fetchJSON(`/ordenes/${ot}/estado`, { method: 'PUT', body: JSON.stringify({ estado }) })
    toast.success(`OT ${ot} actualizada a "${estado}"`)
    cargarOTs()
  } catch (err) { toast.error('Error al actualizar estado: ' + errMsg(err)) }
}

const handleOTCreada = () => {
  activeTab.value = 'asesor-ots-activas'
  page.value = 1
  cargarOTs()
}

const abrirDetalle = (ot) => { otSeleccionada.value = ot; showModalDetalle.value = true; }
const abrirEdicion = (ot) => { otSeleccionada.value = ot; showModalEditar.value = true; }
const cerrarModalesYRecargar = () => { showModalEditar.value = false; cargarOTs(); }

onMounted(cargarOTs)
</script>

<style scoped>
.header-row { display: flex; align-items: center; flex-wrap: wrap; gap: 15px; margin-bottom: 15px; }
.header-row h2 { margin: 0; margin-right: auto; }
.search-input { max-width: 300px; }
</style>
