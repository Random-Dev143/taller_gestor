export function useChartConfig() {
  const formatCurrency = (val) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(val || 0)
  const formatHoras = (val) => `${(val || 0).toLocaleString('es-AR', { maximumFractionDigits: 1 })} hs`
  const formatNumero = (val) => (val || 0).toLocaleString('es-AR', { maximumFractionDigits: 1 })

  // ─── PORCENTAJES DEL TOTAL ──────────────────────────────────────────
  // Todos los gráficos muestran, además del valor, qué % representa del
  // total. El "total" tiene un significado distinto según el tipo de
  // gráfico:
  //   - Doughnut: % de la torta completa (todos los segmentos suman 100%).
  //   - Barras: % de la suma de todas las series en esa misma posición del
  //     eje X (ej: en "Repuestos vs Mano de Obra" por día, qué parte de lo
  //     facturado ESE día fue repuestos vs mano de obra).
  //   - Línea: igual que barras, % de la suma de todas las series en ese punto.

  function pctDoughnut(ctx) {
    const data = ctx.chart.data.datasets[ctx.datasetIndex].data
    const total = data.reduce((a, b) => a + (Number(b) || 0), 0)
    return total > 0 ? ((ctx.parsed / total) * 100).toFixed(1) : '0.0'
  }

  function pctEnIndice(ctx) {
    const datasets = ctx.chart.data.datasets
    const idx = ctx.dataIndex
    const total = datasets.reduce((acc, ds) => acc + (Number(ds.data[idx]) || 0), 0)
    const valor = ctx.parsed.y ?? ctx.parsed
    return total > 0 ? ((valor / total) * 100).toFixed(1) : '0.0'
  }

  // Se pasa el valor explícito (en vez de inferirlo de ctx.parsed.y) porque
  // este helper también se usa en gráficos horizontales (indexAxis: 'y'),
  // donde el valor real vive en ctx.parsed.x, no en .y.
  function pctDeSerie(ctx, valorExplicito) {
    const data = ctx.dataset.data
    const total = data.reduce((a, b) => a + Math.abs(Number(b) || 0), 0)
    const valor = Math.abs(valorExplicito ?? ctx.parsed.y ?? ctx.parsed)
    return total > 0 ? ((valor / total) * 100).toFixed(1) : '0.0'
  }

  const opcionesBase = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { position: 'bottom', labels: { color: '#52606d' } } },
    scales: {
      x: { ticks: { color: '#52606d' }, grid: { display: false } },
      y: { ticks: { color: '#52606d' }, grid: { color: '#eef3f9' } }
    }
  }

  const getOpcionesBarraMoneda = (apilado = false) => ({
    ...opcionesBase,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      ...opcionesBase.plugins,
      tooltip: {
        callbacks: {
          label: (ctx) => `${ctx.dataset.label}: ${formatCurrency(ctx.parsed.y)} (${pctEnIndice(ctx)}%)`,
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
      y: { 
        ...opcionesBase.scales.y, 
        stacked: apilado, 
        ticks: { ...opcionesBase.scales.y.ticks, callback: (v) => formatCurrency(v) } 
      }
    }
  })

  const opcionesDoughnut = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'bottom', labels: { color: '#52606d' } },
      tooltip: { callbacks: { label: (ctx) => `${ctx.label}: ${formatNumero(ctx.parsed)} (${pctDoughnut(ctx)}%)` } }
    }
  }

  const opcionesDoughnutMoneda = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'bottom', labels: { color: '#52606d' } },
      tooltip: { callbacks: { label: (ctx) => `${ctx.label}: ${formatCurrency(ctx.parsed)} (${pctDoughnut(ctx)}%)` } }
    }
  }

  // Variante del doughnut para gráficos donde el valor son horas en vez de
  // dinero o cantidad de OTs (ej: torta de aperturas/cierres por día de semana
  // no usa esta, pero horas de garantía por tipo sí podría en el futuro).
  const opcionesDoughnutHoras = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'bottom', labels: { color: '#52606d' } },
      tooltip: { callbacks: { label: (ctx) => `${ctx.label}: ${formatHoras(ctx.parsed)} (${pctDoughnut(ctx)}%)` } }
    }
  }

  return {
    formatCurrency,
    formatHoras,
    formatNumero,
    pctDoughnut,
    pctEnIndice,
    pctDeSerie,
    opcionesBase,
    getOpcionesBarraMoneda,
    opcionesDoughnut,
    opcionesDoughnutMoneda,
    opcionesDoughnutHoras
  }
}
