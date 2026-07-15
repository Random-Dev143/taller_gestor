<template>
  <div class="im-group">
    <!-- CABECERA Y FILTROS -->
    <header class="header-with-actions mb-25 pb-15 border-bottom">
      <span class="im-eyebrow">Evaluación de Rendimiento Individual</span>
      
      <div class="d-flex align-items-center mt-10 gap-20">
        <select v-model="mecanicoSeleccionado" class="form-control select-sm" style="min-width: 250px z-index= 2 position= relative;">
          <option value="todos">Ver Taller Completo (Consolidado)</option>
          <option v-for="m in tiempos" :key="m.legajo" :value="m.legajo">{{ m.nombre }} ({{ m.legajo }})</option>
        </select>

        <div class="view-toggle">
          <button class="btn btn-sm" :class="vistaOcio === 'semanal' ? 'btn-primary' : 'btn-secondary'" @click="vistaOcio = 'semanal'">Vista Semanal</button>
          <button class="btn btn-sm" :class="vistaOcio === 'mensual' ? 'btn-primary' : 'btn-secondary'" @click="vistaOcio = 'mensual'">Vista Mensual</button>
        </div>
      </div>
    </header>

    <!-- ESTADOS DE CARGA / VACÍO -->
    <div v-if="store.loading" class="empty-state">Cargando informe de rendimiento...</div>
    <div v-else-if="!tiempos?.length" class="empty-state">No hay actividad registrada para el personal.</div>

    <!-- VISTA CONSOLIDADA (TALLER) -->
    <section v-else-if="mecanicoSeleccionado === 'todos'" class="table-wrapper">
      <table>
        <thead>
          <tr>
            <th>Personal</th>
            <th>Hs Productivas</th>
            <th>Ocio Total</th>
            <th>Días sin login</th>
            <th>Eficacia</th>
            <th>Eficiencia</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="m in tiempos" :key="m.legajo">
            <td><strong>{{ m.nombre }}</strong></td>
            <td><span class="text-success">{{ formatHoras(m.hs_productivas) }} hs</span></td>
            <td><strong :class="{'text-danger': m.tiempo_muerto > 10}">{{ formatHoras(m.tiempo_muerto) }} hs</strong></td>
            <td>
              <button v-if="m.dias_ausentes_count > 0" class="btn btn-sm" :class="sinJustificar(m) > 0 ? 'btn-danger' : 'btn-secondary'" @click="verAusencias(m)">
                {{ m.dias_ausentes_count }} día(s)
              </button>
              <span v-else class="text-muted">-</span>
            </td>
            <td><span :class="['badge', eficaciaDe(m) >= 85 ? 'bg-success' : 'bg-warning']">{{ eficaciaDe(m) }}%</span></td>
            <td><span :class="['badge', m.eficiencia_porcentaje >= 100 ? 'bg-success' : 'bg-danger']">{{ m.eficiencia_porcentaje }}%</span></td>
          </tr>
        </tbody>
      </table>
    </section>

    <!-- VISTA INDIVIDUAL -->
    <section v-else-if="mecanicoFiltrado" class="individual-view">
      
      <!-- Métricas Principales -->
      <div class="stats-grid mb-20">
        <div class="stat-card"><strong>Días Asistidos</strong><br>{{ mecanicoFiltrado.dias_asistidos }}</div>
        <div class="stat-card"><strong>Horas Trabajadas</strong><br>{{ formatHoras(mecanicoFiltrado.hs_empleadas) }} hs</div>
        <div class="stat-card"><strong>OTs Finalizadas</strong><br>{{ mecanicoFiltrado.ot_trabajadas }}</div>
        <div class="stat-card highlight-card"><strong>Tiempo Ocioso</strong><br>{{ formatHoras(mecanicoFiltrado.tiempo_muerto) }} hs</div>
      </div>

      <!-- Gráficos -->
      <div class="charts-grid mb-20">
        <div class="card p-15">
          <h3 class="chart-title">Distribución del Tiempo</h3>
          <div class="chart-wrapper">
            <Doughnut v-if="chartDistribucion" :data="chartDistribucion" :options="opcionesGraficoTorta" />
          </div>
        </div>
        <div class="card p-15">
          <h3 class="chart-title">Eficacia vs Eficiencia</h3>
          <div class="chart-wrapper">
            <Bar v-if="chartEficiencia" :data="chartEficiencia" :options="opcionesGraficoBarras" />
          </div>
        </div>
      </div>

      <!-- Detalle de Ausencias -->
      <div v-if="mecanicoFiltrado.dias_ausentes_count > 0" class="alert mb-20">
        <strong>Días hábiles sin registro:</strong>
        <ul>
          <li v-for="aus in mecanicoFiltrado.dias_ausentes" :key="aus.fecha">
            {{ formatFecha(aus.fecha) }} - {{ aus.motivo || 'FALTA INJUSTIFICADA' }}
          </li>
        </ul>
      </div>

      <!-- Visualización Temporal (Mapa/Serie) -->
      <div class="visual-time-data mt-20">
        <div v-if="vistaOcio === 'semanal'" class="card p-15">
          <h3 class="chart-title">Mapa de Calor: Ocio Semanal</h3>
          <div class="table-wrapper">
            <table class="heatmap-table">
              <thead>
                <tr>
                  <th>Día \ Hora</th>
                  <th v-for="h in horasHeatmap" :key="h">{{ h }}:00</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="d in diasHeatmap" :key="d.id">
                  <td><strong>{{ d.nombre }}</strong></td>
                  <td v-for="h in horasHeatmap" :key="h" 
                      :style="{ backgroundColor: getHeatColor(d.id, h) }"
                      class="heatmap-cell"
                      :title="`${d.nombre} a las ${h}:00 - ${getOcioMins(d.id, h)} min ocio`">
                    <span v-if="getOcioMins(d.id, h) > 0" class="heat-text">{{ getOcioMins(d.id, h) }}m</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
        
        <div v-else class="card p-15">
          <h3 class="chart-title">Evolución de Ocio Diario</h3>
          <div class="chart-wrapper">
            <Bar v-if="chartSerieMensual" :data="chartSerieMensual" :options="opcionesGraficoSerieMensual" />
            <p v-else class="text-muted text-center mt-10">Sin datos mensuales registrados</p>
          </div>
        </div>
      </div>
    </section>

    <ModalAusencias v-if="mecanicoModalLegajo" :mecanico="mecanicoModal" @close="mecanicoModalLegajo = null" @justificado="store.cargarInformes" />
  </div>
</template>


<script setup>
import { computed, ref } from 'vue'
import { useInformesStore } from '../../stores/useInformesStore'
import ModalAusencias from '../jefe/ModalAusencias.vue'
import { Doughnut, Bar } from 'vue-chartjs'
import { Chart as ChartJS, Title, Tooltip, Legend, ArcElement, BarElement, CategoryScale, LinearScale } from 'chart.js'

ChartJS.register(Title, Tooltip, Legend, ArcElement, BarElement, CategoryScale, LinearScale)

const store = useInformesStore()
const tiempos = computed(() => store.operativo?.tiempos_mecanicos || [])

const mecanicoSeleccionado = ref('todos')
const mecanicoFiltrado = computed(() => tiempos.value.find(m => m.legajo === mecanicoSeleccionado.value) || null)

const eficaciaDe = (m) => m.productividad_porcentaje ?? 0

const mecanicoModalLegajo = ref(null)
const mecanicoModal = computed(() => tiempos.value.find(m => m.legajo === mecanicoModalLegajo.value) || null)

const sinJustificar = (m) => (m.dias_ausentes || []).filter(d => !d.motivo).length
const verAusencias = (m) => { mecanicoModalLegajo.value = m.legajo }

const formatFecha = (f) => new Date(f + 'T12:00:00Z').toLocaleDateString('es-AR', { weekday: 'long', day: '2-digit', month: '2-digit' })
const formatHoras = (n) => (n ?? 0).toLocaleString('es-AR', { maximumFractionDigits: 1 })

// --- CONFIGURACIÓN DE GRÁFICOS (Chart.js) ---
const opcionesGraficoTorta = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, padding: 15 } } }
}

const opcionesGraficoBarras = {
  responsive: true,
  maintainAspectRatio: false,
  scales: { y: { beginAtZero: true, max: 120 } },
  plugins: { legend: { display: false } }
}

const chartDistribucion = computed(() => {
  if (!mecanicoFiltrado.value) return null;
  const m = mecanicoFiltrado.value;
  return {
    labels: ['Productivo (hs)', 'Internas (hs)', 'Ocio (hs)'],
    datasets: [{
      data: [m.hs_productivas, m.hs_internas, m.tiempo_muerto],
      backgroundColor: ['#1d8a4f', '#0056a7', '#b22234']
    }]
  }
})

const chartEficiencia = computed(() => {
  if (!mecanicoFiltrado.value) return null;
  const m = mecanicoFiltrado.value;
  return {
    labels: ['Eficacia', 'Eficiencia'],
    datasets: [{
      data: [eficaciaDe(m), m.eficiencia_porcentaje],
      backgroundColor: ['#0056a7', '#1d8a4f'],
      borderRadius: 4
    }]
  }
})

// --- LÓGICA DEL MAPA DE CALOR ---
const nombresTipoDescanso = {
  normal: 'Día normal',
  fin_de_semana: 'Después de finde',
  fin_de_semana_largo: 'Después de finde largo / feriado',
  permiso_previo: 'Después de permiso'
}
const coloresTipoDescanso = {
  normal: '#94a3b8',
  fin_de_semana: '#0056a7',
  fin_de_semana_largo: '#1d8a4f',
  permiso_previo: '#b8860b'
}

const vistaOcio = ref('semanal') // 'semanal' | 'mensual'

const patronesDescanso = computed(() => store.operativo?.patrones_descanso || [])

const chartPatrones = computed(() => {
  if (!patronesDescanso.value.length) return null
  return {
    labels: patronesDescanso.value.map(p => nombresTipoDescanso[p.tipo_descanso] || p.tipo_descanso),
    datasets: [{
      label: '% de ocio promedio',
      data: patronesDescanso.value.map(p => p.ocio_promedio_porcentaje),
      backgroundColor: patronesDescanso.value.map(p => coloresTipoDescanso[p.tipo_descanso] || '#94a3b8')
    }]
  }
})

const opcionesGraficoPatrones = {
  responsive: true, maintainAspectRatio: false, indexAxis: 'y',
  scales: { x: { beginAtZero: true, max: 100, title: { display: true, text: '% de tiempo ocioso' } } },
  plugins: { legend: { display: false } }
}

const serieDiariaMecanico = computed(() => mecanicoFiltrado.value?.serie_diaria || [])
const formatFechaCorta = (f) => new Date(f + 'T12:00:00Z').toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })

const chartSerieMensual = computed(() => {
  if (!serieDiariaMecanico.value.length) return null
  return {
    labels: serieDiariaMecanico.value.map(d => formatFechaCorta(d.fecha)),
    datasets: [{
      label: '% de ocio',
      data: serieDiariaMecanico.value.map(d => d.ocio_porcentaje),
      backgroundColor: serieDiariaMecanico.value.map(d => coloresTipoDescanso[d.tipo_descanso] || '#94a3b8')
    }]
  }
})

const opcionesGraficoSerieMensual = {
  responsive: true, maintainAspectRatio: false,
  scales: { y: { beginAtZero: true, max: 100 } },
  plugins: { legend: { display: false } }
}

const horasHeatmap = [8, 9, 10, 11, 12, 14, 15, 16, 17];
const diasHeatmap = [
  {id: 1, nombre: 'Lunes'}, {id: 2, nombre: 'Martes'}, {id: 3, nombre: 'Miércoles'},
  {id: 4, nombre: 'Jueves'}, {id: 5, nombre: 'Viernes'}, {id: 6, nombre: 'Sábado'}
];

const mapaOcioIndexado = computed(() => {
  const mapa = mecanicoFiltrado.value?.mapa_ocio
  if (!mapa) return new Map()
  return new Map(mapa.map(celda => [`${celda.dia}-${celda.hora}`, celda.minutos_ocio]))
})

const getOcioMins = (dia, hora) => mapaOcioIndexado.value.get(`${dia}-${hora}`) || 0

const getHeatColor = (dia, hora) => {
  if (dia === 6 && hora >= 13) return '#f0f0f0';
  const mins = getOcioMins(dia, hora);
  if (mins <= 0) return '#f8fafc';
  const opacity = Math.min(mins / 60, 1) * 0.9;
  return `rgba(178, 34, 52, ${opacity + 0.1})`;
}
</script>

<style scoped>
.im-group { padding-top: 10px; }
.header-with-actions {
  display: flex;
  justify-content: space-between;
  align-items: start;
  flex-wrap: wrap;
  gap: 15px;
  position: relative;
  z-index: 2;
}
.im-eyebrow { font-size: 0.85rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--primary); display: block; }
.table-wrapper { overflow-x: auto; background: white; border: 1px solid var(--border-soft); border-radius: var(--radius); box-shadow: var(--shadow-sm); }
table { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
th, td { padding: 12px 15px; text-align: left; border-bottom: 1px solid var(--border-soft); }
th { background: #f8fafc; font-weight: 600; color: #1a2a3a; text-transform: uppercase; font-size: 0.8rem; }
.badge { padding: 4px 10px; border-radius: 12px; color: white; font-weight: bold; font-size: 0.85rem; }
.bg-success { background: #1d8a4f; }
.bg-warning { background: #b8860b; color: #fff; }
.bg-danger { background: #b22234; }
.text-success { color: #1d8a4f; font-weight: 600; }
.text-muted { color: #6c7a8a; }
.text-danger { color: #b22234; }
.mb-15 { margin-bottom: 15px; }
.mt-15 { margin-top: 15px; }
.mt-10 { margin-top: 10px; }
.stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 15px; }
.stat-card { background: white; border: 1px solid var(--border-soft); border-radius: 8px; padding: 15px; text-align: center; box-shadow: var(--shadow-sm); font-size: 1.05rem; }
.highlight-card { background: #b22234; color: white; border: none; font-size: 1.15rem; }
.chart-hint { font-size: 0.85rem; color: var(--muted); }
.card {
  background: white;
  border-radius: 8px;
  border: 1px solid var(--border-soft);
  box-shadow: var(--shadow-sm);
  position: relative;
  z-index: 0;
  overflow: hidden;
  min-width: 0;
}
.view-toggle { display: flex; gap: 8px; }
.legend-inline { display: flex; flex-wrap: wrap; gap: 14px; font-size: 0.8rem; color: var(--text-soft); }
.legend-item { display: flex; align-items: center; gap: 6px; }
.legend-dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }

.chart-title { font-size: 1rem; color: var(--primary); text-align: center; margin-bottom: 10px; }
.charts-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 20px;
  align-items: start;
}
.stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 15px; }

/* 
  Contenedor envolvente fundamental para Chart.js 
  Evita que vue-chartjs crezca de forma infinita cuando maintainAspectRatio=false
*/
.chart-wrapper {
  position: relative;
  height: 250px;
  width: 100%;
}

/* Estilos para el Mapa de Calor */
.heatmap-table th, .heatmap-table td { 
  padding: 6px; 
  text-align: center; 
  border: 1px solid var(--border-soft); 
  font-size: 0.8rem; 
}
.heatmap-cell { 
  min-width: 45px; 
  transition: filter 0.2s; 
}
.heatmap-cell:hover { 
  filter: brightness(0.9); 
}
.heat-text { 
  font-size: 0.75rem; 
  font-weight: bold; 
  color: #842029; 
}

</style>