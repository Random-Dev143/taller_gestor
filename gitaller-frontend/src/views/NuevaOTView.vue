<template>
  <NuevaOT @ot-creada="alCrear" />
</template>

<script setup>
import { useRouter } from 'vue-router'
import NuevaOT from '../components/asesor/NuevaOT.vue'

const router = useRouter()
// Al crear la OT se vuelve a la lista de órdenes en taller.
const alCrear = () => router.push({ path: '/ordenes' })
</script>
