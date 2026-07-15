<template>
  <div class="view-mecanico">
    <NavBar brand="🛠️ Mi Panel - Taller" :tabs="[]" logoutText="Cambiar legajo" customLogout @logout="cambiarLegajo" />

    <div class="card">
      <div class="header-row">
        <h2>Tareas Asignadas</h2>
        <span class="legajo-pill">Legajo: <strong>{{ legajo }}</strong></span>
      </div>

      <div v-if="loading" class="loading-state">
        <div class="spinner"></div>
        Cargando tareas...
      </div>

      <div v-else-if="tareas.length === 0" class="empty-state">
        No tiene tareas asignadas por el momento.
      </div>

     <div v-else>
        <!-- SECCIÓN TAREAS INTERNAS -->
        <div v-if="tareasInternas.length > 0" style="margin-bottom: 30px;">
          <h3 style="color: var(--muted); border-bottom: 1px solid var(--border-soft); padding-bottom: 8px;">Rutinas y Tareas Internas</h3>
          <div class="grid-tareas">
            <div v-for="tarea in tareasInternas" :key="tarea.id" class="card-tarea" style="background-color: #f8fafc; border-left: 4px solid #b8860b;">
              <div class="tarea-header">
                <h3>{{ tarea.descripcion }}</h3>
                <span :class="['badge-sm', estadoClass(tarea.estado)]">{{ tarea.estado }}</span>
              </div>
              <p class="tarea-horas">Asignado por Jefe de Taller</p>
              <div class="acciones-tarea mt-10">
                <button v-if="tarea.estado !== 'En Curso'" @click="toggleTareaInterna(tarea)" class="btn btn-outline btn-sm w-100">▶ Iniciar Rutina</button>
                <button v-else @click="toggleTareaInterna(tarea)" class="btn btn-warning btn-sm w-100">⏸ Detener / Pausar</button>
              </div>
            </div>
          </div>
        </div>

        <!-- SECCIÓN OTs DE CLIENTES -->
        <div v-if="tareasCliente.length > 0">
          <h3 style="color: var(--primary-dark); border-bottom: 1px solid var(--border-soft); padding-bottom: 8px;">Órdenes de Trabajo</h3>
          <div class="grid-tareas">
            <div v-for="tarea in tareasCliente" :key="tarea.id" class="card-tarea">
              <div class="tarea-header">
                <h3>OT {{ tarea.ot }}</h3>
                <span :class="['badge-sm', estadoClass(tarea.estado)]">{{ tarea.estado }}</span>
              </div>
              <p class="tarea-vehiculo">{{ tarea.unidad }} · <strong>{{ tarea.patente }}</strong></p>
              <p class="tarea-cliente">{{ tarea.cliente }}</p>
              <p class="tarea-desc"><strong>Tarea:</strong> {{ tarea.descripcion }}</p>
              <p class="tarea-horas">Estimado: {{ tarea.tiempo_estimado }} hs</p>

              <div class="acciones-tarea mt-10">
                <button v-if="['Asignada', 'Pendiente'].includes(tarea.estado)" @click="cambiarEstado(tarea, 'En Curso')" class="btn btn-primary btn-sm">▶ Iniciar</button>
                <button v-if="tarea.estado === 'Pausada'" @click="cambiarEstado(tarea, 'En Curso')" class="btn btn-primary btn-sm">▶ Reanudar</button>
                
                <button v-if="tarea.estado === 'En Curso'" @click="abrirPausa(tarea)" class="btn btn-warning btn-sm">⏸ Pausar</button>
                <button v-if="tarea.estado === 'En Curso'" @click="abrirFinalizar(tarea)" class="btn btn-success btn-sm">✔ Finalizar</button>
              </div>
            </div>
          </div>
        </div>
      </div>

    <ModalPausarTarea v-if="showModalPausa" @close="showModalPausa = false" @confirm="ejecutarPausa" />
    <ModalFinalizarTarea v-if="showModalFinalizar" @close="showModalFinalizar = false" @confirm="ejecutarFinalizacion" />
  </div>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useApi } from '../composables/useApi'
import { useToast, errMsg } from '../composables/useToast'
import NavBar from '../components/common/NavBar.vue'
import ModalPausarTarea from '../components/mecanico/ModalPausarTarea.vue'
import ModalFinalizarTarea from '../components/mecanico/ModalFinalizarTarea.vue'


const { fetchJSON } = useApi()
const toast = useToast()
const router = useRouter()

const tareas = ref([])
const loading = ref(true)
const legajo = ref(localStorage.getItem('legajoMecanico') || '')

const showModalPausa = ref(false)
const showModalFinalizar = ref(false)
const tareaActiva = ref(null)

const estadoClass = (estado) => ({
  'Pendiente': 'badge-info',
  'Asignada': 'badge-info',
  'En Curso': 'badge-progress',
  'Pausada': 'badge-warn'
}[estado] || '')

const cargarTareas = async () => {
  loading.value = true
  try {
    tareas.value = await fetchJSON(`/actividades/mecanico/${encodeURIComponent(legajo.value)}`)
  } catch (err) {
    toast.error('Error cargando tareas: ' + errMsg(err))
  } finally {
    loading.value = false
  }
}

const cambiarEstado = async (tarea, estado) => {
  try {
    await fetchJSON(`/actividades/${tarea.id}/estado`, {
      method: 'POST',
      body: JSON.stringify({ nuevo_estado: estado })
    })
    toast.success(`Tarea de OT ${tarea.ot} actualizada a "${estado}"`)
    cargarTareas()
  } catch (err) {
    toast.error('Error al actualizar la tarea: ' + errMsg(err))
  }
}

const abrirPausa = (tarea) => { tareaActiva.value = tarea; showModalPausa.value = true; }
const abrirFinalizar = (tarea) => { tareaActiva.value = tarea; showModalFinalizar.value = true; }

const ejecutarPausa = async (motivo) => {
  try {
    await fetchJSON(`/actividades/${tareaActiva.value.id}/estado`, {
      method: 'POST',
      body: JSON.stringify({ nuevo_estado: 'Pausada', motivo })
    })
    toast.info(`Tarea pausada: ${motivo}`)
    showModalPausa.value = false
    cargarTareas()
  } catch (err) { toast.error(errMsg(err)) }
}

const ejecutarFinalizacion = async (datos) => {
  const textoEstructurado = `CAUSA DEL DESPERFECTO:\n${datos.causa}\n\nREPARACIÓN REALIZADA:\n${datos.reparacion}`
  try {
    await fetchJSON(`/actividades/${tareaActiva.value.id}/estado`, {
      method: 'POST',
      body: JSON.stringify({ nuevo_estado: 'Finalizada' })
    })
    await fetchJSON(`/ordenes/${tareaActiva.value.ot}/aportes`, {
      method: 'POST',
      body: JSON.stringify({ legajo: legajo.value, actividades: textoEstructurado, horas: 0 })
    })
    toast.success('Tarea finalizada y registrada correctamente')
    showModalFinalizar.value = false
    cargarTareas()
  } catch (err) { toast.error(errMsg(err)) }
}

const cambiarLegajo = () => {
  localStorage.removeItem('legajoMecanico')
  router.push({ name: 'mecanico-login' }) 
}
const tareasCliente = computed(() => tareas.value.filter(t => t.ot !== '0000'))
const tareasInternas = computed(() => tareas.value.filter(t => t.ot === '0000'))

const toggleTareaInterna = async (tarea) => {
  const nuevo_estado = tarea.estado === 'En Curso' ? 'Pausada' : 'En Curso';
  try {
    await fetchJSON(`/actividades/${tarea.id}/estado`, {
      method: 'POST',
      body: JSON.stringify({ nuevo_estado, motivo: 'En Espera' })
    })
    toast.success(`Tarea interna ${nuevo_estado}`);
    cargarTareas();
  } catch (err) {
    toast.error(errMsg(err));
  }
}



onMounted(() => {
  if (!legajo.value) {
    router.push({ name: 'mecanico-login' })
    return
  }
  cargarTareas()
})
</script>

<style scoped>
.header-row { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; margin-bottom: 10px; }
.header-row h2 { margin: 0; }
.legajo-pill { background: var(--primary-light); color: var(--primary); padding: 4px 12px; border-radius: 20px; font-size: 0.85rem; }

.grid-tareas { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 15px; margin-top: 10px; }
.card-tarea { border: 1px solid var(--border-soft); padding: 16px; border-radius: var(--radius); background: #fff; box-shadow: var(--shadow-sm); }
.tarea-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
.tarea-header h3 { margin: 0; font-size: 1.05rem; color: var(--primary); }
.tarea-vehiculo { margin: 2px 0; font-size: 0.9rem; }
.tarea-cliente { margin: 0 0 8px; color: var(--muted); font-size: 0.85rem; }
.tarea-desc { font-size: 0.9rem; margin-bottom: 4px; }
.tarea-horas { font-size: 0.8rem; color: var(--muted); margin-bottom: 12px; }
.acciones-tarea { display: flex; gap: 8px; flex-wrap: wrap; }

.badge-info { background: #0056a7; color: white; }
.badge-progress { background: #1d8a4f; color: white; }
.badge-warn { background: #b8860b; color: white; }
</style>