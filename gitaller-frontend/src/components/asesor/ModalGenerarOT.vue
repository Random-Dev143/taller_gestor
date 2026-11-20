<template>
  <div class="modal-overlay" @click.self="$emit('close')">
    <div class="modal-content">
      <button class="close-btn" @click="$emit('close')">&times;</button>
      <h2>Generar OT desde el turno</h2>

      <div class="resumen">
        <div><strong>{{ turno.cliente }}</strong></div>
        <div><span class="patente">{{ turno.patente }}</span> {{ turno.unidad }}</div>
        <div class="sub">
          {{ tipoTexto }} · {{ turno.horas_estimadas || 0 }} h estimadas
          <template v-if="turno.estado === 'sin_confirmar'"> · <strong class="sin-conf">el cliente no confirmó el turno</strong></template>
        </div>
        <div class="sub">El resto de los datos se completa automáticamente con lo cargado en el turno.</div>
      </div>

      <form @submit.prevent="generar">
        <div class="form-grid">
          <div class="form-group">
            <label>Número de OT *</label>
            <input type="text" v-model="form.ot" required />
            <small class="sub">Sugerido: último número + 1. Podés cambiarlo.</small>
          </div>
          <div class="form-group">
            <label>Kilometraje exacto *</label>
            <input type="text" inputmode="numeric" v-model="form.kilometraje" required placeholder="Ej: 45000" />
            <small v-if="turno.km_estimado" class="sub">Estimado al dar el turno: {{ turno.km_estimado }} km</small>
          </div>
          <div class="form-group">
            <label>Asesor (legajo) *</label>
            <input type="text" v-model="form.asesor_legajo" required />
          </div>
          <div class="form-group">
            <label>¿Es otra marca (no Iveco)?</label>
            <select v-model="form.es_no_iveco">
              <option :value="0">No (es Iveco)</option>
              <option :value="1">Sí (otra marca)</option>
            </select>
          </div>
          <div v-if="turno.tipo === 'retrabajo'" class="form-group" style="grid-column: span 2;">
            <label>OT original del trabajo que se repite <small class="sub">(opcional)</small></label>
            <input type="text" v-model="form.ot_retrabajo_origen" placeholder="Ej: 12345" />
          </div>
        </div>

        <p v-if="advertenciaKm" class="aviso">{{ advertenciaKm }}</p>

        <div style="display: flex; gap: 10px; margin-top: 12px;">
          <button type="submit" class="btn btn-success" :disabled="enviando">{{ enviando ? 'Creando...' : 'Crear OT' }}</button>
          <button type="button" class="btn btn-secondary" @click="$emit('close')">Cancelar</button>
        </div>
      </form>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useApi } from '../../composables/useApi'
import { useToast, errMsg } from '../../composables/useToast'
import { useAuthStore } from '../../stores/useAuthStore'

const props = defineProps({ turno: { type: Object, required: true } })
const emit = defineEmits(['close', 'creada'])
const { fetchJSON } = useApi()
const toast = useToast()
const authStore = useAuthStore()

const form = ref({
  ot: '',
  kilometraje: props.turno.km_estimado ? String(props.turno.km_estimado) : '',
  asesor_legajo: props.turno.asesor_legajo || authStore.usuario?.legajo || '',
  es_no_iveco: 0,
  ot_retrabajo_origen: ''
})
const ultimo = ref({ km: null, ot: null })
const enviando = ref(false)

const tipoTexto = computed(() => ({ normal: 'Turno normal', garantia: 'Garantía', retrabajo: 'Retrabajo' }[props.turno.tipo] || props.turno.tipo))

// Advertencia (no bloquea): el km nuevo es menor al último registrado de esa unidad.
const advertenciaKm = computed(() => {
  const km = parseInt(String(form.value.kilometraje).replace(/[^\d]/g, ''), 10)
  if (!km || ultimo.value.km === null || km >= ultimo.value.km) return ''
  return `Atención: el último kilometraje registrado de esta unidad es ${ultimo.value.km.toLocaleString('es-AR')} km (OT ${ultimo.value.ot}). Si el valor ingresado es correcto, podés continuar igual.`
})

onMounted(async () => {
  try { form.value.ot = (await fetchJSON('/turnos/siguiente-ot')).siguiente } catch (e) { /* queda vacío */ }
  try { ultimo.value = await fetchJSON(`/turnos/ultimo-km/${encodeURIComponent(props.turno.patente)}`) } catch (e) { /* sin referencia */ }
})

const generar = async () => {
  enviando.value = true
  try {
    const r = await fetchJSON(`/turnos/${props.turno.id}/generar-ot`, { method: 'POST', body: JSON.stringify(form.value) })
    toast.success(`OT ${r.ot} creada desde el turno`)
    emit('creada', r.ot)
  } catch (err) { toast.error(errMsg(err)) }
  finally { enviando.value = false }
}
</script>

<style scoped>
.resumen { background: var(--border-soft); border: 1px solid var(--border); border-radius: 8px; padding: 10px 14px; margin: 10px 0 14px; display: grid; gap: 2px; }
.sub { font-size: 0.82rem; color: var(--text-soft); }
.sin-conf { color: var(--warning); }
.patente { background: #fff; color: #111; border: 1px solid #111; padding: 0 6px; border-radius: 5px; font-family: monospace; font-weight: 700; margin-right: 6px; }
.aviso { margin: 10px 0 0; padding: 8px 12px; border-radius: 6px; font-size: 0.88rem; background: var(--warning-light); border: 1px solid var(--warning); color: var(--text); }
</style>
