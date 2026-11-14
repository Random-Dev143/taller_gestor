<template>
  <div class="modal-overlay" @click.self="$emit('close')" @keydown.esc="$emit('close')">
    <div class="modal-content detalle" role="dialog" aria-modal="true" aria-labelledby="detalle-titulo">
      <button class="close-btn" aria-label="Cerrar" @click="$emit('close')">&times;</button>

      <p class="detalle__ot">
        <strong>#{{ tarea.ot }}</strong>
        <span class="patente-badge">{{ tarea.patente }}</span>
      </p>
      <p class="detalle__unidad">{{ tarea.unidad }}<span v-if="tarea.cliente"> · {{ tarea.cliente }}</span></p>

      <h2 id="detalle-titulo" class="detalle__titulo">{{ tarea.descripcion }}</h2>

      <dl class="detalle__datos">
        <div>
          <dt>Mi estado</dt>
          <dd><span class="dot" :class="`dot--${claseEstado}`"></span>{{ tarea.mi_estado }}</dd>
        </div>
        <div>
          <dt>Estado general</dt>
          <dd>{{ tarea.estado }}</dd>
        </div>
        <div>
          <dt>Tiempo estimado</dt>
          <dd>{{ redondear1(tarea.tiempo_estimado) }} h</dd>
        </div>
        <div>
          <dt>Mis horas</dt>
          <dd class="num" :class="{ 'num--vivo': tarea.mi_estado === 'En Curso' }">{{ formatoHoras(horasVivas(tarea, ahora)) }}</dd>
        </div>
      </dl>

      <div v-if="tarea.equipo" class="detalle__equipo">
        <span class="detalle__etiqueta">Equipo</span>
        <p>{{ tarea.equipo }}</p>
      </div>

      <p v-if="tarea.estado === 'Finalizada' && tarea.mi_estado !== 'Finalizada'" class="detalle__aviso">
        <strong>Un compañero ya cerró esta tarea.</strong> Podés reanudar si falta algo, o solo completar tu informe.
      </p>
      <p v-else-if="tarea.estado === 'Cerrada por Jefe' && tarea.mi_estado !== 'Finalizada'" class="detalle__aviso">
        <strong>El Jefe cerró esta tarea.</strong> Solo falta que completes tu informe.
      </p>

      <button class="btn btn-outline w-100 mt-15" @click="$emit('close')">Cerrar</button>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { formatoHoras, horasVivas, redondear1 } from '../../utils/horas'

const props = defineProps({
  tarea: { type: Object, required: true },
  ahora: { type: Number, default: () => Date.now() }
})
defineEmits(['close'])

const claseEstado = computed(() => ({
  'En Curso': 'activa',
  'Pausada': 'pausada',
  'Finalizada': 'hecha'
}[props.tarea.mi_estado] || 'pendiente'))
</script>

<style scoped>
.detalle { max-width: 460px; }
.detalle__ot { display: flex; align-items: center; gap: 10px; margin: 0 28px 4px 0; font-size: 1.1rem; color: var(--muted); }
.detalle__unidad { margin: 0 0 14px; font-size: 0.9rem; color: var(--muted); }
.detalle__titulo { margin: 0 0 16px; font-size: 1.15rem; line-height: 1.35; overflow-wrap: anywhere; }

.detalle__datos { display: grid; grid-template-columns: 1fr 1fr; gap: 1px; margin: 0; border: 1px solid var(--border-soft); border-radius: 10px; overflow: hidden; background: var(--border-soft); }
.detalle__datos > div { background: var(--surface); padding: 10px 12px; }
.detalle__datos dt { font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.5px; color: var(--muted); margin-bottom: 2px; }
.detalle__datos dd { margin: 0; font-weight: 600; display: flex; align-items: center; gap: 6px; }
.num { font-variant-numeric: tabular-nums; }
.num--vivo { color: var(--success); }

.dot { width: 8px; height: 8px; border-radius: 50%; background: var(--muted); flex-shrink: 0; }
.dot--activa { background: var(--success); }
.dot--pausada { background: var(--warning); }
.dot--pendiente { background: var(--primary); }

.detalle__etiqueta { display: block; margin-top: 16px; font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.5px; color: var(--muted); }
.detalle__equipo p { margin: 4px 0 0; }

.detalle__aviso { margin: 16px 0 0; padding: 10px 12px; border-left: 3px solid var(--warning); background: var(--hover-row); border-radius: 0 8px 8px 0; font-size: 0.85rem; }
</style>
