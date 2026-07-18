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
                <button v-if="tarea.estado !== 'En Curso'" v-can="'tarea_operar'" @click="toggleTareaInterna(tarea)" class="btn btn-outline btn-sm w-100">▶ Iniciar Rutina</button>
                <button v-else v-can="'tarea_operar'" @click="toggleTareaInterna(tarea)" class="btn btn-warning btn-sm w-100">⏸ Detener / Pausar</button>
              </div>
            </div>
          </div>
        </div>

        <!-- SECCIÓN OTs DE CLIENTES -->
        <div v-if="tareasCliente.length > 0">
          <h3 style="color: var(--primary-dark); border-bottom: 1px solid var(--border-soft); padding-bottom: 8px;">Órdenes de Trabajo</h3>
          <div class="grid-tareas">
            
            <!-- TARJETA MADRE POR OT -->
            <div v-for="orden in ordenesAgrupadas" :key="orden.ot" class="card-tarea" style="grid-column: 1 / -1; padding: 20px;">
              
              <!-- Cabecera de la OT agrupada -->
              <div class="tarea-header" style="border-bottom: 2px solid #eef3f9; padding-bottom: 15px; margin-bottom: 15px;">
                <h3 style="font-size: 1.3rem;">OT {{ orden.ot }}</h3>
                <div style="text-align: right;">
                    <span class="patente-badge" style="background: #111; color: white; padding: 4px 10px; border-radius: 6px; font-family: monospace; font-size: 1.1rem;">{{ orden.patente }}</span>
                    <div class="tarea-vehiculo mt-10" style="font-weight: 600;">{{ orden.unidad }}</div>
                    <div class="tarea-cliente">{{ orden.cliente }}</div>
                </div>
              </div>
              
              <!-- Lista de subtareas internas -->
              <div v-for="tarea in orden.tareas" :key="tarea.id" style="padding: 15px; border: 1px solid #d0d7e2; border-radius: 8px; margin-bottom: 10px; background: #fafcfe;">
                <div style="display:flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                    <p class="tarea-desc" style="margin:0; font-size: 1rem;"><strong>Tarea:</strong> {{ tarea.descripcion }}</p>
                    <span :class="['badge-sm', estadoClass(tarea.estado)]" style="font-size: 0.85rem;">{{ tarea.estado }}</span>
                </div>
                <p class="tarea-horas" style="margin: 0 0 15px;">Estimado: {{ tarea.tiempo_estimado }} hs</p>

                <!-- Botones de acción originales -->
                <div class="acciones-tarea">
                  <button v-if="['Asignada', 'Pendiente'].includes(tarea.estado)" v-can="'tarea_operar'" @click="cambiarEstado(tarea, 'En Curso')" class="btn btn-primary btn-sm">▶ Iniciar</button>
                  <button v-if="tarea.estado === 'Pausada'" v-can="'tarea_operar'" @click="cambiarEstado(tarea, 'En Curso')" class="btn btn-primary btn-sm">▶ Reanudar</button>
                  
                  <button v-if="tarea.estado === 'En Curso'" v-can="'tarea_operar'" @click="abrirPausa(tarea)" class="btn btn-warning btn-sm">⏸ Pausar</button>
                  <button v-if="tarea.estado === 'En Curso'" v-can="'tarea_operar'" @click="abrirFinalizar(tarea)" class="btn btn-success btn-sm">✔ Finalizar</button>

                  <!-- NUEVO BOTÓN INFORMAR -->
                  <button v-if="tarea.estado === 'Cerrada por Jefe'" v-can="'tarea_operar'" @click="abrirInformar(tarea)" class="btn btn-primary btn-sm">📝 Informar</button>
                </div>
              </div>

            </div>
          </div>
        </div>
      </div>

    <ModalPausarTarea v-if="showModalPausa" @close="showModalPausa = false" @confirm="ejecutarPausa" />
    <ModalFinalizarTarea v-if="showModalFinalizar" :otId="tareaActiva.ot" :modoInformar="esModoInformar" @close="showModalFinalizar = false" @confirm="ejecutarFinalizacion" />
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
  // Optimista: el backend ya pausa automáticamente cualquier otra tarea
  // "En Curso" de este mecánico al iniciar una nueva (ver actividades.js).
  // Reflejamos ese efecto en la lista local al toque, sin esperar la
  // respuesta ni el refetch, para que la UI no se sienta atrasada.
  let pausadaAuto = null
  if (estado === 'En Curso') {
    for (const t of tareas.value) {
      if (t.id !== tarea.id && t.estado === 'En Curso') {
        t.estado = 'Pausada'
        pausadaAuto = t
      }
    }
  }
  tarea.estado = estado

  try {
    await fetchJSON(`/actividades/${tarea.id}/estado`, {
      method: 'POST',
      body: JSON.stringify({ nuevo_estado: estado })
    })
    toast.success(`Tarea de OT ${tarea.ot} actualizada a "${estado}"`)
    if (pausadaAuto) toast.info(`Se pausó automáticamente la tarea de OT ${pausadaAuto.ot}`)
    cargarTareas()
  } catch (err) {
    toast.error('Error al actualizar la tarea: ' + errMsg(err))
    cargarTareas() // revertimos el optimismo trayendo el estado real
  }
}

const abrirPausa = (tarea) => { tareaActiva.value = tarea; showModalPausa.value = true; }
const esModoInformar = ref(false)

const abrirFinalizar = (tarea) => { tareaActiva.value = tarea; esModoInformar.value = false; showModalFinalizar.value = true; }
const abrirInformar = (tarea) => { tareaActiva.value = tarea; esModoInformar.value = true; showModalFinalizar.value = true; }

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
  try {
    // 1. Guardar/Actualizar la causa colaborativa de la OT (Método PUT)
    await fetchJSON(`/ordenes/${tareaActiva.value.ot}/explicacion`, {
      method: 'PUT',
      body: JSON.stringify({ causa: datos.causa })
    })

    // 2. Guardar el aporte de reparación individual (Método POST)
    await fetchJSON(`/ordenes/${tareaActiva.value.ot}/aportes`, {
      method: 'POST',
      body: JSON.stringify({ legajo: legajo.value, actividades: datos.reparacion, horas: 0 })
    })

    // 3. Cambiar el estado de la tarea a Finalizada (tanto si era propia
    // como si estaba cerrada por el jefe, para limpiarla de la lista)
    await fetchJSON(`/actividades/${tareaActiva.value.id}/estado`, {
      method: 'POST',
      body: JSON.stringify({ nuevo_estado: 'Finalizada' })
    })

    toast.success(esModoInformar.value ? 'Informe registrado correctamente' : 'Tarea finalizada y registrada correctamente')
    showModalFinalizar.value = false
    cargarTareas()
  } catch (err) { toast.error(errMsg(err)) }
}

const cambiarLegajo = () => {
  localStorage.removeItem('legajoMecanico')
  router.push({ name: 'mecanico-login' }) 
}
const tareasCliente = computed(() => tareas.value.filter(t => t.ot !== '0000'))

const ordenesAgrupadas = computed(() => {
  const mapa = new Map()
  tareasCliente.value.forEach(tarea => {
    if (!mapa.has(tarea.ot)) {
      mapa.set(tarea.ot, {
        ot: tarea.ot,
        patente: tarea.patente,
        unidad: tarea.unidad,
        cliente: tarea.cliente,
        tareas: []
      })
    }
    mapa.get(tarea.ot).tareas.push(tarea)
  })
  return Array.from(mapa.values())
})

const tareasInternas = computed(() => tareas.value.filter(t => t.ot === '0000'))

const toggleTareaInterna = async (tarea) => {
  const nuevo_estado = tarea.estado === 'En Curso' ? 'Pausada' : 'En Curso';

  let pausadaAuto = null
  if (nuevo_estado === 'En Curso') {
    for (const t of tareas.value) {
      if (t.id !== tarea.id && t.estado === 'En Curso') {
        t.estado = 'Pausada'
        pausadaAuto = t
      }
    }
  }
  tarea.estado = nuevo_estado

  try {
    await fetchJSON(`/actividades/${tarea.id}/estado`, {
      method: 'POST',
      body: JSON.stringify({ nuevo_estado, motivo: 'En Espera' })
    })
    toast.success(`Tarea interna ${nuevo_estado}`);
    if (pausadaAuto) toast.info(`Se pausó automáticamente la tarea de OT ${pausadaAuto.ot}`)
    cargarTareas();
  } catch (err) {
    toast.error(errMsg(err));
    cargarTareas()
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