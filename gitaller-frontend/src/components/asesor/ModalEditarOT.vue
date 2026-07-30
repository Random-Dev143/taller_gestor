<template>
  <div class="modal-overlay" @click.self="$emit('close')">
    <div class="modal-content modal-large">
      <button class="close-btn" @click="$emit('close')">&times;</button>
      <h2>Editar Orden de Trabajo ({{ otId }})</h2>

      <div v-if="loading" class="loading-state"><div class="spinner"></div>Cargando datos...</div>
      
      <div v-else>
        <!-- Navegación interna del Modal -->
        <div class="modal-tabs mb-15">
          <button :class="['tab-btn', subTab === 'datos' ? 'active' : '']" @click="subTab = 'datos'">📄 Datos de Cabecera</button>
          <button :class="['tab-btn', subTab === 'cargos' ? 'active' : '']" @click="subTab = 'cargos'">📦 Repuestos y Cargos</button>
        </div>

        <!-- PESTAÑA 1: DATOS GENERALES -->
        <form v-if="subTab === 'datos'" @submit.prevent="guardarCambios">
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
              <input type="datetime-local" v-model="form.fecha_cierre" :disabled="!esFinalizada" :title="!esFinalizada ? 'Solo editable si la OT está Finalizada' : ''" />
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
            
            <div class="form-group" style="grid-column: span 2;">
              <label>Monto Mano de Obra Facturable ($)</label>
              <input type="number" step="0.01" min="0" v-model="form.monto_mano_obra" />
            </div>

            <div class="form-group" v-if="form.es_garantia === 1" style="grid-column: span 2; border-left: 3px solid var(--warning); padding-left: 10px;">
              <label style="color: var(--warning);">Mano Obra Garantía ($)</label>
              <input type="number" step="0.01" min="0" v-model="form.monto_mano_obra_garantia" />
            </div>

            <!-- MONTOS AUTOMATIZADOS (Lectura) -->
            <div class="form-group" style="background: var(--border-soft); padding: 8px; border-radius: 6px;">
              <label>Monto Repuestos (Autocalculado)</label>
              <input type="text" :value="formatCurrency(form.monto_repuestos)" disabled title="Se calcula sumando los ítems de la pestaña Cargos" />
            </div>
            <div class="form-group" v-if="form.es_garantia === 1" style="background: var(--border-soft); padding: 8px; border-radius: 6px;">
              <label style="color: var(--warning);">Repuestos Garantía (Autocalculado)</label>
              <input type="text" :value="formatCurrency(form.monto_repuestos_garantia)" disabled />
            </div>

            <!-- SECCIÓN DESCUENTOS -->
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
                  <input type="text" v-model="descuentoMotivo" placeholder="Ej: reclamo, acuerdo comercial..." required />
                </div>
              </div>

              <div v-if="tieneBonificacion" style="margin-top: 10px; display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
                <span class="badge-descuento" :class="'estado-' + descuentoEstadoOriginal">{{ etiquetaEstadoDescuento }}</span>
                <span v-if="descuentoAutorizadoPor" style="font-size: 0.85rem; color: var(--text-soft);">por {{ descuentoAutorizadoPor }}</span>

                <template v-if="puedeAutorizarDescuento && descuentoEstadoOriginal === 'pendiente'">
                  <button type="button" class="btn btn-success btn-sm" :disabled="autorizando" @click="autorizarDescuento(true)">Aprobar</button>
                  <button type="button" class="btn btn-danger btn-sm" :disabled="autorizando" @click="autorizarDescuento(false)">Rechazar</button>
                </template>
              </div>
            </div>

            <div class="form-group" style="grid-column: span 2;">
              <label>Total OT (Cliente + Garantía{{ tieneBonificacion ? ' − Bonificación' : '' }})</label>
              <input type="text" :value="formatCurrency((form.monto_repuestos || 0) + (form.monto_mano_obra || 0) + (form.monto_repuestos_garantia || 0) + (form.monto_mano_obra_garantia || 0) - (tieneBonificacion ? montoDescuentoCalculado : 0))" readonly style="background: var(--border-soft); font-weight: bold; font-size: 1.1rem; color: var(--primary);" />
            </div>
          </div>
          <button type="submit" class="btn btn-success mt-15 w-100" :disabled="guardando">
            {{ guardando ? 'Guardando...' : 'Guardar Cabecera' }}
          </button>
        </form>

        <!-- PESTAÑA 2: CARGOS Y REPUESTOS -->
        <div v-if="subTab === 'cargos'">
          <div class="table-wrapper mb-20">
            <table>
              <thead>
                <tr>
                  <th>Ítem / Descripción</th>
                  <th>Tipo</th>
                  <th>Cant.</th>
                  <th>Venta Unit.</th>
                  <th>Subtotal</th>
                  <th>Garantía</th>
                </tr>
              </thead>
              <tbody>
                <tr v-if="cargos.length === 0">
                  <td colspan="6" class="empty-state">No se han cargado repuestos ni gastos a esta OT.</td>
                </tr>
                <tr v-for="c in cargos" :key="c.id" :class="{'fila-garantia': c.es_garantia}">
                  <td>
                    <strong>{{ c.descripcion_cargo }}</strong>
                    <div style="font-size: 0.75rem; color: var(--text-soft);">{{ c.np_referencia || c.nro_factura_tercero || 'Sin ref.' }} | Cargado por: {{ c.mecanico_nombre }}</div>
                  </td>
                  <td><span class="badge-sm">{{ c.tipo_cargo.replace('_', ' ') }}</span></td>
                  <td>{{ c.cantidad }}</td>
                  <td>{{ formatCurrency(c.precio_venta_unitario) }}</td>
                  <td><strong>{{ formatCurrency(c.cantidad * c.precio_venta_unitario) }}</strong></td>
                  <td>{{ c.es_garantia ? 'Sí' : 'No' }}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <hr class="divider" />
          
          <h3 style="margin-bottom: 15px;">Añadir Nuevo Cargo</h3>
          <form @submit.prevent="agregarCargo" class="cargo-form">
            <div class="form-grid" style="grid-template-columns: repeat(3, 1fr);">
              
              <div class="form-group">
                <label>Tipo de Cargo *</label>
                <select v-model="nuevoCargo.tipo_cargo" required>
                  <option value="Catalogo">Repuesto de Pañol</option>
                  <option value="Compra_Directa">Compra Directa (Ferretería, etc.)</option>
                  <option value="Servicio_Tercero">Servicio Tercerizado (Lavadero, Tornería)</option>
                </select>
              </div>

              <div class="form-group" style="grid-column: span 2;" v-if="nuevoCargo.tipo_cargo === 'Catalogo'">
                <label>Buscar Repuesto en Catálogo *</label>
                <!-- CAMBIO: Agregamos @change="alSeleccionarRepuesto" -->
                <select v-model="nuevoCargo.catalogo_id" @change="alSeleccionarRepuesto" required>
                  <option value="" disabled>Seleccione un repuesto...</option>
                  <option v-for="r in catalogoRepuestos" :key="r.id" :value="r.id">
                    {{ r.np }} - {{ r.descripcion }} (Stock: {{ r.stock_actual }} | Venta: {{ formatCurrency(r.precio_venta_actual) }})
                  </option>
                </select>
              </div>

              <div class="form-group" style="grid-column: span 2;" v-else>
                <label>Descripción del Cargo *</label>
                <input type="text" v-model="nuevoCargo.descripcion_cargo" placeholder="Ej: Lavado de motor, O-ring 5mm..." required />
              </div>

              <div class="form-group">
                <label>Cantidad *</label>
                <input type="number" step="0.1" min="0.1" v-model="nuevoCargo.cantidad" required />
              </div>

              <!-- CAMBIO: Este input ahora se muestra siempre, sin importar el tipo_cargo -->
              <div class="form-group">
                <label>Precio a cobrar al cliente (Unitario $) *</label>
                <input type="number" step="0.01" min="0" v-model="nuevoCargo.precio_venta_unitario" title="Modificá el precio sugerido según método de pago o cliente" required />
              </div>

              <template v-if="nuevoCargo.tipo_cargo !== 'Catalogo'">
                <div class="form-group">
                  <label>Costo de Compra ($) *</label>
                  <input type="number" step="0.01" min="0" v-model="nuevoCargo.costo_interno_total" title="Lo que pagaste por el total de esto" required />
                </div>
                <div class="form-group">
                  <label>Factura/Ticket (Ref)</label>
                  <input type="text" v-model="nuevoCargo.nro_factura_tercero" placeholder="Nro comprobante" />
                </div>
              </template>

              <div class="form-group" style="display: flex; flex-direction: row; align-items: center; gap: 8px; margin-top: 25px;">
                <input type="checkbox" v-model="nuevoCargo.es_garantia" style="width: 18px; height: 18px;" />
                <label style="margin: 0; cursor: pointer;">Cubierto por Garantía</label>
              </div>

            </div>
            
            <button type="submit" class="btn btn-primary w-100 mt-10" :disabled="agregandoCargo">
              {{ agregandoCargo ? 'Registrando...' : 'Añadir Cargo a la OT' }}
            </button>
          </form>
        </div>

      </div>
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
const agregandoCargo = ref(false)
const esFinalizada = ref(false)
const subTab = ref('datos')

// Datos Generales
const form = ref({ 
  cliente: '', patente: '', unidad: '', kilometraje: '', fecha_apertura: '', fecha_cierre: '',
  tiempo_asignado_horas: 0, tiempo_facturado_horas: 0, es_garantia: 0, es_no_iveco: 0,
  monto_repuestos: 0, monto_mano_obra: 0, monto_repuestos_garantia: 0, monto_mano_obra_garantia: 0
})

// Descuentos
const tieneBonificacion = ref(false)
const porcentajeDescuento = ref(0)
const descuentoMotivo = ref('')
const descuentoEstadoOriginal = ref('ninguno')
const descuentoAutorizadoPor = ref('')

const puedeAutorizarDescuento = computed(() => (authStore.usuario?.permisos || []).includes('ot_autorizar_descuento'))
const montoDescuentoCalculado = computed(() => {
  const subtotal = (Number(form.value.monto_repuestos) || 0) + (Number(form.value.monto_mano_obra) || 0)
  return Math.round(subtotal * ((Number(porcentajeDescuento.value) || 0) / 100) * 100) / 100
})
const etiquetaEstadoDescuento = computed(() => ({ ninguno: 'Sin autorizar', pendiente: 'Pendiente de autorización', autorizado: 'Autorizado', rechazado: 'Rechazado' }[descuentoEstadoOriginal.value] || descuentoEstadoOriginal.value))

// Cargos y Repuestos
const cargos = ref([])
const catalogoRepuestos = ref([])
const nuevoCargoBase = { tipo_cargo: 'Catalogo', catalogo_id: '', descripcion_cargo: '', cantidad: 1, costo_interno_total: 0, precio_venta_unitario: 0, es_garantia: false, nro_factura_tercero: '' }
const nuevoCargo = ref({ ...nuevoCargoBase })

const formatCurrency = (val) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(val || 0)
const parseNum = (val) => { const num = Number(String(val || 0).replace(',', '.')); return isNaN(num) ? 0 : num; }
const formatForInput = (d) => d ? d.replace(' ', 'T').slice(0, 16) : ''

const cargarOT = async () => {
  try {
    const data = await fetchJSON(`/ordenes/${props.otId}`)
    esFinalizada.value = data.estado_actual === 'Finalizada'
    
    form.value = {
      ...data,
      fecha_apertura: formatForInput(data.fecha_apertura),
      fecha_cierre: formatForInput(data.fecha_cierre),
      tiempo_asignado_horas: parseNum(data.tiempo_asignado_horas),
      tiempo_facturado_horas: parseNum(data.tiempo_facturado_horas),
      es_garantia: data.es_garantia ? 1 : 0,
      es_no_iveco: data.es_no_iveco ? 1 : 0,
      monto_repuestos: parseNum(data.monto_repuestos),
      monto_mano_obra: parseNum(data.monto_mano_obra),
      monto_repuestos_garantia: parseNum(data.monto_repuestos_garantia),
      monto_mano_obra_garantia: parseNum(data.monto_mano_obra_garantia)
    }

    const mDesc = parseNum(data.monto_descuento)
    tieneBonificacion.value = mDesc > 0
    descuentoMotivo.value = data.descuento_motivo || ''
    descuentoEstadoOriginal.value = data.descuento_estado || 'ninguno'
    descuentoAutorizadoPor.value = data.descuento_autorizado_por || ''
    
    const subtotalActual = form.value.monto_repuestos + form.value.monto_mano_obra
    porcentajeDescuento.value = subtotalActual > 0 ? Math.round((mDesc / subtotalActual) * 10000) / 100 : 0
  } catch (err) { toast.error('Error cargando OT: ' + errMsg(err)) }
}

const cargarCargosYCatalogo = async () => {
  try {
    const [resCargos, resCatalogo] = await Promise.all([
      fetchJSON(`/ordenes/${props.otId}/cargos`),
      fetchJSON('/repuestos')
    ])
    cargos.value = resCargos
    catalogoRepuestos.value = resCatalogo
  } catch (err) { toast.error('Error al obtener lista de cargos: ' + errMsg(err)) }
}

onMounted(async () => {
  loading.value = true
  await cargarOT()
  await cargarCargosYCatalogo()
  loading.value = false
})

const guardarCambios = async () => {
  if (tieneBonificacion.value && !descuentoMotivo.value.trim()) return toast.error('Indicá el motivo de la bonificación')
  guardando.value = true
  try {
    const payload = { 
      ...form.value, 
      patente: form.value.patente.replace(/[^a-zA-Z0-9]/g, '').toUpperCase(),
      fecha_apertura: form.value.fecha_apertura ? form.value.fecha_apertura.replace('T', ' ') : undefined,
      fecha_cierre: form.value.fecha_cierre ? form.value.fecha_cierre.replace('T', ' ') : undefined,
      monto_mano_obra: parseNum(form.value.monto_mano_obra),
      monto_mano_obra_garantia: form.value.es_garantia === 1 ? parseNum(form.value.monto_mano_obra_garantia) : 0,
      monto_descuento: tieneBonificacion.value ? montoDescuentoCalculado.value : 0,
      descuento_motivo: tieneBonificacion.value ? descuentoMotivo.value.trim() : ''
    }
    // No enviamos monto_repuestos porque el backend lo autocalcula, pero enviarlo no rompe nada
    await fetchJSON(`/ordenes/${props.otId}`, { method: 'PUT', body: JSON.stringify(payload) })
    toast.success('Cabecera actualizada')
    emit('updated')
  } catch (err) { toast.error('Error al guardar: ' + errMsg(err)) } 
  finally { guardando.value = false }
}

const agregarCargo = async () => {
  agregandoCargo.value = true
  try {
    await fetchJSON(`/ordenes/${props.otId}/cargos`, { method: 'POST', body: JSON.stringify(nuevoCargo.value) })
    toast.success('Ítem agregado a la OT')
    nuevoCargo.value = { ...nuevoCargoBase }
    await cargarCargosYCatalogo() // Recarga la tabla de ítems
    await cargarOT() // Recarga la cabecera (para actualizar monto_repuestos)
    emit('updated') // Avisa al componente padre para refrescar la tabla global
  } catch (err) { toast.error(errMsg(err)) }
  finally { agregandoCargo.value = false }
}

const autorizarDescuento = async (aprobado) => {
  autorizando.value = true
  try {
    await fetchJSON(`/ordenes/${props.otId}/descuento/autorizar`, { method: 'PUT', body: JSON.stringify({ aprobado }) })
    descuentoEstadoOriginal.value = aprobado ? 'autorizado' : 'rechazado'
    descuentoAutorizadoPor.value = authStore.usuario?.legajo || authStore.usuario?.nombre || ''
    toast.success(aprobado ? 'Descuento autorizado' : 'Descuento rechazado')
    emit('updated')
  } catch (err) { toast.error(errMsg(err)) }
  finally { autorizando.value = false }
}

const alSeleccionarRepuesto = () => {
  const repuestoElegido = catalogoRepuestos.value.find(r => r.id === nuevoCargo.value.catalogo_id);
  if (repuestoElegido) {
    nuevoCargo.value.precio_venta_unitario = repuestoElegido.precio_venta_actual;
  }
}

</script>

<style scoped>
.modal-large { max-width: 900px; }
.modal-tabs { display: flex; gap: 10px; border-bottom: 2px solid var(--border-soft); }
.tab-btn { background: transparent; border: none; padding: 10px 20px; font-weight: 600; color: var(--muted); cursor: pointer; border-bottom: 3px solid transparent; margin-bottom: -2px; }
.tab-btn:hover { color: var(--primary); }
.tab-btn.active { color: var(--primary); border-bottom-color: var(--primary); }

.cargo-form { background: var(--hover-row); padding: 15px; border-radius: var(--radius-sm); border: 1px solid var(--border-soft); }
.fila-garantia td { background-color: var(--warning-light); color: var(--warning); }
.divider { border: 0; border-top: 1px dashed var(--border); margin: 25px 0; }

.badge-descuento { display: inline-block; padding: 2px 10px; border-radius: 12px; font-size: 0.8rem; font-weight: 600; }
.badge-descuento.estado-pendiente { background: var(--status-urgente-bg); color: var(--status-urgente-text); }
.badge-descuento.estado-autorizado { background: var(--status-progress-bg); color: var(--status-progress-text); }
.badge-descuento.estado-rechazado { background: var(--status-danger-bg); color: var(--status-danger-text); }
.badge-descuento.estado-ninguno { background: var(--border-soft); color: var(--text-soft); }
</style>