<template>
  <div class="modal-overlay" @click.self="$emit('close')">
    <div class="modal-content">
      <button class="close-btn" @click="$emit('close')">&times;</button>
      <h2>Finalizar Tarea</h2>
      
      <form @submit.prevent="$emit('confirm', form)">
        <div class="form-group mb-15">
          <label>Causa del desperfecto *</label>
          <textarea v-model="form.causa" rows="3" class="form-control" required placeholder="Describa el origen del problema..."></textarea>
        </div>
        <div class="form-group mb-15">
          <label>Reparación realizada *</label>
          <textarea v-model="form.reparacion" rows="3" class="form-control" required placeholder="Describa el trabajo ejecutado..."></textarea>
        </div>
        <button type="submit" class="btn btn-success w-100 mt-10">Guardar y Finalizar</button>
      </form>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
const emit = defineEmits(['close', 'confirm'])
const form = ref({ causa: '', reparacion: '' })
</script>
<style scoped> .mb-15 { margin-bottom: 15px; } </style>