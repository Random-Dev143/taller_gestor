export function useChartConfig() {
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

  const getOpcionesBarraMoneda = (apilado = false) => ({
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
    plugins: { legend: { position: 'bottom', labels: { color: '#52606d' } } }
  }

  const opcionesDoughnutMoneda = {
    ...opcionesDoughnut,
    plugins: {
      legend: { position: 'bottom', labels: { color: '#52606d' } },
      tooltip: { callbacks: { label: (ctx) => `${ctx.label}: ${formatCurrency(ctx.parsed)}` } }
    }
  }

  return {
    formatCurrency,
    opcionesBase,
    getOpcionesBarraMoneda,
    opcionesDoughnut,
    opcionesDoughnutMoneda
  }
}