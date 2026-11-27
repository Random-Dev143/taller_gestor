<template>
  <div class="ordenes">
    <div v-if="modo === 'finalizadas'" class="segmented" role="tablist">
      <button :class="{ 'is-active': subTab === 'ordenes' }" @click="subTab = 'ordenes'">Órdenes</button>
      <button :class="{ 'is-active': subTab === 'garantias' }" @click="subTab = 'garantias'">Garantías</button>
    </div>

    <PanelGarantias v-if="modo === 'finalizadas' && subTab === 'garantias'" />

    <template v-else>
      <!-- Cómo está el taller, de un vistazo (solo en la lista de OT abiertas) -->
      <div v-if="modo === 'activas' && resumen" class="estados" aria-label="Resumen de órdenes abiertas">
        <span v-for="e in chipsEstado" :key="e.texto" class="estados__chip" :class="`estados__chip--${e.tono}`">
          <strong class="num">{{ e.n }}</strong> {{ e.texto }}
        </span>
      </div>

      <div class="header-row">
        <div class="search">
          <AppIcon name="search" />
          <input type="text" v-model="busqueda" placeholder="Buscar por patente, OT o cliente" class="form-control" @input="onBuscar" aria-label="Buscar órdenes" />
        </div>
        <span class="conteo num">{{ total }} {{ total === 1 ? 'orden' : 'órdenes' }}</span>
        <span class="toolbar-spacer"></span>
        <button v-if="esJefe" class="btn btn-secondary btn-sm" @click="abrirAsignacion('0000')" title="Asignar limpieza, capacitaciones, etc."><AppIcon name="plus" /> Tarea interna</button>
        <button v-if="can('tiempo_editar_manual')" class="btn btn-secondary btn-sm" @click="abrirDetalle('0000')" title="Corregir tiempos de tareas internas"><AppIcon name="clock" /> Gestionar tiempos</button>
        <button class="btn btn-secondary btn-sm" @click="cargarDatos"><AppIcon name="refresh" /> Actualizar</button>
      </div>

      <div v-if="modo === 'finalizadas'" class="filters">
        <FiltroFechasFinalizadas
          v-model:desde="fechaDesde" v-model:hasta="fechaHasta"
          :buscando="busqueda.trim() !== ''"
          @cambio="onFiltroFacturacionChange" @reset="resetearFechas" />
        <select v-model="filtroGarantia" @change="onFiltroFacturacionChange" class="form-control" title="Filtrar por garantía">
          <option value="">Garantía: todas</option>
          <option value="1">Es garantía: Sí</option>
          <option value="0">Es garantía: No</option>
        </select>
        <label><input type="checkbox" v-model="soloFaltaFacturar" @change="onFiltroFacturacionChange" /> Solo falta facturar</label>
      </div>

      <div v-if="loading" class="loading-state"><div class="spinner"></div>Cargando órdenes...</div>
      <template v-else>
        <OTTable
          :data="ots"
          :esJefe="esJefe"
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
          @ver-legajo="abrirLegajo"
          @refrescar="cargarDatos"
        />
        <p v-if="ots.length === 0 && busqueda.trim() && modo === 'activas'" class="sin-resultados">
          No hay órdenes abiertas que coincidan con "{{ busqueda.trim() }}".
          <router-link :to="{ path: '/finalizadas', query: { q: busqueda.trim() } }">Buscar también en finalizadas</router-link>
        </p>
        <PaginationBar :page="page" :total-pages="totalPages" :total="total" @cambiar-pagina="irAPagina" />
      </template>
    </template>

    <ModalLegajoOT v-if="legajoOt" :ot="legajoOt" @close="legajoOt = null" />
    <ModalDetalleOT
      v-if="showModalDetalle"
      :otId="otSeleccionada"
      :esJefe="esJefe"
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
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useApi } from '../composables/useApi'
import { useToast, errMsg } from '../composables/useToast'
import { usePdfGenerator } from '../composables/usePdfGenerator'
import { useAuthStore } from '../stores/useAuthStore'
import { fechaLocalISO, DIAS_POR_DEFECTO } from '../composables/useRangoFechas'
import FiltroFechasFinalizadas from '../components/common/FiltroFechasFinalizadas.vue'
import OTTable from '../components/common/OTTable.vue'
import PaginationBar from '../components/common/PaginationBar.vue'
import PanelGarantias from '../components/asesor/PanelGarantias.vue'
import ModalDetalleOT from '../components/asesor/ModalDetalleOT.vue'
import ModalEditarOT from '../components/asesor/ModalEditarOT.vue'
import ModalLegajoOT from '../components/asesor/ModalLegajoOT.vue'
import ModalAsignar from '../components/jefe/ModalAsignar.vue'

// Una sola pantalla de órdenes para todo el personal. Lo que antes era "la vista del jefe"
// (asignar, cambiar estado, controlar) aparece según los permisos del usuario.
const props = defineProps({ modo: { type: String, default: 'activas' } }) // 'activas' | 'finalizadas'

const route = useRoute()
const { fetchJSON } = useApi()
const toast = useToast()
const authStore = useAuthStore()
const { generarExplicacionPDF } = usePdfGenerator()

const can = (p) => (authStore.usuario?.permisos || []).includes(p)
const esJefe = computed(() => can('tarea_gestionar_todas'))

const ots = ref([])
const mecanicos = ref([])
const resumen = ref(null)
const busqueda = ref(String(route.query.q || ''))
const loading = ref(true)
const page = ref(1)
const totalPages = ref(1)
const total = ref(0)
const LIMIT = 25
let debounceTimer = null

// Orden, "solo falta facturar" y garantía se resuelven en el servidor para que valgan en todas las páginas.
const sortBy = ref('')
const sortDir = ref('desc')
const soloFaltaFacturar = ref(false)
const filtroGarantia = ref('')
// Finalizadas: por defecto los últimos 30 días; con texto en el buscador se busca en todas las fechas.
const fechaDesde = ref(fechaLocalISO(DIAS_POR_DEFECTO))
const fechaHasta = ref('')
const subTab = ref('ordenes')

const showModalDetalle = ref(false)
const showModalEditar = ref(false)
const showModalAsignar = ref(false)
const otSeleccionada = ref(null)
const actividadAEditar = ref(null)
const legajoOt = ref(null)
const abrirLegajo = (ot) => { legajoOt.value = String(ot) }

// Legajo de quien controla: el del usuario conectado (ya no se pide con un cuadro de texto).
const legajoJefe = () => authStore.usuario?.legajo || localStorage.getItem('legajoJefe') || (() => {
  const v = prompt('Ingresá tu legajo para firmar el control:')
  if (v) localStorage.setItem('legajoJefe', v)
  return v || ''
})()

const chipsEstado = computed(() => {
  const t = resumen.value?.taller; if (!t) return []
  const e = t.por_estado || {}
  return [
    { n: e['En Proceso'] || 0, texto: 'en proceso', tono: 'ok' },
    { n: e['En Espera'] || 0, texto: 'en espera', tono: 'wait' },
    { n: e['Espera de Repuestos'] || 0, texto: 'esperando repuestos', tono: 'warn' },
    { n: e['Trabajos de Terceros'] || 0, texto: 'en terceros', tono: 'violet' },
    { n: t.estancadas, texto: `estancadas (+${t.umbral_dias_estancada} d)`, tono: t.estancadas ? 'danger' : 'wait' },
    { n: t.listas_para_controlar, texto: 'listas para controlar', tono: t.listas_para_controlar ? 'primary' : 'wait' }
  ]
})

const cargarDatos = async () => {
  loading.value = true
  try {
    const params = new URLSearchParams({ estado: props.modo, page: page.value, limit: LIMIT })
    if (busqueda.value.trim()) params.set('busqueda', busqueda.value.trim())
    if (sortBy.value) { params.set('sortBy', sortBy.value); params.set('sortDir', sortDir.value) }
    if (props.modo === 'finalizadas') {
      if (soloFaltaFacturar.value) params.set('facturacion', 'pendientes')
      if (filtroGarantia.value !== '') params.set('garantia', filtroGarantia.value)
      if (!busqueda.value.trim()) {
        if (fechaDesde.value) params.set('desde', fechaDesde.value)
        if (fechaHasta.value) params.set('hasta', fechaHasta.value)
      }
    }
    const pedidos = [fetchJSON(`/ordenes?${params.toString()}`)]
    if (esJefe.value) pedidos.push(fetchJSON('/legajos'))
    const [resOts, legajos] = await Promise.all(pedidos)
    ots.value = resOts.data
    total.value = resOts.total
    totalPages.value = resOts.totalPages
    if (legajos) mecanicos.value = legajos.filter(l => l.rol === 'mecanico' || l.rol === 'jefe')
    if (props.modo === 'activas') cargarResumen()
  } catch (err) { toast.error(errMsg(err)) }
  finally { loading.value = false }
}

const cargarResumen = async () => {
  try { resumen.value = await fetchJSON('/analitica/panel') } catch (e) { resumen.value = null }
}

const irAPagina = (p) => { if (p < 1 || p > totalPages.value) return; page.value = p; cargarDatos() }
const onBuscar = () => {
  clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => { page.value = 1; cargarDatos() }, 350)
}
const onSortChange = (campo) => {
  if (sortBy.value === campo) sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc'
  else { sortBy.value = campo; sortDir.value = 'asc' }
  page.value = 1
  cargarDatos()
}
const onFiltroFacturacionChange = () => {
  if (fechaDesde.value && fechaHasta.value && fechaDesde.value > fechaHasta.value) {
    toast.error('La fecha "Desde" no puede ser posterior a "Hasta"')
    return
  }
  page.value = 1
  cargarDatos()
}
const resetearFechas = () => { fechaDesde.value = fechaLocalISO(DIAS_POR_DEFECTO); fechaHasta.value = ''; onFiltroFacturacionChange() }

// La búsqueda global de la barra superior llega como ?q=
watch(() => route.query.q, (q) => { busqueda.value = String(q || ''); page.value = 1; cargarDatos() })
watch(subTab, (t) => { if (t === 'ordenes') cargarDatos() })

const abrirAsignacion = (ot) => { otSeleccionada.value = ot; actividadAEditar.value = null; showModalAsignar.value = true }
const abrirDetalle = (ot) => { otSeleccionada.value = ot; showModalDetalle.value = true }
const abrirEdicion = (ot) => { otSeleccionada.value = ot; showModalEditar.value = true }
const cerrarModalAsignar = () => { showModalAsignar.value = false; actividadAEditar.value = null }
const cerrarModalesYRecargar = () => { showModalEditar.value = false; cerrarModalAsignar(); cargarDatos() }

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
    await fetchJSON(`/ordenes/${ot}/controlar`, { method: 'POST', body: JSON.stringify({ jefe_legajo: legajoJefe() }) })
    toast.success('OT controlada')
    cargarDatos()
  } catch (err) { toast.error(errMsg(err)) }
}

const confirmarAsignacion = async (datos) => {
  try {
    if (datos.id) {
      await fetchJSON(`/actividades/${datos.id}`, {
        method: 'PUT',
        body: JSON.stringify({ legajos_mecanicos: datos.legajos_mecanicos, descripcion: datos.descripcion, tiempo_estimado: datos.tiempo_estimado, tiempo_real: datos.tiempo_real })
      })
      toast.success('Tarea actualizada')
    } else {
      await fetchJSON(`/actividades/orden/${otSeleccionada.value}`, {
        method: 'POST',
        body: JSON.stringify({ legajos_mecanicos: datos.legajos_mecanicos, descripcion: datos.descripcion, tiempo_estimado: datos.tiempo_estimado, jefe_legajo: legajoJefe(), es_rutina: datos.es_rutina || false })
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

onMounted(cargarDatos)
</script>

<style scoped>
.estados { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 14px; }
.estados__chip {
  display: inline-flex; align-items: baseline; gap: 6px; padding: 5px 12px; border-radius: 999px;
  background: var(--chip-bg); color: var(--text-soft); font-size: 0.82rem;
}
.estados__chip strong { font-size: 0.95rem; color: var(--text); }
.estados__chip--ok { background: var(--status-progress-bg); color: var(--status-progress-text); }
.estados__chip--warn { background: var(--status-warn-bg); color: var(--status-warn-text); }
.estados__chip--danger { background: var(--status-danger-bg); color: var(--status-danger-text); }
.estados__chip--primary { background: var(--status-done-bg); color: var(--status-done-text); }
.estados__chip--violet { background: var(--chip-bg); color: var(--violet); }
.estados__chip--ok strong, .estados__chip--warn strong, .estados__chip--danger strong, .estados__chip--primary strong { color: inherit; }
.conteo { color: var(--muted); font-size: 0.86rem; }
.sin-resultados { margin: 14px 2px; color: var(--text-soft); }
</style>
