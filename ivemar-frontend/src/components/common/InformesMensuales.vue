<template>
  <div class="card" ref="rootRef">
    <div class="header-row">
      <h2>Informes de Rendimiento y Facturación</h2>
      <div class="pdf-actions" v-if="informe">
        <button class="btn btn-outline btn-sm" @click="exportarPDF" :disabled="exportando">
          {{ exportando ? 'Generando PDF...' : '👁️ Previsualizar PDF' }}
        </button>
        <button class="btn btn-sm" @click="descargarPDF" :disabled="exportando || !ultimoPdf">⬇ Descargar</button>
      </div>
    </div>

    <div class="dashboard-controls">
      <div class="date-group">
        <label>Desde:</label>
        <input type="date" v-model="desde" class="form-control date-input" />
      </div>
      <div class="date-group">
        <label>Hasta:</label>
        <input type="date" v-model="hasta" class="form-control date-input" />
      </div>
      <button class="btn" @click="cargarInforme" :disabled="loading">{{ loading ? 'Cargando...' : 'Generar Reporte' }}</button>
    </div>

    <div v-if="loading" class="loading-state"><div class="spinner"></div>Procesando métricas...</div>
    <p v-else-if="!informe" class="empty-state">Seleccione el rango de fechas y presione "Generar Reporte".</p>

    <div v-else>
      <div class="stats-grid mt-15" ref="kpisRef">
        <div class="stat-card highlight-card">
          <strong>Facturación Total</strong><br>{{ formatCurrency(informe.resumen.total_facturado) }}
          <DeltaBadge :valor="deltaFacturacion" />
        </div>
        <div class="stat-card">
          <strong>Ticket Promedio</strong><br>{{ formatCurrency(informe.resumen.facturacion_promedio) }}
          <DeltaBadge :valor="deltaTicket" />
        </div>
        <div class="stat-card"><strong>Mano de Obra</strong><br>{{ formatCurrency(informe.resumen.total_mano_obra) }}</div>
        <div class="stat-card"><strong>Repuestos</strong><br>{{ formatCurrency(informe.resumen.total_repuestos) }}</div>
        <div class="stat-card">
          <strong>Total OTs</strong><br>{{ informe.resumen.total_ot }}
          <DeltaBadge :valor="deltaOts" invertido />
        </div>
        <div class="stat-card"><strong>Ciclo Promedio</strong><br>{{ informe.ciclo_promedio }} días</div>
      </div>
      <p class="chart-hint" v-if="informe.resumen_anterior">
        Comparado contra el período equivalente inmediatamente anterior ({{ diasRangoTexto }} días antes).
      </p>

      <hr class="divider" />

      <div class="section-block" ref="financieroRef">
        <div class="header-with-actions">
          <h3>Evolución de Facturación</h3>
          <div style="display:flex; gap: 8px; flex-wrap: wrap;">
            <select v-model="modoFacturacion" class="form-control select-sm no-print">
              <option value="apilado">Apilado (Suma Total)</option>
              <option value="agrupado">Agrupado (Lado a Lado)</option>
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

      <hr class="divider" />

      <div class="charts-grid">
        <div class="section-block" ref="tendenciaRef">
          <div class="header-with-actions">
            <h3>Tendencia: Abiertas vs. Cerradas</h3>
            <select v-model="agrupacionTendencia" class="form-control select-sm">
              <option value="diaria">Diaria</option>
              <option value="semanal">Semanal</option>
              <option value="mensual">Mensual</option>
            </select>
          </div>
          <p class="chart-hint">Si "Abiertas" supera a "Cerradas", se acumula trabajo.</p>
          <div class="chart-box">
            <Line v-if="datosTendenciaAgrupados.length" :data="chartTendencia" :options="opcionesLineaCantidad" />
            <p v-else class="empty-state">Sin movimientos en este período.</p>
          </div>
        </div>

        <div class="section-block" ref="diasSemanaRef">
          <div class="header-with-actions">
            <h3>Concentración por Día de la Semana</h3>
          </div>
          <p class="chart-hint">¿Qué días de la semana ingresan y salen más vehículos?</p>
          <div class="chart-box">
            <Bar v-if="datosDiasSemana.some(d => d.aperturas > 0 || d.cierres > 0)" :data="chartDiasSemana" :options="opcionesBarraCantidades" />
            <p v-else class="empty-state">Sin movimientos en este período.</p>
          </div>
        </div>
      </div>

      <hr class="divider" />

      <div class="charts-grid">
        <div class="section-block" ref="aporteMecanicosRef">
          <div class="header-with-actions">
            <h3>Aporte por Mecánico</h3>
            <select v-model="modoAporteMecanico" class="form-control select-sm no-print">
              <option value="facturacion">Facturación (Mano de Obra)</option>
              <option value="ordenes">Órdenes Trabajadas</option>
            </select>
          </div>
          <div class="chart-box">
            <Bar v-if="informe.tiempos_mecanicos?.length" :data="chartAporteMecanico" :options="opcionesAporteMecanico" />
            <p v-else class="empty-state">Sin datos en este período.</p>
          </div>
        </div>

        <div class="section-block" ref="tiemposRef">
          <div class="header-with-actions">
            <h3>Desviación de Tiempos</h3>
            <select v-model="mecanicoSeleccionado" class="form-control select-sm">
              <option value="todos">Taller Completo (Suma)</option>
              <option value="separados">Comparativa Mecánicos</option>
              <option v-for="m in informe.tiempos_mecanicos" :key="m.legajo" :value="m.legajo">{{ m.nombre }}</option>
            </select>
          </div>
          <div class="chart-box">
            <Bar v-if="datosTiempos.length" :data="chartTiempos" :options="opcionesBarraHoras" />
            <p v-else class="empty-state">Sin actividades finalizadas en este período.</p>
          </div>
        </div>
      </div>

      <hr class="divider" />

      <div class="charts-grid">
        <div class="section-block" ref="cuellosRef">
          <div class="header-with-actions">
            <h3>Cuellos de Botella (Tiempos por Estado)</h3>
            <div style="display:flex; gap: 8px;" class="no-print">
              <input type="text" v-model="filtroCuellos" placeholder="Filtrar OT o Patente" class="form-control select-sm" @keyup.enter="cargarInforme" style="text-transform: uppercase;" />
              <button class="btn btn-sm" @click="cargarInforme">🔍</button>
            </div>
          </div>
          <div class="chart-box">
            <Bar v-if="informe.permanencia_estado?.length" :data="chartCuellos" :options="opcionesBarraHorasHorizontal" />
            <p v-else class="empty-state">Sin datos de permanencia por estado.</p>
          </div>
        </div>
        
        <div class="section-block" ref="composicionRef">
          <h3>Composición del Trabajo (Normal / Garantía / Otras Marcas)</h3>
          <div class="chart-box chart-box-doughnut">
            <Doughnut v-if="calidadData.datasets[0].data.some(v => v > 0)" :data="calidadData" :options="opcionesDoughnut" />
            <p v-else class="empty-state">Sin OTs en este período.</p>
          </div>
        </div>
      </div>

      <hr class="divider" />

      <div class="charts-grid">
        <div class="section-block" ref="repuestosManoObraRef">
          <h3>Distribución: Repuestos vs. Mano de Obra</h3>
          <div class="chart-box chart-box-doughnut">
            <Doughnut v-if="(informe.resumen.total_repuestos + informe.resumen.total_mano_obra) > 0" :data="chartRepuestosManoObra" :options="opcionesDoughnutMoneda" />
            <p v-else class="empty-state">Sin facturación registrada en este período.</p>
          </div>
        </div>

        <div class="section-block" ref="garantiaRef">
          <h3>Facturación: Garantía vs. Facturable</h3>
          <p class="chart-hint">Cuánto del trabajo del taller fue cubierto por garantía (no cobrado al cliente) vs. facturado normalmente.</p>
          <div class="chart-box chart-box-doughnut">
            <Doughnut v-if="(informe.resumen.monto_garantia + informe.resumen.monto_facturable) > 0" :data="chartGarantia" :options="opcionesDoughnutMoneda" />
            <p v-else class="empty-state">Sin facturación registrada en este período.</p>
          </div>
        </div>
      </div>

      <hr class="divider" />

      <div class="charts-grid">
        <div class="section-block" ref="clientesRef" v-if="informe.top_clientes?.length">
          <h3>Clientes Recurrentes (Top 10)</h3>
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
          <h3>Rentabilidad por Tipo de Unidad (Top 10)</h3>
          <div class="table-wrapper">
            <table>
              <thead><tr><th>Unidad</th><th>Cantidad OTs</th><th>Facturación Total</th></tr></thead>
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
  plugins: { legend: { position: 'bottom', labels: { color: '#445' } } },
  scales: {
    x: { ticks: { color: '#445' }, grid: { display: false } },
    y: { ticks: { color: '#445' }, grid: { color: '#eef3f9' } }
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
  plugins: { legend: { position: 'bottom', labels: { color: '#445' } } }
}

const opcionesDoughnutMoneda = {
  ...opcionesDoughnut,
  plugins: {
    legend: { position: 'bottom', labels: { color: '#445' } },
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
        aporteMecanicosRef.value, tiemposRef.value, cuellosRef.value, 
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
      backgroundColor: ['#0056a7', '#b8860b', '#6c7a8a']
    }]
  }
})

const chartRepuestosManoObra = computed(() => ({
  labels: ['Repuestos', 'Mano de Obra'],
  datasets: [{
    data: [informe.value?.resumen.total_repuestos || 0, informe.value?.resumen.total_mano_obra || 0],
    backgroundColor: ['#1d8a4f', '#0056a7']
  }]
}))

const chartGarantia = computed(() => ({
  labels: ['Garantía (no facturado)', 'Facturable'],
  datasets: [{
    data: [informe.value?.resumen.monto_garantia || 0, informe.value?.resumen.monto_facturable || 0],
    backgroundColor: ['#b8860b', '#1d8a4f']
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
    { label: 'Repuestos', backgroundColor: '#1d8a4f', data: datosFinancierosAgrupados.value.map(d => d.repuestos) },
    { label: 'Mano de Obra', backgroundColor: '#0056a7', data: datosFinancierosAgrupados.value.map(d => d.mano_obra) }
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
    { label: 'Abiertas', borderColor: '#b8860b', backgroundColor: '#b8860b', data: datosTendenciaAgrupados.value.map(d => d.aperturas), tension: 0.3 },
    { label: 'Cerradas', borderColor: '#1d8a4f', backgroundColor: '#1d8a4f', data: datosTendenciaAgrupados.value.map(d => d.cierres), tension: 0.3 }
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
    { label: 'Aperturas', backgroundColor: '#b8860b', data: datosDiasSemana.value.map(d => d.aperturas) },
    { label: 'Cierres', backgroundColor: '#1d8a4f', data: datosDiasSemana.value.map(d => d.cierres) }
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
      backgroundColor: esFact ? '#1d8a4f' : '#0056a7',
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
    { label: 'Estimado (hs)', backgroundColor: '#b8860b', data: datosTiempos.value.map(d => d.estimado) },
    { label: 'Real (hs)', backgroundColor: '#0056a7', data: datosTiempos.value.map(d => d.real) }
  ]
}))

const chartCuellos = computed(() => {
  const datos = informe.value?.permanencia_estado || []
  return {
    labels: datos.map(e => e.estado),
    datasets: [{
      label: filtroCuellos.value ? 'Horas totales' : 'Horas promedio',
      backgroundColor: '#b22234',
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
.header-row { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; }
.header-row h2 { margin: 0; }
.pdf-actions { display: flex; gap: 8px; }
.dashboard-controls { display: flex; flex-wrap: wrap; gap: 15px; align-items: center; background: #f8fafc; padding: 15px; border-radius: var(--radius); border: 1px solid var(--border-soft); margin: 15px 0 20px; }
.date-group { display: flex; align-items: center; gap: 8px; }
.date-input { width: auto; }
.divider { border: 0; border-top: 1px dashed var(--border); margin: 30px 0; }
.section-block { background: white; padding: 20px; border-radius: var(--radius); border: 1px solid var(--border-soft); box-shadow: var(--shadow-sm); break-inside: avoid; }
.header-with-actions { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; margin-bottom: 20px; border-bottom: 1px solid var(--border-soft); padding-bottom: 10px;}
.header-with-actions h3 { margin: 0; color: var(--primary); font-size: 1.1rem; }
.select-sm { width: auto; padding: 4px 8px; font-size: 0.9rem; }
.chart-hint { font-size: 0.8rem; color: var(--muted); margin: -10px 0 12px; }

.stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 15px; }
.stat-card { background: white; border: 1px solid var(--border-soft); border-radius: 8px; padding: 15px; text-align: center; box-shadow: var(--shadow-sm); font-size: 1.05rem; position: relative; }
.highlight-card { background: #0056a7; color: white; border: none; font-size: 1.15rem; }

.chart-box { height: 280px; position: relative; }
.chart-box-doughnut { height: 240px; }

.table-wrapper { overflow-x: auto; }
table { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
th, td { padding: 10px 12px; text-align: left; border-bottom: 1px solid var(--border-soft); }
th { background: #f8fafc; font-weight: 600; color: #1a2a3a; }
.highlight { color: #0056a7; font-weight: bold; }

.charts-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(380px, 1fr)); gap: 20px; }

@media print {
  .no-print { display: none !important; }
  .section-block { break-inside: avoid; page-break-inside: avoid; }
}
</style>