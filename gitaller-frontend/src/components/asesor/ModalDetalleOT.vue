<template>
  <div class="modal-overlay" @click.self="$emit('close')">
    <div class="modal-content modal-large">
      <button class="close-btn" @click="$emit('close')">&times;</button>
      
      <div v-if="loading" class="loading-state"><div class="spinner"></div>Cargando detalles...</div>
      <div v-else-if="data">
        <div class="header-section">
          <h2>{{ data.ot === '0000' ? 'Gestión de Rutinas y Tareas Internas' : `OT ${data.ot}` }}</h2>
          <span v-if="data.ot !== '0000'" class="badge">{{ data.estado_actual }}</span>
        </div>
        
        <div v-if="data.ot !== '0000'" class="info-grid">
          <p><strong>Cliente:</strong> {{ data.cliente }}</p>
          <p><strong>Patente:</strong> {{ data.patente }}</p>
          <p><strong>Unidad:</strong> {{ data.unidad }}</p>
          <p><strong>Asesor:</strong> {{ data.asesor_legajo }}</p>
          <p><strong>Garantía:</strong> {{ data.es_garantia ? 'Sí' : 'No' }}</p>
          <p><strong>Otra Marca:</strong> {{ data.es_no_iveco ? 'Sí' : 'No' }}</p>
          <p><strong>Controlada:</strong> {{ data.controlada ? 'Sí' : 'No' }}</p>
          <p><strong>Hs Asignadas:</strong> {{ data.tiempo_asignado_horas }}</p>
          <p><strong>Hs Empleadas:</strong> {{ Number(data.tiempo_empleado_horas || 0).toFixed(1) }}</p>
          <p><strong>Hs Facturadas:</strong> {{ data.tiempo_facturado_horas }}</p>
          <p><strong>Total Repuestos:</strong> <span class="highlight">{{ formatCurrency(data.monto_repuestos) }}</span></p>
          <p><strong>Total Mano Obra:</strong> <span class="highlight">{{ formatCurrency(data.monto_mano_obra) }}</span></p>
          <p v-if="data.monto_descuento > 0"><strong>Bonificación:</strong> <span class="highlight">− {{ formatCurrency(data.monto_descuento) }} ({{ data.descuento_estado }}{{ data.descuento_motivo ? ' — ' + data.descuento_motivo : '' }})</span></p>
          <p><strong>Total General:</strong> <span class="highlight bold">{{ formatCurrency((data.monto_repuestos || 0) + (data.monto_mano_obra || 0) - (data.descuento_estado === 'autorizado' ? (data.monto_descuento || 0) : 0)) }}</span></p>
        </div>

        <hr v-if="data.ot !== '0000'" />

        <div v-if="data.explicacion?.causa">
          <h3>Causa / Diagnóstico</h3>
          <p class="box-text">{{ data.explicacion.causa }}</p>
        </div>

        <div v-if="data.actividades?.length">
          <h3>Tareas Asignadas (Jefe a Mecánico)</h3>
          <div class="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Mecánico</th>
                  <th>Tarea</th>
                  <th>Estado</th>
                  <th>Hs Est.</th>
                  <th>Hs Real</th>
                  <th v-if="esJefe">Acciones</th>
                </tr>
              </thead>
              <tbody>
                <template v-for="a in data.actividades" :key="a.id">
                  <tr>
                    <td>
                      <div v-if="parseEquipo(a.equipo_detalle).length" class="equipo-mini">
                        <span
                          v-for="(m, idx) in parseEquipo(a.equipo_detalle)"
                          :key="idx"
                          class="mini-pill"
                          :class="miniPillClass(m.estado)"
                          :title="`${m.nombre}: ${m.estado} · ${m.horas.toFixed(2)} hs`"
                        >{{ m.nombre }} <small>({{ m.estado }})</small></span>
                      </div>
                      <span v-else>{{ a.nombre_mecanico || a.legajo_mecanico }}</span>
                    </td>
                    <td>{{ a.descripcion }}</td>
                    <td><span class="badge-sm">{{ a.estado }}</span></td>
                    <td>{{ a.tiempo_estimado }}</td>
                    <td>{{ (a.tiempo_real || 0).toFixed(2) }}</td>
                    <td v-if="esJefe" style="white-space: nowrap;">
                      <button class="btn btn-sm" v-can="'tarea_gestionar_todas'" @click="$emit('editar-actividad', a)" title="Reasignar/Editar">✏️</button>
                      <button class="btn btn-danger btn-sm" v-can="'tarea_gestionar_todas'" @click="$emit('eliminar-actividad', a.id)" title="Eliminar asignación">🗑️</button>
                      <button class="btn btn-sm" v-can="'tiempo_editar_manual'" @click="toggleTiempos(a.id)" title="Ver Tiempos">🕒</button>
                    </td>
                  </tr>
                  <tr v-if="esJefe && tiemposAbiertos === a.id">
                    <td colspan="6" class="tiempos-edit">
                      <template v-if="getTiempos(a.id).length || nuevosTiempos[a.id]?.length">
                        <div v-for="t in getTiempos(a.id)" :key="t.id" class="tiempo-row">
                          <input type="datetime-local" :value="toLocalInput(t.inicio)" @change="t.inicio = fromLocalInput($event.target.value)">
                          <input type="datetime-local" :value="toLocalInput(t.fin)" @change="t.fin = fromLocalInput($event.target.value)">
                          <button class="btn btn-sm" v-can="'tiempo_editar_manual'" @click="guardarTiempo(t, a.id)" title="Guardar">💾</button>
                          <button class="btn btn-danger btn-sm" v-can="'tiempo_editar_manual'" @click="eliminarTiempo(t.id)" title="Eliminar">🗑️</button>
                        </div>
                        <div v-for="t in (nuevosTiempos[a.id] || [])" :key="t.tempId" class="tiempo-row">
                          <input type="datetime-local" :value="toLocalInput(t.inicio)" @change="t.inicio = fromLocalInput($event.target.value)">
                          <input type="datetime-local" :value="toLocalInput(t.fin)" @change="t.fin = fromLocalInput($event.target.value)">
                          <button class="btn btn-sm" v-can="'tiempo_editar_manual'" @click="guardarTiempo(t, a.id)" title="Guardar">💾</button>
                          <button class="btn btn-danger btn-sm" v-can="'tiempo_editar_manual'" @click="quitarNuevo(a.id, t.tempId)" title="Quitar">🗑️</button>
                        </div>
                      </template>
                      <p v-else class="empty-state">Sin registros de tiempo.</p>
                      <button class="btn btn-sm" v-can="'tiempo_editar_manual'" @click="agregarTiempo(a.id)">➕ Agregar registro</button>
                    </td>
                  </tr>
                </template>
              </tbody>
            </table>
          </div>
        </div>

        <div v-if="data.aportes?.length">
          <h3>Aportes (Trabajo realizado)</h3>
          <ul class="aportes-list">
           <li v-for="ap in data.aportes" :key="ap.id">
                <strong>{{ ap.nombre || ap.legajo }}</strong> ({{ formatearFechaAporte(ap.fecha_aporte) }})<br/>
                <span style="white-space: pre-wrap;">{{ ap.actividades }}</span> <em>(Horas: {{ ap.horas }})</em>
            </li>
          </ul>
        </div>

      </div>
      <p v-else class="empty-state">No se encontraron datos para esta OT.</p>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useApi } from '../../composables/useApi'
import { useToast, errMsg } from '../../composables/useToast'

const props = defineProps({
  otId: { type: String, required: true },
  esJefe: { type: Boolean, default: false }
})

const emit = defineEmits(['close', 'editar-actividad', 'eliminar-actividad'])
const { fetchJSON } = useApi()
const toast = useToast()

const data = ref(null)
const loading = ref(true)

const formatCurrency = (val) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(val || 0)
const formatearFechaAporte = (fechaStr) => {
  if (!fechaStr) return '';
  const utcStr = fechaStr.includes('T') ? fechaStr : fechaStr.replace(' ', 'T') + 'Z';
  return new Date(utcStr).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' });
}

onMounted(async () => {
  try {
    data.value = await fetchJSON(`/ordenes/${props.otId}`)
  } catch (err) { toast.error('Error cargando detalle: ' + errMsg(err)) } 
  finally { loading.value = false }
})

const getTiempos = (actId) => {
  return (data.value?.tiempos_actividad || []).filter(t => t.actividad_id === actId);
}

// "Nombre|Estado|Horas;;Nombre|Estado|Horas" -> [{nombre, estado, horas}]
const parseEquipo = (equipoDetalle) => {
  if (!equipoDetalle) return [];
  return equipoDetalle.split(';;').map(parte => {
    const [nombre, estado, horas] = parte.split('|');
    return { nombre, estado, horas: parseFloat(horas) || 0 };
  }).filter(m => m.nombre);
}

const miniPillClass = (estado) => ({
  'Asignada': 'pill-info',
  'En Curso': 'pill-progress',
  'Pausada': 'pill-warn',
  'Finalizada': 'pill-done'
}[estado] || 'pill-info')

const tiemposAbiertos = ref(null);
const toggleTiempos = (actId) => tiemposAbiertos.value = (tiemposAbiertos.value === actId ? null : actId);

// Los registros se guardan en UTC (SQLite CURRENT_TIMESTAMP); los inputs datetime-local trabajan en hora local.
const pad = (n) => String(n).padStart(2, '0');

const toLocalInput = (utcStr) => {
  if (!utcStr) return '';
  const d = new Date(utcStr.replace(' ', 'T') + 'Z');
  if (isNaN(d)) return '';
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const fromLocalInput = (localStr) => {
  if (!localStr) return null;
  const d = new Date(localStr);
  if (isNaN(d)) return null;
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
};

const nuevosTiempos = ref({});

const agregarTiempo = (actId) => {
  if (!nuevosTiempos.value[actId]) nuevosTiempos.value[actId] = [];
  nuevosTiempos.value[actId].push({ tempId: Date.now(), inicio: null, fin: null });
};

const quitarNuevo = (actId, tempId) => {
  nuevosTiempos.value[actId] = (nuevosTiempos.value[actId] || []).filter(t => t.tempId !== tempId);
};

const eliminarTiempo = async (id) => {
    if (!confirm("¿Borrar este registro?")) return;
    try {
        await fetchJSON(`/actividades/tiempos/${id}`, { method: 'DELETE' });
        data.value = await fetchJSON(`/ordenes/${props.otId}`);
        toast.success('Registro eliminado');
    } catch (err) {
        toast.error('Error al eliminar: ' + errMsg(err));
    }
};

const guardarTiempo = async (t, actId) => {
    if (!t.inicio) { toast.error('El inicio es obligatorio'); return; }
    try {
        if (t.id) {
            await fetchJSON(`/actividades/tiempos/${t.id}`, {
                method: 'PUT',
                body: JSON.stringify({ inicio: t.inicio, fin: t.fin })
            });
        } else {
            await fetchJSON(`/actividades/${actId}/tiempos`, {
                method: 'POST',
                body: JSON.stringify({ inicio: t.inicio, fin: t.fin })
            });
            quitarNuevo(actId, t.tempId);
        }
        data.value = await fetchJSON(`/ordenes/${props.otId}`);
        toast.success('Guardado');
    } catch (err) {
        toast.error('Error al guardar: ' + errMsg(err));
    }
};

</script>

<style scoped>
.modal-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: var(--overlay); z-index: 1000; display: flex; justify-content: center; align-items: center; padding: 20px; }
.modal-content { background: var(--surface-raised); color: var(--text); width: 100%; border-radius: 12px; padding: 25px; position: relative; max-height: 90vh; overflow-y: auto; }
.modal-large { max-width: 900px; }
.close-btn { position: absolute; top: 10px; right: 20px; font-size: 1.8rem; background: none; border: none; cursor: pointer; }
.header-section { display: flex; align-items: center; gap: 15px; margin-bottom: 20px; }
.header-section h2 { margin: 0; }
.info-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 10px; margin-bottom: 15px; }
.info-grid p { margin: 0; font-size: 0.95rem; }
.highlight { color: var(--primary); }
.bold { font-weight: bold; }
hr { border: 0; border-top: 1px solid var(--border-soft); margin: 20px 0; }
h3 { color: var(--primary); font-size: 1.1rem; margin-bottom: 10px; }
.box-text { background: var(--border-soft); padding: 10px; border-radius: 8px; border: 1px solid var(--border); }
.table-wrapper { overflow-x: auto; margin-bottom: 15px; }
table { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
th, td { padding: 8px; text-align: left; border-bottom: 1px solid var(--border-soft); }
th { background: var(--border-soft); }
.badge { background: var(--primary); color: white; padding: 4px 10px; border-radius: 20px; font-size: 0.85rem; font-weight: bold; }
.badge-sm { background: var(--muted); color: white; padding: 2px 8px; border-radius: 10px; font-size: 0.75rem; }
.equipo-mini { display: flex; flex-direction: column; gap: 4px; }
.mini-pill { display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 0.78rem; color: white; white-space: nowrap; }
.mini-pill small { opacity: 0.85; }
.pill-info { background: var(--primary); }
.pill-progress { background: var(--success); }
.pill-warn { background: var(--warning); }
.pill-done { background: var(--muted); }
.aportes-list { list-style: none; padding: 0; margin: 0; }
.aportes-list li { border-bottom: 1px solid var(--border-soft); padding: 10px 0; font-size: 0.95rem; }
.btn { margin-right: 4px; }
.tiempos-edit { background: var(--border-soft); }
.tiempo-row { display: flex; align-items: center; gap: 8px; padding: 4px 0; }
</style>
