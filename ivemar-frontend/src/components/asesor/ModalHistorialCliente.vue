<template>
  <div class="modal-overlay" @click.self="$emit('close')">
    <div class="modal-content modal-large">
      <button class="close-btn" @click="$emit('close')">&times;</button>
      <h2>Historial de {{ patente }}</h2>
      <p class="text-muted mt-10" v-if="cliente">{{ cliente }} · {{ unidad }}</p>

      <div v-if="loading" class="loading-state"><div class="spinner"></div>Cargando historial...</div>
      <p v-else-if="historial.length === 0" class="empty-state">Esta unidad todavía no tiene OTs registradas.</p>
      <div v-else class="table-wrapper mt-15">
        <table>
          <thead>
            <tr>
              <th>OT</th><th>Apertura</th><th>Cierre</th><th>Estado</th><th>Garantía</th><th>Facturación</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="ot in historial" :key="ot.ot">
              <td><strong>{{ ot.ot }}</strong></td>
              <td>{{ formatFecha(ot.fecha_apertura) }}</td>
              <td>{{ ot.fecha_cierre ? formatFecha(ot.fecha_cierre) : '—' }}</td>
              <td><span :class="['status-tag', ot.estado_actual === 'Finalizada' ? 'status-done' : 'status-progress']">{{ ot.estado_actual }}</span></td>
              <td>{{ ot.es_garantia ? '✅' : '—' }}</td>
              <td><span class="highlight">{{ formatCurrency((ot.monto_repuestos || 0) + (ot.monto_mano_obra || 0)) }}</span></td>
            </tr>
          </tbody>
          <tfoot v-if="historial.length > 1">
            <tr>
              <td colspan="5" style="text-align: right;"><strong>Total histórico facturado:</strong></td>
              <td><strong>{{ formatCurrency(totalFacturado) }}</strong></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useApi } from '../../composables/useApi'
import { useToast, errMsg } from '../../composables/useToast'

const props = defineProps({
  patente: { type: String, required: true },
  cliente: { type: String, default: '' },
  unidad: { type: String, default: '' }
})
defineEmits(['close'])

const { fetchJSON } = useApi()
const toast = useToast()

const historial = ref([])
const loading = ref(true)

const formatCurrency = (val) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(val || 0)
const formatFecha = (f) => f ? new Date(f).toLocaleDateString('es-AR') : '—'

const totalFacturado = computed(() =>
  historial.value.reduce((acc, ot) => acc + (ot.monto_repuestos || 0) + (ot.monto_mano_obra || 0), 0)
)

onMounted(async () => {
  try {
    historial.value = await fetchJSON(`/ordenes/historial/${encodeURIComponent(props.patente)}`)
  } catch (err) {
    toast.error('Error cargando historial: ' + errMsg(err))
  } finally {
    loading.value = false
  }
})
</script>

<style scoped>
.status-tag { font-size: 0.8rem; font-weight: 700; padding: 3px 10px; border-radius: 20px; }
.status-progress { background: #d4edda; color: #155724; }
.status-done { background: #cfe2ff; color: #084298; }
.highlight { color: var(--primary); font-weight: bold; }
</style>
