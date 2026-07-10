<template>
  <div class="card" ref="rootRef">
    <div class="header-row">
      <h2>Informes de Rendimiento y Facturación</h2>
      <div class="pdf-actions" v-if="store.financiero">
        <button class="btn btn-outline btn-sm" @click="exportarPDF" :disabled="exportando">
          {{ exportando ? 'Generando PDF...' : '👁️ Previsualizar PDF' }}
        </button>
        <button class="btn btn-sm" @click="descargarPDF" :disabled="exportando || !ultimoPdf">⬇ Descargar</button>
      </div>
    </div>

    <div class="dashboard-controls">
      <div class="date-group">
        <label>Desde:</label>
        <input type="date" v-model="store.desde" class="form-control date-input" />
      </div>
      <div class="date-group">
        <label>Hasta:</label>
        <input type="date" v-model="store.hasta" class="form-control date-input" />
      </div>
      <button class="btn" @click="store.cargarInformes" :disabled="store.loading">
        {{ store.loading ? 'Cargando...' : 'Generar Reporte' }}
      </button>
    </div>

    <div v-if="store.loading" class="loading-state"><div class="spinner"></div>Procesando métricas...</div>
    <p v-else-if="!store.financiero" class="empty-state">Seleccione el rango de fechas y presione "Generar Reporte".</p>

    <div v-else>
      <div class="stats-grid mt-15" ref="kpisRef">
        <div class="stat-card highlight-card">
          <strong>Facturación Total</strong><br>{{ formatCurrency(store.financiero.resumen.total_facturado) }}
          <DeltaBadge :valor="deltaFacturacion" />
        </div>
        <div class="stat-card">
          <strong>Ticket Promedio</strong><br>{{ formatCurrency(store.financiero.resumen.facturacion_promedio) }}
          <DeltaBadge :valor="deltaTicket" />
        </div>
        <div class="stat-card"><strong>Mano de Obra</strong><br>{{ formatCurrency(store.financiero.resumen.total_mano_obra) }}</div>
        <div class="stat-card"><strong>Repuestos</strong><br>{{ formatCurrency(store.financiero.resumen.total_repuestos) }}</div>
        <div class="stat-card">
          <strong>Total OTs</strong><br>{{ store.financiero.resumen.total_ot }}
          <DeltaBadge :valor="deltaOts" invertido />
        </div>
        <div class="stat-card"><strong>Ciclo Promedio</strong><br>{{ store.taller.ciclo_promedio }} días</div>
      </div>
      <p class="chart-hint" v-if="store.financiero.resumen_anterior">
        Comparado contra el período equivalente inmediatamente anterior.
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
          <Bar v-if="datosFinancierosAgrupados.length" :data="chartFinanciero" :options="opcionesBarraMonedaConfig" />
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

      <div ref="rendimientoOperativoRef">
        <TableroOperativo />
      </div>

      <hr class="divider" />

      <div class="charts-grid">
        <div class="section-block" ref="aporteMecanicosRef">
          <div class="header-with-actions">
            <h3>Aporte por Mecánico (Facturación)</h3>
            <select v-model="modoAporteMecanico" class="form-control select-sm no-print">
              <option value="facturacion">Facturación (Mano de Obra)</option>
              <option value="ordenes">Órdenes Trabajadas</option>
            </select>
          </div>
          <div class="chart-box">
            <Bar v-if="store.operativo.tiempos_mecanicos?.length" :data="chartAporteMecanico" :options="opcionesAporteMecanico" />
            <p v-else class="empty-state">Sin datos en este período.</p>
          </div>
        </div>

        <div class="section-block" ref="tiemposRef">
          <div class="header-with-actions">
            <h3>Desviación de Tiempos (Estimado vs Real)</h3>
            <select v-model="mecanicoSeleccionado" class="form-control select-sm">
              <option value="todos">Taller Completo (Suma)</option>
              <option value="separados">Comparativa Mecánicos</option>
              <option v-for="m in store.operativo.tiempos_mecanicos" :key="m.legajo" :value="m.legajo">{{ m.nombre }}</option>
            </select>
          </div>
          <div class="chart-box">
            <Bar v-if="datosTiempos.length" :data="chartTiempos" :options="opcionesBarraHoras" />
            <p v-else class="empty-state">Sin actividades finalizadas en este período.</p>
          </div>
        </div>
      </div>

      <hr class="divider" />

      <div class="section-block" ref="rentabilidadMecanicosRef">
        <div class="header-with-actions">
          <h3>Rentabilidad Monetaria por Eficiencia</h3>
          <select v-model="modoRentabilidad" class="form-control select-sm no-print">
            <option value="separados">Comparativa Mecánicos</option>
            <option value="taller">Taller Completo (Consolidado)</option>
          </select>
        </div>
        <p class="chart-hint">Valor monetario del tiempo ahorrado (verde) o excedido (rojo) respecto al presupuestado.</p>
        <div class="chart-box">
          <Bar v-if="datosRentabilidad.length" :data="chartRentabilidad" :options="opcionesBarraRentabilidad" />
          <p v-else class="empty-state">Sin datos de eficiencia en este período.</p>
        </div>
      </div>

      <hr class="divider" />

      <div class="charts-grid">
        <div class="section-block" ref="cuellosRef">
          <div class="header-with-actions">
            <h3>Cuellos de Botella (Tiempos por Estado)</h3>
            <div style="display:flex; gap: 8px;" class="no-print">
              <input type="text" v-model="store.filtroCuellos" placeholder="Filtrar OT o Patente" class="form-control select-sm" @keyup.enter="store.cargarInformes" style="text-transform: uppercase;" />
              <button class="btn btn-sm" @click="store.cargarInformes">🔍</button>
            </div>
          </div>
          <div class="chart-box">
            <Bar v-if="store.taller.permanencia_estado?.length" :data="chartCuellos" :options="opcionesBarraHorasHorizontal" />
            <p v-else class="empty-state">Sin datos de permanencia por estado.</p>
          </div>
        </div>
        
        <div class="section-block" ref="composicionRef">
          <h3>Composición del Trabajo</h3>
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
            <Doughnut v-if="(store.financiero.resumen.total_repuestos + store.financiero.resumen.total_mano_obra) > 0" :data="chartRepuestosManoObra" :options="opcionesDoughnutMoneda" />
            <p v-else class="empty-state">Sin facturación registrada.</p>
          </div>
        </div>

        <div class="section-block" ref="garantiaRef">
          <h3>Facturación: Garantía vs. Facturable</h3>
          <div class="chart-box chart-box-doughnut">
            <Doughnut v-if="(store.financiero.resumen.monto_garantia + store.financiero.resumen.monto_facturable) > 0" :data="chartGarantia" :options="opcionesDoughnutMoneda" />
            <p v-else class="empty-state">Sin facturación registrada.</p>
          </div>
        </div>
      </div>

      <hr class="divider" />

      <div class="charts-grid">
        <div class="section-block" ref="clientesRef" v-if="store.financiero.top_clientes?.length">
          <h3>Clientes Recurrentes (Top 10)</h3>
          <div class="table-wrapper">
            <table>
              <thead><tr><th>Cliente</th><th>OTs</th><th>Facturación</th></tr></thead>
              <tbody>
                <tr v-for="c in store.financiero.top_clientes" :key="c.cliente">
                  <td>{{ c.cliente }}</td>
                  <td>{{ c.cantidad_ot }}</td>
                  <td><span class="highlight">{{ formatCurrency(c.facturacion_total) }}</span></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div class="section-block" ref="rentabilidadRef" v-if="store.financiero.rentabilidad_unidad?.length">
          <h3>Rentabilidad por Tipo de Unidad (Top 10)</h3>
          <div class="table-wrapper">
            <table>
              <thead><tr><th>Unidad</th><th>Cantidad OTs</th><th>Facturación Total</th></tr></thead>
              <tbody>
                <tr v-for="u in store.financiero.rentabilidad_unidad" :key="u.unidad">
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
import { Chart as ChartJS, Title, Tooltip, Legend, BarElement, CategoryScale, LinearScale, LineElement, PointElement, ArcElement } from 'chart.js'
import { useInformesStore } from '../../stores/useInformesStore'
import { useChartConfig } from '../../composables/useChartConfig'
import { useDashboardExporter } from '../../composables/useDashboardExporter'
import DeltaBadge from './DeltaBadge.vue'
import TableroOperativo from '../informes/TableroOperativo.vue'

ChartJS.register(Title, Tooltip, Legend, BarElement, CategoryScale, LinearScale, LineElement, PointElement, ArcElement)

const store = useInformesStore()
const { formatCurrency, opcionesBase, getOpcionesBarraMoneda, opcionesDoughnut, opcionesDoughnutMoneda } = useChartConfig()
const { exportarDashboardPDF } = useDashboardExporter()

// Lógica PDF
const exportando = ref(false)
const ultimoPdf = ref(null)

const kpisRef = ref(null)
const financieroRef = ref(null)
const tendenciaRef = ref(null)
const diasSemanaRef = ref(null)
const rendimientoOperativoRef = ref(null)
const aporteMecanicosRef = ref(null)
const tiemposRef = ref(null)
const rentabilidadMecanicosRef = ref(null)
const cuellosRef = ref(null)
const composicionRef = ref(null)
const repuestosManoObraRef = ref(null)
const garantiaRef = ref(null)
const clientesRef = ref(null)
const rentabilidadRef = ref(null)

const exportarPDF = async () => {
  exportando.value = true
  try {
    const resultado = await exportarDashboardPDF({
      titulo: 'IVEMAR · Informe de Rendimiento y Facturación',
      subtitulo: `Período: ${store.desde} al ${store.hasta}`,
      filename: `informe_ivemar_${store.desde}_a_${store.hasta}.pdf`,
      blocks: [
        kpisRef.value, financieroRef.value, tendenciaRef.value, diasSemanaRef.value,
        rendimientoOperativoRef.value, aporteMecanicosRef.value, tiemposRef.value, rentabilidadMecanicosRef.value, 
        cuellosRef.value, composicionRef.value, repuestosManoObraRef.value,
        garantiaRef.value, clientesRef.value, rentabilidadRef.value
      ]
    })
    if (resultado) ultimoPdf.value = resultado
  } finally {
    exportando.value = false
  }
}
const descargarPDF = () => { if (ultimoPdf.value) ultimoPdf.value.descargar() }

// Calculadora Deltas
const calcularDelta = (actual, anterior) => (anterior ? ((actual - anterior) / anterior) * 100 : null)
const deltaFacturacion = computed(() => calcularDelta(store.financiero?.resumen.total_facturado, store.financiero?.resumen_anterior.total_facturado))
const deltaTicket = computed(() => calcularDelta(store.financiero?.resumen.facturacion_promedio, store.financiero?.resumen_anterior.facturacion_promedio))
const deltaOts = computed(() => calcularDelta(store.financiero?.resumen.total_ot, store.financiero?.resumen_anterior.total_ot))

// Utilidades Fechas
const getSemana = (fecha) => {
  const d = new Date(fecha); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7);
  const week1 = new Date(d.getFullYear(), 0, 4);
  return `Sem ${1 + Math.round(((d.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7)}`;
}
const claveAgrupacion = (fechaStr, modo) => {
  const fechaObj = new Date(fechaStr)
  if (modo === 'semanal') return getSemana(fechaStr)
  if (modo === 'mensual') return fechaStr.substring(0, 7)
  if (modo === 'quincenal') return `${fechaStr.substring(0, 7)} ${fechaObj.getDate() <= 15 ? 'Q1' : 'Q2'}`
  return fechaStr
}

// 1. FINANCIERO
const modoFacturacion = ref('apilado')
const agrupacionFinanciera = ref('diaria')
const opcionesBarraMonedaConfig = computed(() => getOpcionesBarraMoneda(modoFacturacion.value === 'apilado'))

const datosFinancierosAgrupados = computed(() => {
  if (!store.financiero?.facturacion_diaria) return []
  const grupos = {}
  store.financiero.facturacion_diaria.forEach(d => {
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

// 2. TENDENCIAS
const agrupacionTendencia = ref('diaria')
const opcionesLineaCantidad = { ...opcionesBase }
const datosTendenciaAgrupados = computed(() => {
  if (!store.taller) return []
  const grupos = {}
  store.taller.aperturas_por_dia?.forEach(d => {
    const clave = claveAgrupacion(d.fecha, agrupacionTendencia.value)
    if (!grupos[clave]) grupos[clave] = { etiqueta: clave, aperturas: 0, cierres: 0 }
    grupos[clave].aperturas += d.cantidad
  })
  store.taller.cierres_por_dia?.forEach(d => {
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

// 3. DIAS DE LA SEMANA
const diasNombres = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
const opcionesBarraCantidades = { ...opcionesBase, plugins: { ...opcionesBase.plugins, tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${ctx.parsed.y} OTs` } } } }
const datosDiasSemana = computed(() => {
  if (!store.taller) return []
  const dias = Array(7).fill(0).map((_, i) => ({ dia: i, etiqueta: diasNombres[i], aperturas: 0, cierres: 0 }))
  store.taller.aperturas_por_dia?.forEach(d => { const [y, m, dd] = d.fecha.split('-'); dias[new Date(y, m - 1, dd).getDay()].aperturas += d.cantidad })
  store.taller.cierres_por_dia?.forEach(d => { const [y, m, dd] = d.fecha.split('-'); dias[new Date(y, m - 1, dd).getDay()].cierres += d.cantidad })
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

// 4. APORTE MECANICOS
const modoAporteMecanico = ref('facturacion')
const chartAporteMecanico = computed(() => {
  const datos = store.operativo?.tiempos_mecanicos || []
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
    plugins: { ...opcionesBase.plugins, tooltip: { callbacks: { label: (ctx) => esFact ? `Mano de Obra: ${formatCurrency(ctx.parsed.y)}` : `Órdenes: ${ctx.parsed.y}` } } },
    scales: { x: opcionesBase.scales.x, y: { ...opcionesBase.scales.y, ticks: { ...opcionesBase.scales.y.ticks, callback: (v) => esFact ? formatCurrency(v) : v } } }
  }
})

// 5. TIEMPOS ESTIMADO VS REAL
const mecanicoSeleccionado = ref('separados')
const opcionesBarraHoras = { ...opcionesBase, plugins: { ...opcionesBase.plugins, tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${ctx.parsed.y} hs` } } } }
const datosTiempos = computed(() => {
  const mec = store.operativo?.tiempos_mecanicos || []
  if (mecanicoSeleccionado.value === 'todos') {
    return [{ etiqueta: 'Total Taller', estimado: mec.reduce((a, m) => a + m.hs_estimadas, 0), real: mec.reduce((a, m) => a + m.hs_empleadas, 0) }]
  }
  if (mecanicoSeleccionado.value === 'separados') return mec.map(m => ({ etiqueta: m.nombre, estimado: m.hs_estimadas, real: m.hs_empleadas }))
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

// 6. RENTABILIDAD MECANICOS
const modoRentabilidad = ref('separados')
const datosRentabilidad = computed(() => {
  const mec = store.operativo?.tiempos_mecanicos || []
  if (modoRentabilidad.value === 'taller') return [{ etiqueta: 'Taller Completo', valor: mec.reduce((acc, m) => acc + (m.rentabilidad_eficiencia || 0), 0) }]
  return mec.map(m => ({ etiqueta: m.nombre, valor: m.rentabilidad_eficiencia || 0 }))
})
const chartRentabilidad = computed(() => {
  const data = datosRentabilidad.value
  return {
    labels: data.map(d => d.etiqueta),
    datasets: [{ label: 'Rentabilidad ($)', backgroundColor: data.map(d => d.valor >= 0 ? '#1d8a4f' : '#b22234'), data: data.map(d => d.valor) }]
  }
})
const opcionesBarraRentabilidad = computed(() => ({
  ...opcionesBase,
  plugins: { ...opcionesBase.plugins, legend: { display: false }, tooltip: { callbacks: { label: (ctx) => `Rentabilidad: ${formatCurrency(ctx.parsed.y)}` } } },
  scales: { x: opcionesBase.scales.x, y: { ...opcionesBase.scales.y, ticks: { ...opcionesBase.scales.y.ticks, callback: (v) => formatCurrency(v) } } }
}))

// 7. CUELLOS DE BOTELLA
const opcionesBarraHorasHorizontal = { ...opcionesBase, indexAxis: 'y', plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx) => `${ctx.parsed.x} hs` } } } }
const chartCuellos = computed(() => {
  const datos = store.taller?.permanencia_estado || []
  return {
    labels: datos.map(e => e.estado),
    datasets: [{ label: store.filtroCuellos ? 'Horas totales' : 'Horas promedio', backgroundColor: '#b22234', data: datos.map(e => store.filtroCuellos ? e.horas_totales : e.horas_promedio) }]
  }
})

// 8. DOUGHNUTS
const calidadData = computed(() => {
  const r = store.financiero?.resumen || {}
  return {
    labels: ['Normales', 'Garantía IVECO', 'Otras Marcas (No Iveco)'],
    datasets: [{ data: [r.total_normales || 0, r.total_garantia || 0, r.total_no_iveco || 0], backgroundColor: ['#0056a7', '#b8860b', '#6c7a8a'] }]
  }
})
const chartRepuestosManoObra = computed(() => ({
  labels: ['Repuestos', 'Mano de Obra'],
  datasets: [{ data: [store.financiero?.resumen.total_repuestos || 0, store.financiero?.resumen.total_mano_obra || 0], backgroundColor: ['#1d8a4f', '#0056a7'] }]
}))
const chartGarantia = computed(() => ({
  labels: ['Garantía (no facturado)', 'Facturable'],
  datasets: [{ data: [store.financiero?.resumen.monto_garantia || 0, store.financiero?.resumen.monto_facturable || 0], backgroundColor: ['#b8860b', '#1d8a4f'] }]
}))

onMounted(() => { store.cargarInformes() })
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