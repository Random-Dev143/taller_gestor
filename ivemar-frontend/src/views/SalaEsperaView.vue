<template>
  <div class="view-sala">
    <div class="sala-navbar">
      <span class="brand">📺 Estado de Vehículos en Taller</span>
      <span class="page-indicator" v-if="totalPages > 1">Página {{ currentPage + 1 }} de {{ totalPages }}</span>
      <span class="last-update">Última actualización: {{ ultimaActualizacion }}</span>
      <router-link to="/" class="salir-link" title="Salir de la pantalla de sala de espera">⏻</router-link>
    </div>

    <div v-if="ots.length === 0" class="empty-state">No hay vehículos en taller en este momento.</div>

    <div v-else class="grid-container-wrapper" ref="gridWrapper">
      <transition name="fade" mode="out-in">
        <div class="grid-sala" :key="currentPage" :style="gridStyle">
          <div v-for="ot in paginatedOts" :key="ot.ot" :class="['card-sala', colorEstado(ot.estado_actual)]">
            <div class="card-top">
              <span class="ot-number">#{{ ot.ot }}</span>
              <span class="patente">{{ ot.patente }}</span>
            </div>
            <div class="unidad-name">{{ truncate(ot.unidad, 20) }}</div>
            <div class="cliente-name">{{ ot.cliente }}</div>

            <div class="card-mid">
              <div class="mecanico">Mecánico: <strong>{{ ot.mecanico || 'Pendiente' }}</strong></div>
              <div class="estado-text">{{ ot.estado_actual === 'Finalizada' ? 'LISTO PARA ENTREGAR' : ot.estado_actual.toUpperCase() }}</div>
            </div>

            <div class="card-bottom">
              <div class="eta-label">Finalización Estimada</div>
              <div class="eta-value">{{ calcularETA(ot) }}</div>
            </div>
          </div>
        </div>
      </transition>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useApi } from '../composables/useApi'

const { fetchJSON } = useApi()
const ots = ref([])
const ultimaActualizacion = ref('—')

const gridWrapper = ref(null)
const currentPage = ref(0)
const cols = ref(3)
const rows = ref(2)
let fetchInterval = null
let carouselInterval = null
let resizeObserver = null

const itemsPerPage = computed(() => cols.value * rows.value)

const gridStyle = computed(() => ({
  gridTemplateColumns: `repeat(${cols.value}, 1fr)`,
  gridTemplateRows: `repeat(${rows.value}, 1fr)`
}))

const totalPages = computed(() => Math.max(1, Math.ceil(ots.value.length / itemsPerPage.value)))

const paginatedOts = computed(() => {
  const start = currentPage.value * itemsPerPage.value
  return ots.value.slice(start, start + itemsPerPage.value)
})

const MAX_COLS = 5
const MAX_ROWS = 4

const calcularGrilla = () => {
  if (!gridWrapper.value) return
  const w = gridWrapper.value.clientWidth
  const h = gridWrapper.value.clientHeight
  if (w === 0 || h === 0) return

  const cantidad = Math.max(1, ots.value.length)
  const tope = Math.min(cantidad, MAX_COLS * MAX_ROWS)

  let mejor = { cols: 1, rows: 1, score: Infinity }
  for (let c = 1; c <= MAX_COLS; c++) {
    const r = Math.min(MAX_ROWS, Math.ceil(tope / c))
    const cardW = w / c
    const cardH = h / r
    const aspecto = cardW / cardH
    const penalizacionAspecto = aspecto < 1.1 ? (1.1 - aspecto) : aspecto > 2.0 ? (aspecto - 2.0) : 0
    const espacioSobrante = (c * r) - tope
    const score = penalizacionAspecto * 5 + espacioSobrante * 0.5
    if (score < mejor.score) mejor = { cols: c, rows: r, score }
  }

  if (mejor.cols !== cols.value || mejor.rows !== rows.value) {
    cols.value = mejor.cols
    rows.value = mejor.rows
    currentPage.value = 0
    iniciarCarrusel()
  }
}

const avanzarPagina = () => {
  if (totalPages.value > 1) {
    currentPage.value = (currentPage.value + 1) % totalPages.value
  }
}

const iniciarCarrusel = () => {
  clearInterval(carouselInterval)
  if (totalPages.value > 1) {
    carouselInterval = setInterval(avanzarPagina, 10000)
  }
}

const cargarSala = async () => {
  try {
    const data = await fetchJSON('/sala')
    const hoy = new Date().toLocaleDateString('es-AR')

    ots.value = data.filter(ot => {
      if (ot.estado_actual !== 'Finalizada') return true
      if (ot.fecha_cierre) {
        const cierreUTC = new Date(ot.fecha_cierre.replace(' ', 'T') + 'Z')
        return cierreUTC.toLocaleDateString('es-AR') === hoy
      }
      return false
    })

    ultimaActualizacion.value = new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
    calcularGrilla()
    iniciarCarrusel()
  } catch (error) { console.error('Error cargando sala:', error) }
}

const truncate = (str, len) => str.length > len ? str.substring(0, len - 3) + '...' : str

const colorEstado = (estado) => ({
  'En Proceso': 'border-progress',
  'En Espera': 'border-wait',
  'Espera de Repuestos': 'border-warn',
  'Trabajos de Terceros': 'border-warn',
  'Finalizada': 'border-done'
}[estado] || 'border-wait')

const calcularFechaFinHabil = (horasRestantes) => {
  if (horasRestantes <= 0) return 'Próximo a finalizar'
  let fecha = new Date()
  let minutosRestantes = Math.ceil(horasRestantes * 60)
  while (minutosRestantes > 0) {
    let dia = fecha.getDay()
    let hora = fecha.getHours()
    let min = fecha.getMinutes()
    if (dia === 0 || (dia === 6 && hora >= 13)) {
      fecha.setDate(fecha.getDate() + (dia === 0 ? 1 : 2))
      fecha.setHours(8, 0, 0, 0)
      continue
    }
    if (hora < 8) {
      fecha.setHours(8, 0, 0, 0)
    } else if (hora >= 13 && hora < 14) {
      fecha.setHours(14, 0, 0, 0)
    } else if (hora >= 18) {
      fecha.setDate(fecha.getDate() + 1)
      fecha.setHours(8, 0, 0, 0)
    } else {
      let proxCorte = (hora < 13) ? 13 : 18
      let minutosHastaCorte = (proxCorte * 60) - (hora * 60 + min)
      if (minutosRestantes <= minutosHastaCorte) {
        fecha.setMinutes(fecha.getMinutes() + minutosRestantes)
        minutosRestantes = 0
      } else {
        fecha.setHours(proxCorte, 0, 0, 0)
        minutosRestantes -= minutosHastaCorte
      }
    }
  }
  const diaStr = fecha.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })
  const horaStr = fecha.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
  const hoy = new Date()
  const mañana = new Date(); mañana.setDate(mañana.getDate() + 1)
  if (fecha.toDateString() === hoy.toDateString()) return `Hoy a las ${horaStr} hs`
  if (fecha.toDateString() === mañana.toDateString()) return `Mañana a las ${horaStr} hs`
  return `${diaStr} a las ${horaStr} hs`
}

const calcularETA = (ot) => {
  if (ot.estado_actual === 'Finalizada') return 'COMPLETADO'
  if (['Trabajos de Terceros', 'Espera de Repuestos'].includes(ot.estado_actual)) return 'A DETERMINAR'
  const asignado = Math.max(0, ot.tiempo_asignado_horas || 0)
  let empleado = Math.max(0, ot.tiempo_empleado_horas || 0)
  if (ot.inicio_curso) {
      const inicioUTC = new Date(ot.inicio_curso.replace(' ', 'T') + 'Z')
      const transcurrido = (new Date() - inicioUTC) / 3600000
      if (transcurrido > 0) empleado += transcurrido
  }
  const horasRestantes = asignado - empleado
  return calcularFechaFinHabil(horasRestantes > 0 ? horasRestantes : 0)
}

onMounted(() => {
  cargarSala()
  fetchInterval = setInterval(cargarSala, 30000)

  if (gridWrapper.value) {
    resizeObserver = new ResizeObserver(calcularGrilla)
    resizeObserver.observe(gridWrapper.value)
    calcularGrilla()
  }
})

onUnmounted(() => {
  clearInterval(fetchInterval)
  clearInterval(carouselInterval)
  if (resizeObserver && gridWrapper.value) {
    resizeObserver.unobserve(gridWrapper.value)
  }
})
</script>

<style scoped>
.view-sala {
  display: flex; flex-direction: column;
  padding: 1.5vh 1.5vw; background: #121212; height: 100vh; margin: -20px; color: #fff; overflow: hidden;
  box-sizing: border-box;
}

.sala-navbar {
  display: flex; align-items: center; flex-wrap: wrap; gap: 1vh 2vw;
  margin-bottom: 1.5vh; padding-bottom: 1vh; border-bottom: 1px solid #333;
}
.brand { font-weight: 700; font-size: clamp(1.1rem, 2.4vw, 2rem); margin-right: auto; }
.page-indicator { color: #a4c2f4; font-weight: bold; background: rgba(164, 194, 244, 0.1); padding: 0.4vh 1.2vw; border-radius: 20px; font-size: clamp(0.8rem, 1.1vw, 1.1rem); }
.last-update { color: #888; font-size: clamp(0.75rem, 1vw, 1rem); }
.salir-link { color: #555; text-decoration: none; font-size: clamp(1rem, 1.6vw, 1.4rem); padding: 0 0.3vw; }
.salir-link:hover { color: #a4c2f4; }
.empty-state { text-align: center; padding: 50px; font-size: clamp(1rem, 2vw, 1.4rem); color: #666; }

.grid-container-wrapper {
  flex: 1;
  overflow: hidden;
  position: relative;
  container-type: size;
  container-name: sala-wrapper;
}

.grid-sala {
  display: grid;
  gap: 1.2vh 1.2vw;
  width: 100%;
  height: 100%;
}

.card-sala {
  background: #1e1e1e; border-radius: 12px; padding: 1.6vh 1.4vw; border-left: 0.5vw solid #555;
  display: flex; flex-direction: column; justify-content: space-between;
  box-shadow: 0 4px 15px rgba(0,0,0,0.3);
  box-sizing: border-box;
  min-width: 0; min-height: 0; overflow: hidden;
  container-type: inline-size;
  container-name: card-sala;
}

.fade-enter-active, .fade-leave-active { transition: opacity 0.5s ease, transform 0.5s ease; }
.fade-enter-from { opacity: 0; transform: translateX(20px); }
.fade-leave-to { opacity: 0; transform: translateX(-20px); position: absolute; }

.border-progress { border-left-color: #4CAF50; }
.border-wait { border-left-color: #9E9E9E; }
.border-warn { border-left-color: #FFC107; }
.border-done { border-left-color: #2196F3; background: #1a2836; }

.card-top { display: flex; justify-content: space-between; align-items: center; }
.ot-number { font-weight: bold; color: #aaa; font-size: clamp(0.8rem, 3.2vw, 1.3rem); }
.patente { background: white; color: black; padding: 0.3vh 0.8vw; border-radius: 4px; font-family: monospace; font-weight: bold; font-size: clamp(0.75rem, 3vw, 1.2rem); }
.unidad-name { font-weight: bold; margin-top: 0.5vh; font-size: clamp(0.85rem, 3.6vw, 1.5rem); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.cliente-name { color: #9e9e9e; font-weight: 500; margin-top: 0.2vh; font-size: clamp(0.8rem, 3.2vw, 1.3rem); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-transform: uppercase; }

.card-mid { background: #2a2a2a; padding: 1vh 1vw; border-radius: 8px; margin: auto 0; }
.mecanico { margin-bottom: 0.5vh; color: #ccc; font-size: clamp(0.7rem, 2.6vw, 1.05rem); }
.estado-text { font-weight: bold; letter-spacing: 0.5px; font-size: clamp(0.75rem, 2.8vw, 1.15rem); }

.card-bottom { display: flex; flex-direction: column; align-items: center; text-align: center; }
.eta-label { color: #888; text-transform: uppercase; font-size: clamp(0.6rem, 2vw, 0.85rem); }
.eta-value { font-weight: bold; color: #a4c2f4; font-size: clamp(0.85rem, 3.4vw, 1.35rem); }

@container card-sala (min-width: 1px) {
  .ot-number { font-size: clamp(0.8rem, 9cqw, 1.4rem); }
  .patente { font-size: clamp(0.75rem, 8.5cqw, 1.25rem); }
  .unidad-name { font-size: clamp(0.85rem, 10cqw, 1.6rem); }
  .cliente-name { font-size: clamp(0.8rem, 9cqw, 1.4rem); }
  .mecanico { font-size: clamp(0.7rem, 7cqw, 1.1rem); }
  .estado-text { font-size: clamp(0.75rem, 7.5cqw, 1.2rem); }
  .eta-label { font-size: clamp(0.6rem, 5.5cqw, 0.9rem); }
  .eta-value { font-size: clamp(0.85rem, 9.5cqw, 1.4rem); }
}
</style>