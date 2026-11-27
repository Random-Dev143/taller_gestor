<template>
  <div>
    <div class="segmented" role="tablist">
      <button v-for="t in pestanas" :key="t.id" role="tab" :aria-selected="tab === t.id" :class="{ 'is-active': tab === t.id }" @click="elegir(t.id)">{{ t.texto }}</button>
    </div>
    <InformesMensuales v-if="tab === 'mensual'" />
    <InformesCruzados v-else-if="tab === 'turnos'" />
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '../stores/useAuthStore'
import InformesMensuales from '../components/common/InformesMensuales.vue'
import InformesCruzados from '../components/informes/InformesCruzados.vue'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const permisos = computed(() => authStore.usuario?.permisos || [])

const pestanas = computed(() => [
  { id: 'mensual', texto: 'Resumen mensual' },
  ...(permisos.value.includes('informe_operativo') || permisos.value.includes('informe_financiero') ? [{ id: 'turnos', texto: 'Turnos y presupuestos' }] : [])
])
const tab = ref(pestanas.value.some(t => t.id === route.query.tab) ? route.query.tab : 'mensual')
// El pestaña elegida queda en la dirección, así se puede compartir o volver con "atrás".
const elegir = (id) => { tab.value = id; router.replace({ query: { ...route.query, tab: id } }) }
</script>
