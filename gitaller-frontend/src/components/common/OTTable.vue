<template>
  <div class="table-wrapper">
    <table class="ot-table">
      <thead>
        <tr>
          <th v-for="col in columnas" :key="col.key" :class="{ sortable: col.sortable }"
              @click="col.sortable && $emit('sort-change', col.key)">
            {{ col.label }}
            <span v-if="col.sortable" class="sort-icon">{{ sortIcon(col.key) }}</span>
          </th>
          <th>Acciones</th>
        </tr>
      </thead>
      <tbody>
        <tr v-if="data.length === 0">
          <td colspan="10" class="empty-state">No hay órdenes de trabajo para mostrar</td>
        </tr>
        <tr v-for="ot in data" :key="ot.ot" :class="{ 'row-ready': esLista(ot), 'row-stale': esEstancada(ot) }">
          <td data-label="OT">
            <strong>{{ ot.ot }}</strong>
            <span v-if="esEstancada(ot)" class="badge-antiguedad" :title="`Abierta hace ${diasAbierta(ot)} días`">
              ⏳ {{ diasAbierta(ot) }}d
            </span>
          </td>
          <td data-label="Cliente">{{ ot.cliente }}</td>
          <td data-label="Patente"><span class="patente-badge">{{ ot.patente }}</span></td>
          <td data-label="Unidad">{{ ot.unidad }}</td>

          <td data-label="Mecánico">
                <button v-if="esJefe" v-can="'tarea_gestionar_todas'"
                        :class="['btn btn-sm btn-assign', !ot.mecanico ? 'btn-urgente' : '']" 
                        @click="$emit('open-assign-modal', ot.ot)">
                    {{ ot.mecanico || '⚠️ Falta Asignar' }}
                </button>
                <span v-else>
                    <span v-if="!ot.mecanico" class="badge-sm badge-warn">Sin Asignar</span>
                    <span v-else>{{ ot.mecanico }}</span>
                </span>
            </td>

          <td data-label="Estado">
            <select v-if="esJefe" v-can="'ot_cambiar_estado'" class="estado-select" @change="$emit('update-status', {ot: ot.ot, estado: $event.target.value})">
              <option v-for="est in ['En Proceso', 'En Espera', 'Espera de Repuestos', 'Trabajos de Terceros', 'Finalizada']"
                      :key="est" :value="est" :selected="ot.estado_actual === est">{{ est }}</option>
            </select>
            <span v-else :class="['status-tag', statusClass(ot.estado_actual)]">{{ ot.estado_actual }}</span>
          </td>

          <td data-label="Garantía">{{ ot.es_garantia ? '✅' : '—' }}</td>
          <td data-label="Controlada">{{ ot.controlada ? '✅' : '—' }}</td>
          
          <td data-label="Facturación">
            <template v-if="ot.estado_actual === 'Finalizada'">
              <span v-if="tieneMontos(ot)" class="status-tag status-progress" title="Valores cargados">✅ Cargados</span>
              <span v-else class="status-tag status-danger" title="Falta cargar importes">⚠️ Vacíos</span>
            </template>
            <span v-else class="text-muted">—</span>
          </td>

          <td class="actions-cell" data-label="Acciones">
            <button v-if="esJefe && !ot.controlada" v-can="'ot_controlar'" class="btn btn-success btn-sm" @click="$emit('control-ot', ot.ot)">Controlar</button>
            <button class="btn btn-secondary btn-sm" v-can="'ot_ver_detalle'" @click="$emit('view-detail', ot.ot)">Detalle</button>
            <button class="btn btn-sm" v-can="'ot_editar'" @click="$emit('edit-ot', ot.ot)">Editar</button>
            <button class="btn btn-outline btn-sm" v-can="'ot_ver_detalle'" @click="$emit('export-pdf', ot.ot)">📄 PDF</button>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup>
const props = defineProps({
  data: { type: Array, required: true },
  esJefe: { type: Boolean, default: false },
  mecanicos: { type: Array, default: () => [] },
  sortBy: { type: String, default: '' },
  sortDir: { type: String, default: 'desc' }
})
defineEmits(['update-status', 'view-detail', 'edit-ot', 'control-ot', 'open-assign-modal', 'export-pdf', 'sort-change'])

// Columnas ordenables. Garantía/Controlada quedan afuera porque son
// booleanas y ordenarlas no aporta demasiado; se pueden sumar igual
// agregando su key acá y en el whitelist ORDENABLES del backend.
const columnas = [
  { key: 'ot', label: 'OT', sortable: true },
  { key: 'cliente', label: 'Cliente', sortable: true },
  { key: 'patente', label: 'Patente', sortable: true },
  { key: 'unidad', label: 'Unidad', sortable: true },
  { key: 'mecanico', label: 'Mecánico', sortable: true },
  { key: 'estado', label: 'Estado', sortable: true },
  { key: 'garantia', label: 'Garantía', sortable: false },
  { key: 'controlada', label: 'Controlada', sortable: false },
  { key: 'facturacion', label: 'Facturación', sortable: true }
]

const sortIcon = (key) => {
  if (props.sortBy !== key) return '↕'
  return props.sortDir === 'asc' ? '▲' : '▼'
}

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
  const apertura = new Date(ot.fecha_apertura)
  const ahora = new Date()
  return Math.floor((ahora - apertura) / (1000 * 60 * 60 * 24))
}

const esEstancada = (ot) => ot.estado_actual !== 'Finalizada' && diasAbierta(ot) > UMBRAL_DIAS_ESTANCADA
</script>

<style scoped>
.table-wrapper { overflow-x: auto; width: 100%; }
.ot-table thead th.sortable { cursor: pointer; user-select: none; white-space: nowrap; }
.ot-table thead th.sortable:hover { color: var(--primary, #0d6efd); }
.sort-icon { font-size: 0.7rem; margin-left: 4px; opacity: 0.7; }
.btn-assign { background: #f0f4f8; border: 1px solid var(--border); color: var(--text); width: 100%; text-align: left; }
.estado-select { padding: 6px; border-radius: 6px; border: 1px solid var(--border); width: 100%; max-width: 150px; }
.actions-cell { white-space: nowrap; }
.patente-badge { background: #111; color: white; font-family: monospace; font-weight: bold; padding: 3px 8px; border-radius: 4px; }
.text-muted { color: var(--muted); }

.status-tag { font-size: 0.8rem; font-weight: 700; padding: 3px 10px; border-radius: 20px; white-space: nowrap; }
.status-progress { background: #d4edda; color: #155724; }
.status-wait { background: #e9edf4; color: #445; }
.status-warn { background: #fff3cd; color: #7a5c00; }
.status-danger { background: #f8d7da; color: #842029; }
.status-done { background: #cfe2ff; color: #084298; }

.btn-urgente { background-color: #fff3cd !important; color: #856404 !important; border: 1px solid #ffeeba !important; font-weight: bold; animation: pulse-warn 2s infinite; }
@keyframes pulse-warn { 0% { box-shadow: 0 0 0 0 rgba(255, 193, 7, 0.4); } 70% { box-shadow: 0 0 0 6px rgba(255, 193, 7, 0); } 100% { box-shadow: 0 0 0 0 rgba(255, 193, 7, 0); } }

.row-ready { background-color: #e6f9ec !important; border-left: 5px solid #1d8a4f; }
.row-ready td { background-color: transparent !important; }

.badge-antiguedad {
  display: inline-block; margin-left: 8px; font-size: 0.72rem; font-weight: 700;
  background: #f8d7da; color: #842029; padding: 2px 7px; border-radius: 10px;
  white-space: nowrap;
}
.row-stale { background-color: #fdf1f1 !important; border-left: 5px solid #b22234; }
.row-stale td { background-color: transparent !important; }

@media (max-width: 850px) {
  .ot-table thead { display: none; }
  .ot-table, .ot-table tbody, .ot-table tr, .ot-table td { display: block; width: 100%; }
  .ot-table tr {
    border: 1px solid var(--border-soft); border-radius: var(--radius);
    margin-bottom: 16px; padding: 12px; box-shadow: var(--shadow-sm);
    background: white; position: relative;
  }
  .ot-table td {
    display: flex; justify-content: space-between; align-items: center;
    padding: 6px 0; border-bottom: 1px solid var(--border-soft); text-align: right;
  }
  .ot-table td:last-child { border-bottom: none; margin-top: 10px; }
  .ot-table td::before {
    content: attr(data-label); font-weight: bold; color: var(--muted);
    text-align: left; padding-right: 15px; font-size: 0.85rem; text-transform: uppercase;
  }
  .actions-cell { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; }
  .estado-select { max-width: 100%; }
  .row-ready { border-left: none; border-top: 5px solid #1d8a4f; }
  .row-stale { border-left: none; border-top: 5px solid #b22234; }
}
</style>