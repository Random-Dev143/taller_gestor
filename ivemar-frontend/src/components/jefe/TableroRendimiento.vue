<template>
  <div class="card">
    <div class="header-row">
      <h2>Rendimiento y Productividad del Taller</h2>
    </div>

    <div class="dashboard-controls">
      <div class="date-group">
        <label>Desde:</label>
        <input type="date" v-model="store.desde" class="form-control date-input" />
      </div>
      <div class="date-group">
        <label>Hasta:</label>
        <input type="date" v-model="store.hasta" class="form-control date-input" />
      </div>
      <button class="btn btn-primary" @click="store.cargarInformes" :disabled="store.loading">
        {{ store.loading ? 'Calculando...' : 'Generar Reporte' }}
      </button>
    </div>

    <div v-if="store.loading" class="loading-state"><div class="spinner"></div>Procesando tiempos...</div>
    <p v-else-if="!store.operativo" class="empty-state">Seleccione el rango de fechas y presione "Generar Reporte" para ver el panel.</p>

    <div v-else>
      <TableroOperativo />
    </div>
  </div>
</template>

<script setup>
import { onMounted } from 'vue'
import { useInformesStore } from '../../stores/useInformesStore'
import TableroOperativo from '../informes/TableroOperativo.vue'

const store = useInformesStore()

onMounted(() => {
  if (!store.operativo) store.cargarInformes()
})
</script>

<style scoped>
.header-row { display: flex; align-items: center; flex-wrap: wrap; gap: 15px; margin-bottom: 15px; }
.header-row h2 { margin: 0; margin-right: auto; }

.dashboard-controls { display: flex; flex-wrap: wrap; gap: 15px; align-items: end; background: #f8fafc; padding: 15px; border-radius: var(--radius); border: 1px solid var(--border-soft); margin-bottom: 20px; }
.date-group { display: flex; flex-direction: column; gap: 4px; }
.date-group label { font-size: 0.75rem; font-weight: 600; text-transform: uppercase; color: var(--muted); }
.date-input { width: auto; }
</style>