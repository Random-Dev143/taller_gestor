<template>
  <div class="modal-overlay" @click.self="$emit('close')">
    <div class="modal-content modal-large">
      <button class="close-btn" @click="$emit('close')">&times;</button>
      
      <div v-if="loading" class="loading-state"><div class="spinner"></div>Cargando detalles...</div>
      <div v-else-if="data">
        <div class="header-section">
          <h2>OT {{ data.ot }}</h2>
          <span class="badge">{{ data.estado_actual }}</span>
        </div>
        
        <div class="info-grid">
          <p><strong>Cliente:</strong> {{ data.cliente }}</p>
          <p><strong>Patente:</strong> {{ data.patente }}</p>
          <p><strong>Unidad:</strong> {{ data.unidad }}</p>
          <p><strong>Asesor:</strong> {{ data.asesor_legajo }}</p>
          <p><strong>Garantía:</strong> {{ data.es_garantia ? 'Sí' : 'No' }}</p>
          <p><strong>Otra Marca:</strong> {{ data.es_no_iveco ? 'Sí' : 'No' }}</p>
          <p><strong>Controlada:</strong> {{ data.controlada ? 'Sí' : 'No' }}</p>
          <p><strong>Hs Asignadas:</strong> {{ data.tiempo_asignado_horas }}</p>
          <p><strong>Hs Empleadas:</strong> {{ data.tiempo_empleado_horas }}</p>
          <p><strong>Hs Facturadas:</strong> {{ data.tiempo_facturado_horas }}</p>
          <p><strong>Total Repuestos:</strong> <span class="highlight">{{ formatCurrency(data.monto_repuestos) }}</span></p>
          <p><strong>Total Mano Obra:</strong> <span class="highlight">{{ formatCurrency(data.monto_mano_obra) }}</span></p>
          <p><strong>Total General:</strong> <span class="highlight bold">{{ formatCurrency((data.monto_repuestos || 0) + (data.monto_mano_obra || 0)) }}</span></p>
        </div>

        <hr />

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
                <tr v-for="a in data.actividades" :key="a.id">
                  <td>{{ a.legajo_mecanico }}</td>
                  <td>{{ a.descripcion }}</td>
                  <td><span class="badge-sm">{{ a.estado }}</span></td>
                  <td>{{ a.tiempo_estimado }}</td>
                  <td>{{ (a.tiempo_real || 0).toFixed(2) }}</td>
                  <td v-if="esJefe" style="white-space: nowrap;">
                    <button class="btn btn-sm" @click="$emit('editar-actividad', a)" title="Reasignar/Editar">✏️</button>
                    <button class="btn btn-danger btn-sm" @click="$emit('eliminar-actividad', a.id)" title="Eliminar asignación">🗑️</button>
                  </td>
                </tr>
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
</script>

<style scoped>
.modal-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); z-index: 1000; display: flex; justify-content: center; align-items: center; padding: 20px; }
.modal-content { background: white; width: 100%; border-radius: 12px; padding: 25px; position: relative; max-height: 90vh; overflow-y: auto; }
.modal-large { max-width: 900px; }
.close-btn { position: absolute; top: 10px; right: 20px; font-size: 1.8rem; background: none; border: none; cursor: pointer; }
.header-section { display: flex; align-items: center; gap: 15px; margin-bottom: 20px; }
.header-section h2 { margin: 0; }
.info-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 10px; margin-bottom: 15px; }
.info-grid p { margin: 0; font-size: 0.95rem; }
.highlight { color: #0056a7; }
.bold { font-weight: bold; }
hr { border: 0; border-top: 1px solid #eee; margin: 20px 0; }
h3 { color: #0056a7; font-size: 1.1rem; margin-bottom: 10px; }
.box-text { background: #f8fafc; padding: 10px; border-radius: 8px; border: 1px solid #eef3f9; }
.table-wrapper { overflow-x: auto; margin-bottom: 15px; }
table { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
th, td { padding: 8px; text-align: left; border-bottom: 1px solid #eee; }
th { background: #f8fafc; }
.badge { background: #0056a7; color: white; padding: 4px 10px; border-radius: 20px; font-size: 0.85rem; font-weight: bold; }
.badge-sm { background: #6c7a8a; color: white; padding: 2px 8px; border-radius: 10px; font-size: 0.75rem; }
.aportes-list { list-style: none; padding: 0; margin: 0; }
.aportes-list li { border-bottom: 1px solid #eee; padding: 10px 0; font-size: 0.95rem; }
.btn { margin-right: 4px; }
</style>