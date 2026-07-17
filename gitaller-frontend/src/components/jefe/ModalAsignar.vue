<template>
  <div class="modal-overlay" @click.self="$emit('close')">
    <div class="modal-content" style="max-width: 420px;">
      <button class="close-btn" @click="$emit('close')">&times;</button>
      <h2>{{ isEdit ? 'Editar Asignación' : 'Asignar Tarea' }} - OT {{ ot }}</h2>

      <form @submit.prevent="submitAsignacion">
        <div class="form-group">
          <label>Mecánico</label>
          <select v-model="form.legajo" required>
            <option value="" disabled>Seleccione un mecánico</option>
            <option v-for="m in mecanicos" :key="m.legajo" :value="m.legajo">{{ m.nombre }}</option>
          </select>
        </div>
        <div class="form-group">
          <label>Descripción de la tarea</label>
          <textarea v-model="form.descripcion" required rows="3"></textarea>
        </div>
        <div class="form-group">
          <label>Tiempo estimado (horas)</label>
          <input type="number" v-model="form.tiempo_estimado" step="0.5" min="0.5" required />
        </div>
        <div class="form-group" v-if="isEdit">
          <label>Corrección: Tiempo Real Invertido</label>
          <input type="number" v-model="form.tiempo_real" step="0.1" min="0" />
        </div>
        <div class="form-group" v-if="isEdit">
          <label>Forzar Inicio (Opcional)</label>
          <input type="datetime-local" v-model="form.fecha_inicio" />
        </div>
        <div class="form-group" v-if="isEdit">
          <label>Forzar Fin (Opcional)</label>
          <input type="datetime-local" v-model="form.fecha_fin" />
        </div>
        <button type="submit" class="btn btn-success w-100" :disabled="mecanicos.length === 0">
          {{ mecanicos.length === 0 ? 'No hay mecánicos' : (isEdit ? 'Guardar Cambios' : 'Confirmar Asignación') }}
        </button>
      </form>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue'

const props = defineProps({ 
  ot: { type: String, required: true }, 
  mecanicos: { type: Array, default: () => [] },
  actividadEdit: { type: Object, default: null } // Nueva prop para recibir los datos a editar
})
const emit = defineEmits(['close', 'confirm'])

const isEdit = computed(() => !!props.actividadEdit)
const form = ref({ id: null, legajo: '', descripcion: '', tiempo_estimado: 1, tiempo_real: 0, fecha_inicio: '', fecha_fin: '' })

onMounted(() => {
  if (props.actividadEdit) {
    const formatForInput = (d) => d ? new Date(d).toISOString().slice(0, 16) : ''
    
    form.value = {
      id: props.actividadEdit.id,
      legajo: props.actividadEdit.legajo_mecanico,
      descripcion: props.actividadEdit.descripcion,
      tiempo_estimado: props.actividadEdit.tiempo_estimado,
      tiempo_real: props.actividadEdit.tiempo_real,
      fecha_inicio: formatForInput(props.actividadEdit.fecha_inicio),
      fecha_fin: formatForInput(props.actividadEdit.fecha_fin)
    }
  }
})

// Agrega esta función arriba de submitAsignacion
const parseNum = (val) => {
  if (val === undefined || val === null || val === '') return 0;
  const num = Number(String(val).replace(',', '.')); // Transforma la coma argentina en punto de PC
  return isNaN(num) ? 0 : num;
}

const submitAsignacion = () => {
  emit('confirm', { 
    ...form.value, 
    tiempo_estimado: parseNum(form.value.tiempo_estimado),
    tiempo_real: isEdit.value ? parseNum(form.value.tiempo_real) : undefined,
    
    // Si estamos editando y el campo NO está vacío, enviamos el texto formateado. 
    // Si está vacío, enviamos undefined para que la base de datos no lo sobrescriba.
    fecha_inicio: (isEdit.value && form.value.fecha_inicio) 
                    ? form.value.fecha_inicio.replace('T', ' ') 
                    : undefined,
                    
    fecha_fin: (isEdit.value && form.value.fecha_fin) 
                    ? form.value.fecha_fin.replace('T', ' ') 
                    : undefined
  })
}

</script>

<style scoped>
.form-group { margin-bottom: 15px; }
.form-group label { display: block; margin-bottom: 5px; font-weight: 600; font-size: 0.9rem; color: var(--text-soft); }
</style>