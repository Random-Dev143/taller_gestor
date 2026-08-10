<template>
  <div class="card">
    <div class="header-row">
      <h2>Gestión de Usuarios y Accesos</h2>
      <div style="display: flex; gap: 10px;">
        <select v-model="filtroEstado" class="form-control" style="width: auto;" @change="cargarDatos(filtroEstado)">
          <option value="">Todos los estados</option>
          <option value="pendiente">Pendientes</option>
          <option value="aprobado">Aprobados</option>
          <option value="suspendido">Suspendidos</option>
        </select>
        <button class="btn btn-secondary btn-sm" @click="cargarDatos(filtroEstado)">↻ Actualizar</button>
      </div>
    </div>

    <div v-if="loading" class="loading-state"><div class="spinner"></div>Cargando usuarios...</div>
    <div v-else class="table-wrapper mt-15">
      <table>
        <thead>
          <tr>
            <th>Nombre y Correo</th>
            <th>Estado</th>
            <th>Rol de Sistema</th>
            <th>Legajo Físico</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="usuarios.length === 0">
            <td colspan="5" class="empty-state">No hay usuarios para mostrar.</td>
          </tr>
          <tr v-for="u in usuarios" :key="u.id" :class="{'fila-pendiente': u.estado === 'pendiente'}">
            <td>
              <strong>{{ u.nombre_completo }}</strong><br>
              <span class="text-muted" style="font-size: 0.85rem;">{{ u.email }}</span>
            </td>
            <td>
              <span :class="['badge', claseEstado(u.estado)]">{{ u.estado }}</span>
            </td>
            <td>
                <select v-if="editandoId === u.id" v-model="formEdit.rol_id" class="form-control" style="padding: 4px;">
                    <option value="" disabled>Seleccione un perfil...</option>
                    <option v-for="r in rolesLista" :key="r.id" :value="r.id">{{ r.nombre }}</option>
                </select>
                <span v-else class="badge-sm" style="background: #0056a7;">{{ u.rol_nombre || 'Sin asignar' }}</span>
            </td>
            <td>
              <select v-if="editandoId === u.id" v-model="formEdit.legajo" class="form-control" style="padding: 4px;">
                <option value="">Ninguno</option>
                <option v-for="l in legajos" :key="l.legajo" :value="l.legajo">{{ l.nombre }} ({{ l.rol }})</option>
              </select>
              <span v-else>{{ u.nombre_legajo ? `${u.nombre_legajo} (${u.legajo})` : '—' }}</span>
            </td>
            <td style="white-space: nowrap;">
              <!-- Modo Edición -->
              <template v-if="editandoId === u.id">
                <button class="btn btn-success btn-sm" v-can="'usuario_gestionar'" @click="guardarEdicionUsuario(u.id)">Guardar</button>
                <button class="btn btn-secondary btn-sm" @click="cancelarEdicion">Cancelar</button>
              </template>
              
              <!-- Modo Vista (Aprobar Rápido) -->
              <template v-else-if="u.estado === 'pendiente'">
                <button class="btn btn-success btn-sm" v-can="'usuario_gestionar'" @click="iniciarEdicion(u)">✅ Aprobar y Asignar</button>
              </template>

              <!-- Modo Vista Normal -->
              <template v-else>
                <button class="btn btn-sm" v-can="'usuario_gestionar'" @click="iniciarEdicion(u)">✏️ Editar</button>
                <button v-if="u.estado !== 'suspendido'" class="btn btn-danger btn-sm" v-can="'usuario_gestionar'" @click="confirmarSuspension(u.id)">🚫 Suspender</button>
                <button v-else class="btn btn-outline btn-sm" v-can="'usuario_gestionar'" @click="confirmarReactivacion(u.id)">Reactivar</button>
              </template>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useUsuarios } from '../../composables/useUsuarios'

const { usuarios, legajos, rolesLista, loading, cargarDatos, guardarCambios, suspenderUsuario, reactivarUsuario } = useUsuarios()

const filtroEstado = ref('')

const editandoId = ref(null)
const formEdit = ref({ rol_id: '', legajo: '', estado: '' })



const claseEstado = (estado) => ({
  'pendiente': 'badge-warn',
  'aprobado': 'badge-success',
  'suspendido': 'badge-danger'
}[estado] || '')

const iniciarEdicion = (u) => {
  editandoId.value = u.id
  formEdit.value = {
    rol_id: u.rol_id || '', 
    legajo: u.legajo || '',
    estado: 'aprobado' 
  }
}

const cancelarEdicion = () => {
  editandoId.value = null
}

const guardarEdicionUsuario = async (id) => {
  const ok = await guardarCambios(id, formEdit.value)
  if (ok) {
    cancelarEdicion()
    cargarDatos(filtroEstado.value)
  }
}

const confirmarSuspension = async (id) => {
  if (!confirm('¿Seguro que desea suspender a este usuario? Perderá el acceso al sistema.')) return
  const ok = await suspenderUsuario(id)
  if (ok) cargarDatos(filtroEstado.value)
}

const confirmarReactivacion = async (id) => {
  const ok = await reactivarUsuario(id)
  if (ok) cargarDatos(filtroEstado.value)
}

onMounted(() => cargarDatos(filtroEstado.value))
</script>

<style scoped>
.header-row { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; }
.header-row h2 { margin: 0; }
.fila-pendiente td { background-color: #fffaf0; }
.badge-warn { background: #b8860b; color: white; }
.badge-success { background: #1d8a4f; color: white; }
.badge-danger { background: #b22234; color: white; }
.text-muted { color: var(--muted); }
</style>
