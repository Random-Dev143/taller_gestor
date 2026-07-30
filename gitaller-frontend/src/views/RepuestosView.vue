<template>
  <div class="view-repuestos">
    <NavBar brand="📦 Pañol e Inventario" :tabs="tabs" v-model:activeTab="activeTab" />

    <div v-if="activeTab === 'panol-catalogo'" class="tab-content">
      <CatalogoRepuestos />
    </div>
    <div v-else-if="activeTab === 'panol-ingresos'" class="tab-content">
      <IngresosRepuestos />
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import NavBar from '../components/common/NavBar.vue'
import CatalogoRepuestos from '../components/repuestos/CatalogoRepuestos.vue'
import IngresosRepuestos from '../components/repuestos/IngresosRepuestos.vue'

const activeTab = ref('panol-catalogo')

const tabs = [
  { id: 'panol-catalogo', label: 'Catálogo Maestro' },
  { id: 'panol-ingresos', label: 'Ingresos y Compras' }
]
</script>