<template>
  <div class="modal-overlay" @click.self="$emit('close')">
    <div class="modal-content" style="max-width: 400px;">
      <button class="close-btn" @click="$emit('close')">&times;</button>
      <h2>Pausar Tarea</h2>
      <div class="form-group">
        <label>Motivo de la pausa</label>
        <select v-model="motivo" required class="form-control">
          <option value="En Espera">Pausa normal (Almuerzo / Fin de turno)</option>
          <option value="Espera de Repuestos">Espera de Repuestos</option>
          <option value="Trabajos de Terceros">Trabajos de Terceros</option>
        </select>
      </div>
      <button class="btn btn-warning w-100 mt-15" @click="$emit('confirm', motivo)">Confirmar Pausa</button>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
const emit = defineEmits(['close', 'confirm'])
const motivo = ref('En Espera')
</script>