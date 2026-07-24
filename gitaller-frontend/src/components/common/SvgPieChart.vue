<template>
  <div class="svg-pie-chart">
    <svg viewBox="0 0 380 200" preserveAspectRatio="xMidYMid meet">
      <g transform="translate(100, 100)">
        <path v-for="(slice, i) in slices" :key="'p'+i" :d="slice.path" :fill="slice.color" />
      </g>
      <g transform="translate(210, 30)">
        <g v-for="(slice, i) in slices" :key="'l'+i" :transform="`translate(0, ${i * 22})`">
          <rect x="0" y="0" width="12" height="12" :fill="slice.color" rx="2" />
          <text x="18" y="10" font-size="10" fill="var(--text)">{{ truncate(slice.label) }}: {{ slice.value }}</text>
        </g>
      </g>
    </svg>
  </div>
</template>
<script setup>
import { computed } from 'vue'
const props = defineProps({ data: { type: Array, required: true } })

const slices = computed(() => {
  const total = props.data.reduce((sum, d) => sum + d.value, 0)
  if (total === 0) return []
  
  const colors = ['#0056a7', '#1d8a4f', '#b8860b', '#b22234', '#6c7a8a', '#8e44ad', '#e67e22']
  let startAngle = 0
  
  return props.data.map((d, i) => {
    const angle = (d.value / total) * 360
    const endAngle = startAngle + angle
    const startRad = (startAngle - 90) * Math.PI / 180
    const endRad = (endAngle - 90) * Math.PI / 180
    const x1 = 80 * Math.cos(startRad)
    const y1 = 80 * Math.sin(startRad)
    const x2 = 80 * Math.cos(endRad)
    const y2 = 80 * Math.sin(endRad)
    const largeArc = angle > 180 ? 1 : 0
    
    const pathData = (angle === 360) 
      ? `M 0,-80 a 80,80 0 1,1 -0.1,0 z` 
      : `M 0 0 L ${x1} ${y1} A 80 80 0 ${largeArc} 1 ${x2} ${y2} Z`
    
    startAngle = endAngle
    return { path: pathData, color: colors[i % colors.length], label: d.label, value: d.value }
  })
})

// Antes cortaba cualquier etiqueta de más de 14 caracteres a los primeros 12
// + "..", lo que arruinaba textos cortos pero no tan cortos como
// "Entre 1 y 5 días" (16 caracteres) -> "Entre 1 y 5 ..: 4", ilegible.
// Se amplió el viewBox y la columna de leyenda, y se subió el límite para
// que las etiquetas típicas de este dashboard entren completas.
const truncate = (str) => str.length > 26 ? str.substring(0, 24) + '..' : str
</script>
<style scoped>
/* El <svg> por sí solo (sin width/height propios, solo viewBox) se
   renderiza a su tamaño intrínseco por defecto del navegador en vez de
   ajustarse al contenedor — eso es lo que lo hacía desbordar y tapar las
   secciones de abajo. Forzamos que ocupe el 100% del contenedor y
   bloqueamos cualquier desborde como red de seguridad (clave también para
   que la captura a PDF en A4 sea siempre del tamaño esperado). */
.svg-pie-chart { width: 100%; height: 250px; background: var(--surface); border-radius: var(--radius); padding: 10px; border: 1px solid var(--border-soft); overflow: hidden; box-sizing: border-box; }
.svg-pie-chart svg { display: block; width: 100%; height: 100%; }
</style>
