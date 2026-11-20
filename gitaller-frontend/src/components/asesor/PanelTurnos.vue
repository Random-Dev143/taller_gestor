<template>
  <div class="panel-turnos">
    <div class="cabecera">
      <h2>Turnos</h2>
      <div class="rango">
        <button class="btn btn-secondary btn-sm" @click="moverSemana(-7)" title="Semana anterior">◀</button>
        <button class="btn btn-secondary btn-sm" @click="irAHoy">Hoy</button>
        <button class="btn btn-secondary btn-sm" @click="moverSemana(7)" title="Semana siguiente">▶</button>
        <span class="rango__texto">{{ textoRango }}</span>
      </div>
      <button class="btn btn-secondary btn-sm" @click="cargar" :disabled="cargando">↻ Actualizar</button>
      <button class="btn btn-sm" v-can="'turno_gestionar'" @click="abrirNuevo">＋ Nuevo turno</button>
    </div>

    <div v-if="cargando && !turnos.length" class="loading-state"><div class="spinner"></div>Cargando turnos...</div>
    <div v-else class="panel">
      <!-- Lista agrupada por día, con la capacidad de cada uno -->
      <aside class="lista">
        <section v-for="dia in diasConTurnos" :key="dia.fecha" class="dia">
          <header class="dia__cab">
            <span class="dia__nombre">{{ nombreDia(dia.fecha) }}</span>
            <span v-if="dia.cap && !dia.cap.abierto" class="dia__cerrado">Cerrado</span>
            <span v-else-if="dia.cap" class="dia__cap" :class="{ 'dia__cap--excedido': dia.cap.horas_comprometidas > dia.cap.horas_disponibles }"
              :title="`Horas estimadas de turnos normales sobre horas disponibles de mecánicos. No incluye las OT que ya están en el taller.`">
              {{ redondear(dia.cap.horas_comprometidas) }} / {{ redondear(dia.cap.horas_disponibles) }} h
              <template v-if="dia.cap.horas_prioritarias > 0"> · +{{ redondear(dia.cap.horas_prioritarias) }} h prioridad</template>
            </span>
          </header>
          <div v-if="dia.cap && dia.cap.abierto" class="barra"><div class="barra__fill" :class="{ 'barra__fill--excedida': dia.cap.horas_comprometidas > dia.cap.horas_disponibles }" :style="{ width: porcentaje(dia.cap) + '%' }"></div></div>

          <p v-if="dia.items.length === 0" class="dia__vacio">Sin turnos</p>
          <button v-for="t in dia.items" :key="t.id" type="button" class="item" :class="{ 'item--sel': seleccionado && seleccionado.id === t.id }" @click="seleccionar(t)">
            <span class="dot" :class="`dot--${t.estado}`"></span>
            <span class="item__txt">
              <span class="item__l1">
                <strong>{{ hora(t.fecha_hora) }}</strong>
                <span class="patente patente--mini">{{ t.patente }}</span>
                <span v-if="t.tipo !== 'normal'" class="prio" :class="`prio--${t.tipo}`">{{ t.tipo === 'garantia' ? 'Garantía' : 'Retrabajo' }}</span>
              </span>
              <span class="item__l2">{{ t.unidad }} · {{ t.cliente }}</span>
              <span class="item__l3">{{ ESTADOS[t.estado].texto }}<template v-if="t.ot"> · OT {{ t.ot }}</template></span>
            </span>
          </button>
        </section>

        <details class="leyenda" open>
          <summary>Referencia de colores</summary>
          <ul>
            <li v-for="(e, clave) in ESTADOS" :key="clave" :title="e.ayuda"><span class="dot" :class="`dot--${clave}`"></span>{{ e.texto }}</li>
          </ul>
        </details>
      </aside>

      <!-- Detalle y acciones -->
      <main class="detalle">
        <div v-if="!seleccionado" class="empty-state">Elegí un turno de la lista para ver sus datos y gestionarlo.</div>
        <template v-else>
          <header class="det-cab">
            <div class="det-cab__fila">
              <span class="det-cab__hora">{{ fechaLarga(seleccionado.fecha_hora) }}</span>
              <span class="patente">{{ seleccionado.patente }}</span>
              <span class="chip"><span class="dot" :class="`dot--${seleccionado.estado}`"></span>{{ ESTADOS[seleccionado.estado].texto }}</span>
              <span v-if="seleccionado.tipo !== 'normal'" class="prio" :class="`prio--${seleccionado.tipo}`">{{ seleccionado.tipo === 'garantia' ? 'Garantía · prioridad' : 'Retrabajo · prioridad' }}</span>
            </div>
            <h3 class="det-cab__unidad">{{ seleccionado.unidad }}</h3>
            <div class="sub">{{ seleccionado.cliente }}</div>
          </header>

          <div class="datos">
            <div><small>Contacto</small><strong>{{ seleccionado.contacto_nombre || '—' }}</strong></div>
            <div><small>Teléfono</small><strong>{{ seleccionado.telefono || '—' }}</strong></div>
            <div><small>Correo</small><strong>{{ seleccionado.correo || '—' }}</strong></div>
            <div><small>Horas estimadas</small><strong>{{ seleccionado.horas_estimadas || 0 }} h</strong></div>
            <div><small>Km estimado</small><strong>{{ seleccionado.km_estimado ?? '—' }}</strong></div>
            <div><small>Chasis</small><strong>{{ seleccionado.chasis || '—' }}</strong></div>
          </div>
          <p v-if="seleccionado.motivo" class="motivo"><small>Motivo</small>{{ seleccionado.motivo }}</p>
          <p v-if="seleccionado.estado === 'cancelado' && seleccionado.cancelado_motivo" class="motivo"><small>Motivo de la cancelación</small>{{ seleccionado.cancelado_motivo }}</p>

          <div class="acciones" v-if="!seleccionado.ot">
            <template v-if="seleccionado.estado !== 'cancelado'">
              <button class="act-btn act-btn--principal" v-can="'turno_gestionar'" @click="generarOt = seleccionado">Generar OT</button>
              <button class="act-btn" v-can="'turno_gestionar'" @click="abrirLlamado">📞 Registrar llamado</button>
              <button v-if="seleccionado.estado !== 'confirmado'" class="act-btn" v-can="'turno_gestionar'" @click="confirmarDirecto">✔ Marcar confirmado</button>
              <button class="act-btn" v-can="'turno_gestionar'" @click="editando = seleccionado; mostrarModalTurno = true">Reprogramar / editar</button>
              <button class="act-btn" v-can="'turno_gestionar'" @click="cambiarEstado('no_asistio')">No asistió</button>
              <button class="act-btn act-btn--peligro" v-can="'turno_gestionar'" @click="cancelando = seleccionado; motivoCancelacion = ''">Cancelar turno</button>
            </template>
            <p v-else class="sub">Turno cancelado. Para reagendar, programá uno nuevo.</p>
          </div>
          <div class="acciones" v-else>
            <button class="act-btn act-btn--principal" @click="$emit('ver-legajo', seleccionado.ot)">📁 Ver legajo de la OT {{ seleccionado.ot }}</button>
          </div>

          <h4>Historial del turno</h4>
          <ul class="linea-tiempo">
            <li v-for="e in (seleccionado.eventos || [])" :key="e.id">
              <span class="cuando">{{ fechaCorta(e.ts) }}</span>
              <span class="que"><strong>{{ nombreEvento(e.tipo) }}</strong><template v-if="e.detalle"> — {{ e.detalle }}</template></span>
              <span v-if="e.usuario" class="quien">{{ e.usuario }}</span>
            </li>
          </ul>
        </template>
      </main>
    </div>

    <!-- Registro de llamado -->
    <div v-if="llamando" class="modal-overlay" @click.self="llamando = null">
      <div class="modal-content" style="max-width: 460px;">
        <button class="close-btn" @click="llamando = null">&times;</button>
        <h3>Registrar llamado</h3>
        <p class="sub">{{ llamando.cliente }} · {{ llamando.telefono || 'sin teléfono cargado' }}</p>
        <div class="form-group">
          <label>Resultado</label>
          <select v-model="llamadoForm.resultado">
            <option value="confirmo">Confirmó el turno</option>
            <option value="no_atiende">No atendió / no se pudo contactar</option>
            <option value="reprogramar">Pidió reprogramar</option>
            <option value="cancelo">Canceló</option>
            <option value="otro">Otro</option>
          </select>
        </div>
        <div class="form-group"><label>Nota</label><input type="text" v-model="llamadoForm.nota" placeholder="Opcional" /></div>
        <div style="display: flex; gap: 10px; margin-top: 12px;">
          <button class="btn btn-success" :disabled="procesando" @click="guardarLlamado">Guardar</button>
          <button class="btn btn-secondary" @click="llamando = null">Cerrar</button>
        </div>
      </div>
    </div>

    <!-- Cancelación: exige motivo -->
    <div v-if="cancelando" class="modal-overlay" @click.self="cancelando = null">
      <div class="modal-content" style="max-width: 460px;">
        <button class="close-btn" @click="cancelando = null">&times;</button>
        <h3>Cancelar el turno</h3>
        <p class="sub">{{ cancelando.cliente }} · {{ cancelando.patente }} · {{ fechaLarga(cancelando.fecha_hora) }}</p>
        <div class="form-group"><label>Motivo *</label><input type="text" v-model="motivoCancelacion" placeholder="Ej: el cliente vendió la unidad" /></div>
        <div style="display: flex; gap: 10px; margin-top: 12px;">
          <button class="btn btn-danger" :disabled="motivoCancelacion.trim().length < 3 || procesando" @click="cambiarEstado('cancelado', motivoCancelacion.trim()); cancelando = null">Cancelar turno</button>
          <button class="btn btn-secondary" @click="cancelando = null">Volver</button>
        </div>
      </div>
    </div>

    <ModalTurno v-if="mostrarModalTurno" :turno="editando" @close="mostrarModalTurno = false" @guardado="turnoGuardado" />
    <ModalGenerarOT v-if="generarOt" :turno="generarOt" @close="generarOt = null" @creada="otCreada" />
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useApi } from '../../composables/useApi'
import { useToast, errMsg } from '../../composables/useToast'
import { parseUtc } from '../../utils/fechas'
import ModalTurno from './ModalTurno.vue'
import ModalGenerarOT from './ModalGenerarOT.vue'

const emit = defineEmits(['resumen-cambio', 'ver-legajo'])
const { fetchJSON } = useApi()
const toast = useToast()

const ESTADOS = {
  sin_confirmar: { texto: 'Sin confirmar', ayuda: 'El cliente todavía no confirmó el turno.' },
  confirmado: { texto: 'Confirmado', ayuda: 'Confirmado por el cliente (o turno otorgado con poca antelación). Listo para generar la OT.' },
  reprogramar: { texto: 'Pidió reprogramar', ayuda: 'El cliente pidió otra fecha: modificá el turno.' },
  ot_creada: { texto: 'OT creada', ayuda: 'El cliente llegó y ya se generó la OT.' },
  no_asistio: { texto: 'No asistió', ayuda: 'No se presentó al turno.' },
  cancelado: { texto: 'Cancelado', ayuda: 'Turno cancelado.' }
}

const pad = (n) => String(n).padStart(2, '0')
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const desde = ref(iso(new Date()))
const hastaDe = (d) => { const f = new Date(`${d}T12:00:00`); f.setDate(f.getDate() + 6); return iso(f) }
const hasta = computed(() => hastaDe(desde.value))

const turnos = ref([])
const capacidad = ref([])
const cargando = ref(true)
const seleccionado = ref(null)
const procesando = ref(false)

const mostrarModalTurno = ref(false)
const editando = ref(null)
const generarOt = ref(null)
const llamando = ref(null)
const llamadoForm = ref({ resultado: 'confirmo', nota: '' })
const cancelando = ref(null)
const motivoCancelacion = ref('')

const textoRango = computed(() => {
  const f = (d) => new Date(`${d}T12:00:00`).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })
  return `${f(desde.value)} – ${f(hasta.value)}`
})

const diasConTurnos = computed(() => {
  const dias = []
  const cursor = new Date(`${desde.value}T12:00:00`)
  for (let i = 0; i < 7; i++) {
    const fecha = iso(cursor)
    dias.push({ fecha, cap: capacidad.value.find(c => c.fecha === fecha), items: turnos.value.filter(t => t.dia === fecha) })
    cursor.setDate(cursor.getDate() + 1)
  }
  return dias
})

const redondear = (n) => Math.round((Number(n) || 0) * 10) / 10
const porcentaje = (c) => c.horas_disponibles > 0 ? Math.min(100, Math.round((c.horas_comprometidas / c.horas_disponibles) * 100)) : 100
const nombreDia = (f) => new Date(`${f}T12:00:00`).toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'numeric' })
const hora = (v) => { const d = parseUtc(v); return d ? d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }) : '' }
const fechaLarga = (v) => { const d = parseUtc(v); return d ? d.toLocaleString('es-AR', { weekday: 'short', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' }) : '' }
const fechaCorta = (v) => { const d = parseUtc(v); return d ? d.toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' }) : '' }
const nombreEvento = (t) => ({
  creado: 'Turno programado', editado: 'Turno modificado', reprogramado: 'Turno reprogramado', llamado: 'Llamado al cliente',
  confirmado: 'Confirmado', sin_confirmar: 'Sin confirmar', reprogramar: 'Pidió reprogramar', cancelado: 'Cancelado',
  no_asistio: 'No asistió', ot_creada: 'OT creada'
}[t] || t)

const cargar = async () => {
  cargando.value = true
  try {
    const [t, c] = await Promise.all([
      fetchJSON(`/turnos?desde=${desde.value}&hasta=${hasta.value}`),
      fetchJSON(`/turnos/capacidad?desde=${desde.value}&hasta=${hasta.value}`)
    ])
    turnos.value = t
    capacidad.value = c.dias
    if (seleccionado.value) {
      const actual = t.find(x => x.id === seleccionado.value.id)
      if (actual) await seleccionar(actual); else seleccionado.value = null
    }
    emit('resumen-cambio')
  } catch (err) { toast.error('Error cargando turnos: ' + errMsg(err)) }
  finally { cargando.value = false }
}

// Trae el detalle completo (con su historial) del turno elegido.
const seleccionar = async (t) => {
  try { seleccionado.value = await fetchJSON(`/turnos/${t.id}`) } catch (err) { toast.error(errMsg(err)) }
}

const moverSemana = (dias) => { const f = new Date(`${desde.value}T12:00:00`); f.setDate(f.getDate() + dias); desde.value = iso(f); seleccionado.value = null; cargar() }
const irAHoy = () => { desde.value = iso(new Date()); seleccionado.value = null; cargar() }

const abrirNuevo = () => { editando.value = null; mostrarModalTurno.value = true }
const turnoGuardado = () => { mostrarModalTurno.value = false; cargar() }
const otCreada = (ot) => { generarOt.value = null; cargar(); emit('ver-legajo', ot) }

const abrirLlamado = () => { llamando.value = seleccionado.value; llamadoForm.value = { resultado: 'confirmo', nota: '' } }
const guardarLlamado = async () => {
  procesando.value = true
  try {
    await fetchJSON(`/turnos/${llamando.value.id}/llamado`, { method: 'POST', body: JSON.stringify(llamadoForm.value) })
    toast.success('Llamado registrado')
    llamando.value = null
    await cargar()
  } catch (err) { toast.error(errMsg(err)) }
  finally { procesando.value = false }
}

const confirmarDirecto = () => cambiarEstado('confirmado')

const cambiarEstado = async (estado, motivo = '') => {
  procesando.value = true
  try {
    await fetchJSON(`/turnos/${seleccionado.value.id}/estado`, { method: 'POST', body: JSON.stringify({ estado, motivo, via: 'asesor' }) })
    toast.success('Turno actualizado')
    await cargar()
  } catch (err) { toast.error(errMsg(err)) }
  finally { procesando.value = false }
}

onMounted(cargar)
defineExpose({ cargar })
</script>

<style scoped>
.cabecera { display: flex; align-items: center; flex-wrap: wrap; gap: 12px; margin-bottom: 12px; }
.cabecera h2 { margin: 0; margin-right: auto; }
.rango { display: flex; align-items: center; gap: 6px; }
.rango__texto { font-weight: 600; margin-left: 6px; text-transform: capitalize; }
.sub { font-size: 0.82rem; color: var(--text-soft); }

.panel { display: grid; grid-template-columns: minmax(280px, 360px) 1fr; gap: 16px; align-items: start; }
@media (max-width: 860px) { .panel { grid-template-columns: 1fr; } }

.lista { border: 1px solid var(--border); border-radius: 10px; background: var(--surface); padding: 6px; max-height: 76vh; overflow-y: auto; }
.dia { padding: 8px 6px 4px; border-bottom: 1px solid var(--border-soft); }
.dia__cab { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
.dia__nombre { font-weight: 700; text-transform: capitalize; }
.dia__cap { font-size: 0.78rem; color: var(--text-soft); }
.dia__cap--excedido { color: var(--warning); font-weight: 700; }
.dia__cerrado { font-size: 0.78rem; color: var(--muted); }
.dia__vacio { font-size: 0.82rem; color: var(--muted); margin: 4px 0; }
.barra { height: 4px; background: var(--border-soft); border-radius: 3px; margin: 4px 0 6px; overflow: hidden; }
.barra__fill { height: 100%; background: var(--success); }
.barra__fill--excedida { background: var(--warning); }

.item { display: flex; align-items: flex-start; gap: 4px; width: 100%; text-align: left; padding: 7px 8px; margin: 2px 0; border: 1px solid transparent; border-radius: 8px; background: transparent; color: var(--text); font: inherit; cursor: pointer; }
.item:hover { background: var(--hover-row); }
.item--sel { background: var(--primary-light); border-color: var(--primary); }
.item__txt { display: grid; gap: 1px; min-width: 0; }
.item__l1 { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.item__l2 { font-size: 0.84rem; color: var(--text-soft); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.item__l3 { font-size: 0.76rem; color: var(--text-soft); }

/* Estado = punto de color + texto. Mismos colores en lista, detalle y leyenda. */
.dot { width: 10px; height: 10px; border-radius: 50%; background: var(--muted); flex-shrink: 0; display: inline-block; margin: 5px 6px 0 0; }
.chip .dot { margin: 0 6px 0 0; }
.dot--sin_confirmar { background: var(--warning); }
.dot--confirmado { background: var(--success); }
.dot--reprogramar { background: #8b5cf6; }
.dot--ot_creada { background: var(--primary); }
.dot--no_asistio { background: var(--muted); }
.dot--cancelado { background: var(--danger); }
.chip { display: inline-flex; align-items: center; padding: 3px 10px; border-radius: 20px; background: var(--hover-row); font-size: 0.8rem; font-weight: 600; color: var(--text-soft); }

.patente { background: #fff; color: #111; border: 2px solid #111; padding: 1px 9px; border-radius: 6px; font-family: monospace; font-weight: 700; font-size: 1rem; letter-spacing: 1px; }
.patente--mini { border-width: 1px; padding: 0 6px; font-size: 0.78rem; letter-spacing: 0.5px; }
.prio { padding: 1px 8px; border-radius: 10px; font-size: 0.72rem; font-weight: 700; background: var(--warning-light); color: var(--warning); }
.prio--retrabajo { background: var(--danger-light); color: var(--danger); }

.leyenda { margin: 10px 6px 4px; font-size: 0.82rem; }
.leyenda summary { cursor: pointer; font-weight: 600; color: var(--text-soft); }
.leyenda ul { list-style: none; padding: 6px 0 0; margin: 0; display: grid; gap: 2px; }
.leyenda li { display: flex; align-items: center; }
.leyenda .dot { margin: 0 6px 0 0; }

.detalle { border: 1px solid var(--border); border-radius: 10px; background: var(--surface); padding: 16px; min-height: 260px; }
.det-cab__fila { display: flex; align-items: center; flex-wrap: wrap; gap: 10px; }
.det-cab__hora { font-size: 1.1rem; font-weight: 700; text-transform: capitalize; }
.det-cab__unidad { margin: 8px 0 0; }
.datos { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 10px; margin: 14px 0 8px; }
.datos div { display: grid; }
.datos small, .motivo small { color: var(--text-soft); display: block; }
.motivo { margin: 6px 0; }

.acciones { display: flex; flex-wrap: wrap; gap: 8px; margin: 14px 0; }
.act-btn { flex: 1 1 150px; min-height: 40px; padding: 8px 14px; border: 1px solid var(--border); border-radius: 8px; background: transparent; color: var(--text); font: inherit; font-size: 0.88rem; font-weight: 600; cursor: pointer; transition: background 0.15s; }
.act-btn:hover { background: var(--hover-row); }
.act-btn--principal { background: var(--primary); border-color: var(--primary); color: #fff; }
.act-btn--principal:hover { filter: brightness(1.08); background: var(--primary); }
.act-btn--peligro { color: var(--danger); border-color: var(--danger); }
.act-btn:focus-visible, .item:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }

h4 { margin: 14px 0 6px; }
.linea-tiempo { list-style: none; margin: 0; padding: 0; border-left: 2px solid var(--border); }
.linea-tiempo li { display: grid; grid-template-columns: 120px 1fr auto; gap: 8px; padding: 3px 0 3px 10px; font-size: 0.88rem; }
.linea-tiempo .cuando, .linea-tiempo .quien { color: var(--text-soft); font-size: 0.8rem; }
</style>
