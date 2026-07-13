<template>
  <div class="im-group">
    <!-- Selector de Mecánicos -->
    <div class="header-with-actions" style="margin-bottom: 25px; border-bottom: 2px solid var(--border-soft); padding-bottom: 15px;">
      <div>
        <span class="im-eyebrow">Evaluación de Rendimiento Individual</span>
        <select v-model="mecanicoSeleccionado" class="form-control select-sm mt-10" style="min-width: 250px; font-weight: bold; font-size: 1rem;">
          <option value="todos">Ver Taller Completo (Consolidado)</option>
          <option v-for="m in tiempos" :key="m.legajo" :value="m.legajo">{{ m.nombre }} ({{ m.legajo }})</option>
        </select>
      </div>
    </div>

    <div v-if="store.loading" class="empty-state">
      Cargando informe de rendimiento...
    </div>

    <div v-else-if="!tiempos || tiempos.length === 0" class="empty-state">
      No hay actividad registrada para el personal del taller en las fechas seleccionadas.
    </div>

    <div v-else>
      <!-- VISTA GENERAL: TABLA CONSOLIDADA -->
      <div v-if="mecanicoSeleccionado === 'todos'" class="table-wrapper mb-15">
        <table>
          <thead>
            <tr>
              <th>Personal</th>
              <th>Hs Productivas</th>
              <th>Ocio Total</th>
              <th>Días sin login</th>
              <th>Eficacia (Uso del tiempo)</th>
              <th>Eficiencia (T. Est vs Real)</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="m in tiempos" :key="m.legajo">
              <td><strong>{{ m.nombre }}</strong></td>
              <td><span class="text-success">{{ formatHoras(m.hs_productivas) }} hs</span></td>
              <td :class="{'text-danger': m.tiempo_muerto > 10}">
                <strong>{{ formatHoras(m.tiempo_muerto) }} hs</strong>
              </td>
              <td>
                <button v-if="m.dias_ausentes_count > 0" class="btn btn-sm" :class="sinJustificar(m) > 0 ? 'btn-danger' : 'btn-secondary'" @click="verAusencias(m)">
                  {{ m.dias_ausentes_count }} día(s)
                </button>
                <span v-else class="text-muted">-</span>
              </td>
              <td>
                <span :class="['badge', eficaciaDe(m) >= 85 ? 'bg-success' : 'bg-warning']" title="(Hs Trabajadas / Hs Exigidas) * 100">
                  {{ eficaciaDe(m) }}%
                </span>
              </td>
              <td>
                <span :class="['badge', m.eficiencia_porcentaje >= 100 ? 'bg-success' : 'bg-danger']" title="(Hs Estimadas / Hs Productivas) * 100">
                  {{ m.eficiencia_porcentaje }}%
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- VISTA INDIVIDUAL: GRÁFICOS Y MAPA DE CALOR -->
      <div v-if="mecanicoFiltrado && mecanicoSeleccionado !== 'todos'">

        <!-- 1. Tarjetas Numéricas -->
        <div class="stats-grid mb-15">
          <div class="stat-card"><strong>Días Asistidos</strong><br>{{ mecanicoFiltrado.dias_asistidos }}</div>
          <div class="stat-card"><strong>Horas Trabajadas</strong><br>{{ formatHoras(mecanicoFiltrado.hs_empleadas) }} hs</div>
          <div class="stat-card"><strong>OTs Finalizadas</strong><br>{{ mecanicoFiltrado.ot_trabajadas }}</div>
          <div class="stat-card highlight-card"><strong>Tiempo Ocioso</strong><br>{{ formatHoras(mecanicoFiltrado.tiempo_muerto) }} hs</div>
        </div>

        <!-- 2. Gráficos Visuales (Chart.js) -->
        <div class="charts-grid mb-15" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px;">
            <div class="card" style="margin-bottom: 0; padding: 15px;">
                <h3 style="font-size: 1rem; color: var(--primary); text-align: center; margin-bottom: 10px;">Distribución del Tiempo</h3>
                <div style="height: 220px; position: relative;">
                    <Doughnut v-if="chartDistribucion" :data="chartDistribucion" :options="opcionesGraficoTorta" />
                </div>
            </div>
            <div class="card" style="margin-bottom: 0; padding: 15px;">
                <h3 style="font-size: 1rem; color: var(--primary); text-align: center; margin-bottom: 10px;">Eficacia vs Eficiencia</h3>
                <div style="height: 220px; position: relative;">
                    <Bar v-if="chartEficiencia" :data="chartEficiencia" :options="opcionesGraficoBarras" />
                </div>
            </div>
        </div>

        <!-- 3. Detalle de Ausencias -->
        <div v-if="mecanicoFiltrado.dias_ausentes_count > 0" class="alert mt-10 mb-15">
          <strong>Días hábiles sin registro de actividad:</strong>
          <ul style="margin: 5px 0 0 15px; font-size: 0.85rem;">
            <li v-for="aus in mecanicoFiltrado.dias_ausentes" :key="aus.fecha">
              {{ formatFecha(aus.fecha) }} - {{ aus.motivo || 'FALTA INJUSTIFICADA' }}
            </li>
          </ul>
        </div>

        <!-- 4. Mapa de Calor de Dispersión -->
        <div v-if="mecanicoFiltrado.mapa_ocio" class="heatmap-container mt-15" style="background: white; padding: 20px; border-radius: 8px; border: 1px solid var(--border-soft);">
           <h3 style="color: var(--primary); margin-bottom: 5px;">Mapa de Dispersión de Ocio</h3>
           <p class="chart-hint" style="margin-bottom: 20px;">
              Distribución de inactividad durante el rango de fechas. Los recuadros rojos indican los horarios donde el mecánico acumuló más minutos sin trabajar.
           </p>

           <div class="table-wrapper">
              <table class="heatmap-table" style="width: 100%; border-collapse: separate; border-spacing: 2px;">
                 <thead>
                   <tr>
                     <th style="background: transparent; border: none; padding: 5px;">Día \ Hora</th>
                     <th v-for="h in horasHeatmap" :key="h" style="text-align: center; padding: 5px; background: #f8fafc; font-size: 0.8rem; border-radius: 4px;">
                       {{ h }}:00
                     </th>
                   </tr>
                 </thead>
                 <tbody>
                   <tr v-for="d in diasHeatmap" :key="d.id">
                     <td style="font-weight: bold; color: var(--text-soft); border: none; padding: 8px 5px; font-size: 0.9rem;">
                       {{ d.nombre }}
                     </td>
                     <td v-for="h in horasHeatmap" :key="h"
                         :style="{ backgroundColor: getHeatColor(d.id, h), textAlign: 'center', borderRadius: '4px', transition: 'background 0.3s', padding: '6px' }">
                       <span class="heat-text" style="font-size: 0.75rem; font-weight: bold; color: #fff; text-shadow: 1px 1px 2px rgba(0,0,0,0.5);" v-if="getOcioMins(d.id, h) > 0">
                         {{ getOcioMins(d.id, h) }}m
                       </span>
                       <span v-else style="color: transparent; user-select: none;">-</span>
                     </td>
                   </tr>
                 </tbody>
              </table>
           </div>
        </div>

      </div>
    </div>
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

// Antes esta fórmula se recalculaba en el front con .toFixed() (devolviendo un
// string y duplicando la lógica del backend). Ahora se usa directamente el valor
// numérico que ya trae informes.service.js: productividad_porcentaje.
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
const horasHeatmap = [8, 9, 10, 11, 12, 14, 15, 16, 17];
const diasHeatmap = [
  {id: 1, nombre: 'Lunes'}, {id: 2, nombre: 'Martes'}, {id: 3, nombre: 'Miércoles'},
  {id: 4, nombre: 'Jueves'}, {id: 5, nombre: 'Viernes'}, {id: 6, nombre: 'Sábado'}
];

// Antes: cada celda del heatmap (hasta 54 por mecánico) hacía .find() sobre el
// array de mapa_ocio, y se llamaba dos veces por celda (texto + color).
// Ahora: se indexa una sola vez en un Map cuando cambia el mecánico seleccionado.
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
.header-with-actions { display: flex; justify-content: space-between; align-items: start; flex-wrap: wrap; gap: 15px; }
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
.card { background: white; border-radius: 8px; border: 1px solid var(--border-soft); box-shadow: var(--shadow-sm); }
</style>
