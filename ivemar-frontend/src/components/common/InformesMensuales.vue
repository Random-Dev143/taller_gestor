<template>
  <div class="im-dashboard card" ref="rootRef">
    <div class="im-topbar">
      <div class="im-title-block">
        <span class="im-eyebrow">Panel de control · Taller</span>
        <h2>Informes de Rendimiento y Facturación</h2>
      </div>
      <div class="pdf-actions" v-if="informe">
        <button class="btn btn-outline btn-sm" @click="exportarPDF" :disabled="exportando">
          {{ exportando ? 'Generando PDF…' : '👁️ Previsualizar PDF' }}
        </button>
        <button class="btn btn-sm" @click="descargarPDF" :disabled="exportando || !ultimoPdf">⬇ Descargar</button>
      </div>
    </div>

    <div class="dashboard-controls">
      <div class="date-group">
        <label>Desde</label>
        <input type="date" v-model="desde" class="form-control date-input" />
      </div>
      <div class="date-group">
        <label>Hasta</label>
        <input type="date" v-model="hasta" class="form-control date-input" />
      </div>
      <button class="btn im-btn-primary" @click="cargarInforme" :disabled="loading">{{ loading ? 'Cargando…' : 'Generar reporte' }}</button>
    </div>

    <div v-if="loading" class="loading-state"><div class="spinner"></div>Procesando métricas…</div>
    <p v-else-if="!informe" class="empty-state">Elegí un rango de fechas y presioná "Generar reporte" para ver el panel.</p>

    <div v-else class="im-body">

      <div class="im-kpi-strip" ref="kpisRef">
        <div class="im-kpi-hero">
          <svg class="im-gauge" viewBox="0 0 120 68" aria-hidden="true">
            <path d="M10,60 A50,50 0 0 1 110,60" fill="none" stroke="rgba(255,255,255,0.16)" stroke-width="8" stroke-linecap="round" />
            <path d="M10,60 A50,50 0 0 1 90,20" fill="none" stroke="rgba(255,255,255,0.55)" stroke-width="8" stroke-linecap="round" />
          </svg>
          <span class="im-kpi-label">Facturación total</span>
          <strong class="im-kpi-value">{{ formatCurrency(informe.resumen.total_facturado) }}</strong>
          <DeltaBadge :valor="deltaFacturacion" />
        </div>
        <div class="im-kpi-grid">
          <div class="im-kpi-card">
            <span class="im-kpi-label">Ticket promedio</span>
            <strong class="im-kpi-value-sm">{{ formatCurrency(informe.resumen.facturacion_promedio) }}</strong>
            <DeltaBadge :valor="deltaTicket" />
          </div>
          <div class="im-kpi-card">
            <span class="im-kpi-label">Mano de obra</span>
            <strong class="im-kpi-value-sm">{{ formatCurrency(informe.resumen.total_mano_obra) }}</strong>
          </div>
          <div class="im-kpi-card">
            <span class="im-kpi-label">Repuestos</span>
            <strong class="im-kpi-value-sm">{{ formatCurrency(informe.resumen.total_repuestos) }}</strong>
          </div>
          <div class="im-kpi-card">
            <span class="im-kpi-label">Total OTs</span>
            <strong class="im-kpi-value-sm">{{ informe.resumen.total_ot }}</strong>
            <DeltaBadge :valor="deltaOts" invertido />
          </div>
          <div class="im-kpi-card">
            <span class="im-kpi-label">Ciclo promedio</span>
            <strong class="im-kpi-value-sm">{{ informe.ciclo_promedio }} <small>días</small></strong>
          </div>
        </div>
      </div>
      <p class="chart-hint im-hint-strip" v-if="informe.resumen_anterior">
        Comparado contra el período equivalente inmediatamente anterior ({{ diasRangoTexto }} días antes).
      </p>

      <div class="im-group">
        <span class="im-eyebrow">Facturación</span>
        <div class="section-block" ref="financieroRef">
          <div class="header-with-actions">
            <h3>Evolución de facturación</h3>
            <div class="im-controls-row">
              <select v-model="modoFacturacion" class="form-control select-sm no-print">
                <option value="apilado">Apilado (suma total)</option>
                <option value="agrupado">Agrupado (lado a lado)</option>
              </select>
              <select v-model="agrupacionFinanciera" class="form-control select-sm">
                <option value="diaria">Diaria</option>
                <option value="semanal">Semanal</option>
                <option value="quincenal">Quincenal</option>
                <option value="mensual">Mensual</option>
              </select>
            </div>
          </div>
          <div class="chart-box">
            <Bar v-if="datosFinancierosAgrupados.length" :data="chartFinanciero" :options="opcionesBarraMoneda" />
            <p v-else class="empty-state">No hay facturación registrada en este período.</p>
          </div>
        </div>
      </div>

      <div class="im-group">
        <span class="im-eyebrow">Operación</span>
        <div class="charts-grid">
          <div class="section-block" ref="tendenciaRef">
            <div class="header-with-actions">
              <h3>Abiertas vs. cerradas</h3>
              <select v-model="agrupacionTendencia" class="form-control select-sm">
                <option value="diaria">Diaria</option>
                <option value="semanal">Semanal</option>
                <option value="mensual">Mensual</option>
              </select>
            </div>
            <p class="chart-hint">Si "abiertas" supera a "cerradas", se acumula trabajo pendiente.</p>
            <div class="chart-box">
              <Line v-if="datosTendenciaAgrupados.length" :data="chartTendencia" :options="opcionesLineaCantidad" />
              <p v-else class="empty-state">Sin movimientos en este período.</p>
            </div>
          </div>

          <div class="section-block" ref="diasSemanaRef">
            <div class="header-with-actions">
              <h3>Concentración por día de la semana</h3>
            </div>
            <p class="chart-hint">¿Qué días entran y salen más vehículos del taller?</p>
            <div class="chart-box">
              <Bar v-if="datosDiasSemana.some(d => d.aperturas > 0 || d.cierres > 0)" :data="chartDiasSemana" :options="opcionesBarraCantidades" />
              <p v-else class="empty-state">Sin movimientos en este período.</p>
            </div>
          </div>
        </div>
      </div>

      <div class="im-group">
        <span class="im-eyebrow">Mecánicos</span>
        <div class="charts-grid">
          <div class="section-block" ref="aporteMecanicosRef">
            <div class="header-with-actions">
              <h3>Aporte por mecánico</h3>
              <select v-model="modoAporteMecanico" class="form-control select-sm no-print">
                <option value="facturacion">Facturación (mano de obra)</option>
                <option value="ordenes">Órdenes trabajadas</option>
              </select>
            </div>
            <div class="chart-box">
              <Bar v-if="informe.tiempos_mecanicos?.length" :data="chartAporteMecanico" :options="opcionesAporteMecanico" />
              <p v-else class="empty-state">Sin datos en este período.</p>
            </div>
          </div>

          <div class="section-block" ref="tiemposRef">
            <div class="header-with-actions">
              <h3>Desviación de tiempos</h3>
              <select v-model="mecanicoSeleccionado" class="form-control select-sm">
                <option value="todos">Taller completo (suma)</option>
                <option value="separados">Comparativa mecánicos</option>
                <option v-for="m in informe.tiempos_mecanicos" :key="m.legajo" :value="m.legajo">{{ m.nombre }}</option>
              </select>
            </div>
            <div class="chart-box">
              <Bar v-if="datosTiempos.length" :data="chartTiempos" :options="opcionesBarraHoras" />
              <p v-else class="empty-state">Sin actividades finalizadas en este período.</p>
            </div>
          </div>
        </div>

        <div class="section-block im-mt" ref="rentabilidadMecanicosRef">
          <div class="header-with-actions">
            <h3>Rentabilidad por eficiencia</h3>
            <select v-model="modoRentabilidad" class="form-control select-sm no-print">
              <option value="separados">Comparativa mecánicos</option>
              <option value="taller">Taller completo (consolidado)</option>
            </select>
          </div>
          <p class="chart-hint">Valor monetario del tiempo ahorrado (verde) o excedido (rojo) respecto al presupuestado.</p>
          <div class="chart-box">
            <Bar v-if="datosRentabilidad.length" :data="chartRentabilidad" :options="opcionesBarraRentabilidad" />
            <p v-else class="empty-state">Sin datos de eficiencia en este período.</p>
          </div>
        </div>
      </div>

      <div class="im-group">
        <span class="im-eyebrow">Calidad y composición</span>
        <div class="charts-grid">
          <div class="section-block" ref="cuellosRef">
            <div class="header-with-actions">
              <h3>Cuellos de botella (tiempo por estado)</h3>
              <div class="im-controls-row no-print">
                <input type="text" v-model="filtroCuellos" placeholder="Filtrar OT o patente" class="form-control select-sm im-uppercase" @keyup.enter="cargarInforme" />
                <button class="btn btn-sm" @click="cargarInforme">🔍</button>
              </div>
            </div>
            <div class="chart-box">
              <Bar v-if="informe.permanencia_estado?.length" :data="chartCuellos" :options="opcionesBarraHorasHorizontal" />
              <p v-else class="empty-state">Sin datos de permanencia por estado.</p>
            </div>
          </div>

          <div class="section-block" ref="composicionRef">
            <h3>Composición del trabajo</h3>
            <p class="chart-hint">Normal / garantía / otras marcas</p>
            <div class="chart-box chart-box-doughnut">
              <Doughnut v-if="calidadData.datasets[0].data.some(v => v > 0)" :data="calidadData" :options="opcionesDoughnut" />
              <p v-else class="empty-state">Sin OTs en este período.</p>
            </div>
          </div>
        </div>

        <div class="charts-grid im-mt">
          <div class="section-block" ref="repuestosManoObraRef">
            <h3>Repuestos vs. mano de obra</h3>
            <div class="chart-box chart-box-doughnut">
              <Doughnut v-if="(informe.resumen.total_repuestos + informe.resumen.total_mano_obra) > 0" :data="chartRepuestosManoObra" :options="opcionesDoughnutMoneda" />
              <p v-else class="empty-state">Sin facturación registrada en este período.</p>
            </div>
          </div>

          <div class="section-block" ref="garantiaRef">
            <h3>Garantía vs. facturable</h3>
            <p class="chart-hint">Trabajo cubierto por garantía (no cobrado al cliente) vs. facturado normalmente.</p>
            <div class="chart-box chart-box-doughnut">
              <Doughnut v-if="(informe.resumen.monto_garantia + informe.resumen.monto_facturable) > 0" :data="chartGarantia" :options="opcionesDoughnutMoneda" />
              <p v-else class="empty-state">Sin facturación registrada en este período.</p>
            </div>
          </div>
        </div>
      </div>

      <div class="im-group" v-if="informe.top_clientes?.length || informe.rentabilidad_unidad?.length">
        <span class="im-eyebrow">Clientes y unidades</span>
        <div class="charts-grid">
          <div class="section-block" ref="clientesRef" v-if="informe.top_clientes?.length">
            <h3>Clientes recurrentes <small class="im-subtle">(top 10)</small></h3>
            <div class="table-wrapper">
              <table>
                <thead><tr><th>Cliente</th><th>OTs</th><th>Facturación</th></tr></thead>
                <tbody>
                  <tr v-for="c in informe.top_clientes" :key="c.cliente">
                    <td>{{ c.cliente }}</td>
                    <td>{{ c.cantidad_ot }}</td>
                    <td><span class="highlight">{{ formatCurrency(c.facturacion_total) }}</span></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div class="section-block" ref="rentabilidadRef" v-if="informe.rentabilidad_unidad?.length">
            <h3>Rentabilidad por tipo de unidad <small class="im-subtle">(top 10)</small></h3>
            <div class="table-wrapper">
              <table>
                <thead><tr><th>Unidad</th><th>Cantidad OTs</th><th>Facturación total</th></tr></thead>
                <tbody>
                  <tr v-for="u in informe.rentabilidad_unidad" :key="u.unidad">
                    <td><strong>{{ u.unidad }}</strong></td>
                    <td>{{ u.cantidad }}</td>
                    <td><span class="highlight">{{ formatCurrency(u.facturacion_total) }}</span></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { Bar, Line, Doughnut } from 'vue-chartjs'
import {
  Chart as ChartJS, Title, Tooltip, Legend, BarElement, CategoryScale,
  LinearScale, LineElement, PointElement, ArcElement
} from 'chart.js'
import { useApi } from '../../composables/useApi'
import { useToast, errMsg } from '../../composables/useToast'
import { useDashboardExporter } from '../../composables/useDashboardExporter'
import DeltaBadge from './DeltaBadge.vue'

ChartJS.register(Title, Tooltip, Legend, BarElement, CategoryScale, LinearScale, LineElement, PointElement, ArcElement)

const { fetchJSON } = useApi()
const toast = useToast()
const { exportarDashboardPDF } = useDashboardExporter()

const today = new Date()
const firstDay = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0]
const currentDay = today.toISOString().split('T')[0]

const desde = ref(firstDay)
const hasta = ref(currentDay)
const informe = ref(null)
const loading = ref(false)
const filtroCuellos = ref('')

const formatCurrency = (val) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(val || 0)

const opcionesBase = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { position: 'bottom', labels: { color: '#52606d' } } },
  scales: {
    x: { ticks: { color: '#52606d' }, grid: { display: false } },
    y: { ticks: { color: '#52606d' }, grid: { color: '#eef3f9' } }
  }
}

const modoFacturacion = ref('apilado')
const opcionesBarraMoneda = computed(() => {
  const apilado = modoFacturacion.value === 'apilado'
  return {
    ...opcionesBase,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      ...opcionesBase.plugins,
      tooltip: {
        callbacks: {
          label: (ctx) => `${ctx.dataset.label}: ${formatCurrency(ctx.parsed.y)}`,
          footer: (tooltipItems) => {
            let total = 0;
            tooltipItems.forEach(item => { total += item.parsed.y; });
            return `\nTOTAL: ${formatCurrency(total)}`;
          }
        }
      }
    },
    scales: {
      x: { ...opcionesBase.scales.x, stacked: apilado },
      y: { ...opcionesBase.scales.y, stacked: apilado, ticks: { ...opcionesBase.scales.y.ticks, callback: (v) => formatCurrency(v) } }
    }
  }
})

const opcionesLineaCantidad = { ...opcionesBase }

const opcionesBarraHoras = {
  ...opcionesBase,
  plugins: {
    ...opcionesBase.plugins,
    tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${ctx.parsed.y} hs` } }
  }
}

const opcionesBarraHorasHorizontal = {
  ...opcionesBase,
  indexAxis: 'y',
  plugins: {
    legend: { display: false },
    tooltip: { callbacks: { label: (ctx) => `${ctx.parsed.x} hs` } }
  }
}

const opcionesBarraCantidades = {
  ...opcionesBase,
  plugins: {
    ...opcionesBase.plugins,
    tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${ctx.parsed.y} OTs` } }
  }
}

const opcionesDoughnut = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { position: 'bottom', labels: { color: '#52606d' } } }
}

const opcionesDoughnutMoneda = {
  ...opcionesDoughnut,
  plugins: {
    legend: { position: 'bottom', labels: { color: '#52606d' } },
    tooltip: { callbacks: { label: (ctx) => `${ctx.label}: ${formatCurrency(ctx.parsed)}` } }
  }
}

const diasRangoTexto = computed(() => {
  if (!desde.value || !hasta.value) return ''
  return Math.round((new Date(hasta.value) - new Date(desde.value)) / 86400000) + 1
})

const calcularDelta = (actual, anterior) => {
  if (anterior === null || anterior === undefined || anterior === 0) return null
  if (actual === null || actual === undefined) return null
  return ((actual - anterior) / anterior) * 100
}
const deltaFacturacion = computed(() => informe.value?.resumen_anterior ? calcularDelta(informe.value.resumen.total_facturado, informe.value.resumen_anterior.total_facturado) : null)
const deltaTicket = computed(() => informe.value?.resumen_anterior ? calcularDelta(informe.value.resumen.facturacion_promedio, informe.value.resumen_anterior.facturacion_promedio) : null)
const deltaOts = computed(() => informe.value?.resumen_anterior ? calcularDelta(informe.value.resumen.total_ot, informe.value.resumen_anterior.total_ot) : null)

const kpisRef = ref(null)
const financieroRef = ref(null)
const tendenciaRef = ref(null)
const diasSemanaRef = ref(null)
const tiemposRef = ref(null)
const rentabilidadMecanicosRef = ref(null)
const cuellosRef = ref(null)
const composicionRef = ref(null)
const repuestosManoObraRef = ref(null)
const garantiaRef = ref(null)
const clientesRef = ref(null)
const rentabilidadRef = ref(null)
const aporteMecanicosRef = ref(null)

const exportando = ref(false)
const ultimoPdf = ref(null)

const exportarPDF = async () => {
  exportando.value = true
  try {
    const resultado = await exportarDashboardPDF({
      titulo: 'IVEMAR · Informe de Rendimiento y Facturación',
      subtitulo: `Período: ${desde.value} al ${hasta.value}`,
      filename: `informe_ivemar_${desde.value}_a_${hasta.value}.pdf`,
      blocks: [
        kpisRef.value, financieroRef.value, tendenciaRef.value, diasSemanaRef.value,
        aporteMecanicosRef.value, tiemposRef.value, rentabilidadMecanicosRef.value, cuellosRef.value, 
        composicionRef.value, repuestosManoObraRef.value,
        garantiaRef.value, clientesRef.value, rentabilidadRef.value
      ]
    })
    if (resultado) ultimoPdf.value = resultado
  } finally {
    exportando.value = false
  }
}

const descargarPDF = () => { if (ultimoPdf.value) ultimoPdf.value.descargar() }

const calidadData = computed(() => {
  const r = informe.value?.resumen || {}
  return {
    labels: ['Normales', 'Garantía IVECO', 'Otras Marcas (No Iveco)'],
    datasets: [{
      data: [r.total_normales || 0, r.total_garantia || 0, r.total_no_iveco || 0],
      backgroundColor: ['#1f6fb8', '#d98a2b', '#64748b']
    }]
  }
})

const chartRepuestosManoObra = computed(() => ({
  labels: ['Repuestos', 'Mano de Obra'],
  datasets: [{
    data: [informe.value?.resumen.total_repuestos || 0, informe.value?.resumen.total_mano_obra || 0],
    backgroundColor: ['#1f8a74', '#1f6fb8']
  }]
}))

const chartGarantia = computed(() => ({
  labels: ['Garantía (no facturado)', 'Facturable'],
  datasets: [{
    data: [informe.value?.resumen.monto_garantia || 0, informe.value?.resumen.monto_facturable || 0],
    backgroundColor: ['#d98a2b', '#1f8a74']
  }]
}))

const getSemana = (fecha) => {
  const d = new Date(fecha); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7);
  const week1 = new Date(d.getFullYear(), 0, 4);
  return `Sem ${1 + Math.round(((d.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7)}`;
}

const claveAgrupacion = (fechaStr, modo) => {
  const fechaObj = new Date(fechaStr)
  if (modo === 'semanal') return getSemana(fechaStr)
  if (modo === 'mensual') return fechaStr.substring(0, 7)
  if (modo === 'quincenal') {
    const q = fechaObj.getDate() <= 15 ? 'Q1' : 'Q2'
    return `${fechaStr.substring(0, 7)} ${q}`
  }
  return fechaStr
}

const agrupacionFinanciera = ref('diaria')

const datosFinancierosAgrupados = computed(() => {
  if (!informe.value || !informe.value.facturacion_diaria) return []
  const grupos = {}
  informe.value.facturacion_diaria.forEach(d => {
    const clave = claveAgrupacion(d.fecha, agrupacionFinanciera.value)
    if (!grupos[clave]) grupos[clave] = { etiqueta: clave, repuestos: 0, mano_obra: 0 }
    grupos[clave].repuestos += d.repuestos
    grupos[clave].mano_obra += d.mano_obra
  })
  return Object.values(grupos)
})

const chartFinanciero = computed(() => ({
  labels: datosFinancierosAgrupados.value.map(d => d.etiqueta),
  datasets: [
    { label: 'Repuestos', backgroundColor: '#1f8a74', data: datosFinancierosAgrupados.value.map(d => d.repuestos) },
    { label: 'Mano de Obra', backgroundColor: '#1f6fb8', data: datosFinancierosAgrupados.value.map(d => d.mano_obra) }
  ]
}))

const agrupacionTendencia = ref('diaria')

const datosTendenciaAgrupados = computed(() => {
  if (!informe.value) return []
  const grupos = {}
  const aperturas = informe.value.aperturas_por_dia || []
  const cierres = informe.value.cierres_por_dia || []

  aperturas.forEach(d => {
    const clave = claveAgrupacion(d.fecha, agrupacionTendencia.value)
    if (!grupos[clave]) grupos[clave] = { etiqueta: clave, aperturas: 0, cierres: 0 }
    grupos[clave].aperturas += d.cantidad
  })
  cierres.forEach(d => {
    const clave = claveAgrupacion(d.fecha, agrupacionTendencia.value)
    if (!grupos[clave]) grupos[clave] = { etiqueta: clave, aperturas: 0, cierres: 0 }
    grupos[clave].cierres += d.cantidad
  })

  return Object.values(grupos).sort((a, b) => a.etiqueta.localeCompare(b.etiqueta))
})

const chartTendencia = computed(() => ({
  labels: datosTendenciaAgrupados.value.map(d => d.etiqueta),
  datasets: [
    { label: 'Abiertas', borderColor: '#d98a2b', backgroundColor: '#d98a2b', data: datosTendenciaAgrupados.value.map(d => d.aperturas), tension: 0.3 },
    { label: 'Cerradas', borderColor: '#1f8a74', backgroundColor: '#1f8a74', data: datosTendenciaAgrupados.value.map(d => d.cierres), tension: 0.3 }
  ]
}))

const diasNombres = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']

const datosDiasSemana = computed(() => {
  if (!informe.value) return []
  const aperturas = informe.value.aperturas_por_dia || []
  const cierres = informe.value.cierres_por_dia || []

  const dias = Array(7).fill(0).map((_, i) => ({
    dia: i, etiqueta: diasNombres[i], aperturas: 0, cierres: 0
  }))

  aperturas.forEach(d => {
    const [yyyy, mm, dd] = d.fecha.split('-')
    dias[new Date(yyyy, mm - 1, dd).getDay()].aperturas += d.cantidad
  })

  cierres.forEach(d => {
    const [yyyy, mm, dd] = d.fecha.split('-')
    dias[new Date(yyyy, mm - 1, dd).getDay()].cierres += d.cantidad
  })

  const ordenados = [dias[1], dias[2], dias[3], dias[4], dias[5], dias[6], dias[0]]
  if (ordenados[6].aperturas === 0 && ordenados[6].cierres === 0) ordenados.pop()
  
  return ordenados
})

const chartDiasSemana = computed(() => ({
  labels: datosDiasSemana.value.map(d => d.etiqueta),
  datasets: [
    { label: 'Aperturas', backgroundColor: '#d98a2b', data: datosDiasSemana.value.map(d => d.aperturas) },
    { label: 'Cierres', backgroundColor: '#1f8a74', data: datosDiasSemana.value.map(d => d.cierres) }
  ]
}))

const modoAporteMecanico = ref('facturacion')

const chartAporteMecanico = computed(() => {
  const datos = informe.value?.tiempos_mecanicos || []
  const esFact = modoAporteMecanico.value === 'facturacion'
  
  return {
    labels: datos.map(d => d.nombre),
    datasets: [{
      label: esFact ? 'Facturación Generada ($)' : 'OTs Trabajadas',
      backgroundColor: esFact ? '#1f8a74' : '#1f6fb8',
      data: datos.map(d => esFact ? d.facturacion_generada : d.ot_trabajadas)
    }]
  }
})

const opcionesAporteMecanico = computed(() => {
  const esFact = modoAporteMecanico.value === 'facturacion'
  return {
    ...opcionesBase,
    plugins: {
      ...opcionesBase.plugins,
      tooltip: {
        callbacks: {
          label: (ctx) => esFact ? `Mano de Obra: ${formatCurrency(ctx.parsed.y)}` : `Órdenes: ${ctx.parsed.y}`
        }
      }
    },
    scales: {
      x: { ...opcionesBase.scales.x },
      y: { 
        ...opcionesBase.scales.y, 
        ticks: { 
          ...opcionesBase.scales.y.ticks, 
          callback: (v) => esFact ? formatCurrency(v) : v 
        } 
      }
    }
  }
})


const mecanicoSeleccionado = ref('separados')
const datosTiempos = computed(() => {
  if (!informe.value || !informe.value.tiempos_mecanicos) return []
  const mec = informe.value.tiempos_mecanicos

  if (mecanicoSeleccionado.value === 'todos') {
    const totEst = mec.reduce((acc, m) => acc + m.hs_estimadas, 0)
    const totReal = mec.reduce((acc, m) => acc + m.hs_empleadas, 0)
    return [{ etiqueta: 'Total Taller', estimado: totEst, real: totReal }]
  }

  if (mecanicoSeleccionado.value === 'separados') {
    return mec.map(m => ({ etiqueta: m.nombre, estimado: m.hs_estimadas, real: m.hs_empleadas }))
  }

  const m = mec.find(m => m.legajo === mecanicoSeleccionado.value)
  return m ? [{ etiqueta: m.nombre, estimado: m.hs_estimadas, real: m.hs_empleadas }] : []
})

const chartTiempos = computed(() => ({
  labels: datosTiempos.value.map(d => d.etiqueta),
  datasets: [
    { label: 'Estimado (hs)', backgroundColor: '#d98a2b', data: datosTiempos.value.map(d => d.estimado) },
    { label: 'Real (hs)', backgroundColor: '#1f6fb8', data: datosTiempos.value.map(d => d.real) }
  ]
}))


const modoRentabilidad = ref('separados')

const datosRentabilidad = computed(() => {
  if (!informe.value || !informe.value.tiempos_mecanicos) return []
  const mec = informe.value.tiempos_mecanicos

  if (modoRentabilidad.value === 'taller') {
    const totalRent = mec.reduce((acc, m) => acc + (m.rentabilidad_eficiencia || 0), 0)
    return [{ etiqueta: 'Taller Completo', valor: totalRent }]
  }

  return mec.map(m => ({
    etiqueta: m.nombre,
    valor: m.rentabilidad_eficiencia || 0
  }))
})

const chartRentabilidad = computed(() => {
  const data = datosRentabilidad.value
  return {
    labels: data.map(d => d.etiqueta),
    datasets: [{
      label: 'Rentabilidad ($)',
      backgroundColor: data.map(d => d.valor >= 0 ? '#1f8a74' : '#c1443c'), 
      data: data.map(d => d.valor)
    }]
  }
})

const opcionesBarraRentabilidad = computed(() => ({
  ...opcionesBase,
  plugins: {
    ...opcionesBase.plugins,
    legend: { display: false },
    tooltip: {
      callbacks: {
        label: (ctx) => `Rentabilidad: ${formatCurrency(ctx.parsed.y)}`
      }
    }
  },
  scales: {
    x: { ...opcionesBase.scales.x },
    y: {
      ...opcionesBase.scales.y,
      ticks: {
        ...opcionesBase.scales.y.ticks,
        callback: (v) => formatCurrency(v)
      }
    }
  }
}))


const chartCuellos = computed(() => {
  const datos = informe.value?.permanencia_estado || []
  return {
    labels: datos.map(e => e.estado),
    datasets: [{
      label: filtroCuellos.value ? 'Horas totales' : 'Horas promedio',
      backgroundColor: '#c1443c',
      data: datos.map(e => filtroCuellos.value ? e.horas_totales : e.horas_promedio)
    }]
  }
})

const cargarInforme = async () => {
  let url = '/informes/mensual?'
  if (desde.value && hasta.value) url += `desde=${desde.value}&hasta=${hasta.value}`
  if (filtroCuellos.value) url += `&filtro_cuellos=${filtroCuellos.value.trim().toUpperCase()}`

  loading.value = true
  ultimoPdf.value = null
  try {
    informe.value = await fetchJSON(url)
  } catch (err) {
    toast.error('Error cargando informe: ' + errMsg(err))
  } finally {
    loading.value = false
  }
}
onMounted(cargarInforme)
</script>

<style scoped>
/* ---- Tokens locales del panel (no pisan variables globales) ---- */
.im-dashboard {
  --im-navy: #12283f;
  --im-blue: #1f6fb8;
  --im-teal: #1f8a74;
  --im-amber: #d98a2b;
  --im-rust: #c1443c;
  --im-slate: #64748b;
  --im-bg: #f4f6f9;
  --im-line: #e2e8f0;
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}

.im-eyebrow {
  display: inline-block;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.09em;
  text-transform: uppercase;
  color: var(--im-slate);
  margin-bottom: 6px;
}

/* ---- Encabezado ---- */
.im-topbar { display: flex; justify-content: space-between; align-items: flex-end; flex-wrap: wrap; gap: 12px; }
.im-title-block h2 { margin: 2px 0 0; font-family: 'Space Grotesk', 'Inter', sans-serif; font-weight: 700; letter-spacing: -0.01em; color: var(--im-navy); }
.pdf-actions { display: flex; gap: 8px; }

.dashboard-controls {
  display: flex; flex-wrap: wrap; gap: 16px; align-items: end;
  background: var(--im-bg);
  padding: 14px 16px;
  border-radius: 10px;
  border: 1px solid var(--im-line);
  margin: 16px 0 24px;
}
.date-group { display: flex; flex-direction: column; gap: 4px; }
.date-group label { font-size: 0.72rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: var(--im-slate); }
.date-input { width: auto; }
.im-btn-primary { background: var(--im-navy); border-color: var(--im-navy); }
.im-uppercase { text-transform: uppercase; }
.im-controls-row { display: flex; gap: 8px; flex-wrap: wrap; }

/* ---- Grupos con eyebrow de sección ---- */
.im-body { display: flex; flex-direction: column; }
.im-group { margin-top: 34px; padding-top: 18px; border-top: 1px solid var(--im-line); }
.im-group:first-of-type { margin-top: 28px; }
.im-mt { margin-top: 20px; }

.section-block { background: white; padding: 20px; border-radius: 12px; border: 1px solid var(--im-line); box-shadow: 0 1px 2px rgba(18,40,63,0.04); break-inside: avoid; }
.header-with-actions { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; margin-bottom: 16px; padding-bottom: 10px; border-bottom: 1px solid var(--im-line); }
.header-with-actions h3 { margin: 0; color: var(--im-navy); font-size: 1.02rem; font-weight: 600; }
.section-block > h3 { margin: 0 0 4px; color: var(--im-navy); font-size: 1.02rem; font-weight: 600; }
.im-subtle { color: var(--im-slate); font-weight: 400; }
.select-sm { width: auto; padding: 4px 8px; font-size: 0.85rem; }
.chart-hint { font-size: 0.8rem; color: var(--im-slate); margin: 0 0 12px; }
.im-hint-strip { margin: 10px 0 0; text-align: right; }

/* ---- Tira de KPIs tipo "panel de instrumentos" ---- */
.im-kpi-strip { display: grid; grid-template-columns: minmax(220px, 320px) 1fr; gap: 16px; }
.im-kpi-hero {
  position: relative;
  background: linear-gradient(155deg, var(--im-navy), #1a3a5c);
  color: white;
  border-radius: 14px;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  overflow: hidden;
}
.im-gauge { position: absolute; top: 10px; right: 10px; width: 90px; opacity: 0.9; }
.im-kpi-hero .im-kpi-label { color: rgba(255,255,255,0.75); }
.im-kpi-value { font-family: 'IBM Plex Mono', 'Space Grotesk', monospace; font-size: 1.7rem; font-weight: 600; font-variant-numeric: tabular-nums; letter-spacing: -0.01em; }

.im-kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; }
.im-kpi-card { background: white; border: 1px solid var(--im-line); border-radius: 12px; padding: 14px 16px; display: flex; flex-direction: column; gap: 4px; box-shadow: 0 1px 2px rgba(18,40,63,0.04); }
.im-kpi-label { font-size: 0.72rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: var(--im-slate); }
.im-kpi-value-sm { font-family: 'IBM Plex Mono', 'Space Grotesk', monospace; font-size: 1.15rem; font-weight: 600; color: var(--im-navy); font-variant-numeric: tabular-nums; }
.im-kpi-value-sm small { font-size: 0.7rem; font-weight: 500; color: var(--im-slate); }

.chart-box { height: 280px; position: relative; }
.chart-box-doughnut { height: 240px; }

.table-wrapper { overflow-x: auto; }
table { width: 100%; border-collapse: collapse; font-size: 0.88rem; }
th, td { padding: 10px 12px; text-align: left; border-bottom: 1px solid var(--im-line); }
th { background: var(--im-bg); font-weight: 600; color: var(--im-navy); font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.03em; }
td { font-variant-numeric: tabular-nums; }
.highlight { color: var(--im-blue); font-weight: 700; font-family: 'IBM Plex Mono', monospace; }

.charts-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(380px, 1fr)); gap: 20px; }

@media (max-width: 640px) {
  .im-kpi-strip { grid-template-columns: 1fr; }
}

@media print {
  .no-print { display: none !important; }
  .section-block { break-inside: avoid; page-break-inside: avoid; }
}
</style>