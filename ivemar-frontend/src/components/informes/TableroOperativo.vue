<template>
  <div class="im-group">
    <span class="im-eyebrow">Rendimiento Operativo (Mecánicos)</span>
    
    <div v-if="!tiempos || tiempos.length === 0" class="empty-state">
      No hay actividad de mecánicos en este período.
    </div>
    
    <div class="table-wrapper" v-else>
      <table>
        <thead>
          <tr>
            <th>Mecánico</th>
            <th>Asistencia</th>
            <th>Hs Productivas</th>
            <th>Hs Internas</th>
            <th>Ocio</th>
            <th>Días sin login</th>
            <th>Productividad</th>
            <th>Eficiencia (Cumplimiento)</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="m in tiempos" :key="m.legajo">
            <td><strong>{{ m.nombre }}</strong></td>
            <td>{{ m.dias_asistidos }} días</td>
            <td><span class="text-success">{{ m.hs_productivas }} hs</span></td>
            <td class="text-muted">{{ m.hs_internas }} hs</td>
            <td :class="{'text-danger': m.tiempo_muerto > 10}">
              <strong>{{ m.tiempo_muerto }} hs</strong>
            </td>
            <td>
              <button
                v-if="m.dias_ausentes_count > 0"
                class="btn btn-sm"
                :class="sinJustificar(m) > 0 ? 'btn-danger' : 'btn-secondary'"
                @click="verAusencias(m)"
              >
                {{ m.dias_ausentes_count }} día{{ m.dias_ausentes_count > 1 ? 's' : '' }}
                <template v-if="sinJustificar(m) > 0">({{ sinJustificar(m) }} sin justificar)</template>
              </button>
              <span v-else class="text-muted">-</span>
            </td>
            <td>
              <span :class="['badge', m.productividad_porcentaje >= 80 ? 'bg-success' : 'bg-warning']" title="(Hs Productivas + Hs Internas) / Hs Exigidas">
                {{ m.productividad_porcentaje }}%
              </span>
            </td>
            <td>
              <span :class="['badge', m.eficiencia_porcentaje >= 100 ? 'bg-success' : 'bg-danger']" title="Hs Estimadas / Hs Productivas">
                {{ m.eficiencia_porcentaje }}%
              </span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <p class="chart-hint im-mt">
      * <strong>Hs Internas:</strong> Tareas realizadas en OTs donde el cliente es "IVEMAR". Suman a la productividad pero no a la facturación.<br>
      * <strong>Ocio:</strong> Horas hábiles donde el mecánico estuvo presente pero no registró actividad en el panel.<br>
      * <strong>Días sin login:</strong> días hábiles del período sin ningún registro de actividad. Se pueden justificar (franco, permiso, vacaciones, etc.).
    </p>

    <ModalAusencias v-if="mecanicoModalLegajo" :mecanico="mecanicoModal" @close="mecanicoModalLegajo = null" @justificado="store.cargarInformes" />
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useInformesStore } from '../../stores/useInformesStore'
import ModalAusencias from '../jefe/ModalAusencias.vue'

const store = useInformesStore()
const tiempos = computed(() => store.operativo?.tiempos_mecanicos || [])

const mecanicoModalLegajo = ref(null)
const mecanicoModal = computed(() => tiempos.value.find(m => m.legajo === mecanicoModalLegajo.value) || null)

const sinJustificar = (m) => (m.dias_ausentes || []).filter(d => !d.motivo).length
const verAusencias = (m) => { mecanicoModalLegajo.value = m.legajo }
</script>

<style scoped>
.im-group { padding-top: 18px; border-top: 1px solid var(--border-soft); margin-top: 24px; }
.im-eyebrow { font-size: 0.75rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted); display: block; margin-bottom: 16px; }
.table-wrapper { overflow-x: auto; background: white; border: 1px solid var(--border-soft); border-radius: var(--radius); box-shadow: var(--shadow-sm); }
table { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
th, td { padding: 12px 15px; text-align: left; border-bottom: 1px solid var(--border-soft); }
th { background: #f8fafc; font-weight: 600; color: #1a2a3a; text-transform: uppercase; font-size: 0.8rem; }
.badge { padding: 4px 10px; border-radius: 12px; color: white; font-weight: bold; font-size: 0.85rem; }
.bg-success { background: #1d8a4f; }
.bg-warning { background: #b8860b; color: #fff; }
.bg-danger { background: #b22234; }
.text-success { color: #1d8a4f; font-weight: 600; }
.text-muted { color: #6c7a8a; }
.text-danger { color: #b22234; }
.im-mt { margin-top: 12px; }
.chart-hint { font-size: 0.8rem; color: var(--muted); line-height: 1.5; }
</style>