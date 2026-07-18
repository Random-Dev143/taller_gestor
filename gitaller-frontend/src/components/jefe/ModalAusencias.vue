<template>
  <div class="modal-overlay" @click.self="$emit('close')">
    <div class="modal-content" style="max-width: 500px;">
      <button class="close-btn" @click="$emit('close')">&times;</button>
      <h2>Días sin registro - {{ mecanico?.nombre }}</h2>

      <p class="chart-hint" v-if="dias.length === 0">No hay días hábiles sin actividad en este período.</p>

      <ul class="ausencias-list" v-else>
        <li v-for="d in dias" :key="d.fecha" class="ausencia-item">
          <div class="ausencia-row">
            <strong>{{ formatFecha(d.fecha) }}</strong>
            <span v-if="d.motivo" class="badge bg-success">{{ d.motivo }}</span>
            <span v-else class="badge bg-danger">Sin justificar</span>
            <button v-if="editando !== d.fecha" class="btn btn-secondary btn-sm" @click="abrirForm(d)">
              {{ d.motivo ? 'Editar' : 'Justificar' }}
            </button>
          </div>

          <form v-if="editando === d.fecha" class="form-inline" @submit.prevent="guardar(d)">
            <input
              v-model="form.motivo"
              list="motivos-comunes"
              placeholder="Motivo (Franco, Permiso, Vacaciones...)"
              required
            />
            <datalist id="motivos-comunes">
              <option value="Franco" />
              <option value="Permiso" />
              <option value="Vacaciones" />
              <option value="Enfermedad" />
              <option value="Falta injustificada" />
            </datalist>
            <input
              type="number"
              v-model="form.horas_descontadas"
              step="0.5"
              min="0"
              title="Horas a descontar de la exigencia de ese día"
            />
            <button type="submit" class="btn btn-success btn-sm" :disabled="guardando">Guardar</button>
            <button type="button" class="btn btn-secondary btn-sm" @click="editando = null">Cancelar</button>
          </form>
        </li>
      </ul>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useApi } from '../../composables/useApi'
import { useToast, errMsg } from '../../composables/useToast'

const props = defineProps({ mecanico: { type: Object, default: null } })
const emit = defineEmits(['close', 'justificado'])

const { fetchJSON } = useApi()
const toast = useToast()

const dias = computed(() => props.mecanico?.dias_ausentes || [])
const editando = ref(null)
const guardando = ref(false)
const form = ref({ motivo: '', horas_descontadas: 10 })

const horasPorDefecto = (fecha) => (new Date(fecha + 'T12:00:00Z').getDay() === 6 ? 5 : 10)

const abrirForm = (d) => {
  editando.value = d.fecha
  form.value = { motivo: d.motivo || '', horas_descontadas: horasPorDefecto(d.fecha) }
}

const formatFecha = (f) =>
  new Date(f + 'T12:00:00Z').toLocaleDateString('es-AR', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' })

const guardar = async (d) => {
  guardando.value = true
  try {
    // Si ya había una excepción para ese día, la reemplazamos en vez de duplicarla
    if (d.excepcion_id) {
      await fetchJSON(`/legajos/excepciones/${d.excepcion_id}`, { method: 'DELETE' })
    }
    await fetchJSON('/legajos/excepciones', {
      method: 'POST',
      body: JSON.stringify({
        legajo: props.mecanico.legajo,
        fecha: d.fecha,
        motivo: form.value.motivo,
        horas_descontadas: Number(form.value.horas_descontadas) || 0
      })
    })
    toast.success(`Día ${d.fecha} justificado`)
    editando.value = null
    emit('justificado')
  } catch (err) {
    toast.error(errMsg(err))
  } finally {
    guardando.value = false
  }
}
</script>

<style scoped>
.ausencias-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 10px; max-height: 60vh; overflow-y: auto; }
.ausencia-item { padding: 10px; border: 1px solid var(--border-soft); border-radius: var(--radius); }
.ausencia-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.ausencia-row strong { min-width: 120px; }
.form-inline { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; margin-top: 10px; }
.form-inline input:not([type="number"]) { flex: 1; min-width: 180px; }
.form-inline input[type="number"] { width: 75px; }
.badge { padding: 3px 9px; border-radius: 12px; color: white; font-weight: 600; font-size: 0.78rem; }
.bg-success { background: #1d8a4f; }
.bg-danger { background: #b22234; }
.chart-hint { font-size: 0.85rem; color: var(--muted); }
</style>