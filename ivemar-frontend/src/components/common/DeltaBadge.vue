<template>
  <span v-if="valor !== null" :class="['delta-badge', claseColor]">
    {{ valor >= 0 ? '▲' : '▼' }} {{ Math.abs(valor).toFixed(1) }}%
  </span>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  valor: { type: Number, default: null },
  // Para métricas donde "más" no siempre es "mejor" (ej. cantidad de OTs
  // abiertas puede subir por más demanda, no es en sí bueno ni malo, pero
  // en general un aumento de actividad se marca en azul neutro en vez de
  // verde/rojo). Con invertido=true, sube en vez de verde marca ámbar.
  invertido: { type: Boolean, default: false }
})

const claseColor = computed(() => {
  if (props.valor === null) return ''
  if (props.invertido) return 'delta-neutral'
  return props.valor >= 0 ? 'delta-positivo' : 'delta-negativo'
})
</script>

<style scoped>
.delta-badge {
  display: inline-block;
  margin-top: 4px;
  font-size: 0.75rem;
  font-weight: 700;
  padding: 1px 8px;
  border-radius: 10px;
}
.delta-positivo { background: rgba(29, 138, 79, 0.15); color: #1d8a4f; }
.delta-negativo { background: rgba(178, 34, 52, 0.15); color: #b22234; }
.delta-neutral { background: rgba(184, 134, 11, 0.15); color: #b8860b; }

/* Dentro de la tarjeta destacada (fondo azul) los colores de arriba no
   contrastan bien, se usa una variante más clara. */
.highlight-card .delta-badge { background: rgba(255,255,255,0.2); color: white; }
</style>
