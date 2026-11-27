<template>
  <div class="modal-overlay" @click.self="$emit('close')">
    <div class="modal-content modal-large">
      <button class="close-btn" @click="$emit('close')">&times;</button>
      <h2>{{ esEdicion ? 'Modificar turno' : 'Nuevo turno' }}</h2>

      <form @submit.prevent="guardar">
        <div class="form-grid">
          <div class="form-group">
            <label>Fecha y hora *</label>
            <input type="datetime-local" v-model="form.fecha_hora" required @change="revisarCapacidad" />
          </div>
          <div class="form-group">
            <label>Tipo de turno</label>
            <select v-model="form.tipo" @change="revisarCapacidad">
              <option value="normal">Normal</option>
              <option value="garantia">Garantía (prioridad)</option>
              <option value="retrabajo">Retrabajo (prioridad)</option>
            </select>
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
                <strong>{{ c.nombre }}</strong> <span class="sub">{{ c.telefono || '' }}</span>
              </li>
            </ul>
          </div>

          <div class="form-group">
            <label>Vehículos del cliente</label>
            <select v-model="unidadElegida" :disabled="unidadesCliente.length === 0" @change="onElegirUnidad($event.target.value)">
              <option value="">{{ unidadesCliente.length === 0 ? '— Elegí un cliente de la lista —' : `— ${unidadesCliente.length} vehículo(s) registrados —` }}</option>
              <option v-for="u in unidadesCliente" :key="u.patente" :value="u.patente">{{ u.patente }} · {{ $modelo(u.unidad) }}</option>
            </select>
          </div>
          <div class="form-group">
            <label>Unidad *</label>
            <input type="text" v-model="form.unidad" required />
          </div>

          <div class="form-group">
            <label>Nombre del contacto</label>
            <input type="text" v-model="form.contacto_nombre" />
          </div>
          <div class="form-group">
            <label>Teléfono</label>
            <input type="tel" v-model="form.telefono" placeholder="Ej: +54 9 11 2233-4455" />
          </div>
          <div class="form-group">
            <label>Correo</label>
            <input type="email" v-model="form.correo" />
          </div>
          <div class="form-group">
            <label>Chasis <small class="sub">(se puede completar después)</small></label>
            <input type="text" v-model="form.chasis" />
          </div>

          <div class="form-group">
            <label>Horas estimadas</label>
            <input type="number" step="0.5" min="0" v-model.number="form.horas_estimadas" @input="revisarCapacidad" />
          </div>
          <div class="form-group">
            <label>Kilometraje estimado <small class="sub">(opcional)</small></label>
            <input type="text" inputmode="numeric" v-model="form.km_estimado" placeholder="Ej: 45000" />
          </div>

          <div class="form-group" style="grid-column: span 2;">
            <label>Motivo del turno</label>
            <textarea v-model="form.motivo" rows="2" class="form-control" placeholder="Ej: Service de 40.000 km + ruido en tren delantero"></textarea>
          </div>
        </div>

        <p v-if="sinConfirmacion" class="aviso aviso--info">
          Se otorga con 1 día o menos de antelación: <strong>no necesita confirmación</strong> y queda confirmado.
        </p>
        <p v-if="avisoCapacidad" class="aviso" :class="avisoCapacidad.nivel === 'alerta' ? 'aviso--alerta' : 'aviso--info'">{{ avisoCapacidad.texto }}</p>

        <div style="display: flex; gap: 10px; margin-top: 12px;">
          <button type="submit" class="btn btn-success" :disabled="enviando">{{ enviando ? 'Guardando...' : (esEdicion ? 'Guardar cambios' : 'Programar turno') }}</button>
          <button type="button" class="btn btn-secondary" @click="$emit('close')">Cancelar</button>
        </div>
      </form>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { useApi } from '../../composables/useApi'
import { useToast, errMsg } from '../../composables/useToast'
import { utcAInputLocal, fechaParaGuardar } from '../../utils/fechas'

const props = defineProps({ turno: { type: Object, default: null } })
const emit = defineEmits(['close', 'guardado'])
const { fetchJSON } = useApi()
const toast = useToast()

const esEdicion = computed(() => !!props.turno)
const t = props.turno || {}
const form = ref({
  fecha_hora: utcAInputLocal(t.fecha_hora) || '',
  tipo: t.tipo || 'normal',
  patente: t.patente || '', cliente: t.cliente || '', unidad: t.unidad || '', chasis: t.chasis || '',
  contacto_nombre: t.contacto_nombre || '', telefono: t.telefono || '', correo: t.correo || '',
  horas_estimadas: t.horas_estimadas || 0, km_estimado: t.km_estimado ?? '', motivo: t.motivo || ''
})
const enviando = ref(false)
const clientesSugeridos = ref([])
const unidadesCliente = ref([])
const unidadElegida = ref('')
const avisoCapacidad = ref(null)
let searchTimeout = null

const normalizarPatente = (p) => p.replace(/[^a-zA-Z0-9]/g, '').toUpperCase()

// Mismo criterio que el backend: 1 día o menos de antelación = sin confirmación.
const sinConfirmacion = computed(() => {
  if (!form.value.fecha_hora) return false
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0)
  const dia = new Date(form.value.fecha_hora); dia.setHours(0, 0, 0, 0)
  return Math.round((dia - hoy) / 86400000) <= 1
})

const buscarPatente = async () => {
  form.value.patente = normalizarPatente(form.value.patente)
  if (form.value.patente.length < 3) return
  try {
    const u = await fetchJSON(`/unidades/${encodeURIComponent(form.value.patente)}`)
    if (u) {
      form.value.cliente = u.cliente || form.value.cliente
      form.value.unidad = u.unidad || form.value.unidad
      if (!form.value.telefono) form.value.telefono = u.telefono || ''
      if (!form.value.correo) form.value.correo = u.correo || ''
      if (!form.value.contacto_nombre) form.value.contacto_nombre = [u.contacto_nombre, u.contacto_apellido].filter(Boolean).join(' ')
      if (!form.value.chasis) form.value.chasis = u.chasis || ''
      toast.info(`Datos autocompletados para ${form.value.patente}`, 2500)
    }
  } catch (err) { /* patente nueva: se completa a mano */ }
}

const buscarClientes = () => {
  form.value.cliente = form.value.cliente.toUpperCase()
  unidadesCliente.value = []
  unidadElegida.value = ''
  clearTimeout(searchTimeout)
  if (form.value.cliente.length < 2) { clientesSugeridos.value = []; return }
  searchTimeout = setTimeout(async () => {
    try { clientesSugeridos.value = await fetchJSON(`/unidades/clientes/buscar?q=${encodeURIComponent(form.value.cliente)}`) } catch (e) { /* sin sugerencias */ }
  }, 300)
}

const seleccionarCliente = async (c) => {
  form.value.cliente = c.nombre
  if (!form.value.telefono && c.telefono) form.value.telefono = c.telefono
  clientesSugeridos.value = []
  try { unidadesCliente.value = await fetchJSON(`/unidades/cliente/${c.id}`) } catch (e) { unidadesCliente.value = [] }
}

const onElegirUnidad = (patente) => {
  const u = unidadesCliente.value.find(x => x.patente === patente)
  if (!u) return
  form.value.patente = u.patente
  form.value.unidad = u.unidad
  if (u.ultimo_kilometraje && !form.value.km_estimado) form.value.km_estimado = String(u.ultimo_kilometraje).replace(/[^\d]/g, '')
  if (!form.value.chasis) form.value.chasis = u.chasis || ''
}

// Aviso de capacidad del día: informativo, nunca bloquea.
const revisarCapacidad = async () => {
  avisoCapacidad.value = null
  if (!form.value.fecha_hora) return
  const dia = form.value.fecha_hora.slice(0, 10)
  try {
    const { dias } = await fetchJSON(`/turnos/capacidad?desde=${dia}&hasta=${dia}`)
    const d = dias[0]
    if (!d) return
    if (!d.abierto) { avisoCapacidad.value = { nivel: 'alerta', texto: 'Ese día el taller está cerrado (domingo, sábado sin atención o feriado).' }; return }
    if (form.value.tipo !== 'normal') {
      avisoCapacidad.value = { nivel: 'info', texto: 'Garantías y retrabajos tienen prioridad: se pueden dar como sobreturno.' }
      return
    }
    // Al editar, las horas de este mismo turno ya están sumadas en el día: se restan para no contarlas dos veces.
    const propias = esEdicion.value && props.turno.tipo === 'normal' && ['sin_confirmar', 'confirmado'].includes(props.turno.estado) && utcAInputLocal(props.turno.fecha_hora).slice(0, 10) === dia ? (props.turno.horas_estimadas || 0) : 0
    const total = d.horas_comprometidas - propias + (Number(form.value.horas_estimadas) || 0)
    if (total > d.horas_disponibles) {
      avisoCapacidad.value = { nivel: 'alerta', texto: `Ese día ya hay ${d.horas_comprometidas} h de turnos sobre ${d.horas_disponibles} h disponibles. Podés darlo igual.` }
    } else {
      avisoCapacidad.value = { nivel: 'info', texto: `Ese día: ${d.horas_comprometidas} h de turnos sobre ${d.horas_disponibles} h disponibles.` }
    }
  } catch (e) { /* el aviso es opcional */ }
}

const guardar = async () => {
  enviando.value = true
  try {
    const payload = { ...form.value, patente: normalizarPatente(form.value.patente) }
    payload.fecha_hora = esEdicion.value
      ? fechaParaGuardar(form.value.fecha_hora, props.turno.fecha_hora)
      : new Date(form.value.fecha_hora).toISOString()
    if (esEdicion.value) {
      await fetchJSON(`/turnos/${props.turno.id}`, { method: 'PUT', body: JSON.stringify(payload) })
      toast.success('Turno actualizado')
    } else {
      const r = await fetchJSON('/turnos', { method: 'POST', body: JSON.stringify(payload) })
      toast.success(r.estado === 'confirmado' ? 'Turno programado (no necesita confirmación)' : 'Turno programado: queda sin confirmar')
    }
    emit('guardado')
  } catch (err) { toast.error(errMsg(err)) }
  finally { enviando.value = false }
}

watch(() => form.value.patente, (p) => { if (unidadElegida.value && p !== unidadElegida.value) unidadElegida.value = '' })
if (esEdicion.value) revisarCapacidad()
</script>

<style scoped>
.sub { font-size: 0.8rem; color: var(--text-soft); font-weight: normal; }
.autocomplete-list {
  position: absolute; top: 100%; left: 0; right: 0;
  background: var(--surface); border: 1px solid var(--border); border-radius: 4px;
  box-shadow: var(--shadow-sm); list-style: none; padding: 0; margin: 4px 0 0 0;
  z-index: 1000; max-height: 180px; overflow-y: auto;
}
.autocomplete-list li { padding: 8px 12px; cursor: pointer; border-bottom: 1px solid var(--border-soft); display: flex; justify-content: space-between; }
.autocomplete-list li:hover { background: var(--primary-light); color: var(--primary-text); }
.aviso { margin: 10px 0 0; padding: 8px 12px; border-radius: 6px; font-size: 0.88rem; border: 1px solid var(--border); }
.aviso--info { background: var(--primary-light); color: var(--text); }
.aviso--alerta { background: var(--warning-light); border-color: var(--warning); color: var(--text); }
</style>
