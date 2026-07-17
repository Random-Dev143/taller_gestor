<template>
  <div class="view-jefe">
    <NavBar brand="🔧 Jefe de Taller" :tabs="tabs" v-model:activeTab="activeTab">
      <template #extra><span class="jefe-pill" @click="cambiarJefe">👤 {{ jefeLegajo }}</span></template>
    </NavBar>

    <!-- PESTAÑAS DE GESTIÓN DE OTs -->
    <div v-if="activeTab === 'jefe-ots' || activeTab === 'jefe-ots-finalizadas'" class="card">
      <div class="header-row">
        <h2>{{ activeTab === 'jefe-ots' ? 'Gestión de OTs en Taller' : 'OTs Finalizadas' }}</h2>
        <label v-if="activeTab === 'jefe-ots-finalizadas'" class="check-facturacion">
          <input type="checkbox" v-model="soloFaltaFacturar" @change="onFiltroFacturacionChange" />
          Solo falta facturar
        </label>
        <input type="text" v-model="busqueda" placeholder="🔍 Buscar por patente, OT o cliente..." class="form-control search-input" @input="onBuscar" />
        <button class="btn btn-outline btn-sm" v-can="'tarea_gestionar_todas'" @click="abrirAsignacion('0000')" title="Asignar limpieza, capacitaciones, etc.">
        🧹 Tarea Interna
      </button>
      <button class="btn btn-secondary btn-sm" v-can="'tiempo_editar_manual'" @click="abrirDetalle('0000')" title="Corregir tiempos de tareas internas">
            ⏱️ Gestionar Tiempos
      </button>
        <button class="btn btn-secondary btn-sm" @click="cargarDatos">↻ Actualizar</button>
      </div>

      <div v-if="loading" class="loading-state"><div class="spinner"></div>Cargando...</div>
      <template v-else>
        <OTTable
          :data="ots"
          :esJefe="true"
          :mecanicos="mecanicos"
          :sort-by="sortBy"
          :sort-dir="sortDir"
          @sort-change="onSortChange"
          @open-assign-modal="abrirAsignacion"
          @update-status="actualizarEstado"
          @control-ot="controlarOT"
          @view-detail="abrirDetalle"
          @edit-ot="abrirEdicion"
          @export-pdf="generarExplicacionPDF"
        />
        <PaginationBar :page="page" :total-pages="totalPages" :total="total" @cambiar-pagina="irAPagina" />
      </template>
    </div>

    <!-- NUEVA PESTAÑA: RENDIMIENTO OPERATIVO -->
    <TableroRendimiento v-else-if="activeTab === 'jefe-rendimiento'" />

    <!-- MODALES -->
    <ModalDetalleOT
      v-if="showModalDetalle"
      :otId="otSeleccionada"
      :esJefe="true"
      @close="showModalDetalle = false"
      @editar-actividad="abrirEdicionActividad"
      @eliminar-actividad="borrarActividad"
    />
    <ModalEditarOT v-if="showModalEditar" :otId="otSeleccionada" @close="showModalEditar = false" @updated="cerrarModalesYRecargar" />
    <ModalAsignar
      v-if="showModalAsignar"
      :ot="otSeleccionada"
      :mecanicos="mecanicos"
      :actividadEdit="actividadAEditar"
      @close="cerrarModalAsignar"
      @confirm="confirmarAsignacion"
    />
  </div>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue'
import { useApi } from '../composables/useApi'
import { useToast, errMsg } from '../composables/useToast'
import { usePdfGenerator } from '../composables/usePdfGenerator'

import NavBar from '../components/common/NavBar.vue'
import OTTable from '../components/common/OTTable.vue'
import PaginationBar from '../components/common/PaginationBar.vue'
import ModalDetalleOT from '../components/asesor/ModalDetalleOT.vue'
import ModalEditarOT from '../components/asesor/ModalEditarOT.vue'
import ModalAsignar from '../components/jefe/ModalAsignar.vue'
import TableroRendimiento from '../components/jefe/TableroRendimiento.vue' // <-- Importamos el nuevo componente

const { fetchJSON } = useApi()
const toast = useToast()
const { generarExplicacionPDF } = usePdfGenerator()

const activeTab = ref('jefe-ots')
const ots = ref([])
const mecanicos = ref([])
const busqueda = ref('')
const loading = ref(true)

const page = ref(1)
const totalPages = ref(1)
const total = ref(0)
const LIMIT = 25
let debounceTimer = null

// Orden de columnas (a-z / z-a) y filtro "solo falta facturar", resueltos
// en el backend para que se apliquen a todas las páginas, no solo a la
// página cargada en el navegador.
const sortBy = ref('')
const sortDir = ref('desc')
const soloFaltaFacturar = ref(false)

const showModalDetalle = ref(false)
const showModalEditar = ref(false)
const showModalAsignar = ref(false)
const otSeleccionada = ref(null)
const actividadAEditar = ref(null)

const jefeLegajo = ref(localStorage.getItem('legajoJefe') || '')

const tabs = [
  { id: 'jefe-ots', label: 'En Taller' },
  { id: 'jefe-ots-finalizadas', label: 'Finalizadas' },
  { id: 'jefe-rendimiento', label: 'Rendimiento' }
]

const estadoParaBackend = () => activeTab.value === 'jefe-ots' ? 'activas' : 'finalizadas'

const pedirLegajoJefe = () => {
  let v = prompt('Ingrese su legajo de Jefe:')
  if (v) { jefeLegajo.value = v; localStorage.setItem('legajoJefe', v); }
}

const cambiarJefe = () => { localStorage.removeItem('legajoJefe'); jefeLegajo.value = ''; pedirLegajoJefe(); }

const cargarDatos = async () => {
  loading.value = true
  try {
    const params = new URLSearchParams({ estado: estadoParaBackend(), page: page.value, limit: LIMIT })
    if (busqueda.value.trim()) params.set('busqueda', busqueda.value.trim())
    if (sortBy.value) { params.set('sortBy', sortBy.value); params.set('sortDir', sortDir.value) }
    if (activeTab.value === 'jefe-ots-finalizadas' && soloFaltaFacturar.value) params.set('facturacion', 'pendientes')
    const [resOts, legajos] = await Promise.all([
      fetchJSON(`/ordenes?${params.toString()}`),
      fetchJSON('/legajos')
    ])
    ots.value = resOts.data
    total.value = resOts.total
    totalPages.value = resOts.totalPages
    mecanicos.value = legajos.filter(l => l.rol === 'mecanico' || l.rol === 'jefe')
  } catch (err) { toast.error(errMsg(err)) }
  finally { loading.value = false }
}

const irAPagina = (p) => {
  if (p < 1 || p > totalPages.value) return
  page.value = p
  cargarDatos()
}

const onBuscar = () => {
  clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    page.value = 1
    cargarDatos()
  }, 350)
}

watch(activeTab, (newTab) => {
  if (newTab === 'jefe-ots' || newTab === 'jefe-ots-finalizadas') {
    page.value = 1
    busqueda.value = ''
    soloFaltaFacturar.value = false
    cargarDatos()
  }
})

// Click en un header ordenable: mismo campo -> invierte dirección (a-z / z-a),
// campo distinto -> arranca en ascendente.
const onSortChange = (campo) => {
  if (sortBy.value === campo) {
    sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc'
  } else {
    sortBy.value = campo
    sortDir.value = 'asc'
  }
  page.value = 1
  cargarDatos()
}

const onFiltroFacturacionChange = () => {
  page.value = 1
  cargarDatos()
}

const abrirAsignacion = (ot) => { otSeleccionada.value = ot; actividadAEditar.value = null; showModalAsignar.value = true; }
const abrirDetalle = (ot) => { otSeleccionada.value = ot; showModalDetalle.value = true; }
const abrirEdicion = (ot) => { otSeleccionada.value = ot; showModalEditar.value = true; }
const cerrarModalAsignar = () => { showModalAsignar.value = false; actividadAEditar.value = null; }
const cerrarModalesYRecargar = () => { showModalEditar.value = false; cerrarModalAsignar(); cargarDatos(); }

const actualizarEstado = async ({ ot, estado }) => {
  try {
    await fetchJSON(`/ordenes/${ot}/estado`, { method: 'PUT', body: JSON.stringify({ estado }) })
    toast.success(`OT ${ot} movida a "${estado}"`)
    cargarDatos()
  } catch (err) { toast.error(errMsg(err)) }
}

const controlarOT = async (ot) => {
  if (!confirm(`¿Confirmar finalización de la OT ${ot}?`)) return
  try {
    await fetchJSON(`/ordenes/${ot}/controlar`, { method: 'POST', body: JSON.stringify({ jefe_legajo: jefeLegajo.value }) })
    toast.success(`OT controlada`)
    cargarDatos()
  } catch (err) { toast.error(errMsg(err)) }
}

const confirmarAsignacion = async (datos) => {
  try {
    if (datos.id) {
      await fetchJSON(`/actividades/${datos.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          legajo_mecanico: datos.legajo,
          descripcion: datos.descripcion,
          tiempo_estimado: datos.tiempo_estimado,
          tiempo_real: datos.tiempo_real
        })
      })
      toast.success('Tarea actualizada')
    } else {
      await fetchJSON(`/actividades/orden/${otSeleccionada.value}`, {
        method: 'POST',
        body: JSON.stringify({ legajo_mecanico: datos.legajo, descripcion: datos.descripcion, tiempo_estimado: datos.tiempo_estimado, jefe_legajo: jefeLegajo.value })
      })
      toast.success('Nueva tarea asignada')
    }
    cerrarModalesYRecargar()
  } catch (err) { toast.error(errMsg(err)) }
}

const abrirEdicionActividad = (actividad) => {
  showModalDetalle.value = false
  otSeleccionada.value = actividad.ot
  actividadAEditar.value = actividad
  showModalAsignar.value = true
}

const borrarActividad = async (idActividad) => {
  if (!confirm('¿Eliminar esta tarea y todos sus tiempos registrados?')) return
  try {
    await fetchJSON(`/actividades/${idActividad}`, { method: 'DELETE' })
    toast.success('Tarea eliminada correctamente')
    showModalDetalle.value = false
    cargarDatos()
  } catch (err) { toast.error(errMsg(err)) }
}

onMounted(() => {
  if (!jefeLegajo.value) pedirLegajoJefe()
  cargarDatos()
})
</script>

<style scoped>
.header-row { display: flex; align-items: center; flex-wrap: wrap; gap: 15px; margin-bottom: 15px; }
.header-row h2 { margin: 0; margin-right: auto; }
.search-input { max-width: 300px; }
.jefe-pill { cursor: pointer; }
.check-facturacion { display: flex; align-items: center; gap: 6px; font-size: 0.9rem; white-space: nowrap; }
</style>