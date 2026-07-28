<template>
  <div class="roles-container">
    
    <!-- COLUMNA IZQUIERDA: Listado de Roles -->
    <div class="card roles-list">
      <div class="header-row mb-15">
        <h3 style="margin: 0;">Roles del Sistema</h3>
        <button class="btn btn-primary btn-sm" @click="limpiarFormulario">➕ Nuevo Rol</button>
      </div>

      <div v-if="loading" class="loading-state">Cargando...</div>
      
      <div v-else class="list-group">
        <div 
          v-for="rol in roles" 
          :key="rol.id"
          class="list-item"
          :class="{ 'active': form.id === rol.id }"
          @click="seleccionarRol(rol)"
        >
          <div class="rol-info">
            <strong>{{ rol.nombre }}</strong>
            <span v-if="rol.es_sistema" class="badge badge-warn ms-2" title="Rol nativo inborrable">🔒 Sistema</span>
          </div>
          <div class="rol-actions" v-if="!rol.es_sistema">
            <button class="btn-icon text-danger" @click.stop="eliminarRol(rol.id)" title="Eliminar Rol">🗑️</button>
          </div>
        </div>
      </div>
    </div>

    <!-- COLUMNA DERECHA: Editor de Permisos -->
    <div class="card roles-editor">
      <h3 class="mb-15">{{ form.id ? 'Editar Rol' : 'Crear Nuevo Rol' }}</h3>
      
      <form @submit.prevent="guardarRol">
        <div class="form-group mb-15">
          <label>Nombre del Rol</label>
          <input 
            type="text" 
            v-model="form.nombre" 
            class="form-control" 
            required 
            :disabled="esRolSistemaActual"
            placeholder="Ej: Cajero, Auditor..."
          />
          <small v-if="esRolSistemaActual" class="text-muted mt-5 block">
            El nombre de este rol nativo no puede ser modificado, pero sus permisos sí.
          </small>
        </div>

        <h4 class="mb-10">Asignación de Permisos</h4>
        <div class="permisos-grid">
          
          <!-- Iteramos sobre los permisos agrupados por módulo -->
          <div v-for="(listaPermisos, modulo) in permisosAgrupados" :key="modulo" class="permiso-modulo">
            <h5 class="modulo-title">{{ modulo }}</h5>
            
            <label v-for="p in listaPermisos" :key="p.clave" class="checkbox-label">
              <input 
                type="checkbox" 
                :value="p.clave" 
                v-model="form.permisos"
              />
              <div class="checkbox-text">
                <span class="clave">{{ p.clave }}</span>
                <span class="desc">{{ p.descripcion }}</span>
              </div>
            </label>
          </div>

        </div>

        <div class="form-actions mt-20 text-right">
          <button type="button" class="btn btn-secondary me-2" v-if="form.id" @click="limpiarFormulario">Cancelar Edición</button>
          <button type="submit" class="btn btn-success" :disabled="procesando">
            {{ procesando ? 'Guardando...' : 'Guardar Cambios' }}
          </button>
        </div>
      </form>
    </div>

  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useApi } from '../../composables/useApi'
import { useToast, errMsg } from '../../composables/useToast'

const { fetchJSON } = useApi()
const toast = useToast()

const roles = ref([])
const permisosList = ref([])
const loading = ref(true)
const procesando = ref(false)

const form = ref({ id: null, nombre: '', permisos: [] })

// Determina si el rol que se está editando actualmente es un rol protegido del sistema
const esRolSistemaActual = computed(() => {
  if (!form.value.id) return false
  const rol = roles.value.find(r => r.id === form.value.id)
  return rol ? rol.es_sistema === 1 : false
})

// Agrupa la lista plana de permisos por su propiedad "modulo"
const permisosAgrupados = computed(() => {
  const grupos = {}
  permisosList.value.forEach(p => {
    if (!grupos[p.modulo]) grupos[p.modulo] = []
    grupos[p.modulo].push(p)
  })
  return grupos
})

const cargarDatos = async () => {
  loading.value = true
  try {
    const [resRoles, resPermisos] = await Promise.all([
      fetchJSON('/roles'),
      fetchJSON('/roles/permisos')
    ])
    roles.value = resRoles
    permisosList.value = resPermisos
  } catch (err) {
    toast.error('Error cargando la configuración: ' + errMsg(err))
  } finally {
    loading.value = false
  }
}

const seleccionarRol = (rol) => {
  form.value = {
    id: rol.id,
    nombre: rol.nombre,
    permisos: [...(rol.permisos || [])] // Clonamos el array para no mutar directamente
  }
}

const limpiarFormulario = () => {
  form.value = { id: null, nombre: '', permisos: [] }
}

const guardarRol = async () => {
  procesando.value = true
  try {
    if (form.value.id) {
      // Editar
      await fetchJSON(`/roles/${form.value.id}`, {
        method: 'PUT',
        body: JSON.stringify({ nombre: form.value.nombre, permisos: form.value.permisos })
      })
      toast.success('Rol actualizado correctamente')
    } else {
      // Crear
      await fetchJSON('/roles', {
        method: 'POST',
        body: JSON.stringify({ nombre: form.value.nombre, permisos: form.value.permisos })
      })
      toast.success('Rol creado correctamente')
    }
    await cargarDatos()
    if (!form.value.id) limpiarFormulario() // Solo limpiamos si era uno nuevo
  } catch (err) {
    toast.error(errMsg(err))
  } finally {
    procesando.value = false
  }
}

const eliminarRol = async (id) => {
  if (!confirm('¿Está seguro de eliminar este rol? Esta acción no se puede deshacer.')) return
  try {
    await fetchJSON(`/roles/${id}`, { method: 'DELETE' })
    toast.success('Rol eliminado')
    if (form.value.id === id) limpiarFormulario()
    await cargarDatos()
  } catch (err) {
    toast.error(errMsg(err))
  }
}

onMounted(cargarDatos)
</script>

<style scoped>
.roles-container {
  display: grid;
  grid-template-columns: 300px 1fr;
  gap: 20px;
  align-items: start;
}

/* Columna Izquierda */
.list-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.list-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 15px;
  background: var(--border-soft);
  border: 1px solid var(--border-soft);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
}
.list-item:hover { background: var(--primary-light); }
.list-item.active {
  background: var(--primary);
  color: white;
  border-color: var(--primary);
}
.list-item.active .badge-warn { background: var(--warning); color: var(--text); }
.btn-icon {
  background: none; border: none; font-size: 1.1rem; cursor: pointer; opacity: 0.7;
}
.btn-icon:hover { opacity: 1; transform: scale(1.1); }

/* Columna Derecha */
.permisos-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 20px;
  background: var(--border-soft);
  padding: 20px;
  border-radius: 8px;
  border: 1px solid var(--border-soft);
}
.modulo-title {
  margin-top: 0; margin-bottom: 12px; color: var(--primary); border-bottom: 2px solid var(--border-soft); padding-bottom: 5px;
}
.checkbox-label {
  display: flex; align-items: flex-start; gap: 10px; margin-bottom: 10px; cursor: pointer;
}
.checkbox-label input[type="checkbox"] {
  margin-top: 4px; accent-color: var(--primary); transform: scale(1.1);
}
.checkbox-text { display: flex; flex-direction: column; }
.checkbox-text .clave { font-size: 0.9rem; font-weight: bold; color: var(--text); }
.checkbox-text .desc { font-size: 0.8rem; color: var(--text-soft); line-height: 1.3; }

.block { display: block; }
.text-right { text-align: right; }
.me-2 { margin-right: 10px; }
.mt-5 { margin-top: 5px; }

@media (max-width: 900px) {
  .roles-container { grid-template-columns: 1fr; }
}
</style>
