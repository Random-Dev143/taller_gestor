<template>
  <div class="card">
    <h2>Control de Calidad Final</h2>
    <div class="form-group">
      <label>Ingrese OT para finalizar:</label>
      <div style="display: flex; gap: 10px;">
        <input v-model="otFinalizar" placeholder="Ej: 9649" />
        <button class="btn btn-success" @click="finalizar">Finalizar OT</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useApi } from '../../composables/useApi'

const { fetchJSON } = useApi()
const otFinalizar = ref('')
const emit = defineEmits(['controlada'])

const finalizar = async () => {
  if (!confirm('¿Confirmar finalización y cierre de OT?')) return
  try {
    // Usamos el endpoint controlar que preparamos en routes/ordenes.js
    await fetchJSON(`/ordenes/${otFinalizar.value}/controlar`, {
      method: 'POST',
      body: JSON.stringify({ jefe_legajo: 'JEFE_SISTEMA' }) // Ajustar con legajo real
    })
    emit('controlada')
    otFinalizar.value = ''
  } catch (err) { alert('Error al finalizar') }
}
</script>