<template>
  <div class="card">
    <h2>Crear Nueva OT</h2>

    <form @submit.prevent="crearOT">
      <div class="form-grid">
        <div class="form-group">
          <label>Número OT *</label>
          <input type="text" v-model="form.ot" required />
        </div>
        <div class="form-group">
          <label>Patente *</label>
          <input type="text" v-model="form.patente" @blur="buscarPatente" required placeholder="Ej: AB123CD" />
        </div>
        <div class="form-group" style="position: relative;">
          <label>Cliente *</label>
          <input type="text" v-model="form.cliente" @input="buscarClientes" required style="text-transform: uppercase;" autocomplete="off" />
          
          <ul v-if="clientesSugeridos.length > 0" class="autocomplete-list">
            <li v-for="c in clientesSugeridos" :key="c.id" @click="seleccionarCliente(c)">
              <strong>{{ c.nombre }}</strong> <span style="font-size: 0.8rem; color: var(--text-soft);">{{ c.telefono || '' }}</span>
            </li>
          </ul>

          <!-- Vehículos ya registrados a nombre del cliente elegido. Elegir uno
               autocompleta patente/unidad; si el vehículo es nuevo, se ignora
               y se completa el formulario a mano como siempre. -->
          <div v-if="unidadesCliente.length > 0" class="unidades-cliente">
            <span class="unidades-cliente-label">Vehículos de este cliente:</span>
            <button v-for="u in unidadesCliente" :key="u.patente" type="button"
                    class="btn-unidad-sugerida" @click="seleccionarUnidad(u)">
              {{ u.patente }} · {{ u.unidad }}
            </button>
          </div>
        </div>
        <div class="form-group">
          <label>Unidad *</label>
          <input type="text" v-model="form.unidad" required />
        </div>
        <div class="form-group">
          <label>Kilometraje</label>
          <input type="text" v-model="form.kilometraje" placeholder="Ej: 45000 km" />
        </div>
        <div class="form-group">
          <label>Asesor (legajo) *</label>
          <input type="text" v-model="form.asesor_legajo" required />
        </div>
        <div class="form-group">
          <label>Fecha apertura</label>
          <input type="datetime-local" v-model="form.fecha_apertura" />
        </div>
        <div class="form-group">
          <label>Horas asignadas</label>
          <input type="number" step="0.5" min="0" v-model="form.tiempo_asignado_horas" />
        </div>
        <div class="form-group">
          <label>¿Garantía?</label>
          <select v-model="form.es_garantia">
            <option :value="0">No</option>
            <option :value="1">Sí</option>
          </select>
        </div>
        <div class="form-group">
          <label>¿Es Otra Marca (No Iveco)?</label>
          <select v-model="form.es_no_iveco">
            <option :value="0">No (Es Iveco)</option>
            <option :value="1">Sí (Otra Marca)</option>
          </select>
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
          <div class="form-group" style="border-left: 3px solid var(--warning); padding-left: 10px;">
            <label style="color: var(--warning);">Repuestos en Garantía ($)</label>
            <input type="number" step="0.01" min="0" v-model="form.monto_repuestos_garantia" />
          </div>
          <div class="form-group" style="border-left: 3px solid var(--warning); padding-left: 10px;">
            <label style="color: var(--warning);">Mano Obra Garantía ($)</label>
            <input type="number" step="0.01" min="0" v-model="form.monto_mano_obra_garantia" />
          </div>
        </template>

        <div class="form-group" style="grid-column: span 2; background: var(--border-soft); padding: 10px; border-radius: 6px; border: 1px solid var(--border);">
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
              <input type="text" :value="formatCurrency(montoDescuentoCalculado)" readonly style="background: var(--border-soft);" />
            </div>
            <div style="flex: 2; min-width: 220px;">
              <label>Motivo del descuento *</label>
              <input type="text" v-model="descuentoMotivo" placeholder="Ej: reclamo, cliente frecuente, acuerdo comercial..." required />
            </div>
          </div>
          <p v-if="tieneBonificacion" style="margin: 8px 0 0; font-size: 0.85rem; color: var(--text-soft);">
            El descuento queda <strong>pendiente de autorización</strong> del administrador y no se resta de la facturación de los informes hasta que sea aprobado.
          </p>
        </div>

        <div class="form-group" style="grid-column: span 2;">
          <label>Total OT (Cliente + Garantía{{ tieneBonificacion ? ' − Bonificación' : '' }})</label>
          <input type="text" :value="formatCurrency((form.monto_repuestos || 0) + (form.monto_mano_obra || 0) + (form.monto_repuestos_garantia || 0) + (form.monto_mano_obra_garantia || 0) - (tieneBonificacion ? montoDescuentoCalculado : 0))" readonly style="background: var(--border-soft); font-weight: bold; font-size: 1.1rem; color: var(--primary);" />
        </div>
      </div>
      <button type="submit" class="btn" :disabled="enviando">{{ enviando ? 'Creando...' : 'Crear OT' }}</button>
    </form>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useApi } from '../../composables/useApi'
import { useToast, errMsg } from '../../composables/useToast'

const emit = defineEmits(['ot-creada'])
const { fetchJSON } = useApi()
const toast = useToast()

const formatCurrency = (val) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(val || 0)

const formBase = {
  ot: '', patente: '', cliente: '', unidad: '', kilometraje: '',
  asesor_legajo: '', fecha_apertura: '', tiempo_asignado_horas: 0,
  tiempo_facturado_horas: 0, es_garantia: 0, es_no_iveco: 0, 
  monto_repuestos: 0, monto_mano_obra: 0, monto_repuestos_garantia: 0, monto_mano_obra_garantia: 0
}

const form = ref({ ...formBase })
const tieneBonificacion = ref(false)
const porcentajeDescuento = ref(0)
const descuentoMotivo = ref('')
const montoDescuentoCalculado = computed(() => {
  const subtotal = (Number(form.value.monto_repuestos) || 0) + (Number(form.value.monto_mano_obra) || 0)
  return Math.round(subtotal * ((Number(porcentajeDescuento.value) || 0) / 100) * 100) / 100
})
const enviando = ref(false)
const clientesSugeridos = ref([])
const unidadesCliente = ref([])
let searchTimeout = null

const normalizarPatente = (pat) => pat.replace(/[^a-zA-Z0-9]/g, '').toUpperCase()

const buscarPatente = async () => {
  form.value.patente = normalizarPatente(form.value.patente)
  if (form.value.patente.length < 3) return

  try {
    const unidadData = await fetchJSON(`/unidades/${encodeURIComponent(form.value.patente)}`)
    if (unidadData) {
      form.value.cliente = unidadData.cliente || ''
      form.value.unidad = unidadData.unidad || ''
      toast.info(`Datos autocompletados para ${form.value.patente}`, 2500)
    }
  } catch (err) {}
}

const buscarClientes = () => {
  form.value.cliente = form.value.cliente.toUpperCase()
  unidadesCliente.value = []
  clearTimeout(searchTimeout)
  if (form.value.cliente.length < 2) {
    clientesSugeridos.value = []
    return
  }
  searchTimeout = setTimeout(async () => {
    try {
      clientesSugeridos.value = await fetchJSON(`/unidades/clientes/buscar?q=${encodeURIComponent(form.value.cliente)}`)
    } catch (e) { }
  }, 300)
}

const seleccionarCliente = async (cliente) => {
  form.value.cliente = cliente.nombre
  clientesSugeridos.value = []
  try {
    unidadesCliente.value = await fetchJSON(`/unidades/cliente/${cliente.id}`)
  } catch (e) {
    unidadesCliente.value = []
  }
}

const seleccionarUnidad = (unidad) => {
  form.value.patente = unidad.patente
  form.value.unidad = unidad.unidad
  if (unidad.ultimo_kilometraje) form.value.kilometraje = unidad.ultimo_kilometraje
  unidadesCliente.value = []
  toast.info(`Vehículo ${unidad.patente} cargado`, 2000)
}

const crearOT = async () => {
  if (tieneBonificacion.value && !descuentoMotivo.value.trim()) {
    toast.error('Indicá el motivo de la bonificación/descuento')
    return
  }

  enviando.value = true
  try {
    form.value.patente = normalizarPatente(form.value.patente)
    if (!form.value.fecha_apertura) form.value.fecha_apertura = new Date().toISOString()

    // Si desmarcan garantía, forzamos los montos de garantía a 0 para no arrastrar basura
    if (form.value.es_garantia === 0) {
      form.value.monto_repuestos_garantia = 0
      form.value.monto_mano_obra_garantia = 0
    }

    const payload = {
      ...form.value,
      monto_descuento: tieneBonificacion.value ? montoDescuentoCalculado.value : 0,
      descuento_motivo: tieneBonificacion.value ? descuentoMotivo.value.trim() : ''
    }

    await fetchJSON('/ordenes', { method: 'POST', body: JSON.stringify(payload) })
    toast.success('OT creada correctamente' + (tieneBonificacion.value ? ' (bonificación pendiente de autorización)' : ''))
    form.value = { ...formBase }
    tieneBonificacion.value = false
    porcentajeDescuento.value = 0
    descuentoMotivo.value = ''
    unidadesCliente.value = []
    emit('ot-creada')
  } catch (err) { toast.error('Error al crear la OT: ' + errMsg(err)) } 
  finally { enviando.value = false }
}
</script>

<style scoped>
.autocomplete-list {
  position: absolute; top: 100%; left: 0; right: 0;
  background: var(--surface); border: 1px solid var(--border); border-radius: 4px;
  box-shadow: var(--shadow-sm); list-style: none; padding: 0; margin: 4px 0 0 0;
  z-index: 1000; max-height: 180px; overflow-y: auto;
}
.autocomplete-list li { padding: 8px 12px; cursor: pointer; border-bottom: 1px solid var(--border-soft); display: flex; justify-content: space-between;}
.autocomplete-list li:hover { background: var(--primary-light); color: var(--primary); }

.unidades-cliente { margin-top: 8px; display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.unidades-cliente-label { font-size: 0.78rem; color: var(--muted); width: 100%; }
.btn-unidad-sugerida {
  border: 1px solid var(--border); background: var(--border-soft); color: var(--primary);
  padding: 4px 10px; border-radius: 14px; font-size: 0.8rem; cursor: pointer;
}
.btn-unidad-sugerida:hover { background: var(--primary-light); }
</style>
