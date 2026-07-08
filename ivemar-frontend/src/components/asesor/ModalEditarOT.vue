<template>
  <div class="modal-overlay" @click.self="$emit('close')">
    <div class="modal-content">
      <button class="close-btn" @click="$emit('close')">&times;</button>
      <h2>Editar Orden de Trabajo ({{ otId }})</h2>

      <div v-if="loading" class="loading-state"><div class="spinner"></div>Cargando datos...</div>
      <form v-else @submit.prevent="guardarCambios">
        <div class="form-grid">
          <div class="form-group"><label>Cliente</label><input type="text" v-model="form.cliente" required /></div>
          <div class="form-group"><label>Patente</label><input type="text" v-model="form.patente" required /></div>
          <div class="form-group"><label>Unidad</label><input type="text" v-model="form.unidad" required /></div>
          <div class="form-group"><label>Kilometraje</label><input type="text" v-model="form.kilometraje" /></div>
          
          <div class="form-group">
            <label>Fecha de Apertura</label>
            <input type="datetime-local" v-model="form.fecha_apertura" required />
          </div>
          <div class="form-group">
            <label>Fecha de Cierre</label>
            <input type="datetime-local" v-model="form.fecha_cierre" :disabled="!esFinalizada" :title="!esFinalizada ? 'Solo se puede editar si la OT está en estado Finalizada' : ''" />
          </div>

          <div class="form-group">
            <label>¿Garantía?</label>
            <select v-model="form.es_garantia">
              <option :value="0">No</option>
              <option :value="1">Sí</option>
            </select>
          </div>
          <div class="form-group">
            <label>¿Otra Marca?</label>
            <select v-model="form.es_no_iveco">
              <option :value="0">No</option>
              <option :value="1">Sí</option>
            </select>
          </div>
          <div class="form-group">
            <label>Horas Asignadas (Proyectadas)</label>
            <input type="number" step="0.1" min="0" v-model="form.tiempo_asignado_horas" />
          </div>
          <div class="form-group">
            <label>Horas Facturadas</label>
            <input type="number" step="0.1" min="0" v-model="form.tiempo_facturado_horas" />
          </div>
          <div class="form-group">
            <label>Horas Empleadas (Reales)</label>
            <input type="number" step="0.1" v-model="form.tiempo_empleado_horas" readonly style="background: #f0f0f0; cursor: not-allowed;" title="Dato gestionado automáticamente por las sesiones mecánicas." />
          </div>

          <div class="form-group">
            <label>Monto Repuestos Facturable ($)</label>
            <input type="number" step="0.01" min="0" v-model="form.monto_repuestos" />
          </div>
          <div class="form-group">
            <label>Monto Mano de Obra Facturable ($)</label>
            <input type="number" step="0.01" min="0" v-model="form.monto_mano_obra" />
          </div>

          <template v-if="form.es_garantia === 1">
            <div class="form-group" style="border-left: 3px solid #b8860b; padding-left: 10px;">
              <label style="color: #b8860b;">Repuestos en Garantía ($)</label>
              <input type="number" step="0.01" min="0" v-model="form.monto_repuestos_garantia" />
            </div>
            <div class="form-group" style="border-left: 3px solid #b8860b; padding-left: 10px;">
              <label style="color: #b8860b;">Mano Obra Garantía ($)</label>
              <input type="number" step="0.01" min="0" v-model="form.monto_mano_obra_garantia" />
            </div>
          </template>

          <div class="form-group" style="grid-column: span 2;">
            <label>Total OT (Cliente + Garantía)</label>
            <input type="text" :value="formatCurrency((form.monto_repuestos || 0) + (form.monto_mano_obra || 0) + (form.monto_repuestos_garantia || 0) + (form.monto_mano_obra_garantia || 0))" readonly style="background: #eef3f9; font-weight: bold; font-size: 1.1rem; color: #0056a7;" />
          </div>
        </div>
        <button type="submit" class="btn btn-success mt-15 w-100" :disabled="guardando">
          {{ guardando ? 'Guardando...' : 'Guardar Cambios' }}
        </button>
      </form>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useApi } from '../../composables/useApi'
import { useToast, errMsg } from '../../composables/useToast'

const props = defineProps({ otId: { type: String, required: true } })
const emit = defineEmits(['close', 'updated'])
const { fetchJSON } = useApi()
const toast = useToast()

const loading = ref(true)
const guardando = ref(false)
const esFinalizada = ref(false)
const form = ref({ 
  cliente: '', patente: '', unidad: '', kilometraje: '', 
  fecha_apertura: '', fecha_cierre: '',
  tiempo_asignado_horas: 0, tiempo_empleado_horas: 0, tiempo_facturado_horas: 0, es_garantia: 0, es_no_iveco: 0,
  monto_repuestos: 0, monto_mano_obra: 0, monto_repuestos_garantia: 0, monto_mano_obra_garantia: 0
})

const normalizarPatente = (pat) => pat.replace(/[^a-zA-Z0-9]/g, '').toUpperCase()
const formatCurrency = (val) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(val || 0)

const parseNum = (val) => {
  if (val === undefined || val === null || val === '') return 0;
  const num = Number(String(val).replace(',', '.'));
  return isNaN(num) ? 0 : num;
}

const formatForInput = (d) => d ? d.replace(' ', 'T').slice(0, 16) : ''

onMounted(async () => {
  try {
    const data = await fetchJSON(`/ordenes/${props.otId}`)
    esFinalizada.value = data.estado_actual === 'Finalizada'
    
    form.value = {
      cliente: data.cliente, patente: data.patente, unidad: data.unidad,
      kilometraje: data.kilometraje || '', 
      fecha_apertura: formatForInput(data.fecha_apertura),
      fecha_cierre: formatForInput(data.fecha_cierre),
      tiempo_asignado_horas: parseNum(data.tiempo_asignado_horas),
      tiempo_empleado_horas: parseNum(data.tiempo_empleado_horas),
      tiempo_facturado_horas: parseNum(data.tiempo_facturado_horas),
      es_garantia: data.es_garantia ? 1 : 0,
      es_no_iveco: data.es_no_iveco ? 1 : 0,
      monto_repuestos: parseNum(data.monto_repuestos),
      monto_mano_obra: parseNum(data.monto_mano_obra),
      monto_repuestos_garantia: parseNum(data.monto_repuestos_garantia),
      monto_mano_obra_garantia: parseNum(data.monto_mano_obra_garantia)
    }
  } catch (err) { toast.error('Error cargando OT: ' + errMsg(err)) } 
  finally { loading.value = false }
})

const guardarCambios = async () => {
  guardando.value = true
  try {
    const payload = { 
      ...form.value, 
      patente: normalizarPatente(form.value.patente),
      fecha_apertura: form.value.fecha_apertura ? form.value.fecha_apertura.replace('T', ' ') : undefined,
      fecha_cierre: form.value.fecha_cierre ? form.value.fecha_cierre.replace('T', ' ') : undefined,
      tiempo_asignado_horas: parseNum(form.value.tiempo_asignado_horas),
      tiempo_facturado_horas: parseNum(form.value.tiempo_facturado_horas),
      es_no_iveco: form.value.es_no_iveco,
      monto_repuestos: parseNum(form.value.monto_repuestos),
      monto_mano_obra: parseNum(form.value.monto_mano_obra),
      monto_repuestos_garantia: form.value.es_garantia === 1 ? parseNum(form.value.monto_repuestos_garantia) : 0,
      monto_mano_obra_garantia: form.value.es_garantia === 1 ? parseNum(form.value.monto_mano_obra_garantia) : 0
    }
    await fetchJSON(`/ordenes/${props.otId}`, { method: 'PUT', body: JSON.stringify(payload) })
    toast.success('OT actualizada correctamente')
    emit('updated')
  } catch (err) { toast.error('Error al guardar: ' + errMsg(err)) } 
  finally { guardando.value = false }
}
</script>