<template>
  <div class="view-mecanico">
    <NavBar brand="Mi panel" :tabs="tabs" v-model:activeTab="activeTab" logoutText="Cambiar legajo" customLogout @logout="cambiarLegajo" />

    <!-- Aportes que el Jefe habilitó para corregir. Va fuera del bloque de tareas a propósito:
         tiene que verse aunque el mecánico no tenga ninguna tarea pendiente. -->
    <div v-if="aportesCorregibles.length" class="card card-correccion">
      <h2><AppIcon name="edit" /> Aportes para corregir</h2>
      <p class="correccion-ayuda">El Jefe de Taller te habilitó a corregir {{ aportesCorregibles.length === 1 ? 'este aporte' : 'estos aportes' }}. Podés modificar cada uno <strong>una sola vez</strong>.</p>
      <div v-for="ap in aportesCorregibles" :key="ap.id" class="correccion-item">
        <div class="correccion-cabecera">
          <strong>OT {{ ap.ot }}</strong> · {{ ap.patente }} · {{ $modelo(ap.unidad) }} <span class="correccion-cliente">({{ ap.cliente }})</span>
        </div>
        <textarea v-model="textosCorreccion[ap.id]" rows="4" class="form-control" :disabled="guardandoAporte === ap.id"></textarea>
        <button class="btn btn-success btn-sm mt-8" :disabled="guardandoAporte === ap.id" @click="guardarCorreccionAporte(ap)">
          {{ guardandoAporte === ap.id ? 'Guardando...' : 'Guardar corrección' }}
        </button>
      </div>
    </div>

    <div v-if="loading" class="loading-state">
      <div class="spinner"></div>
      Cargando tareas...
    </div>

    <div v-else-if="tareas.length === 0" class="empty-state">
      No tiene tareas asignadas por el momento.
    </div>

    <template v-else>
      <!-- ═══ 1. BARRA SUPERIOR: la tarea en curso, siempre a la vista, en una sola línea ═══ -->
      <section v-if="tareaEnCurso" class="activa-bar" aria-live="polite">
        <span class="estado-linea estado-linea--fuerte"><span class="dot dot--activa"></span>EN CURSO</span>
        <button v-if="tareaEnCurso.ot !== '0000'" type="button" class="activa-bar__ot" title="Ir a esta OT" @click="irAOrden(tareaEnCurso)">
          #{{ tareaEnCurso.ot }} <span class="patente patente--mini">{{ tareaEnCurso.patente }}</span>
        </button>
        <span v-else class="activa-bar__ot">Tarea interna</span>
        <span class="activa-bar__desc" :title="tareaEnCurso.descripcion">{{ tareaEnCurso.descripcion }}</span>
        <span class="activa-bar__tiempos">
          <span class="tiempo"><small>Trabajado</small><strong class="num num--vivo">{{ tiempoVivo(tareaEnCurso) }}</strong></span>
          <span v-if="Number(tareaEnCurso.tiempo_estimado) > 0" class="tiempo">
            <small>{{ disponibleEnCurso < 0 ? 'Excedido' : 'Disponible' }}</small>
            <strong class="num" :class="{ 'num--alerta': disponibleEnCurso < 0 }">{{ formatoHoras(Math.abs(disponibleEnCurso)) }}</strong>
          </span>
        </span>
        <span class="activa-bar__acciones">
          <template v-if="tareaEnCurso.ot !== '0000'">
            <button v-can="'tarea_operar'" class="act-btn" @click="abrirPausa(tareaEnCurso)"><AppIcon name="pause" /> Pausar</button>
            <button v-can="'tarea_operar'" class="act-btn act-btn--success" @click="abrirFinalizar(tareaEnCurso)"><AppIcon name="check" /> Finalizar mi parte</button>
          </template>
          <template v-else>
            <button v-can="'tarea_operar'" class="act-btn" @click="toggleTareaInterna(tareaEnCurso)"><AppIcon name="pause" /> Pausar</button>
            <button v-if="!tareaEnCurso.es_rutina" v-can="'tarea_operar'" class="act-btn act-btn--success" @click="finalizarTareaInterna(tareaEnCurso)"><AppIcon name="check" /> Finalizar</button>
          </template>
        </span>
      </section>
      <section v-else class="activa-bar activa-bar--libre">
        <span class="estado-linea"><span class="dot dot--hecha"></span>Sin tarea en curso</span>
        <span class="activa-bar__desc">Elegí una OT y presioná <strong>Iniciar</strong> o <strong>Reanudar</strong>.</span>
      </section>

      <!-- ═══ 2 y 3. LISTA DE OT (lateral en escritorio, solapas en celular) + DETALLE ═══ -->
      <div v-if="activeTab === 'mecanico-ot'" class="panel">
        <aside class="lista">
          <div class="lista__cabecera">
            <span class="legajo-pill">Legajo <strong>{{ legajo }}</strong></span>
            <span class="lista__titulo">Mis OT ({{ ordenesAgrupadas.length }})</span>
            <button class="act-btn act-btn--icono" @click="cargarTareas(false)" :disabled="loading" title="Actualizar ahora" aria-label="Actualizar ahora"><AppIcon name="refresh" /></button>
          </div>

          <nav class="lista__items" aria-label="Órdenes de trabajo asignadas">
            <button v-for="orden in ordenesAgrupadas" :key="orden.ot" type="button" class="ot-item"
              :class="{ 'ot-item--sel': otActual && otActual.ot === orden.ot }"
              :aria-current="otActual && otActual.ot === orden.ot ? 'true' : null"
              @click="seleccion = orden.ot">
              <span class="dot" :class="`dot--${estadoVisualOrden(orden)}`"></span>
              <span class="ot-item__txt">
                <span class="ot-item__l1"><strong>#{{ orden.ot }}</strong><span class="patente patente--mini">{{ orden.patente }}</span></span>
                <span class="ot-item__l2" :title="$unidadCompleta(orden.unidad)">{{ $modelo(orden.unidad) }}</span>
                <span class="ot-item__l3">{{ ESTADOS_VISUALES[estadoVisualOrden(orden)].texto }}</span>
              </span>
              <span v-if="orden.tareas.length > 1" class="ot-item__n" :title="`${orden.tareas.length} tareas`">{{ orden.tareas.length }}</span>
            </button>
          </nav>

          <details class="leyenda" :open="esEscritorio">
            <summary>Referencia de colores</summary>
            <ul>
              <li v-for="(e, clave) in ESTADOS_VISUALES" :key="clave" :title="e.ayuda">
                <span class="dot" :class="`dot--${clave}`"></span>{{ e.texto }}
              </li>
            </ul>
            <p v-if="ultimaActualizacion" class="leyenda__act">Actualizado hace {{ segundosDesdeActualizacion }}s · se actualiza solo cada 45s</p>
          </details>
        </aside>

        <main class="detalle">
          <div v-if="!otActual" class="empty-state">No tenés órdenes de trabajo asignadas por el momento.</div>
          <template v-else>
            <header class="det-cabecera">
              <div class="det-cabecera__fila">
                <span class="det-cabecera__num">#{{ otActual.ot }}</span>
                <span class="patente">{{ otActual.patente }}</span>
                <span class="chip"><span class="dot" :class="`dot--${estadoVisualOrden(otActual)}`"></span>{{ ESTADOS_VISUALES[estadoVisualOrden(otActual)].texto }}</span>
              </div>
              <h2 class="det-cabecera__unidad" :title="$unidadCompleta(otActual.unidad)">{{ $modelo(otActual.unidad) }}</h2>
              <div class="det-cabecera__cliente">{{ otActual.cliente }}</div>
            </header>

            <!-- Horas de la OT: asignado vs. ocupado -->
            <div class="tiempos">
              <div class="tiempos__dato"><small>Asignado</small><strong class="num">{{ redondear1(otActual.asignado) }} h</strong></div>
              <div class="tiempos__dato"><small>Ocupado</small><strong class="num" :class="{ 'num--vivo': otActual.activa }">{{ formatoHoras(horasOcupadasOrden(otActual, ahora)) }}</strong></div>
              <div class="tiempos__barra" role="progressbar" :aria-valuenow="porcentajeOrden(otActual)" aria-valuemin="0" aria-valuemax="100">
                <span :class="{ 'tiempos__relleno--excedido': porcentajeOrden(otActual) >= 100 }" :style="{ width: Math.min(porcentajeOrden(otActual), 100) + '%' }"></span>
              </div>
            </div>

            <h3 class="det-subtitulo">Mis tareas en esta OT ({{ otActual.tareas.length }})</h3>
            <div class="tareas">
              <article v-for="tarea in otActual.tareas" :key="tarea.id" class="tarea" :class="{ 'tarea--activa': tarea.mi_estado === 'En Curso' }">
                <div class="tarea__estado">
                  <span class="estado-linea"><span class="dot" :class="dotClass(tarea.mi_estado)"></span>{{ tarea.mi_estado }}</span>
                  <span class="tarea__general">Estado general: <strong>{{ tarea.estado }}</strong></span>
                </div>
                <h4 class="tarea__desc">{{ tarea.descripcion }}</h4>

                <dl class="tarea__datos">
                  <div><dt>Estimado</dt><dd class="num">{{ redondear1(tarea.tiempo_estimado) }} h</dd></div>
                  <div><dt>Mis horas</dt><dd class="num" :class="{ 'num--vivo': tarea.mi_estado === 'En Curso' }">{{ tiempoVivo(tarea) }}</dd></div>
                  <div v-if="tarea.equipo" class="tarea__equipo"><dt>Equipo</dt><dd>{{ tarea.equipo }}</dd></div>
                </dl>

                <p v-if="tarea.estado === 'Finalizada' && tarea.mi_estado !== 'Finalizada'" class="tarea__aviso">
                  <strong>Un compañero ya cerró esta tarea.</strong> Podés reanudar si falta algo, o solo completar tu informe.
                </p>

                <!-- Acciones sobre TU propio estado, independiente del resto del equipo.
                     Un solo botón destacado por tarea; el resto, discretos. -->
                <div class="acciones-tarea">
                  <button v-if="tarea.mi_estado === 'Asignada'" v-can="'tarea_operar'" @click="cambiarEstado(tarea, 'En Curso')" class="act-btn" :class="clasePrincipal(tarea, 'iniciar')"><AppIcon name="play" /> Iniciar</button>
                  <button v-if="tarea.mi_estado === 'Pausada'" v-can="'tarea_operar'" @click="cambiarEstado(tarea, 'En Curso')" class="act-btn" :class="clasePrincipal(tarea, 'iniciar')"><AppIcon name="play" /> Reanudar</button>
                  <button v-if="tarea.mi_estado === 'En Curso'" v-can="'tarea_operar'" @click="abrirPausa(tarea)" class="act-btn"><AppIcon name="pause" /> Pausar</button>
                  <button v-if="['En Curso', 'Pausada'].includes(tarea.mi_estado)" v-can="'tarea_operar'" @click="abrirFinalizar(tarea)" class="act-btn" :class="clasePrincipal(tarea, 'finalizar')"><AppIcon name="check" /> Finalizar mi parte</button>
                  <!-- La tarea completa fue cerrada por el Jefe: solo queda completar el informe -->
                  <button v-if="tarea.estado === 'Cerrada por Jefe' && tarea.mi_estado !== 'Finalizada'" v-can="'tarea_operar'" @click="abrirInformar(tarea)" class="act-btn" :class="clasePrincipal(tarea, 'informar')">Informar</button>
                </div>
              </article>
            </div>
          </template>
        </main>
      </div>

      <!-- ═══ Pestaña "Orden Interna" ═══ -->
      <div v-else class="interna">
        <h3 class="det-subtitulo">Rutinas y tareas internas</h3>
        <div v-if="tareasInternas.length === 0" class="empty-state">No tenés tareas internas asignadas por el momento.</div>
        <div v-else class="grid-interna">
          <article v-for="tarea in tareasInternas" :key="tarea.id" class="tarea" :class="{ 'tarea--activa': tarea.mi_estado === 'En Curso' }">
            <div class="tarea__estado">
              <span class="estado-linea"><span class="dot" :class="dotClass(tarea.mi_estado)"></span>{{ tarea.mi_estado }}</span>
              <span v-if="tarea.es_rutina" class="tarea__general" title="Tarea rutinaria: siempre disponible, no se cierra"><AppIcon name="refresh" /> Rutina</span>
            </div>
            <h4 class="tarea__desc">{{ tarea.descripcion }}</h4>
            <p class="tarea__general">Asignado por Jefe de Taller</p>
            <div class="acciones-tarea">
              <button v-if="tarea.mi_estado !== 'En Curso'" v-can="'tarea_operar'" @click="toggleTareaInterna(tarea)" class="act-btn act-btn--primary"><AppIcon name="play" /> Iniciar{{ tarea.es_rutina ? ' rutina' : '' }}</button>
              <button v-else v-can="'tarea_operar'" @click="toggleTareaInterna(tarea)" class="act-btn"><AppIcon name="pause" /> Pausar</button>
              <!-- Solo las extraordinarias se pueden cerrar; las rutinas nunca -->
              <button v-if="!tarea.es_rutina && ['En Curso', 'Pausada'].includes(tarea.mi_estado)" v-can="'tarea_operar'" @click="finalizarTareaInterna(tarea)" class="act-btn"><AppIcon name="check" /> Finalizar</button>
            </div>
          </article>
        </div>
      </div>
    </template>

    <ModalPausarTarea v-if="showModalPausa" @close="showModalPausa = false" @confirm="ejecutarPausa" />
    <ModalFinalizarTarea v-if="showModalFinalizar" :otId="tareaActiva.ot" :modoInformar="esModoInformar" :puedeSerAuxiliar="(tareaActiva.otros_no_auxiliares || 0) > 0" @close="showModalFinalizar = false" @confirm="ejecutarFinalizacion" />
  </div>
</template>

<script setup>
import { agruparOrdenes, horasOcupadasOrden, estadoVisualOrden, ESTADOS_VISUALES } from '../utils/ordenesMecanico'
import { formatoHoras, horasVivas, redondear1 } from '../utils/horas'
import { ref, onMounted, onUnmounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useApi } from '../composables/useApi'
import { useToast, errMsg } from '../composables/useToast'
import NavBar from '../components/common/NavBar.vue'
import ModalPausarTarea from '../components/mecanico/ModalPausarTarea.vue'
import ModalFinalizarTarea from '../components/mecanico/ModalFinalizarTarea.vue'


const { fetchJSON } = useApi()
const toast = useToast()
const router = useRouter()

const tareas = ref([])
const loading = ref(true)
const legajo = ref(localStorage.getItem('legajoMecanico') || '')

const tabs = [
  { id: 'mecanico-ot', label: 'Órdenes de Trabajo' },
  { id: 'mecanico-interna', label: 'Orden Interna' }
]
const activeTab = ref('mecanico-ot')

const showModalPausa = ref(false)
const showModalFinalizar = ref(false)
const tareaActiva = ref(null)

// Reloj compartido: un solo timer que actualiza "ahora" cada segundo, del que
// dependen tanto el cronómetro en vivo de cada tarea como el "Actualizado hace Ns".
const ahora = ref(Date.now())
const ultimaActualizacion = ref(null)
let relojInterval = null
let autoRefreshInterval = null

const segundosDesdeActualizacion = computed(() => {
  if (!ultimaActualizacion.value) return 0
  return Math.max(0, Math.round((ahora.value - ultimaActualizacion.value) / 1000))
})

// Horas trabajadas en vivo: lo ya acumulado (mi_tiempo_real) + lo transcurrido
// desde que arrancó la sesión actual (mi_sesion_inicio), mostrado como HH:MM:SS.
const tiempoVivo = (tarea) => formatoHoras(horasVivas(tarea, ahora.value))

// Punto de color junto al estado de MI tarea (los de la OT salen de estadoVisualOrden)
const dotClass = (estado) => ({
  'En Curso': 'dot--activa',
  'Pausada': 'dot--pausada',
  'Finalizada': 'dot--hecha'
}[estado] || 'dot--pendiente')

// Cuál es LA acción principal de la tarea (la única que se pinta con color lleno).
//  · En curso            -> Finalizar mi parte
//  · Cerrada por el Jefe -> Informar
//  · Resto               -> Iniciar / Reanudar
const accionPrincipal = (tarea) => {
  if (tarea.mi_estado === 'En Curso') return 'finalizar'
  if (tarea.estado === 'Cerrada por Jefe' && tarea.mi_estado !== 'Finalizada') return 'informar'
  return 'iniciar'
}
const clasePrincipal = (tarea, accion) => {
  if (accionPrincipal(tarea) !== accion) return ''
  return accion === 'finalizar' ? 'act-btn--success' : 'act-btn--primary'
}

// ─── Aportes que el Jefe habilitó para corregir (migración 017) ───
// Se piden junto con las tareas en cada refresco. Si falla, se ignora en silencio:
// es un extra y nunca debe afectar a la lista de tareas.
const aportesCorregibles = ref([])
const textosCorreccion = ref({})   // id de aporte -> texto en edición
const guardandoAporte = ref(null)

const cargarAportesCorregibles = async () => {
  try {
    const lista = await fetchJSON(`/ordenes/aportes/habilitados/${encodeURIComponent(legajo.value)}`)
    aportesCorregibles.value = Array.isArray(lista) ? lista : []
    for (const ap of aportesCorregibles.value) {
      if (textosCorreccion.value[ap.id] === undefined) textosCorreccion.value[ap.id] = ap.actividades
    }
  } catch (_) { /* silencioso a propósito */ }
}

const guardarCorreccionAporte = async (ap) => {
  const texto = (textosCorreccion.value[ap.id] || '').trim()
  if (!texto) return toast.error('El aporte no puede quedar vacío')
  if (texto === (ap.actividades || '').trim()) return toast.info('No hiciste ningún cambio en el texto')
  if (!confirm('Vas a guardar la corrección. Después el aporte vuelve a quedar bloqueado. ¿Confirmás?')) return
  guardandoAporte.value = ap.id
  try {
    await fetchJSON(`/ordenes/aportes/${ap.id}/corregir`, { method: 'PUT', body: JSON.stringify({ legajo: legajo.value, actividades: texto }) })
    toast.success('Aporte corregido')
    delete textosCorreccion.value[ap.id]
    await cargarAportesCorregibles()
  } catch (err) { toast.error(errMsg(err)) }
  finally { guardandoAporte.value = null }
}

const cargarTareas = async (silencioso = false) => {
  if (!silencioso) loading.value = true
  try {
    tareas.value = await fetchJSON(`/actividades/mecanico/${encodeURIComponent(legajo.value)}`)
    ultimaActualizacion.value = Date.now()
  } catch (err) {
    if (!silencioso) toast.error('Error cargando tareas: ' + errMsg(err))
  } finally {
    if (!silencioso) loading.value = false
  }
  cargarAportesCorregibles()
}

const cambiarEstado = async (tarea, estado) => {
  // Optimista: el backend pausa automáticamente cualquier OTRA tarea "En Curso" de ESTE
  // mecánico al iniciar una nueva (por persona, no afecta a sus compañeros de equipo).
  let pausadaAuto = null
  if (estado === 'En Curso') {
    for (const t of tareas.value) {
      if (t.id !== tarea.id && t.mi_estado === 'En Curso') {
        t.mi_estado = 'Pausada'
        pausadaAuto = t
      }
    }
  }
  tarea.mi_estado = estado

  try {
    await fetchJSON(`/actividades/${tarea.id}/estado`, {
      method: 'POST',
      body: JSON.stringify({ nuevo_estado: estado, legajo_mecanico: legajo.value })
    })
    toast.success(`Tu tarea de OT ${tarea.ot} pasó a "${estado}"`)
    if (pausadaAuto) toast.info(`Se pausó automáticamente tu tarea de OT ${pausadaAuto.ot}`)
    cargarTareas()
  } catch (err) {
    toast.error('Error al actualizar la tarea: ' + errMsg(err))
    cargarTareas() // revertimos el optimismo trayendo el estado real
  }
}

const abrirPausa = (tarea) => { tareaActiva.value = tarea; showModalPausa.value = true; }
const esModoInformar = ref(false)

const abrirFinalizar = (tarea) => {
  // Confirmación explícita: cerrar tu parte de la tarea no tiene "deshacer" fácil,
  // así que evitamos que un toque accidental la cierre.
  const mensaje = tarea.estado === 'Finalizada'
    ? `Un compañero ya cerró "${tarea.descripcion}". ¿Confirmás que también finalizás tu parte?`
    : `¿Confirmás que terminaste tu parte de "${tarea.descripcion}"?`
  if (!confirm(mensaje)) return
  tareaActiva.value = tarea; esModoInformar.value = false; showModalFinalizar.value = true;
}
const abrirInformar = (tarea) => { tareaActiva.value = tarea; esModoInformar.value = true; showModalFinalizar.value = true; }

const ejecutarPausa = async (motivo) => {
  try {
    await fetchJSON(`/actividades/${tareaActiva.value.id}/estado`, {
      method: 'POST',
      body: JSON.stringify({ nuevo_estado: 'Pausada', motivo, legajo_mecanico: legajo.value })
    })
    toast.info(`Tarea pausada: ${motivo}`)
    showModalPausa.value = false
    cargarTareas()
  } catch (err) { toast.error(errMsg(err)) }
}

const ejecutarFinalizacion = async (datos) => {
  try {
    const esAuxiliar = !!datos.esAuxiliar
    const puedeSerAuxiliar = (tareaActiva.value.otros_no_auxiliares || 0) > 0
    // Solo se manda el flag si la opción estaba disponible (si no, el pedido queda como siempre).
    const bodyEstado = { nuevo_estado: 'Finalizada', legajo_mecanico: legajo.value }
    if (puedeSerAuxiliar) bodyEstado.es_auxiliar = esAuxiliar

    if (esAuxiliar) {
      // AUXILIAR: no escribe aporte. Primero se cierra su parte (el backend valida que haya
      // otro mecánico que escriba el aporte); la causa solo se guarda si la completó.
      await fetchJSON(`/actividades/${tareaActiva.value.id}/estado`, { method: 'POST', body: JSON.stringify(bodyEstado) })
      if ((datos.causa || '').trim()) {
        await fetchJSON(`/ordenes/${tareaActiva.value.ot}/explicacion`, { method: 'PUT', body: JSON.stringify({ causa: datos.causa }) })
      }
      toast.success('Tu parte quedó finalizada como auxiliar')
    } else {
      // 1. Guardar/Actualizar la causa colaborativa de la OT (Método PUT)
      await fetchJSON(`/ordenes/${tareaActiva.value.ot}/explicacion`, {
        method: 'PUT',
        body: JSON.stringify({ causa: datos.causa })
      })

      // 2. Guardar el aporte de reparación individual (Método POST)
      await fetchJSON(`/ordenes/${tareaActiva.value.ot}/aportes`, {
        method: 'POST',
        body: JSON.stringify({ legajo: legajo.value, actividades: datos.reparacion, horas: 0 })
      })

      // 3. Marcar TU parte de la tarea como Finalizada. Si tenías una sesión en curso, el
      // backend la cierra; si no (venías de "Pausada" o de una tarea cerrada por el jefe),
      // simplemente registra que terminaste, sin afectar a tus compañeros de equipo.
      await fetchJSON(`/actividades/${tareaActiva.value.id}/estado`, { method: 'POST', body: JSON.stringify(bodyEstado) })

      toast.success(esModoInformar.value ? 'Informe registrado correctamente' : 'Tu parte de la tarea quedó finalizada')
    }

    showModalFinalizar.value = false
    cargarTareas()
  } catch (err) { toast.error(errMsg(err)) }
}

const cambiarLegajo = () => {
  localStorage.removeItem('legajoMecanico')
  router.push({ name: 'mecanico-login' }) 
}
const tareasCliente = computed(() => tareas.value.filter(t => t.ot !== '0000'))

// Una tarjeta por OT: la que tiene trabajo activo primero, el resto de la más vieja a la más nueva.
const ordenesAgrupadas = computed(() => agruparOrdenes(tareasCliente.value))

// ─── Lista lateral + detalle ───────────────────────────────────────────────
// OT elegida a mano. Si no hay (o la OT ya no está, p. ej. porque la finalizaste), se muestra
// la que está en curso y, si no hay, la primera de la lista. Se guarda el número de OT (no el
// objeto) para que la selección sobreviva al refresco automático de 45 s.
const seleccion = ref(null)
const otActual = computed(() =>
  ordenesAgrupadas.value.find(o => o.ot === seleccion.value) ||
  ordenesAgrupadas.value.find(o => o.activa) ||
  ordenesAgrupadas.value[0] || null)

// Tarea que estoy haciendo ahora (el backend garantiza una sola "En Curso" por mecánico)
const tareaEnCurso = computed(() => tareas.value.find(t => t.mi_estado === 'En Curso') || null)
// Horas que quedan de lo estimado para esa tarea (negativo = excedido)
const disponibleEnCurso = computed(() =>
  tareaEnCurso.value ? (Number(tareaEnCurso.value.tiempo_estimado) || 0) - horasVivas(tareaEnCurso.value, ahora.value) : 0)

const irAOrden = (tarea) => { seleccion.value = tarea.ot; activeTab.value = 'mecanico-ot' }

// La leyenda de colores va abierta en escritorio y plegada en celular
const mediaEscritorio = window.matchMedia('(min-width: 900px)')
const esEscritorio = ref(mediaEscritorio.matches)
const alCambiarPantalla = (e) => { esEscritorio.value = e.matches }

// Avance de horas de la OT (ocupadas / asignadas), en %
const porcentajeOrden = (orden) => {
  if (!orden.asignado) return 0
  return Math.round((horasOcupadasOrden(orden, ahora.value) / orden.asignado) * 100)
}

const tareasInternas = computed(() => tareas.value.filter(t => t.ot === '0000'))

const toggleTareaInterna = async (tarea) => {
  const nuevo_estado = tarea.mi_estado === 'En Curso' ? 'Pausada' : 'En Curso';

  let pausadaAuto = null
  if (nuevo_estado === 'En Curso') {
    for (const t of tareas.value) {
      if (t.id !== tarea.id && t.mi_estado === 'En Curso') {
        t.mi_estado = 'Pausada'
        pausadaAuto = t
      }
    }
  }
  tarea.mi_estado = nuevo_estado

  try {
    await fetchJSON(`/actividades/${tarea.id}/estado`, {
      method: 'POST',
      body: JSON.stringify({ nuevo_estado, motivo: 'En Espera', legajo_mecanico: legajo.value })
    })
    toast.success(`Tarea interna ${nuevo_estado}`);
    if (pausadaAuto) toast.info(`Se pausó automáticamente la tarea de OT ${pausadaAuto.ot}`)
    cargarTareas();
  } catch (err) {
    toast.error(errMsg(err));
    cargarTareas()
  }
}



const finalizarTareaInterna = async (tarea) => {
  if (tarea.es_rutina) return // por las dudas: las rutinas nunca se cierran

  const previo = tarea.mi_estado
  tarea.mi_estado = 'Finalizada'

  try {
    await fetchJSON(`/actividades/${tarea.id}/estado`, {
      method: 'POST',
      body: JSON.stringify({ nuevo_estado: 'Finalizada', legajo_mecanico: legajo.value })
    })
    toast.success('Tarea interna finalizada.')
    cargarTareas()
  } catch (err) {
    tarea.mi_estado = previo
    toast.error(errMsg(err))
  }
}

onMounted(() => {
  if (!legajo.value) {
    router.push({ name: 'mecanico-login' })
    return
  }
  mediaEscritorio.addEventListener('change', alCambiarPantalla)
  cargarTareas()

  // Reloj en vivo (cronómetro + "actualizado hace Ns"): 1 tick por segundo
  relojInterval = setInterval(() => { ahora.value = Date.now() }, 1000)

  // Auto-refresh silencioso: como varios mecánicos pueden compartir la misma
  // tarea, esto evita que alguien tome decisiones sobre datos desactualizados
  // sin tener que recargar la página a mano.
  autoRefreshInterval = setInterval(() => { cargarTareas(true) }, 45000)
})

onUnmounted(() => {
  mediaEscritorio.removeEventListener('change', alCambiarPantalla)
  if (relojInterval) clearInterval(relojInterval)
  if (autoRefreshInterval) clearInterval(autoRefreshInterval)
})
</script>

<style scoped>
/* ════════════════════════════════════════════════════════════════
   Layout: pantalla completa, sin scroll de página.
   [NavBar]  [Barra de tarea en curso]  [Lista de OT | Detalle (scroll)]
   ════════════════════════════════════════════════════════════════ */
.view-mecanico {
  display: flex; flex-direction: column;
    width: 100%; height: 100vh; height: 100dvh;
  overflow: hidden;
}
.view-mecanico > .topbar { flex: none; }
.view-mecanico > .loading-state, .view-mecanico > .empty-state { flex: 1; }

/* ── Aportes para corregir (se ve aunque no haya tareas) ──── */
.card-correccion { flex: none; max-height: 40dvh; overflow-y: auto; border-left: 4px solid var(--warning); margin: 12px 16px 0; }
.correccion-ayuda { font-size: 0.9rem; color: var(--muted); margin: 4px 0 12px; }
.correccion-item { border-top: 1px solid var(--border-soft); padding: 12px 0; }
.correccion-cabecera { margin-bottom: 6px; font-size: 0.95rem; }
.correccion-cliente { color: var(--muted); }

/* ── Piezas comunes ───────────────────────────────────────── */
.num--vivo { color: var(--success); }
.num--alerta { color: var(--warning); }
.legajo-pill { background: var(--primary-light); color: var(--primary-text); padding: 3px 10px; border-radius: 20px; font-size: 0.78rem; white-space: nowrap; }

/* Estado = punto de color + texto. Mismos colores en lista, detalle y leyenda. */
.dot { width: 10px; height: 10px; border-radius: 50%; background: var(--muted); flex-shrink: 0; display: inline-block; margin-right: 6px; }
.dot--activa { background: var(--success); animation: latido 1.8s ease-out infinite; }
.dot--pendiente { background: var(--primary); }
.dot--pausada { background: var(--muted); }
.dot--repuestos { background: var(--warning); }
.dot--terceros { background: var(--violet); }
.dot--hecha { background: var(--border); }
@keyframes latido { 0% { box-shadow: 0 0 0 0 rgba(52, 179, 111, 0.55); } 70%, 100% { box-shadow: 0 0 0 7px rgba(52, 179, 111, 0); } }
@media (prefers-reduced-motion: reduce) { .dot--activa { animation: none; } }
.estado-linea { display: inline-flex; align-items: center; font-size: 0.8rem; font-weight: 600; color: var(--text-soft); white-space: nowrap; }
.estado-linea--fuerte { color: var(--success); letter-spacing: 0.5px; }

/* ── Botones: uno destacado, el resto discretos ───────────── */
.acciones-tarea { display: flex; gap: 8px; flex-wrap: wrap; }
.act-btn {
  flex: 1 1 130px; min-height: 40px; padding: 8px 14px;
  border: 1px solid var(--border); border-radius: 8px;
  background: transparent; color: var(--text);
  font: inherit; font-size: 0.88rem; font-weight: 600; white-space: nowrap;
  cursor: pointer; transition: background 0.15s, filter 0.15s;
}
.act-btn:hover { background: var(--hover-row); }
.act-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.act-btn--primary { background: var(--primary); border-color: var(--primary); color: var(--on-primary); }
.act-btn--success { background: var(--success-solid); border-color: var(--success-solid); color: #fff; }
.act-btn--primary:hover { background: var(--primary); filter: brightness(1.1); }
.act-btn--success:hover { background: var(--success-solid); filter: brightness(1.1); }
.act-btn--icono { flex: none; min-height: 32px; padding: 4px 10px; }
.act-btn:focus-visible, .ot-item:focus-visible, .activa-bar__ot:focus-visible { outline: 2px solid var(--primary-text); outline-offset: 2px; }

/* ═══ 1. Barra de la tarea en curso ═══ */
.activa-bar {
  flex: none; display: flex; align-items: center; gap: 8px 18px; flex-wrap: nowrap;
  padding: 10px 20px;
  background: var(--row-ready-bg); border-bottom: 1px solid var(--row-ready-border); border-left: 6px solid var(--success);
}
.activa-bar--libre { background: var(--surface); border-bottom-color: var(--border-soft); border-left-color: var(--border); color: var(--muted); font-size: 0.9rem; }
.activa-bar__ot { display: inline-flex; align-items: center; gap: 8px; padding: 0; background: none; border: 0; font: inherit; font-size: 1.1rem; font-weight: 800; color: var(--text); white-space: nowrap; cursor: pointer; }
span.activa-bar__ot { cursor: default; font-size: 1rem; }
.activa-bar__ot:hover { color: var(--primary-text); }
.activa-bar__desc { flex: 1; min-width: 0; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.activa-bar__tiempos { display: flex; gap: 20px; }
.tiempo { display: flex; flex-direction: column; line-height: 1.15; }
.tiempo small { font-size: 0.65rem; text-transform: uppercase; letter-spacing: 0.5px; color: var(--muted); }
.tiempo strong { font-size: 1.15rem; }
.activa-bar__acciones { display: flex; gap: 8px; }
.activa-bar__acciones .act-btn { flex: none; }

/* ═══ 2 y 3. Panel: lista lateral + detalle ═══ */
.panel { flex: 1; min-height: 0; display: flex; }

.lista { flex: none; width: 300px; display: flex; flex-direction: column; background: var(--surface); border-right: 1px solid var(--border-soft); min-height: 0; }
.lista__cabecera { flex: none; display: flex; align-items: center; gap: 8px; padding: 12px 14px; border-bottom: 1px solid var(--border-soft); }
.lista__titulo { flex: 1; font-size: 0.8rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: var(--muted); text-align: right; }
.lista__items { flex: 1; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; }

.ot-item { display: flex; align-items: center; gap: 4px; width: 100%; padding: 12px 14px; background: none; border: 0; border-left: 4px solid transparent; border-bottom: 1px solid var(--border-soft); font: inherit; color: var(--text); text-align: left; cursor: pointer; }
.ot-item:hover { background: var(--hover-row); }
.ot-item--sel { background: var(--hover-row); border-left-color: var(--primary); }
.ot-item__txt { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.ot-item__l1 { display: flex; align-items: center; gap: 8px; }
.ot-item__l2 { font-size: 0.85rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ot-item__l3 { font-size: 0.75rem; color: var(--muted); }
.ot-item__n { flex: none; min-width: 20px; padding: 0 6px; border-radius: 10px; background: var(--border-soft); font-size: 0.72rem; font-weight: 700; text-align: center; }

.leyenda { flex: none; padding: 10px 14px; border-top: 1px solid var(--border-soft); font-size: 0.78rem; color: var(--text-soft); }
.leyenda summary { cursor: pointer; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; font-size: 0.7rem; color: var(--muted); }
.leyenda ul { list-style: none; margin: 8px 0 0; padding: 0; display: flex; flex-direction: column; gap: 5px; }
.leyenda li { display: flex; align-items: center; }
.leyenda__act { margin: 10px 0 0; font-size: 0.7rem; color: var(--muted); }

/* Detalle: ocupa todo el resto de la pantalla y hace scroll por su cuenta */
.detalle { flex: 1; min-width: 0; min-height: 0; overflow-y: auto; padding: 20px 28px 40px; }
.det-cabecera__fila { display: flex; align-items: center; flex-wrap: wrap; gap: 12px; }
.det-cabecera__num { font-size: 1.5rem; font-weight: 800; color: var(--muted); }
.det-cabecera__unidad { margin: 8px 0 2px; font-size: 1.3rem; }
.det-cabecera__cliente { color: var(--muted); font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.3px; }

.tiempos { display: grid; grid-template-columns: auto auto 1fr; align-items: center; gap: 8px 32px; margin: 18px 0 6px; padding: 14px 16px; background: var(--surface); border: 1px solid var(--border-soft); border-radius: 12px; }
.tiempos__dato { display: flex; flex-direction: column; line-height: 1.2; }
.tiempos__dato small, .tarea__datos dt { font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.5px; color: var(--muted); }
.tiempos__dato strong { font-size: 1.3rem; }
.tiempos__barra { height: 8px; border-radius: 4px; background: var(--border-soft); overflow: hidden; }
.tiempos__barra span { display: block; height: 100%; background: var(--primary); border-radius: 4px; transition: width 0.4s; }
.tiempos__barra span.tiempos__relleno--excedido { background: var(--warning); }

.det-subtitulo { margin: 22px 0 10px; font-size: 0.8rem; font-weight: 700; letter-spacing: 0.6px; text-transform: uppercase; color: var(--muted); }

/* Tareas: una tarjeta simple por tarea, un solo acento (borde izquierdo si está en curso) */
.tareas, .grid-interna { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 420px), 1fr)); gap: 14px; align-items: start; }
.tarea { display: flex; flex-direction: column; gap: 10px; padding: 16px; background: var(--surface); border: 1px solid var(--border-soft); border-left: 4px solid var(--border); border-radius: 12px; box-shadow: var(--shadow-sm); }
.tarea--activa { border-left-color: var(--success); }
.tarea__estado { display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap; }
.tarea__general { margin: 0; font-size: 0.78rem; color: var(--muted); }
.tarea__general strong { color: var(--text-soft); }
.tarea__desc { margin: 0; font-size: 1.05rem; font-weight: 600; line-height: 1.35; overflow-wrap: anywhere; }
.tarea__datos { display: flex; flex-wrap: wrap; gap: 8px 28px; margin: 0; padding: 10px 0; border-top: 1px solid var(--border-soft); border-bottom: 1px solid var(--border-soft); }
.tarea__datos dd { margin: 2px 0 0; font-weight: 600; }
.tarea__equipo { flex-basis: 100%; }
.tarea__aviso { margin: 0; padding: 8px 12px; border-left: 3px solid var(--warning); background: var(--hover-row); border-radius: 0 8px 8px 0; font-size: 0.85rem; }

.interna { flex: 1; min-height: 0; overflow-y: auto; padding: 8px 28px 40px; }

/* ═══ Celular: la lista pasa arriba como solapas y el detalle ocupa el resto ═══ */
@media (max-width: 899px) {
  .activa-bar { flex-wrap: wrap; padding: 8px 12px; gap: 4px 12px; }
  .activa-bar__desc { flex-basis: 100%; order: 3; white-space: normal; display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; }
  .activa-bar__tiempos { order: 2; margin-left: auto; gap: 14px; }
  .activa-bar__acciones { order: 4; flex-basis: 100%; }
  .activa-bar__acciones .act-btn { flex: 1; min-height: 44px; }

  .panel { flex-direction: column; }
  .lista { width: auto; flex-direction: row; flex-wrap: wrap; border-right: 0; border-bottom: 1px solid var(--border-soft); }
  .lista__cabecera { order: 1; flex: 1 1 100%; padding: 6px 12px; border-bottom: 0; }
  .lista__items { order: 2; flex: 1 1 100%; flex-direction: row; overflow-x: auto; overflow-y: hidden; scrollbar-width: thin; }
  .ot-item { flex: none; width: auto; min-width: 150px; max-width: 220px; padding: 8px 12px; border-left: 0; border-bottom: 4px solid transparent; border-right: 1px solid var(--border-soft); }
  .ot-item--sel { border-bottom-color: var(--primary); }
  .ot-item__l2 { display: none; }              /* en solapas: dot + #OT + patente + estado */
  .leyenda { order: 3; flex: 1 1 100%; padding: 6px 12px; }
  .leyenda ul { flex-direction: row; flex-wrap: wrap; gap: 4px 14px; }
  .leyenda__act { display: none; }

  .detalle, .interna { padding: 14px 12px 32px; }
  .tiempos { grid-template-columns: 1fr 1fr; }
  .tiempos__barra { grid-column: 1 / -1; }
  .act-btn { min-height: 44px; flex-basis: 100%; }
  .act-btn--icono { flex: none; min-height: 32px; padding: 2px 12px; }   /* gana a la regla de arriba */
  .lista__titulo { white-space: nowrap; }

}
</style>
