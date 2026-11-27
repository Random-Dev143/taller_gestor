<template>
  <div class="table-wrapper">
    <table class="ot-table">
      <thead>
        <tr>
          <th v-for="col in columnas" :key="col.key" :class="{ sortable: col.sortable, 'is-sorted': sortBy === col.key }"
              :aria-sort="sortBy === col.key ? (sortDir === 'asc' ? 'ascending' : 'descending') : null"
              @click="col.sortable && $emit('sort-change', col.key)">
            {{ col.label }}
            <AppIcon v-if="col.sortable" :name="iconoOrden(col.key)" class="sort-icon" />
          </th>
          <th v-if="mostrarFacturacion">Facturación</th>
          <th class="col-acciones"><span class="sr-only">Acciones</span></th>
        </tr>
      </thead>
      <tbody>
        <tr v-if="data.length === 0">
          <td :colspan="cantidadColumnas" class="empty-state">No hay órdenes de trabajo para mostrar</td>
        </tr>
        <tr v-for="ot in data" :key="ot.ot"
            :class="{ 'row-anulada': !!ot.anulada, 'row-ready': !ot.anulada && esLista(ot), 'row-stale': !ot.anulada && esEstancada(ot), 'row-click': can('ot_ver_detalle') }"
            @click="abrirFila(ot)">
          <td data-label="OT" class="cell-ot">
            <strong :class="{ 'ot-anulada': !!ot.anulada }">{{ ot.ot }}</strong>
            <span v-if="ot.anulada" class="tag tag--danger" :title="ot.anulada_motivo ? `Motivo: ${ot.anulada_motivo}` : 'OT anulada'">Anulada</span>
            <span v-else-if="esEstancada(ot)" class="tag tag--danger" :title="`Abierta hace ${diasAbierta(ot)} días`">
              <AppIcon name="clock" /> {{ diasAbierta(ot) }} d
            </span>
          </td>

          <td data-label="Vehículo" class="cell-vehiculo">
            <span class="patente">{{ ot.patente }}</span>
            <span class="modelo" :title="$unidadCompleta(ot.unidad)">{{ $modelo(ot.unidad) }}</span>
          </td>

          <td data-label="Cliente" class="cell-cliente">{{ ot.cliente }}</td>

          <td data-label="Mecánico" @click.stop>
            <button v-if="esJefe && can('tarea_gestionar_todas')"
                    :class="['btn btn-sm', ot.mecanico ? 'btn-ghost btn-assign' : 'btn-assign btn-urgente']"
                    @click="$emit('open-assign-modal', ot.ot)">
              <AppIcon v-if="!ot.mecanico" name="alert" />{{ ot.mecanico || 'Asignar' }}
            </button>
            <template v-else>
              <span v-if="!ot.mecanico" class="text-muted">Sin asignar</span>
              <span v-else>{{ ot.mecanico }}</span>
            </template>
          </td>

          <td data-label="Estado" class="cell-estado" @click.stop>
            <select v-if="esJefe && can('ot_cambiar_estado')" class="estado-select" @change="$emit('update-status', {ot: ot.ot, estado: $event.target.value})">
              <option v-for="est in ['En Proceso', 'En Espera', 'Espera de Repuestos', 'Trabajos de Terceros', 'Finalizada']"
                      :key="est" :value="est" :selected="ot.estado_actual === est">{{ est }}</option>
            </select>
            <span v-else :class="['status-tag', statusClass(ot.estado_actual)]">{{ ot.estado_actual }}</span>
            <span v-if="ot.es_garantia" class="tag">Garantía</span>
            <span v-if="ot.controlada" class="tag tag--ok"><AppIcon name="check" /> Controlada</span>
          </td>

          <td v-if="mostrarFacturacion" data-label="Facturación">
            <template v-if="ot.estado_actual === 'Finalizada'">
              <span v-if="tieneMontos(ot)" class="status-tag status-progress" title="Valores cargados"><AppIcon name="check" /> Cargada</span>
              <span v-else class="status-tag status-danger" title="Falta cargar importes"><AppIcon name="alert" /> Falta cargar</span>
            </template>
            <span v-else class="text-muted">—</span>
          </td>

          <td class="actions-cell" data-label="" @click.stop>
            <button v-if="esJefe && !ot.controlada && can('ot_controlar')" class="btn btn-sm btn-ok" @click="$emit('control-ot', ot.ot)"><AppIcon name="check" /> Controlar</button>
            <button v-if="hayAccionesMenu(ot)" type="button" class="btn btn-ghost btn-icon btn-sm btn-menu"
                    :aria-label="`Más acciones de la OT ${ot.ot}`" aria-haspopup="menu" :aria-expanded="menu && menu.ot.ot === ot.ot ? 'true' : 'false'"
                    @click.stop="abrirMenu(ot, $event)">
              <AppIcon name="more" />
            </button>
          </td>
        </tr>
      </tbody>
    </table>

    <Teleport to="body">
      <div v-if="menu" class="ot-menu" role="menu" :style="{ top: menu.top + 'px', right: menu.right + 'px' }" @click.stop>
        <button v-if="can('ot_ver_detalle')" role="menuitem" @click="accion('view-detail', menu.ot)"><AppIcon name="eye" /> Ver detalle</button>
        <button v-if="can('ot_editar')" role="menuitem" @click="accion('edit-ot', menu.ot)"><AppIcon name="edit" /> Editar</button>
        <button v-if="can('ot_ver_detalle')" role="menuitem" @click="accion('ver-legajo', menu.ot)"><AppIcon name="folder" /> Legajo digital</button>
        <button v-if="can('ot_ver_detalle')" role="menuitem" @click="accion('export-pdf', menu.ot)"><AppIcon name="file" /> Descargar PDF</button>
        <template v-if="can('ot_anular')">
          <hr />
          <button v-if="!menu.ot.anulada" role="menuitem" class="danger" @click="cerrarMenu(); pedirAnulacion(menu.ot)"><AppIcon name="x" /> Anular OT</button>
          <button v-else role="menuitem" @click="cerrarMenu(); reactivar(menu.ot)"><AppIcon name="refresh" /> Reactivar OT</button>
        </template>
      </div>
    </Teleport>

    <div v-if="anulando" class="modal-overlay" @click.self="anulando = null">
      <div class="modal-content" style="max-width: 440px;">
        <h3>Anular OT {{ anulando.ot }}</h3>
        <p class="text-muted">La OT queda marcada en rojo y figura como "Anulada" en la planilla de NPS. Se puede reactivar después.</p>
        <div class="form-group">
          <label>Motivo (opcional)</label>
          <textarea v-model="motivoAnulacion" class="form-control" rows="3" maxlength="200"></textarea>
        </div>
        <div style="display: flex; gap: 10px; margin-top: 16px;">
          <button class="btn btn-danger" :disabled="procesando" @click="confirmarAnulacion">{{ procesando ? 'Anulando...' : 'Anular OT' }}</button>
          <button class="btn btn-secondary" @click="anulando = null">Cancelar</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { diasDesde } from '../../utils/fechas'
import { useApi } from '../../composables/useApi'
import { useToast, errMsg } from '../../composables/useToast'
import { useAuthStore } from '../../stores/useAuthStore'
const props = defineProps({
  data: { type: Array, required: true },
  esJefe: { type: Boolean, default: false },
  mecanicos: { type: Array, default: () => [] },
  sortBy: { type: String, default: '' },
  sortDir: { type: String, default: 'desc' }
})
const emit = defineEmits(['update-status', 'view-detail', 'edit-ot', 'control-ot', 'open-assign-modal', 'export-pdf', 'ver-legajo', 'sort-change', 'refrescar'])

// ─── Permisos: se evalúan en cada render (v-can solo corre al montar) ───
const authStore = useAuthStore()
const can = (permiso) => (authStore.usuario?.permisos || []).includes(permiso)

// ─── Anulación (solo con el permiso 'ot_anular', la opción se oculta si no lo tiene) ───
const { fetchJSON } = useApi()
const toast = useToast()
const anulando = ref(null)
const motivoAnulacion = ref('')
const procesando = ref(false)

const pedirAnulacion = (ot) => { anulando.value = ot; motivoAnulacion.value = '' }
const confirmarAnulacion = async () => {
  procesando.value = true
  try {
    await fetchJSON(`/ordenes/${anulando.value.ot}/anular`, { method: 'POST', body: JSON.stringify({ motivo: motivoAnulacion.value }) })
    toast.success(`OT ${anulando.value.ot} anulada`)
    anulando.value = null
    emit('refrescar')
  } catch (err) { toast.error(errMsg(err)) }
  finally { procesando.value = false }
}
const reactivar = async (ot) => {
  if (!confirm(`¿Reactivar la OT ${ot.ot}?`)) return
  try {
    await fetchJSON(`/ordenes/${ot.ot}/reactivar`, { method: 'POST', body: '{}' })
    toast.success(`OT ${ot.ot} reactivada`)
    emit('refrescar')
  } catch (err) { toast.error(errMsg(err)) }
}

// Columnas ordenables. "Vehículo" ordena por patente. Garantía y Controlada ya no son
// columnas: son etiquetas dentro de Estado (solo se muestran cuando aplican).
const columnas = [
  { key: 'ot', label: 'OT', sortable: true },
  { key: 'patente', label: 'Vehículo', sortable: true },
  { key: 'cliente', label: 'Cliente', sortable: true },
  { key: 'mecanico', label: 'Mecánico', sortable: true },
  { key: 'estado', label: 'Estado', sortable: true }
]

// Facturación solo tiene sentido en OTs finalizadas: si no hay ninguna en la página, no ocupa lugar.
const mostrarFacturacion = computed(() => props.data.some(o => o.estado_actual === 'Finalizada'))
const cantidadColumnas = computed(() => columnas.length + (mostrarFacturacion.value ? 1 : 0) + 1)

const iconoOrden = (key) => props.sortBy !== key ? 'sort' : (props.sortDir === 'asc' ? 'chevron-up' : 'chevron-down')

const statusClass = (estado) => ({
  'En Proceso': 'status-progress',
  'En Espera': 'status-wait',
  'Espera de Repuestos': 'status-warn',
  'Trabajos de Terceros': 'status-warn',
  'Finalizada': 'status-done'
}[estado] || '')

const esLista = (ot) => ot.total_tareas > 0 && ot.tareas_pendientes === 0 && !ot.controlada && ot.estado_actual !== 'Finalizada'

const tieneMontos = (ot) => {
  const total = (ot.monto_repuestos || 0) + (ot.monto_mano_obra || 0) + (ot.monto_repuestos_garantia || 0) + (ot.monto_mano_obra_garantia || 0)
  return total > 0
}

// Alerta de antigüedad: una OT que lleva más de una semana abierta sin
// finalizar merece llamar la atención del jefe/asesor sin que tengan que
// ir a mirar el informe mensual para notarlo.
const UMBRAL_DIAS_ESTANCADA = 7

const diasAbierta = (ot) => {
  if (!ot.fecha_apertura) return 0
  return diasDesde(ot.fecha_apertura)
}

const esEstancada = (ot) => ot.estado_actual !== 'Finalizada' && diasAbierta(ot) > UMBRAL_DIAS_ESTANCADA

// ─── Menú de acciones por fila ("⋯") ───
// Se dibuja con posición fija (Teleport) para que no lo recorte el scroll horizontal de la tabla.
const menu = ref(null) // { ot, top, right }
const abrirMenu = (ot, ev) => {
  if (menu.value && menu.value.ot.ot === ot.ot) { menu.value = null; return }
  const r = ev.currentTarget.getBoundingClientRect()
  menu.value = { ot, top: r.bottom + 4, right: Math.max(8, window.innerWidth - r.right) }
}
const cerrarMenu = () => { menu.value = null }
const accion = (evento, ot) => { cerrarMenu(); emit(evento, ot.ot) }
const onTecla = (e) => { if (e.key === 'Escape') cerrarMenu() }
onMounted(() => {
  document.addEventListener('click', cerrarMenu)
  document.addEventListener('keydown', onTecla)
  window.addEventListener('resize', cerrarMenu)
  window.addEventListener('scroll', cerrarMenu, true)
})
onBeforeUnmount(() => {
  document.removeEventListener('click', cerrarMenu)
  document.removeEventListener('keydown', onTecla)
  window.removeEventListener('resize', cerrarMenu)
  window.removeEventListener('scroll', cerrarMenu, true)
})

const hayAccionesMenu = (ot) => can('ot_editar') || can('ot_ver_detalle') || can('ot_anular')
const abrirFila = (ot) => { if (can('ot_ver_detalle')) emit('view-detail', ot.ot) }
</script>

<style scoped>
/* Los colores salen de las variables de style.css: cambian solos con el tema oscuro. */
.table-wrapper { width: 100%; }
.ot-table thead th.sortable { cursor: pointer; user-select: none; }
.ot-table thead th.sortable:hover, .ot-table thead th.is-sorted { color: var(--text); }
.sort-icon { margin-left: 3px; font-size: 0.95em; opacity: 0.45; vertical-align: -0.2em; }
.is-sorted .sort-icon { opacity: 1; color: var(--primary-text); }
.col-acciones { width: 1%; }
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }

.row-click { cursor: pointer; }
.cell-ot { white-space: nowrap; }
.cell-ot strong { font-size: 0.95rem; }
.cell-vehiculo { white-space: nowrap; }
.cell-vehiculo .modelo { margin-left: 8px; color: var(--text); }
.ot-table th, .ot-table td { padding-left: 10px; padding-right: 10px; }
.cell-cliente { color: var(--text-soft); max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cell-estado .tag { margin: 4px 0 0 0; }
.cell-estado .tag + .tag { margin-left: 6px; }
.cell-estado select + .tag, .cell-estado .status-tag + .tag { margin-left: 0; display: inline-flex; }
.estado-select { min-height: 30px; padding: 3px 8px; font-size: 0.82rem; width: auto; max-width: 172px; }

.tag {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 1px 8px; border-radius: 999px;
  background: var(--chip-bg); color: var(--text-soft);
  font-size: 0.72rem; font-weight: 600; white-space: nowrap;
}
.tag--ok { background: var(--status-progress-bg); color: var(--status-progress-text); }
.tag--danger { background: var(--status-danger-bg); color: var(--status-danger-text); margin-left: 8px; }

.btn-assign { max-width: 170px; justify-content: flex-start; overflow: hidden; text-overflow: ellipsis; }
.btn-assign.btn-ghost { font-weight: 500; color: var(--text); padding: 0 8px; margin-left: -8px; }
.btn-ok { padding: 0 10px; background: transparent; color: var(--success); border-color: var(--success); }
.btn-ok:hover { background: var(--status-progress-bg); }
.btn-urgente { background: var(--status-urgente-bg); color: var(--status-urgente-text); border-color: var(--status-urgente-border); }
.btn-urgente:hover { background: var(--status-urgente-bg); filter: brightness(0.97); }

.actions-cell { white-space: nowrap; text-align: right; }
.actions-cell .btn + .btn { margin-left: 4px; }
.btn-menu { color: var(--text-soft); }

/* Filas con estado: barra de color a la izquierda + tinte suave (sin !important) */
.ot-table tbody tr.row-ready td { background: var(--row-ready-bg); }
.ot-table tbody tr.row-stale td { background: var(--row-stale-bg); }
.ot-table tbody tr.row-anulada td { background: var(--row-anulada-bg); }
.ot-table tbody tr.row-ready td:first-child { box-shadow: inset 3px 0 0 var(--row-ready-border); }
.ot-table tbody tr.row-stale td:first-child { box-shadow: inset 3px 0 0 var(--row-stale-border); }
.ot-table tbody tr.row-anulada td:first-child { box-shadow: inset 3px 0 0 var(--row-anulada-border); }
.ot-anulada { text-decoration: line-through; color: var(--muted); }

/* Menú "⋯" (Teleport al body: lleva el data-v de este componente) */
.ot-menu {
  position: fixed; z-index: 1100; min-width: 190px; padding: 6px;
  background: var(--surface-raised); color: var(--text);
  border: 1px solid var(--border); border-radius: 10px; box-shadow: var(--shadow-md);
}
.ot-menu button {
  display: flex; align-items: center; gap: 10px; width: 100%;
  padding: 8px 10px; border: none; border-radius: 6px; background: transparent;
  font: inherit; font-size: 0.88rem; color: inherit; text-align: left; cursor: pointer;
}
.ot-menu button:hover, .ot-menu button:focus-visible { background: var(--hover-row); outline: none; }
.ot-menu button .icon { color: var(--text-soft); }
.ot-menu button.danger, .ot-menu button.danger .icon { color: var(--danger); }
.ot-menu hr { border: none; border-top: 1px solid var(--border-soft); margin: 6px 0; }

@media (max-width: 850px) {
  .ot-table thead { display: none; }
  .ot-table, .ot-table tbody, .ot-table tr, .ot-table td { display: block; width: 100%; }
  .table-wrapper { border: none; background: transparent; }
  .ot-table tr {
    border: 1px solid var(--border-soft); border-radius: var(--radius);
    margin-bottom: 12px; padding: 10px 14px; box-shadow: var(--shadow-sm);
    background: var(--surface); position: relative;
  }
  .ot-table td {
    display: flex; justify-content: space-between; align-items: center; gap: 12px;
    padding: 6px 0; border-bottom: 1px solid var(--border-soft); text-align: right;
    max-width: none; white-space: normal;
  }
  .ot-table td[data-label]:not([data-label=""])::before {
    content: attr(data-label); font-weight: 600; color: var(--muted);
    text-align: left; font-size: 0.74rem; text-transform: uppercase; letter-spacing: 0.04em;
  }
  .ot-table td:last-child { border-bottom: none; justify-content: flex-end; }
  .ot-table tbody tr.row-ready td, .ot-table tbody tr.row-stale td, .ot-table tbody tr.row-anulada td { background: transparent; }
  .ot-table tbody tr.row-ready td:first-child, .ot-table tbody tr.row-stale td:first-child, .ot-table tbody tr.row-anulada td:first-child { box-shadow: none; }
  .ot-table tr.row-ready { border-left: 4px solid var(--row-ready-border); }
  .ot-table tr.row-stale { border-left: 4px solid var(--row-stale-border); }
  .ot-table tr.row-anulada { border-left: 4px solid var(--row-anulada-border); }
  .cell-cliente { max-width: none; }
}
</style>
