<template>
  <div class="view-mecanico">
    <NavBar brand="🛠️ Mi Panel - Taller" :tabs="tabs" v-model:activeTab="activeTab" logoutText="Cambiar legajo" customLogout @logout="cambiarLegajo" />

    <!-- Aportes que el Jefe habilitó para corregir. Va fuera del bloque de tareas a propósito:
         tiene que verse aunque el mecánico no tenga ninguna tarea pendiente. -->
    <div v-if="aportesCorregibles.length" class="card card-correccion">
      <h2>✏️ Aportes para corregir</h2>
      <p class="correccion-ayuda">El Jefe de Taller te habilitó a corregir {{ aportesCorregibles.length === 1 ? 'este aporte' : 'estos aportes' }}. Podés modificar cada uno <strong>una sola vez</strong>.</p>
      <div v-for="ap in aportesCorregibles" :key="ap.id" class="correccion-item">
        <div class="correccion-cabecera">
          <strong>OT {{ ap.ot }}</strong> · {{ ap.patente }} · {{ ap.unidad }} <span class="correccion-cliente">({{ ap.cliente }})</span>
        </div>
        <textarea v-model="textosCorreccion[ap.id]" rows="4" class="form-control" :disabled="guardandoAporte === ap.id"></textarea>
        <button class="btn btn-success btn-sm mt-8" :disabled="guardandoAporte === ap.id" @click="guardarCorreccionAporte(ap)">
          {{ guardandoAporte === ap.id ? 'Guardando...' : 'Guardar corrección' }}
        </button>
      </div>
    </div>

    <div class="card">
      <div class="header-row">
        <h2>Tareas Asignadas</h2>
        <div style="display:flex; align-items:center; gap:8px; flex-wrap: wrap;">
          <span class="legajo-pill">Legajo: <strong>{{ legajo }}</strong></span>
          <button class="btn btn-outline btn-sm" @click="cargarTareas(false)" :disabled="loading" title="Actualizar ahora">🔄</button>
        </div>
      </div>
      <p class="ultima-actualizacion" v-if="ultimaActualizacion">Actualizado hace {{ segundosDesdeActualizacion }}s · se actualiza solo cada 45s</p>

      <div v-if="loading" class="loading-state">
        <div class="spinner"></div>
        Cargando tareas...
      </div>

      <div v-else-if="tareas.length === 0" class="empty-state">
        No tiene tareas asignadas por el momento.
      </div>

     <div v-else>
        <!-- SECCIÓN TAREAS INTERNAS -->
        <div v-if="activeTab === 'mecanico-interna'" v-show="tareasInternas.length > 0" class="seccion">
          <h3 class="seccion__titulo">Rutinas y tareas internas</h3>
          <div class="grid-ot">
            <article v-for="tarea in tareasInternas" :key="tarea.id" class="ot-card" :class="tarea.mi_estado === 'En Curso' ? 'ot-card--activa' : 'ot-card--pausada'">
              <header class="ot-card__top">
                <span class="estado-linea"><span class="dot" :class="dotClass(tarea.mi_estado)"></span>{{ tarea.mi_estado }}</span>
                <span v-if="tarea.es_rutina" class="etiqueta" title="Tarea rutinaria: siempre disponible, no se cierra">🔁 Rutina</span>
              </header>
              <h4 class="ot-card__unidad">{{ tarea.descripcion }}</h4>
              <div class="ot-card__cliente">Asignado por Jefe de Taller</div>
              <div class="acciones-tarea">
                <button v-if="tarea.mi_estado !== 'En Curso'" v-can="'tarea_operar'" @click="toggleTareaInterna(tarea)" class="act-btn act-btn--primary">▶ Iniciar{{ tarea.es_rutina ? ' rutina' : '' }}</button>
                <button v-else v-can="'tarea_operar'" @click="toggleTareaInterna(tarea)" class="act-btn">⏸ Pausar</button>
                <!-- Solo las extraordinarias se pueden cerrar; las rutinas nunca -->
                <button v-if="!tarea.es_rutina && ['En Curso', 'Pausada'].includes(tarea.mi_estado)" v-can="'tarea_operar'" @click="finalizarTareaInterna(tarea)" class="act-btn">✔ Finalizar</button>
              </div>
            </article>
          </div>
        </div>

        <!-- SECCIÓN OTs DE CLIENTES -->
        <div v-if="activeTab === 'mecanico-ot'" v-show="tareasCliente.length > 0" class="seccion">
          <h3 class="seccion__titulo">Órdenes de trabajo</h3>
          <!-- Una tarjeta por OT. La OT donde está trabajando ahora va primera; el resto, de la más vieja a la más nueva.
               Un solo acento de color por tarjeta (borde izquierdo) y una sola línea de estado por tarea.
               El detalle (equipo, estado general, estimado) vive en un modal. -->
          <div class="grid-ot">
            <article v-for="orden in ordenesAgrupadas" :key="orden.ot" class="ot-card" :class="claseOrden(orden)">
              <header class="ot-card__top">
                <span class="ot-card__num">#{{ orden.ot }}</span>
                <span class="patente-badge">{{ orden.patente }}</span>
              </header>
              <h4 class="ot-card__unidad">{{ orden.unidad }}</h4>
              <div class="ot-card__cliente" :title="orden.cliente">{{ orden.cliente }}</div>

              <!-- Horas de la OT: un solo renglón + barra de avance (asignado vs. ocupado) -->
              <div class="progreso">
                <div class="progreso__texto">
                  <span><strong class="num" :class="{ 'num--vivo': orden.activa }">{{ formatoHoras(horasOcupadasOrden(orden, ahora)) }}</strong> ocupadas</span>
                  <span>de {{ redondear1(orden.asignado) }} h</span>
                </div>
                <div class="progreso__barra" role="progressbar" :aria-valuenow="porcentajeOrden(orden)" aria-valuemin="0" aria-valuemax="100">
                  <span :class="{ 'progreso__relleno--excedido': porcentajeOrden(orden) >= 100 }" :style="{ width: Math.min(porcentajeOrden(orden), 100) + '%' }"></span>
                </div>
              </div>

              <ul class="ot-card__tareas">
                <li v-for="tarea in orden.tareas" :key="tarea.id" class="fila-tarea">
                  <button type="button" class="fila-tarea__info" title="Ver detalle de la tarea" @click="verDetalle(tarea)">
                    <span class="estado-linea"><span class="dot" :class="dotClass(tarea.mi_estado)"></span>{{ tarea.mi_estado }}</span>
                    <span class="fila-tarea__desc">{{ tarea.descripcion }}</span>
                    <!-- Con varias tareas en la OT, cada una muestra sus horas; con una sola ya está en la barra de arriba -->
                    <span v-if="orden.tareas.length > 1" class="fila-tarea__meta">
                      Est. {{ redondear1(tarea.tiempo_estimado) }} h ·
                      <strong class="num" :class="{ 'num--vivo': tarea.mi_estado === 'En Curso' }">{{ tiempoVivo(tarea) }}</strong>
                    </span>
                    <span v-if="tarea.estado === 'Finalizada' && tarea.mi_estado !== 'Finalizada'" class="fila-tarea__aviso">⚠ Un compañero ya cerró esta tarea</span>
                    <span class="fila-tarea__ver" aria-hidden="true">Detalle ›</span>
                  </button>

                  <!-- Acciones sobre TU propio estado, independiente del resto del equipo.
                       Un solo botón destacado por tarea; el resto, discretos. -->
                  <div class="acciones-tarea">
                    <button v-if="tarea.mi_estado === 'Asignada'" v-can="'tarea_operar'" @click="cambiarEstado(tarea, 'En Curso')" class="act-btn" :class="clasePrincipal(tarea, 'iniciar')">▶ Iniciar</button>
                    <button v-if="tarea.mi_estado === 'Pausada'" v-can="'tarea_operar'" @click="cambiarEstado(tarea, 'En Curso')" class="act-btn" :class="clasePrincipal(tarea, 'iniciar')">▶ Reanudar</button>
                    <button v-if="tarea.mi_estado === 'En Curso'" v-can="'tarea_operar'" @click="abrirPausa(tarea)" class="act-btn">⏸ Pausar</button>
                    <button v-if="['En Curso', 'Pausada'].includes(tarea.mi_estado)" v-can="'tarea_operar'" @click="abrirFinalizar(tarea)" class="act-btn" :class="clasePrincipal(tarea, 'finalizar')">✔ Finalizar mi parte</button>
                    <!-- La tarea completa fue cerrada por el Jefe: solo queda completar el informe -->
                    <button v-if="tarea.estado === 'Cerrada por Jefe' && tarea.mi_estado !== 'Finalizada'" v-can="'tarea_operar'" @click="abrirInformar(tarea)" class="act-btn" :class="clasePrincipal(tarea, 'informar')">📝 Informar</button>
                  </div>
                </li>
              </ul>
            </article>
          </div>
        </div>
      </div>

    <ModalDetalleTarea v-if="tareaDetalle" :tarea="tareaDetalle" :ahora="ahora" @close="detalleId = null" />
    <ModalPausarTarea v-if="showModalPausa" @close="showModalPausa = false" @confirm="ejecutarPausa" />
    <ModalFinalizarTarea v-if="showModalFinalizar" :otId="tareaActiva.ot" :modoInformar="esModoInformar" :puedeSerAuxiliar="(tareaActiva.otros_no_auxiliares || 0) > 0" @close="showModalFinalizar = false" @confirm="ejecutarFinalizacion" />
  </div>
  </div>
</template>

<script setup>
import { agruparOrdenes, horasOcupadasOrden } from '../utils/ordenesMecanico'
import { formatoHoras, horasVivas, redondear1 } from '../utils/horas'
import { ref, onMounted, onUnmounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useApi } from '../composables/useApi'
import { useToast, errMsg } from '../composables/useToast'
import NavBar from '../components/common/NavBar.vue'
import ModalPausarTarea from '../components/mecanico/ModalPausarTarea.vue'
import ModalFinalizarTarea from '../components/mecanico/ModalFinalizarTarea.vue'
import ModalDetalleTarea from '../components/mecanico/ModalDetalleTarea.vue'


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

// Punto de color junto al estado (único indicador de estado por tarea)
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

// Detalle de tarea en modal. Se guarda el id (no el objeto) para que siga actualizado
// cuando la pantalla se refresca sola cada 45 s.
const detalleId = ref(null)
const tareaDetalle = computed(() => tareas.value.find(t => t.id === detalleId.value) || null)
const verDetalle = (tarea) => { detalleId.value = tarea.id }

// Avance de horas de la OT (ocupadas / asignadas), en %
const porcentajeOrden = (orden) => {
  if (!orden.asignado) return 0
  return Math.round((horasOcupadasOrden(orden, ahora.value) / orden.asignado) * 100)
}

const claseOrden = (orden) => ({
  'ot-card--activa': orden.activa,
  'ot-card--pausada': !orden.activa && orden.tareas.some(t => t.mi_estado === 'Pausada')
})

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
  cargarTareas()

  // Reloj en vivo (cronómetro + "actualizado hace Ns"): 1 tick por segundo
  relojInterval = setInterval(() => { ahora.value = Date.now() }, 1000)

  // Auto-refresh silencioso: como varios mecánicos pueden compartir la misma
  // tarea, esto evita que alguien tome decisiones sobre datos desactualizados
  // sin tener que recargar la página a mano.
  autoRefreshInterval = setInterval(() => { cargarTareas(true) }, 45000)
})

onUnmounted(() => {
  if (relojInterval) clearInterval(relojInterval)
  if (autoRefreshInterval) clearInterval(autoRefreshInterval)
})
</script>

<style scoped>
.header-row { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; margin-bottom: 4px; }
.header-row h2 { margin: 0; }
.legajo-pill { background: var(--primary-light); color: var(--primary); padding: 4px 12px; border-radius: 20px; font-size: 0.85rem; }
.ultima-actualizacion { margin: 0 0 10px; font-size: 0.75rem; color: var(--muted); }

.seccion { margin-bottom: 24px; }
.seccion__titulo { margin: 0 0 4px; padding-bottom: 8px; font-size: 0.8rem; font-weight: 700; letter-spacing: 0.6px; text-transform: uppercase; color: var(--muted); border-bottom: 1px solid var(--border-soft); }

.num { font-variant-numeric: tabular-nums; }
.num--vivo { color: var(--success); }

/* ── Tarjeta por OT ───────────────────────────────────────── */
.grid-ot { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 340px), 1fr)); gap: 16px; margin-top: 14px; align-items: start; }
.ot-card {
  display: flex; flex-direction: column; gap: 4px;
  padding: 16px;
  border: 1px solid var(--border-soft);
  border-left: 4px solid var(--border);      /* único acento de color de la tarjeta */
  border-radius: 12px;
  background: var(--surface);
  box-shadow: var(--shadow-sm);
}
.ot-card--pausada { border-left-color: var(--warning); }
.ot-card--activa { border-left-color: var(--success); }
.ot-card__top { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
.ot-card__num { font-weight: 700; font-size: 1.05rem; color: var(--muted); }
.ot-card__unidad { margin: 6px 0 0; font-weight: 700; font-size: 1.05rem; line-height: 1.25; }
.ot-card__cliente { color: var(--muted); font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.3px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.patente-badge { background: #fff; color: #111; border: 2px solid #111; padding: 1px 9px; border-radius: 6px; font-family: monospace; font-weight: 700; font-size: 1rem; letter-spacing: 1px; }

/* ── Avance de horas ──────────────────────────────────────── */
.progreso { margin: 12px 0 4px; }
.progreso__texto { display: flex; justify-content: space-between; gap: 8px; font-size: 0.8rem; color: var(--muted); margin-bottom: 6px; }
.progreso__texto strong { color: var(--text); font-size: 0.95rem; }
.progreso__texto strong.num--vivo { color: var(--success); }
.progreso__barra { height: 6px; border-radius: 3px; background: var(--border-soft); overflow: hidden; }
.progreso__barra span { display: block; height: 100%; background: var(--primary); border-radius: 3px; transition: width 0.4s; }
.progreso__barra span.progreso__relleno--excedido { background: var(--warning); }

/* ── Estado: punto + texto ────────────────────────────────── */
.estado-linea { display: inline-flex; align-items: center; gap: 6px; font-size: 0.78rem; font-weight: 600; color: var(--text-soft); }
.dot { width: 8px; height: 8px; border-radius: 50%; background: var(--muted); flex-shrink: 0; }
.dot--activa { background: var(--success); box-shadow: 0 0 0 0 var(--success); animation: latido 1.8s ease-out infinite; }
.dot--pausada { background: var(--warning); }
.dot--pendiente { background: var(--primary); }
@keyframes latido { 0% { box-shadow: 0 0 0 0 rgba(39, 174, 96, 0.55); } 70%, 100% { box-shadow: 0 0 0 7px rgba(39, 174, 96, 0); } }
@media (prefers-reduced-motion: reduce) { .dot--activa { animation: none; } }
.etiqueta { font-size: 0.75rem; color: var(--muted); }

/* ── Tareas dentro de la OT: lista limpia, sin cajas anidadas ─ */
.ot-card__tareas { list-style: none; margin: 10px 0 0; padding: 0; display: flex; flex-direction: column; }
.fila-tarea { padding: 12px 0; border-top: 1px solid var(--border-soft); }
.fila-tarea__info { display: flex; flex-direction: column; align-items: flex-start; gap: 4px; width: 100%; padding: 0; background: none; border: 0; text-align: left; font: inherit; color: var(--text); cursor: pointer; }
.fila-tarea__desc { font-weight: 600; font-size: 0.98rem; line-height: 1.35; overflow-wrap: anywhere; display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.fila-tarea__meta { font-size: 0.8rem; color: var(--muted); }
.fila-tarea__aviso { font-size: 0.78rem; color: var(--status-urgente-text); }
.fila-tarea__ver { font-size: 0.75rem; color: var(--primary); }
.fila-tarea__info:hover .fila-tarea__ver, .fila-tarea__info:focus-visible .fila-tarea__ver { text-decoration: underline; }
.fila-tarea__info:focus-visible { outline: 2px solid var(--primary); outline-offset: 3px; border-radius: 4px; }

/* ── Botones: uno destacado, el resto discretos ───────────── */
.acciones-tarea { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 10px; }
.act-btn {
  flex: 1 1 120px; min-height: 40px; padding: 8px 12px;
  border: 1px solid var(--border); border-radius: 8px;
  background: transparent; color: var(--text);
  font: inherit; font-size: 0.88rem; font-weight: 600; white-space: nowrap;
  cursor: pointer; transition: background 0.15s, filter 0.15s;
}
.act-btn:hover { background: var(--hover-row); }
.act-btn--primary { background: var(--primary); border-color: var(--primary); color: #fff; }
.act-btn--success { background: var(--success); border-color: var(--success); color: #fff; }
.act-btn--primary:hover, .act-btn--success:hover { filter: brightness(1.1); }
.act-btn--primary:hover { background: var(--primary); }
.act-btn--success:hover { background: var(--success); }
.act-btn:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }

/* ── Aportes para corregir ────────────────────────────────── */
.card-correccion { border-left: 4px solid var(--warning); margin-bottom: 15px; }
.correccion-ayuda { font-size: 0.9rem; color: var(--muted); margin: 4px 0 12px; }
.correccion-item { border-top: 1px solid var(--border-soft); padding: 12px 0; }
.correccion-cabecera { margin-bottom: 6px; font-size: 0.95rem; }
.correccion-cliente { color: var(--muted); }
.mt-8 { margin-top: 8px; }

@media (max-width: 640px) {
  .ot-card { padding: 14px; }
  .act-btn { flex-basis: 100%; min-height: 44px; }  /* más fácil de tocar con el pulgar */
}
</style>
