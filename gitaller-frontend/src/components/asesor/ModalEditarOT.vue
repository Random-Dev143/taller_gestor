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

          <div class="form-group" style="grid-column: span 2; background: #f5f7fa; padding: 10px; border-radius: 6px; border: 1px solid var(--border);">
            <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
              <input type="checkbox" v-model="tieneBonificacion" style="width: 18px; height: 18px;" />
              <strong>Aplicar bonificación / descuento al cliente</strong>
            </label>

            <div v-if="tieneBonificacion" style="display: flex; gap: 10px; margin-top: 10px; flex-wrap: wrap;">
              <div style="flex: 1; min-width: 140px;">
                <label>Porcentaje (%)</label>
                <input type="number" step="1" min="0" max="100" v-model.number="porcentajeDescuento" />
              </div>
              <div style="flex: 1; min-width: 140px;">
                <label>Monto a descontar ($)</label>
                <input type="text" :value="formatCurrency(montoDescuentoCalculado)" readonly style="background: #eef3f9;" />
              </div>
              <div style="flex: 2; min-width: 220px;">
                <label>Motivo del descuento *</label>
                <input type="text" v-model="descuentoMotivo" placeholder="Ej: reclamo, cliente frecuente, acuerdo comercial..." required />
              </div>
            </div>

            <div v-if="tieneBonificacion" style="margin-top: 10px; display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
              <span class="badge-descuento" :class="'estado-' + descuentoEstadoOriginal">{{ etiquetaEstadoDescuento }}</span>
              <span v-if="descuentoAutorizadoPor" style="font-size: 0.85rem; color: #666;">por {{ descuentoAutorizadoPor }}</span>

              <template v-if="puedeAutorizarDescuento && descuentoEstadoOriginal === 'pendiente'">
                <button type="button" class="btn btn-success" style="padding: 4px 10px; font-size: 0.85rem;" :disabled="autorizando" @click="autorizarDescuento(true)">Aprobar</button>
                <button type="button" class="btn btn-danger" style="padding: 4px 10px; font-size: 0.85rem;" :disabled="autorizando" @click="autorizarDescuento(false)">Rechazar</button>
              </template>
            </div>
            <p v-if="tieneBonificacion && descuentoEstadoOriginal !== 'autorizado'" style="margin: 8px 0 0; font-size: 0.85rem; color: #666;">
              Este descuento no se resta de la facturación de los informes hasta que un administrador lo autorice.
            </p>
          </div>

          <div class="form-group" style="grid-column: span 2;">
            <label>Total OT (Cliente + Garantía{{ tieneBonificacion ? ' − Bonificación' : '' }})</label>
            <input type="text" :value="formatCurrency((form.monto_repuestos || 0) + (form.monto_mano_obra || 0) + (form.monto_repuestos_garantia || 0) + (form.monto_mano_obra_garantia || 0) - (tieneBonificacion ? montoDescuentoCalculado : 0))" readonly style="background: #eef3f9; font-weight: bold; font-size: 1.1rem; color: #0056a7;" />
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
import { ref, computed, onMounted } from 'vue'
import { useApi } from '../../composables/useApi'
import { useToast, errMsg } from '../../composables/useToast'
import { useAuthStore } from '../../stores/useAuthStore'

const props = defineProps({ otId: { type: String, required: true } })
const emit = defineEmits(['close', 'updated'])
const { fetchJSON } = useApi()
const toast = useToast()
const authStore = useAuthStore()

const loading = ref(true)
const guardando = ref(false)
const autorizando = ref(false)
const esFinalizada = ref(false)
const form = ref({ 
  cliente: '', patente: '', unidad: '', kilometraje: '', 
  fecha_apertura: '', fecha_cierre: '',
  tiempo_asignado_horas: 0, tiempo_empleado_horas: 0, tiempo_facturado_horas: 0, es_garantia: 0, es_no_iveco: 0,
  monto_repuestos: 0, monto_mano_obra: 0, monto_repuestos_garantia: 0, monto_mano_obra_garantia: 0
})

const tieneBonificacion = ref(false)
const porcentajeDescuento = ref(0)
const descuentoMotivo = ref('')
const descuentoEstadoOriginal = ref('ninguno') // ninguno | pendiente | autorizado | rechazado
const descuentoAutorizadoPor = ref('')
const montoDescuentoOriginal = ref(0)

const puedeAutorizarDescuento = computed(() => (authStore.usuario?.permisos || []).includes('ot_autorizar_descuento'))

const montoDescuentoCalculado = computed(() => {
  const subtotal = (Number(form.value.monto_repuestos) || 0) + (Number(form.value.monto_mano_obra) || 0)
  return Math.round(subtotal * ((Number(porcentajeDescuento.value) || 0) / 100) * 100) / 100
})

const etiquetaEstadoDescuento = computed(() => ({
  ninguno: 'Sin autorizar',
  pendiente: 'Pendiente de autorización',
  autorizado: 'Autorizado',
  rechazado: 'Rechazado'
}[descuentoEstadoOriginal.value] || descuentoEstadoOriginal.value))

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

    const montoDescuento = parseNum(data.monto_descuento)
    tieneBonificacion.value = montoDescuento > 0
    montoDescuentoOriginal.value = montoDescuento
    descuentoMotivo.value = data.descuento_motivo || ''
    descuentoEstadoOriginal.value = data.descuento_estado || 'ninguno'
    descuentoAutorizadoPor.value = data.descuento_autorizado_por || ''
    // Reconstruimos el % aproximado a partir del monto guardado, solo para mostrarlo editable
    const subtotalActual = form.value.monto_repuestos + form.value.monto_mano_obra
    porcentajeDescuento.value = subtotalActual > 0 ? Math.round((montoDescuento / subtotalActual) * 10000) / 100 : 0
  } catch (err) { toast.error('Error cargando OT: ' + errMsg(err)) } 
  finally { loading.value = false }
})

const guardarCambios = async () => {
  if (tieneBonificacion.value && !descuentoMotivo.value.trim()) {
    toast.error('Indicá el motivo de la bonificación/descuento')
    return
  }

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
      monto_mano_obra_garantia: form.value.es_garantia === 1 ? parseNum(form.value.monto_mano_obra_garantia) : 0,
      monto_descuento: tieneBonificacion.value ? montoDescuentoCalculado.value : 0,
      descuento_motivo: tieneBonificacion.value ? descuentoMotivo.value.trim() : ''
    }
    await fetchJSON(`/ordenes/${props.otId}`, { method: 'PUT', body: JSON.stringify(payload) })
    toast.success('OT actualizada correctamente')
    emit('updated')
  } catch (err) { toast.error('Error al guardar: ' + errMsg(err)) } 
  finally { guardando.value = false }
}

const autorizarDescuento = async (aprobado) => {
  autorizando.value = true
  try {
    await fetchJSON(`/ordenes/${props.otId}/descuento/autorizar`, { method: 'PUT', body: JSON.stringify({ aprobado }) })
    descuentoEstadoOriginal.value = aprobado ? 'autorizado' : 'rechazado'
    descuentoAutorizadoPor.value = authStore.usuario?.legajo || authStore.usuario?.nombre || ''
    toast.success(aprobado ? 'Descuento autorizado' : 'Descuento rechazado')
    emit('updated')
  } catch (err) { toast.error('Error al autorizar el descuento: ' + errMsg(err)) }
  finally { autorizando.value = false }
}
</script>

<style scoped>
.badge-descuento {
  display: inline-block; padding: 2px 10px; border-radius: 12px;
  font-size: 0.8rem; font-weight: 600;
}
.badge-descuento.estado-pendiente { background: #fff3cd; color: #856404; }
.badge-descuento.estado-autorizado { background: #d4edda; color: #155724; }
.badge-descuento.estado-rechazado { background: #f8d7da; color: #721c24; }
.badge-descuento.estado-ninguno { background: #e2e3e5; color: #383d41; }
</style>