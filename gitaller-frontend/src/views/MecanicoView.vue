<template>
  <div class="view-mecanico">
    <NavBar brand="🛠️ Mi Panel - Taller" :tabs="[]" logoutText="Cambiar legajo" customLogout @logout="cambiarLegajo" />

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
        <div v-if="tareasInternas.length > 0" style="margin-bottom: 30px;">
          <h3 style="color: var(--muted); border-bottom: 1px solid var(--border-soft); padding-bottom: 8px;">Rutinas y Tareas Internas</h3>
          <div class="grid-tareas">
            <div v-for="tarea in tareasInternas" :key="tarea.id" class="card-tarea" style="background-color: var(--status-urgente-bg); border-left: 4px solid var(--warning);">
              <div class="tarea-header">
                <h3>{{ tarea.descripcion }}</h3>
                <span :class="['badge-sm', estadoClass(tarea.mi_estado)]">{{ tarea.mi_estado }}</span>
              </div>
              <p class="tarea-horas">Asignado por Jefe de Taller</p>
              <div class="acciones-tarea mt-10">
                <button v-if="tarea.mi_estado !== 'En Curso'" v-can="'tarea_operar'" @click="toggleTareaInterna(tarea)" class="btn btn-outline btn-sm w-100">▶ Iniciar Rutina</button>
                <button v-else v-can="'tarea_operar'" @click="toggleTareaInterna(tarea)" class="btn btn-warning btn-sm w-100">⏸ Detener / Pausar</button>
              </div>
            </div>
          </div>
        </div>

        <!-- SECCIÓN OTs DE CLIENTES -->
        <div v-if="tareasCliente.length > 0">
          <h3 style="color: var(--primary-dark); border-bottom: 1px solid var(--border-soft); padding-bottom: 8px;">Órdenes de Trabajo</h3>
          <div class="grid-tareas">
            
            <!-- TARJETA MADRE POR OT -->
            <div v-for="orden in ordenesAgrupadas" :key="orden.ot" class="card-tarea" style="grid-column: 1 / -1; padding: 20px;">
              
              <!-- Cabecera de la OT agrupada -->
              <div class="ot-header">
                <h3 class="ot-header__titulo">OT {{ orden.ot }}</h3>
                <div class="ot-header__info">
                    <span class="patente-badge">{{ orden.patente }}</span>
                    <div class="ot-header__unidad">{{ orden.unidad }}</div>
                    <div class="tarea-cliente">{{ orden.cliente }}</div>
                </div>
              </div>
              
              <!-- Lista de subtareas internas -->
              <div
                v-for="tarea in orden.tareas"
                :key="tarea.id"
                class="tarea-card"
                :class="tarjetaClass(tarea)"
              >
                <div class="tarea-card__top">
                  <p class="tarea-card__desc">{{ tarea.descripcion }}</p>
                  <span class="mi-estado-chip" :class="estadoClass(tarea.mi_estado)">{{ tarea.mi_estado }}</span>
                </div>

                <div class="tarea-card__meta">
                  <span>⏱ Est. {{ tarea.tiempo_estimado }} hs</span>
                  <span v-if="tarea.mi_estado === 'En Curso'">· <strong class="tiempo-vivo">{{ tiempoVivo(tarea) }}</strong> ⏺</span>
                  <span v-else>· Mis horas: <strong>{{ (tarea.mi_tiempo_real || 0).toFixed(2) }}</strong></span>
                </div>
                <div class="tarea-card__equipo">👥 {{ tarea.equipo }}</div>
                <div class="tarea-card__tarea-general">Estado general de la tarea: <strong>{{ tarea.estado }}</strong></div>

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
              </div>

            </div>
          </div>
        </div>
      </div>

    <ModalPausarTarea v-if="showModalPausa" @close="showModalPausa = false" @confirm="ejecutarPausa" />
    <ModalFinalizarTarea v-if="showModalFinalizar" :otId="tareaActiva.ot" :modoInformar="esModoInformar" @close="showModalFinalizar = false" @confirm="ejecutarFinalizacion" />
  </div>
  </div>
</template>

<script setup>
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
const tiempoVivo = (tarea) => {
  let horas = tarea.mi_tiempo_real || 0
  if (tarea.mi_sesion_inicio) {
    const inicioUTC = new Date(tarea.mi_sesion_inicio.replace(' ', 'T') + 'Z').getTime()
    const transcurridoMs = Math.max(0, ahora.value - inicioUTC)
    horas += transcurridoMs / 3600000
  }
  const totalSeg = Math.floor(horas * 3600)
  const h = Math.floor(totalSeg / 3600)
  const m = Math.floor((totalSeg % 3600) / 60)
  const s = totalSeg % 60
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

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
    await fetchJSON(`/actividades/${tareaActiva.value.id}/estado`, {
      method: 'POST',
      body: JSON.stringify({ nuevo_estado: 'Finalizada', legajo_mecanico: legajo.value })
    })

    toast.success(esModoInformar.value ? 'Informe registrado correctamente' : 'Tu parte de la tarea quedó finalizada')
    showModalFinalizar.value = false
    cargarTareas()
  } catch (err) { toast.error(errMsg(err)) }
}

const cambiarLegajo = () => {
  localStorage.removeItem('legajoMecanico')
  router.push({ name: 'mecanico-login' }) 
}
const tareasCliente = computed(() => tareas.value.filter(t => t.ot !== '0000'))

const ordenesAgrupadas = computed(() => {
  const mapa = new Map()
  tareasCliente.value.forEach(tarea => {
    if (!mapa.has(tarea.ot)) {
      mapa.set(tarea.ot, {
        ot: tarea.ot,
        patente: tarea.patente,
        unidad: tarea.unidad,
        cliente: tarea.cliente,
        tareas: []
      })
    }
    mapa.get(tarea.ot).tareas.push(tarea)
  })
  return Array.from(mapa.values())
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
.tarea-desc { font-size: 0.9rem; margin-bottom: 4px; }
.tarea-horas { font-size: 0.8rem; color: var(--muted); margin-bottom: 12px; }
.acciones-tarea { display: flex; gap: 8px; flex-wrap: wrap; }

.badge-info { background: var(--primary); color: white; }
.badge-progress { background: var(--success); color: white; }
.badge-warn { background: var(--warning); color: white; }

/* --- Tarjeta de subtarea: legible primero en celular --- */
.tarea-card {
  padding: 14px;
  border: 1px solid var(--border);
  border-left: 5px solid var(--muted);
  border-radius: 10px;
  margin-bottom: 12px;
  background: var(--hover-row);
}
.tarea-card--info { border-left-color: var(--primary); }
.tarea-card--progress { border-left-color: var(--success); }
.tarea-card--warn { border-left-color: var(--warning); }
.tarea-card--done { border-left-color: var(--muted); }

.tarea-card__top {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 10px;
  margin-bottom: 8px;
}
.tarea-card__desc {
  margin: 0;
  font-size: 1.05rem;
  line-height: 1.35;
  font-weight: 600;
  color: var(--text);
}
.mi-estado-chip {
  flex-shrink: 0;
  padding: 4px 10px;
  border-radius: 20px;
  font-size: 0.78rem;
  font-weight: 700;
  white-space: nowrap;
}

.tarea-card__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 8px;
  font-size: 0.85rem;
  color: var(--muted);
  margin-bottom: 4px;
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
  .acciones-tarea { flex-direction: column; }
  .acciones-tarea .btn-lg { width: 100%; }
  .tarea-card__desc { font-size: 1rem; }
  .ot-header { flex-direction: column; align-items: flex-start !important; }
  .ot-header__info { text-align: left !important; }
}

.ot-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 10px;
  border-bottom: 2px solid var(--border-soft);
  padding-bottom: 15px;
  margin-bottom: 15px;
}
.ot-header__titulo { font-size: 1.3rem; margin: 0; }
.ot-header__info { text-align: right; }
.ot-header__unidad { font-weight: 600; margin-top: 6px; }
.patente-badge { background: #111; color: white; padding: 4px 10px; border-radius: 6px; font-family: monospace; font-size: 1.1rem; display: inline-block; }
</style>
