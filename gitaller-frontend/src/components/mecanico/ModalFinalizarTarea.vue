<template>
  <div class="modal-overlay" @click.self="$emit('close')">
    <div class="modal-content">
      <button class="close-btn" @click="$emit('close')">&times;</button>
      <h2>{{ modoInformar ? 'Informar Tarea' : 'Finalizar Tarea' }}</h2>
      
      <div v-if="loading" class="loading-state"><div class="spinner"></div>Cargando datos...</div>
      <form v-else @submit.prevent="$emit('confirm', form)">
        <!-- Solo aparece si hay otro mecánico en la actividad que va a escribir el aporte -->
        <label v-if="puedeSerAuxiliar" class="auxiliar-check">
          <input type="checkbox" v-model="form.esAuxiliar" />
          <span><strong>Fui auxiliar en esta tarea</strong> — mi compañero escribe el aporte; mi tiempo igual queda registrado.</span>
        </label>

        <div class="form-group mb-15">
          <label>Causa del desperfecto <span v-if="!form.esAuxiliar">*</span> <span style="color:var(--primary); font-weight:normal;">(Compartida en toda la OT)</span></label>
          <textarea v-model="form.causa" rows="3" class="form-control" :required="!form.esAuxiliar" placeholder="Describa el origen del problema..."></textarea>
        </div>
        <div v-if="!form.esAuxiliar" class="form-group mb-15">
          <label>Reparación realizada * <span style="color:var(--primary); font-weight:normal;">(Tu aporte individual)</span></label>
          <textarea v-model="form.reparacion" rows="3" class="form-control" required placeholder="Describa el trabajo que ejecutaste..."></textarea>
        </div>
        <button type="submit" class="btn btn-success w-100 mt-10">
          {{ form.esAuxiliar ? 'Finalizar como auxiliar' : `Guardar y ${modoInformar ? 'Enviar Informe' : 'Finalizar'}` }}
        </button>
      </form>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useApi } from '../../composables/useApi'

const props = defineProps({ 
  otId: { type: String, required: true }, 
  modoInformar: { type: Boolean, default: false },
  // true si hay al menos otro mecánico en la actividad que NO es auxiliar
  puedeSerAuxiliar: { type: Boolean, default: false }
})
const emit = defineEmits(['close', 'confirm'])
const { fetchJSON } = useApi()

const form = ref({ causa: '', reparacion: '', esAuxiliar: false })
const loading = ref(true)

onMounted(async () => {
  try {
    const data = await fetchJSON(`/ordenes/${props.otId}/explicacion`)
    if (data && data.explicacion && data.explicacion.causa) {
      form.value.causa = data.explicacion.causa
    }
  } catch (e) {
    console.error('Error cargando causa previa', e)
  } finally {
    loading.value = false
  }
})
</script>

<style scoped>
.mb-15 { margin-bottom: 15px; }
.auxiliar-check {
  display: flex; gap: 10px; align-items: flex-start; cursor: pointer;
  background: var(--border-soft); border: 1px solid var(--border); border-radius: 6px;
  padding: 10px; margin-bottom: 15px; font-size: 0.9rem;
}
.auxiliar-check input { width: 18px; height: 18px; margin-top: 2px; flex-shrink: 0; }
</style>