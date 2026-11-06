<template>
  <div class="filtro-fechas">
    <label class="ff-campo">
      Desde
      <input type="date" class="form-control" :value="desde" :max="hasta || hoy"
             :disabled="buscando" @change="emit('update:desde', $event.target.value); emit('cambio')" />
    </label>
    <label class="ff-campo">
      Hasta
      <input type="date" class="form-control" :value="hasta" :max="hoy" :min="desde || undefined"
             :disabled="buscando" @change="emit('update:hasta', $event.target.value); emit('cambio')" />
    </label>
    <button type="button" class="btn btn-outline btn-sm" :disabled="buscando" @click="emit('reset')"
            :title="`Volver a mostrar solo los últimos ${DIAS_POR_DEFECTO} días`">
      Últimos {{ DIAS_POR_DEFECTO }} días
    </button>
    <span v-if="buscando" class="ff-aviso">🔍 La búsqueda abarca todas las fechas</span>
  </div>
</template>

<script setup>
import { fechaLocalISO, DIAS_POR_DEFECTO } from '../../composables/useRangoFechas'

defineProps({
  desde: { type: String, default: '' },
  hasta: { type: String, default: '' },
  // true mientras hay texto en el buscador: ahí se ignora el rango
  buscando: { type: Boolean, default: false }
})
const emit = defineEmits(['update:desde', 'update:hasta', 'cambio', 'reset'])
const hoy = fechaLocalISO(0)
</script>

<style scoped>
.filtro-fechas { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.ff-campo { display: flex; align-items: center; gap: 6px; font-size: 0.9rem; white-space: nowrap; }
.ff-campo input { width: auto; }
.ff-aviso { font-size: 0.8rem; color: var(--muted); }
</style>
