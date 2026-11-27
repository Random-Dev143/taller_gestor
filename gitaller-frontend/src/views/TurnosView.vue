<template>
  <div>
    <PanelTurnos ref="panelRef" :turno-inicial="turnoInicial" @resumen-cambio="refrescarResumen" @ver-legajo="abrirLegajo" />
    <ModalLegajoOT v-if="legajoOt" :ot="legajoOt" @close="legajoOt = null" />
  </div>
</template>

<script setup>
import { ref, onMounted, nextTick } from 'vue'
import { useRoute } from 'vue-router'
import PanelTurnos from '../components/asesor/PanelTurnos.vue'
import ModalLegajoOT from '../components/asesor/ModalLegajoOT.vue'
import { useResumen } from '../composables/useResumen'

const route = useRoute()
const { refrescarResumen } = useResumen()
const panelRef = ref(null)
const legajoOt = ref(null)
const abrirLegajo = (ot) => { legajoOt.value = String(ot) }
// Desde el inicio se llega con ?turno=ID (abre ese turno) o ?nuevo=1 (abre el formulario).
const turnoInicial = Number(route.query.turno) || null

onMounted(async () => {
  if (route.query.nuevo) { await nextTick(); panelRef.value?.abrirNuevo() }
})
</script>
