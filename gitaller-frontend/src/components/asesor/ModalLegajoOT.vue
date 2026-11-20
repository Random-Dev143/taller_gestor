<template>
  <div class="modal-overlay" @click.self="$emit('close')">
    <div class="modal-content modal-large">
      <button class="close-btn" @click="$emit('close')">&times;</button>
      <h2>Legajo digital · OT {{ ot }}</h2>

      <div v-if="cargando" class="loading-state"><div class="spinner"></div>Cargando legajo...</div>
      <template v-else-if="legajo">
        <p class="text-muted">
          <span class="patente">{{ legajo.orden.patente }}</span> {{ legajo.orden.unidad }} · {{ legajo.orden.cliente }}
          <span v-if="legajo.orden.es_garantia" class="etiqueta">Garantía</span>
          <span v-if="legajo.orden.es_retrabajo" class="etiqueta etiqueta--warn">Retrabajo<template v-if="legajo.orden.ot_retrabajo_origen"> de la OT {{ legajo.orden.ot_retrabajo_origen }}</template></span>
        </p>

        <!-- 1. Turno y llamados de confirmación -->
        <section class="bloque">
          <h3>Turno y confirmación</h3>
          <p v-if="!legajo.turno" class="vacio">Esta OT no se originó en un turno (ingreso por mostrador).</p>
          <template v-else>
            <p>
              Turno del <strong>{{ fechaHora(legajo.turno.fecha_hora) }}</strong> · {{ tipoTurno(legajo.turno.tipo) }}
              <span v-if="legajo.turno.motivo"> · {{ legajo.turno.motivo }}</span>
            </p>
            <ul class="linea-tiempo">
              <li v-for="e in legajo.eventos" :key="e.id">
                <span class="cuando">{{ fechaHora(e.ts) }}</span>
                <span class="que"><strong>{{ nombreEvento(e.tipo) }}</strong><template v-if="e.detalle"> — {{ e.detalle }}</template></span>
                <span v-if="e.usuario" class="quien">{{ e.usuario }}</span>
              </li>
            </ul>
          </template>
        </section>

        <!-- 2. Presupuestos y documentos -->
        <section class="bloque">
          <h3>Presupuestos y documentos</h3>
          <p v-if="docsVisibles.length === 0" class="vacio">Todavía no hay documentos cargados.</p>
          <div v-for="d in docsVisibles" :key="d.id" class="doc" :class="{ 'doc--baja': d.borrado_en }">
            <div class="doc__cab">
              <strong>{{ d.tipo === 'presupuesto' ? 'Presupuesto' : 'Documento' }} v{{ d.version }}</strong>
              <span v-if="d.es_revision" class="etiqueta">Ampliación / nueva versión</span>
              <span class="sub">{{ d.nombre_original }} · {{ fechaHora(d.subido_en) }} · {{ d.subido_por }}</span>
            </div>
            <p v-if="d.revision_motivo" class="sub">Motivo: {{ d.revision_motivo }}</p>

            <div v-if="d.borrado_en" class="sub">Dado de baja el {{ fechaHora(d.borrado_en) }} por {{ d.borrado_por }}: {{ d.borrado_motivo }}</div>
            <div v-else class="doc__acciones">
              <template v-if="d.tipo === 'presupuesto'">
                <select v-model="d.estado_presupuesto" @change="guardarPresupuesto(d)" :disabled="!puedeSubir" title="Estado del presupuesto">
                  <option value="pendiente">Pendiente de respuesta</option>
                  <option value="aprobado">Aprobado</option>
                  <option value="aprobado_parcial">Aprobado parcial</option>
                  <option value="rechazado">Rechazado</option>
                </select>
                <input type="number" step="0.01" min="0" v-model.number="d.monto" @change="guardarPresupuesto(d)" :disabled="!puedeSubir" placeholder="Monto $" title="Monto del presupuesto" />
              </template>
              <button class="btn btn-secondary btn-sm" @click="verPdf(d)">Ver PDF</button>
              <button v-if="puedeBorrar" class="btn btn-danger btn-sm" @click="bajaDe = d; bajaMotivo = ''">Dar de baja</button>
            </div>
          </div>

          <form v-if="puedeSubir" class="subida" @submit.prevent="subir">
            <strong>Subir PDF</strong>
            <div class="subida__fila">
              <select v-model="nuevo.tipo">
                <option value="presupuesto">Presupuesto</option>
                <option value="otro">Otro documento</option>
              </select>
              <input ref="inputArchivo" type="file" accept="application/pdf,.pdf" required />
              <input v-if="nuevo.tipo === 'presupuesto'" type="number" step="0.01" min="0" v-model.number="nuevo.monto" placeholder="Monto $ (opcional)" />
            </div>
            <label v-if="nuevo.tipo === 'presupuesto'" class="check">
              <input type="checkbox" v-model="nuevo.es_revision" /> Es una ampliación o nueva versión de un presupuesto anterior
            </label>
            <input v-if="nuevo.es_revision" type="text" v-model="nuevo.revision_motivo" placeholder="Motivo (ej: se agregó cambio de embrague)" />
            <button type="submit" class="btn btn-success btn-sm" :disabled="subiendo">{{ subiendo ? 'Subiendo...' : 'Subir' }}</button>
          </form>
        </section>

        <!-- 3. OT, recepción y entrega -->
        <section class="bloque">
          <h3>OT, recepción y entrega</h3>
          <div class="datos">
            <div><small>OT</small><strong>{{ legajo.orden.ot }}</strong></div>
            <div><small>Recepción de la unidad</small><strong>{{ fechaHora(legajo.orden.fecha_apertura) }}</strong></div>
            <div><small>Kilometraje</small><strong>{{ legajo.orden.kilometraje || '—' }}</strong></div>
            <div><small>Entrega (cierre de la OT)</small><strong>{{ legajo.orden.fecha_cierre ? fechaHora(legajo.orden.fecha_cierre) : 'Todavía en taller' }}</strong></div>
            <div><small>Estado</small><strong>{{ legajo.orden.estado_actual }}</strong></div>
          </div>
        </section>

        <!-- 4. Trabajos realizados -->
        <section class="bloque">
          <h3>Trabajos realizados</h3>
          <p v-if="!legajo.explicacion && legajo.aportes.length === 0" class="vacio">Los mecánicos todavía no cargaron la explicación de los trabajos.</p>
          <p v-if="legajo.explicacion" class="texto">{{ legajo.explicacion }}</p>
          <div v-for="(a, i) in legajo.aportes" :key="i" class="aporte">
            <div class="sub"><strong>{{ a.nombre }}</strong> · {{ a.horas }} h · {{ fechaHora(a.fecha_aporte) }}</div>
            <p class="texto">{{ a.actividades }}</p>
          </div>
        </section>
      </template>

      <!-- Baja de documento: exige causa -->
      <div v-if="bajaDe" class="modal-overlay" @click.self="bajaDe = null">
        <div class="modal-content" style="max-width: 460px;">
          <h3>Dar de baja el documento</h3>
          <p class="sub">{{ bajaDe.nombre_original }} (v{{ bajaDe.version }}). El archivo no se borra del disco: queda registrado quién y por qué.</p>
          <input type="text" v-model="bajaMotivo" placeholder="Causa de la baja *" style="width: 100%;" />
          <div style="display: flex; gap: 10px; margin-top: 12px;">
            <button class="btn btn-danger" :disabled="bajaMotivo.trim().length < 3" @click="confirmarBaja">Dar de baja</button>
            <button class="btn btn-secondary" @click="bajaDe = null">Cancelar</button>
          </div>
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
import { parseUtc } from '../../utils/fechas'

const props = defineProps({ ot: { type: String, required: true } })
defineEmits(['close'])
const { fetchJSON, API_BASE, getToken } = useApi()
const toast = useToast()
const authStore = useAuthStore()

const permisos = computed(() => authStore.usuario?.permisos || [])
const puedeSubir = computed(() => permisos.value.includes('ot_documento_subir'))
const puedeBorrar = computed(() => permisos.value.includes('ot_documento_borrar'))

const cargando = ref(true)
const legajo = ref(null)
const documentos = ref([])
const subiendo = ref(false)
const inputArchivo = ref(null)
const nuevo = ref({ tipo: 'presupuesto', monto: null, es_revision: false, revision_motivo: '' })
const bajaDe = ref(null)
const bajaMotivo = ref('')

// Los dados de baja solo vienen para quien puede darlos de baja (auditoría).
const docsVisibles = computed(() => documentos.value)

const fechaHora = (v) => {
  const d = parseUtc(v)
  return d ? d.toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' }) : '—'
}
const tipoTurno = (t) => ({ normal: 'normal', garantia: 'garantía', retrabajo: 'retrabajo' }[t] || t)
const nombreEvento = (t) => ({
  creado: 'Turno programado', editado: 'Turno modificado', reprogramado: 'Turno reprogramado', llamado: 'Llamado al cliente',
  confirmado: 'Confirmado', sin_confirmar: 'Sin confirmar', reprogramar: 'Pidió reprogramar', cancelado: 'Cancelado',
  no_asistio: 'No asistió', ot_creada: 'OT creada'
}[t] || t)

const cargar = async () => {
  cargando.value = true
  try {
    legajo.value = await fetchJSON(`/turnos/legajo/${encodeURIComponent(props.ot)}`)
    documentos.value = await fetchJSON(`/ot-documentos/${encodeURIComponent(props.ot)}`)
  } catch (err) { toast.error(errMsg(err)) }
  finally { cargando.value = false }
}

const recargarDocumentos = async () => {
  documentos.value = await fetchJSON(`/ot-documentos/${encodeURIComponent(props.ot)}`)
}

const subir = async () => {
  const archivo = inputArchivo.value?.files?.[0]
  if (!archivo) return
  subiendo.value = true
  try {
    const fd = new FormData()
    fd.append('tipo', nuevo.value.tipo)
    if (nuevo.value.tipo === 'presupuesto') {
      if (nuevo.value.monto !== null && nuevo.value.monto !== '') fd.append('monto', nuevo.value.monto)
      fd.append('es_revision', nuevo.value.es_revision ? 'true' : 'false')
      if (nuevo.value.es_revision) fd.append('revision_motivo', nuevo.value.revision_motivo)
    }
    fd.append('archivo', archivo)
    // fetchJSON fuerza Content-Type JSON; para multipart el navegador debe poner el suyo (con el boundary).
    const res = await fetch(`${API_BASE}/ot-documentos/${encodeURIComponent(props.ot)}`, {
      method: 'POST', headers: { Authorization: `Bearer ${getToken()}` }, body: fd
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error || 'No se pudo subir el archivo')
    toast.success('Documento subido al legajo')
    nuevo.value = { tipo: 'presupuesto', monto: null, es_revision: false, revision_motivo: '' }
    if (inputArchivo.value) inputArchivo.value.value = ''
    await recargarDocumentos()
  } catch (err) { toast.error(errMsg(err)) }
  finally { subiendo.value = false }
}

const guardarPresupuesto = async (d) => {
  try {
    await fetchJSON(`/ot-documentos/item/${d.id}`, {
      method: 'PUT', body: JSON.stringify({ estado_presupuesto: d.estado_presupuesto, monto: d.monto === '' ? null : d.monto })
    })
    toast.success('Presupuesto actualizado', 1800)
  } catch (err) { toast.error(errMsg(err)); await recargarDocumentos() }
}

// El PDF se pide con el token y se abre desde un blob (un enlace directo no llevaría la sesión).
const verPdf = async (d) => {
  try {
    const res = await fetch(`${API_BASE}/ot-documentos/item/${d.id}/archivo`, { headers: { Authorization: `Bearer ${getToken()}` } })
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'No se pudo abrir el PDF')
    const url = URL.createObjectURL(await res.blob())
    const ventana = window.open(url, '_blank')
    if (!ventana) {
      // Si el visor bloquea la ventana nueva, se descarga.
      const a = document.createElement('a')
      a.href = url; a.download = d.nombre_original || `${d.tipo}_v${d.version}.pdf`
      document.body.appendChild(a); a.click(); a.remove()
    }
    setTimeout(() => URL.revokeObjectURL(url), 60000)
  } catch (err) { toast.error(errMsg(err)) }
}

const confirmarBaja = async () => {
  try {
    await fetchJSON(`/ot-documentos/item/${bajaDe.value.id}`, { method: 'DELETE', body: JSON.stringify({ motivo: bajaMotivo.value.trim() }) })
    toast.success('Documento dado de baja')
    bajaDe.value = null
    await recargarDocumentos()
  } catch (err) { toast.error(errMsg(err)) }
}

onMounted(cargar)
</script>

<style scoped>
.bloque { border-top: 1px solid var(--border); padding-top: 10px; margin-top: 14px; }
.bloque h3 { margin: 0 0 8px; }
.sub { font-size: 0.82rem; color: var(--text-soft); }
.vacio { color: var(--text-soft); font-style: italic; }
.patente { background: #fff; color: #111; border: 1px solid #111; padding: 0 6px; border-radius: 5px; font-family: monospace; font-weight: 700; margin-right: 6px; }
.etiqueta { display: inline-block; margin-left: 8px; padding: 1px 8px; border-radius: 10px; font-size: 0.74rem; font-weight: 600; background: var(--primary-light); color: var(--primary); }
.etiqueta--warn { background: var(--warning-light); color: var(--warning); }
.linea-tiempo { list-style: none; margin: 6px 0 0; padding: 0; border-left: 2px solid var(--border); }
.linea-tiempo li { display: grid; grid-template-columns: 130px 1fr auto; gap: 8px; padding: 3px 0 3px 10px; font-size: 0.88rem; }
.linea-tiempo .cuando, .linea-tiempo .quien { color: var(--text-soft); font-size: 0.8rem; }
.doc { border: 1px solid var(--border); border-radius: 8px; padding: 8px 12px; margin-bottom: 8px; }
.doc--baja { opacity: 0.6; border-style: dashed; }
.doc__cab { display: flex; flex-wrap: wrap; gap: 8px; align-items: baseline; }
.doc__acciones { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 6px; align-items: center; }
.doc__acciones select, .doc__acciones input { max-width: 200px; }
.subida { display: grid; gap: 8px; margin-top: 10px; padding: 10px; background: var(--border-soft); border-radius: 8px; }
.subida__fila { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.check { display: flex; align-items: center; gap: 8px; font-size: 0.88rem; }
.datos { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 10px; }
.datos div { display: grid; }
.datos small { color: var(--text-soft); }
.texto { white-space: pre-wrap; margin: 4px 0 8px; }
.aporte { border-left: 3px solid var(--border); padding-left: 10px; margin-bottom: 6px; }
</style>
