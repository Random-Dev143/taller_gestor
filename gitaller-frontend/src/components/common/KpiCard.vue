<template>
  <component :is="to ? 'router-link' : 'div'" :to="to || undefined" class="kpi" :class="[`kpi--${tone}`, { 'kpi--link': !!to }]">
    <div class="kpi__top">
      <span class="kpi__label">{{ label }}</span>
      <AppIcon v-if="icon" :name="icon" class="kpi__icon" />
    </div>
    <div class="kpi__value">
      <span class="num">{{ value }}</span>
      <span v-if="delta !== null && delta !== undefined" class="kpi__delta" :class="deltaClase" :title="deltaTitle">
        {{ delta > 0 ? '▲' : delta < 0 ? '▼' : '=' }} {{ Math.abs(delta).toLocaleString('es-AR') }}%
      </span>
    </div>
    <div v-if="progreso !== null && progreso !== undefined" class="kpi__bar" role="img" :aria-label="`${Math.round(progreso)}%`">
      <div class="kpi__fill" :style="{ width: Math.min(100, Math.max(0, progreso)) + '%' }" :class="{ 'kpi__fill--over': progreso > 100 }"></div>
    </div>
    <div v-if="sub" class="kpi__sub">{{ sub }}</div>
  </component>
</template>

<script setup>
import { computed } from 'vue'
// Tarjeta de indicador. `tone` pinta el borde superior: ok | warn | danger | primary | neutral.
// `delta` es la variación % contra el período anterior; con `invertir` una baja es buena (ej. no-show).
const props = defineProps({
  label: { type: String, required: true },
  value: { type: [String, Number], default: '—' },
  sub: { type: String, default: '' },
  tone: { type: String, default: 'neutral' },
  icon: { type: String, default: '' },
  to: { type: [String, Object], default: null },
  delta: { type: Number, default: null },
  invertir: { type: Boolean, default: false },
  deltaTitle: { type: String, default: 'Variación contra el período anterior' },
  progreso: { type: Number, default: null }
})
const deltaClase = computed(() => {
  if (!props.delta) return 'kpi__delta--igual'
  const bueno = props.invertir ? props.delta < 0 : props.delta > 0
  return bueno ? 'kpi__delta--bueno' : 'kpi__delta--malo'
})
</script>

<style scoped>
.kpi {
  display: flex; flex-direction: column; gap: 6px; min-width: 0;
  padding: 14px 16px 14px; background: var(--surface); color: var(--text); text-decoration: none;
  border: 1px solid var(--border-soft); border-top: 3px solid var(--border); border-radius: var(--radius);
  box-shadow: var(--shadow-sm);
}
.kpi--ok { border-top-color: var(--success); }
.kpi--warn { border-top-color: var(--amber); }
.kpi--danger { border-top-color: var(--danger); }
.kpi--primary { border-top-color: var(--primary-text); }
.kpi--link { cursor: pointer; transition: border-color 0.15s, box-shadow 0.15s, transform 0.15s; }
.kpi--link:hover { box-shadow: 0 4px 14px rgba(16, 24, 40, 0.1); transform: translateY(-1px); }
.kpi--link:focus-visible { outline: 2px solid var(--primary-text); outline-offset: 2px; }
.kpi__top { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.kpi__label { font-size: 0.74rem; font-weight: 650; letter-spacing: 0.05em; text-transform: uppercase; color: var(--text-soft); }
.kpi__icon { color: var(--muted); font-size: 1.1rem; }
.kpi__value { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }
.kpi__value .num { font-size: 1.85rem; font-weight: 700; line-height: 1.1; letter-spacing: -0.02em; }
.kpi__delta { font-size: 0.74rem; font-weight: 650; padding: 1px 7px; border-radius: 999px; background: var(--chip-bg); color: var(--text-soft); }
.kpi__delta--bueno { background: var(--status-progress-bg); color: var(--status-progress-text); }
.kpi__delta--malo { background: var(--status-danger-bg); color: var(--status-danger-text); }
.kpi__bar { height: 6px; border-radius: 4px; background: var(--border-soft); overflow: hidden; }
.kpi__fill { height: 100%; background: var(--success); border-radius: 4px; }
.kpi__fill--over { background: var(--amber); }
.kpi__sub { font-size: 0.8rem; color: var(--muted); line-height: 1.35; }
</style>
