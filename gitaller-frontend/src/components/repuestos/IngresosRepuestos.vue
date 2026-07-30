<template>
  <div class="card">
    <div class="header-row">
      <h2>Ingreso de Stock a Pañol</h2>
      <div style="display: flex; gap: 10px;">
        <button class="btn btn-outline btn-sm" disabled title="Próximamente: Importación masiva">📄 Importar Excel</button>
      </div>
    </div>

    <div class="ingreso-container mt-15">
      <div class="ingreso-form-box">
        <h3 style="margin-bottom: 15px; color: var(--primary);">Registrar Compra Manual</h3>
        
        <form @submit.prevent="registrarIngreso">
          <div class="form-group mb-15">
            <label>1. Seleccionar Material del Catálogo *</label>
            <select v-model="form.catalogo_id" required class="form-control select-list">
              <option value="" disabled>Seleccione la pieza que acaba de ingresar...</option>
              <option v-for="r in catalogo" :key="r.id" :value="r.id">
                NP: {{ r.np }} | {{ r.descripcion }} (Stock act: {{ r.stock_actual }})
              </option>
            </select>
          </div>

          <div class="form-grid">
            <div class="form-group">
              <label>2. Cantidad Recibida *</label>
              <input type="number" step="0.1" min="0.1" v-model="form.cantidad" required />
            </div>
            
            <div class="form-group">
              <label>3. Costo Unitario de Compra ($) *</label>
              <input type="number" step="0.01" min="0" v-model="form.costo_unitario" title="El valor real pagado por unidad en esta compra" required />
            </div>

            <div class="form-group" style="grid-column: span 2;">
              <label>4. Referencia / Nro Comprobante</label>
              <input type="text" v-model="form.referencia" placeholder="Ej: Factura A-0001-000456, Remito Proveedor X..." required />
            </div>
          </div>

          <div v-if="repuestoSeleccionado" class="preview-box">
            <h4>Resumen del Lote a generar:</h4>
            <p><strong>Ítem:</strong> {{ repuestoSeleccionado.descripcion }}</p>
            <p><strong>Costo Total Factura:</strong> <span class="highlight">{{ formatCurrency(form.cantidad * form.costo_unitario) }}</span></p>
            <p><strong>Nuevo Precio de Venta Sugerido:</strong> {{ formatCurrency(nuevoPrecioVentaSugerido) }} <span style="font-size: 0.8rem; color: var(--muted);">(calculado con margen del {{ repuestoSeleccionado.margen_ganancia }}%)</span></p>
          </div>

          <button type="submit" class="btn btn-success w-100 mt-15" :disabled="procesando || !form.catalogo_id">
            {{ procesando ? 'Procesando Lote y Kardex...' : 'Impactar Inventario' }}
          </button>
        </form>
      </div>

      <div class="ingreso-info-box">
        <h3>ℹ️ ¿Cómo impacta esto?</h3>
        <ul style="color: var(--text-soft); font-size: 0.9rem; line-height: 1.6; padding-left: 20px;">
          <li>Se generará un <strong>nuevo Lote</strong> físico en el sistema con la cantidad exacta que ingreses.</li>
          <li>El costo que declares aquí quedará <strong>congelado</strong> para este lote específico. Cuando se use en una OT, se descontará a este valor (Sistema FIFO).</li>
          <li>El Catálogo Maestro actualizará automáticamente su "Costo Actual" y recalculará el precio de venta al público en base a la configuración de la pieza.</li>
          <li>Se escribirá una línea inmutable en el Kardex para auditoría contable.</li>
        </ul>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useApi } from '../../composables/useApi'
import { useToast, errMsg } from '../../composables/useToast'

const { fetchJSON } = useApi()
const toast = useToast()

const catalogo = ref([])
const procesando = ref(false)

const formBase = { catalogo_id: '', cantidad: 1, costo_unitario: 0, referencia: '' }
const form = ref({ ...formBase })

const formatCurrency = (val) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(val || 0)

const repuestoSeleccionado = computed(() => {
  if (!form.value.catalogo_id) return null
  return catalogo.value.find(r => r.id === form.value.catalogo_id)
})

const nuevoPrecioVentaSugerido = computed(() => {
  if (!repuestoSeleccionado.value) return 0
  const costo = Number(form.value.costo_unitario) || 0
  const margen = Number(repuestoSeleccionado.value.margen_ganancia) || 0
  return costo * (1 + (margen / 100))
})

const cargarCatalogo = async () => {
  try {
    catalogo.value = await fetchJSON('/repuestos')
  } catch (err) {
    toast.error('Error cargando catálogo: ' + errMsg(err))
  }
}

onMounted(cargarCatalogo)

const registrarIngreso = async () => {
  procesando.value = true
  try {
    const payload = {
      cantidad: Number(form.value.cantidad),
      costo_unitario: Number(form.value.costo_unitario),
      referencia: form.value.referencia.trim()
    }
    
    await fetchJSON(`/repuestos/${form.value.catalogo_id}/ingreso`, {
      method: 'POST',
      body: JSON.stringify(payload)
    })
    
    toast.success('Stock ingresado y lote generado correctamente')
    form.value = { ...formBase }
    await cargarCatalogo() // Recargamos para actualizar los stocks en el desplegable
  } catch (err) {
    toast.error('Error al registrar ingreso: ' + errMsg(err))
  } finally {
    procesando.value = false
  }
}
</script>

<style scoped>
.header-row { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border-soft); padding-bottom: 15px; }
.header-row h2 { margin: 0; }

.ingreso-container {
  display: grid;
  grid-template-columns: 2fr 1fr;
  gap: 30px;
  align-items: start;
}

.ingreso-form-box {
  background: var(--surface);
  padding: 20px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
}

.ingreso-info-box {
  background: var(--hover-row);
  padding: 20px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-soft);
}

.select-list { font-size: 1rem; padding: 10px; }

.preview-box {
  background: var(--primary-light);
  padding: 15px;
  border-radius: var(--radius-sm);
  margin-top: 15px;
  border-left: 4px solid var(--primary);
}
.preview-box h4 { margin-top: 0; margin-bottom: 10px; color: var(--primary-dark); }
.preview-box p { margin: 5px 0; font-size: 0.95rem; }
.highlight { font-weight: bold; color: var(--primary); font-size: 1.1rem; }

@media (max-width: 800px) {
  .ingreso-container { grid-template-columns: 1fr; }
}
</style>