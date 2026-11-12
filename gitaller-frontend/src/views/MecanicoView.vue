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
        <div v-if="activeTab === 'mecanico-interna'" v-show="tareasInternas.length > 0" style="margin-bottom: 30px;">
          <h3 style="color: var(--muted); border-bottom: 1px solid var(--border-soft); padding-bottom: 8px;">Rutinas y Tareas Internas</h3>
          <div class="grid-tareas">
            <div v-for="tarea in tareasInternas" :key="tarea.id" class="card-tarea" style="background-color: var(--status-urgente-bg); border-left: 4px solid var(--warning);">
              <div class="tarea-header">
                <h3>{{ tarea.descripcion }}</h3>
                <span :class="['badge-sm', estadoClass(tarea.mi_estado)]">{{ tarea.mi_estado }}</span>
              </div>
              <p class="tarea-horas">
                Asignado por Jefe de Taller
                <span v-if="tarea.es_rutina" class="badge-sm badge-rutina" title="Tarea rutinaria: siempre disponible, no se cierra">🔁 Rutina</span>
              </p>
              <div class="acciones-tarea mt-10">
                <button v-if="tarea.mi_estado !== 'En Curso'" v-can="'tarea_operar'" @click="toggleTareaInterna(tarea)" class="btn btn-outline btn-sm w-100">▶ Iniciar{{ tarea.es_rutina ? ' Rutina' : '' }}</button>
                <button v-else v-can="'tarea_operar'" @click="toggleTareaInterna(tarea)" class="btn btn-warning btn-sm w-100">⏸ Detener / Pausar</button>

                <!-- Solo las extraordinarias se pueden cerrar; las rutinas nunca -->
                <button v-if="!tarea.es_rutina && ['En Curso', 'Pausada'].includes(tarea.mi_estado)" v-can="'tarea_operar'" @click="finalizarTareaInterna(tarea)" class="btn btn-success btn-sm w-100 mt-5">✅ Finalizar</button>
              </div>
            </div>
          </div>
          <p v-if="tareasInternas.length === 0" class="empty-state">No tenés tareas internas asignadas por el momento.</p>
        </div>

        <!-- SECCIÓN OTs DE CLIENTES -->
        <div v-if="activeTab === 'mecanico-ot'" v-show="tareasCliente.length > 0">
          <h3 style="color: var(--primary-dark); border-bottom: 1px solid var(--border-soft); padding-bottom: 8px;">Órdenes de Trabajo</h3>
          <!-- Una tarjeta por OT, al estilo de la sala de espera. La OT donde está trabajando
               ahora va primera y en verde; el resto, de la más vieja a la más nueva. -->
          <div class="grid-ot">
            <article v-for="orden in ordenesAgrupadas" :key="orden.ot" class="ot-card" :class="claseOrden(orden)">
              <header class="ot-card__top">
                <span class="ot-card__num">#{{ orden.ot }}</span>
                <span class="patente-badge">{{ orden.patente }}</span>
              </header>
              <div class="ot-card__unidad">{{ orden.unidad }}</div>
              <div class="ot-card__cliente">{{ orden.cliente }}</div>

              <div v-if="orden.activa" class="ot-card__ahora">⏺ TRABAJANDO AHORA</div>

              <div class="ot-card__tiempos">
                <div>
                  <span class="tiempo-label">Asignado</span>
                  <strong>{{ redondear1(orden.asignado) }} h</strong>
                </div>
                <div>
                  <span class="tiempo-label">Ocupado</span>
                  <strong :class="{ 'tiempo-vivo': orden.activa }">{{ formatoHoras(horasOcupadasOrden(orden, ahora)) }}</strong>
                </div>
              </div>

              <!-- Mis actividades en esta OT. La descripción ocupa un solo renglón; al tocar la fila se despliega completa. -->
              <ul class="ot-card__tareas">
                <li v-for="tarea in orden.tareas" :key="tarea.id" class="fila-tarea" :class="tarjetaClass(tarea)">
                  <button type="button" class="fila-tarea__cabecera" :aria-expanded="abierta(tarea)" @click="alternar(tarea)">
                    <span class="mi-estado-chip" :class="estadoClass(tarea.mi_estado)">{{ tarea.mi_estado }}</span>
                    <span class="fila-tarea__desc" :class="{ 'fila-tarea__desc--completa': abierta(tarea) }">{{ tarea.descripcion }}</span>
                    <span class="fila-tarea__flecha" aria-hidden="true">{{ abierta(tarea) ? '▴' : '▾' }}</span>
                  </button>

                  <div class="fila-tarea__meta">
                    <span>⏱ Est. {{ redondear1(tarea.tiempo_estimado) }} h</span>
                    <span v-if="tarea.mi_estado === 'En Curso'">· <strong class="tiempo-vivo">{{ tiempoVivo(tarea) }}</strong> ⏺</span>
                    <span v-else>· Mis horas: <strong>{{ formatoHoras(tarea.mi_tiempo_real) }}</strong></span>
                  </div>

                  <div v-if="abierta(tarea)" class="fila-tarea__detalle">
                    <div class="tarea-card__equipo">👥 {{ tarea.equipo }}</div>
                    <div class="tarea-card__tarea-general">Estado general de la tarea: <strong>{{ tarea.estado }}</strong></div>
                  </div>

                  <p v-if="tarea.estado === 'Finalizada' && tarea.mi_estado !== 'Finalizada'" class="aviso-compañero">
                    <span class="aviso-compañero__icono">⚠</span>
                    <span><strong>Un compañero ya cerró esta tarea.</strong> Podés reanudar si falta algo, o solo completar tu informe.</span>
                  </p>

                  <!-- Botones de acción: actúan sobre TU propio estado, independiente del resto del equipo -->
                  <div class="acciones-tarea">
                    <button v-if="tarea.mi_estado === 'Asignada'" v-can="'tarea_operar'" @click="cambiarEstado(tarea, 'En Curso')" class="btn btn-primary btn-lg">▶ Iniciar</button>
                    <button v-if="tarea.mi_estado === 'Pausada'" v-can="'tarea_operar'" @click="cambiarEstado(tarea, 'En Curso')" class="btn btn-primary btn-lg">▶ Reanudar</button>

                    <button v-if="tarea.mi_estado === 'En Curso'" v-can="'tarea_operar'" @click="abrirPausa(tarea)" class="btn btn-warning btn-lg">⏸ Pausar</button>
                    <button v-if="['En Curso', 'Pausada'].includes(tarea.mi_estado)" v-can="'tarea_operar'" @click="abrirFinalizar(tarea)" class="btn btn-success btn-lg">✔ Finalizar mi parte</button>

                    <!-- La tarea completa fue cerrada por el Jefe: solo queda completar el informe -->
                    <button v-if="tarea.estado === 'Cerrada por Jefe' && tarea.mi_estado !== 'Finalizada'" v-can="'tarea_operar'" @click="abrirInformar(tarea)" class="btn btn-primary btn-lg">📝 Informar</button>
                  </div>
                </li>
              </ul>
            </article>
          </div>
        </div>
      </div>

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

const estadoClass = (estado) => ({
  'Pendiente': 'badge-info',
  'Asignada': 'badge-info',
  'En Curso': 'badge-progress',
  'Pausada': 'badge-warn',
  'Finalizada': 'badge-progress'
}[estado] || '')

// Color del borde izquierdo de la tarjeta según TU estado personal en esa tarea
const tarjetaClass = (tarea) => ({
  'Asignada': 'tarea-card--info',
  'En Curso': 'tarea-card--progress',
  'Pausada': 'tarea-card--warn',
  'Finalizada': 'tarea-card--done'
}[tarea.mi_estado] || 'tarea-card--info')

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

// Filas desplegadas (se recuerdan aunque la pantalla se actualice sola cada 45 s).
const abiertas = ref({})
const abierta = (tarea) => !!abiertas.value[tarea.id]
const alternar = (tarea) => { abiertas.value[tarea.id] = !abierta(tarea) }

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

.grid-tareas { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 15px; margin-top: 10px; }
.card-tarea { border: 1px solid var(--border-soft); padding: 16px; border-radius: var(--radius); background: var(--surface); box-shadow: var(--shadow-sm); }
.tarea-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
.tarea-header h3 { margin: 0; font-size: 1.05rem; color: var(--primary); }
.tarea-vehiculo { margin: 2px 0; font-size: 0.9rem; }
.tarea-cliente { margin: 0 0 8px; color: var(--muted); font-size: 0.85rem; }
.badge-rutina { margin-left: 6px; background: var(--primary); }
.tarea-desc { font-size: 0.9rem; margin-bottom: 4px; }
.tarea-horas { font-size: 0.8rem; color: var(--muted); margin-bottom: 12px; }
.acciones-tarea { display: flex; gap: 8px; flex-wrap: wrap; }

.badge-info { background: var(--primary); color: white; }
.badge-progress { background: var(--success); color: white; }
.badge-warn { background: var(--warning); color: white; }

.fila-tarea.tarea-card--info { border-left-color: var(--primary); }
.fila-tarea.tarea-card--progress { border-left-color: var(--success); }
.fila-tarea.tarea-card--warn { border-left-color: var(--warning); }
.fila-tarea.tarea-card--done { border-left-color: var(--muted); }

.mi-estado-chip {
  flex-shrink: 0;
  padding: 4px 10px;
  border-radius: 20px;
  font-size: 0.78rem;
  font-weight: 700;
  white-space: nowrap;
}

.tarea-card__equipo {
  font-size: 0.85rem;
  color: var(--primary);
  margin-bottom: 4px;
}
.tarea-card__tarea-general {
  font-size: 0.8rem;
  color: var(--muted);
  margin-bottom: 10px;
  padding-bottom: 10px;
  border-bottom: 1px dashed var(--border);
}

.aviso-compañero {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  background: var(--status-urgente-bg);
  border: 1px solid var(--status-urgente-border);
  color: var(--status-urgente-text);
  font-size: 0.85rem;
  padding: 10px 12px;
  border-radius: 8px;
  margin: 0 0 12px;
}
.aviso-compañero__icono { font-size: 1.1rem; line-height: 1.2; flex-shrink: 0; }

.tiempo-vivo {
  color: var(--success);
  font-variant-numeric: tabular-nums;
}

.acciones-tarea .btn-lg {
  padding: 12px 16px;
  font-size: 0.95rem;
  font-weight: 600;
}

/* En celular, cada botón ocupa todo el ancho y se apilan: son más fáciles
   de tocar con el pulgar y no hay riesgo de tocar el botón equivocado. */
@media (max-width: 640px) {
  .grid-tareas { grid-template-columns: 1fr; }
  .ot-card { padding: 12px; }
  .acciones-tarea { flex-direction: column; }
  .acciones-tarea .btn-lg { width: 100%; }
}

.patente-badge { background: #fff; color: #111; border: 2px solid #111; padding: 2px 10px; border-radius: 6px; font-family: monospace; font-weight: 700; font-size: 1.1rem; display: inline-block; letter-spacing: 1px; }
/* --- Tarjeta por OT (estilo sala de espera) --- */
.grid-ot { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 340px), 1fr)); gap: 16px; margin-top: 12px; align-items: start; }
.ot-card {
  display: flex; flex-direction: column; gap: 6px;
  padding: 16px;
  border: 1px solid var(--border-soft);
  border-left: 8px solid var(--muted);
  border-radius: 12px;
  background: var(--surface);
  box-shadow: var(--shadow-sm);
}
.ot-card--pausada { border-left-color: var(--warning); }
/* Trabajo activo: verde, como las tarjetas "En Proceso" de la sala de espera */
.ot-card--activa { border-color: var(--row-ready-border); border-left-color: var(--success); background: var(--row-ready-bg); }
.ot-card__top { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
.ot-card__num { font-weight: 800; font-size: 1.4rem; color: var(--muted); }
.ot-card__unidad { font-weight: 700; font-size: 1.1rem; line-height: 1.25; }
.ot-card__cliente { color: var(--muted); font-size: 0.85rem; font-weight: 500; text-transform: uppercase; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ot-card__ahora { background: var(--success); color: #fff; font-weight: 800; letter-spacing: 0.5px; text-align: center; padding: 6px 10px; border-radius: 8px; font-size: 0.85rem; }
.ot-card__tiempos { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; background: var(--hover-row); border-radius: 8px; padding: 10px 12px; margin-top: 4px; }
.ot-card__tiempos strong { display: block; font-size: 1.2rem; font-variant-numeric: tabular-nums; }
.tiempo-label { display: block; font-size: 0.72rem; color: var(--muted); text-transform: uppercase; letter-spacing: 0.4px; }
.ot-card__tareas { list-style: none; margin: 6px 0 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }

.fila-tarea { border: 1px solid var(--border); border-left-width: 5px; border-radius: 10px; padding: 10px 12px; background: var(--surface); }
.fila-tarea__cabecera { display: flex; align-items: center; gap: 8px; width: 100%; background: none; border: 0; padding: 0; text-align: left; cursor: pointer; color: var(--text); font: inherit; }
.fila-tarea__desc { flex: 1; min-width: 0; font-weight: 600; font-size: 1rem; line-height: 1.35; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fila-tarea__desc--completa { white-space: normal; overflow: visible; }
.fila-tarea__flecha { flex-shrink: 0; color: var(--muted); }
.fila-tarea__meta { display: flex; flex-wrap: wrap; gap: 4px 8px; margin: 6px 0 4px; font-size: 0.85rem; color: var(--muted); }
.fila-tarea__detalle { margin: 6px 0; padding: 8px 0 2px; border-top: 1px dashed var(--border); }
.fila-tarea .aviso-compañero { margin: 8px 0 0; }
.fila-tarea .acciones-tarea { margin-top: 8px; }

.card-correccion { border-left: 4px solid var(--warning); margin-bottom: 15px; }
.correccion-ayuda { font-size: 0.9rem; color: var(--muted); margin: 4px 0 12px; }
.correccion-item { border-top: 1px solid var(--border-soft); padding: 12px 0; }
.correccion-cabecera { margin-bottom: 6px; font-size: 0.95rem; }
.correccion-cliente { color: var(--muted); }
.mt-8 { margin-top: 8px; }
</style>
