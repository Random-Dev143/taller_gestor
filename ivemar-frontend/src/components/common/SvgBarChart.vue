<template>
  <div class="svg-bar-chart">
    <svg viewBox="0 0 500 250" preserveAspectRatio="xMidYMid meet">
      <g v-for="(item, i) in data" :key="i">
        <rect :x="i * barSpacing + offset" y="30" :width="barWidth" height="190" fill="#f0f4f8" rx="4" />
        <rect :x="i * barSpacing + offset" :y="220 - getBarHeight(item.value)" :width="barWidth" :height="getBarHeight(item.value)" fill="var(--primary)" rx="4" />
        <text :x="i * barSpacing + offset + barWidth/2" :y="215 - getBarHeight(item.value)" text-anchor="middle" font-size="12" font-weight="bold" fill="var(--primary-dark)">{{ item.value }}</text>
        <text :x="i * barSpacing + offset + barWidth/2" y="240" text-anchor="middle" font-size="11" fill="var(--text-soft)">{{ truncate(item.label) }}</text>
      </g>
    </svg>
  </div>
</template>
<script setup>
import { computed } from 'vue'
const props = defineProps({ data: { type: Array, required: true } })

const maxValue = computed(() => Math.max(...props.data.map(d => d.value), 1))
const barSpacing = computed(() => props.data.length ? (500 / props.data.length) : 0)
const barWidth = computed(() => Math.min(barSpacing.value * 0.6, 60))
const offset = computed(() => (barSpacing.value - barWidth.value) / 2)

const getBarHeight = (val) => (val / maxValue.value) * 190
const truncate = (str) => str.length > 10 ? str.substring(0, 8) + '..' : str
</script>
<style scoped>
.svg-bar-chart { width: 100%; height: 250px; background: white; border-radius: var(--radius); padding: 10px; border: 1px solid var(--border-soft); overflow: hidden; box-sizing: border-box; }
.svg-bar-chart svg { display: block; width: 100%; height: 100%; }
</style>