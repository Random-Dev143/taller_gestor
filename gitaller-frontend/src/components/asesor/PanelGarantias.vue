<template>
  <div class="panel-garantias">
    <div class="pg-barra">
      <input type="text" v-model="busqueda" class="form-control search-input"
             placeholder="🔍 Buscar por N° de OT (garantía), patente o proforma..." @input="onBuscar" />
      <button class="btn btn-secondary btn-sm" @click="cargar">↻ Actualizar</button>
    </div>

    <p v-if="!loading && resumen" class="pg-resumen">{{ resumen }}</p>

    <div v-if="loading" class="loading-state"><div class="spinner"></div>Cargando garantías...</div>
    <div v-else-if="filas.length === 0" class="empty-state">
      {{ busqueda.trim() ? 'No se encontraron garantías con esa búsqueda.' : 'Todavía no hay OT de garantía finalizadas.' }}
    </div>

    <div v-else class="table-wrapper">
      <table class="pg-tabla">
        <thead>
          <tr>
            <th>N° OT (garantía)</th>
            <th>Cliente / Unidad</th>
            <th>Cierre</th>
            <th>Total OT</th>
            <th>Fecha reclamo</th>
            <th>Monto solicitado</th>
            <th>Monto pagado</th>
            <th>N° proforma (claim)</th>
            <th>Estado</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="f in filas" :key="f.ot" :class="{ 'pg-editando': editando === f.ot }">
            <td><strong>{{ f.ot }}</strong></td>
            <td>{{ f.cliente }}<br /><small class="pg-sub">{{ f.patente }} · {{ f.unidad }}</small></td>
            <td>{{ fmtFechaHora(f.fecha_cierre) }}</td>
            <td>{{ fmtMoneda(f.monto_ot_garantia) }}</td>

            <!-- Modo edición: los 4 datos del reclamo -->
            <template v-if="editando === f.ot">
              <td><input type="date" class="form-control" v-model="form.fecha_reclamo" /></td>
              <td><input type="number" class="form-control pg-num" min="0" step="0.01" v-model="form.monto_solicitado" placeholder="0,00" /></td>
              <td><input type="number" class="form-control pg-num" min="0" step="0.01" v-model="form.monto_pagado" placeholder="0,00" /></td>
              <td><input type="text" class="form-control" maxlength="60" v-model="form.numero_proforma" placeholder="N° de proforma" /></td>
              <td></td>
              <td class="pg-acciones">
                <button class="btn btn-success btn-sm" :disabled="guardando" @click="guardar(f)">{{ guardando ? 'Guardando...' : 'Guardar' }}</button>
                <button class="btn btn-outline btn-sm" :disabled="guardando" @click="cancelar">Cancelar</button>
              </td>
            </template>

            <!-- Modo lectura -->
            <template v-else>
              <td>{{ fmtFechaReclamo(f.fecha_reclamo) }}</td>
              <td>{{ fmtMoneda(f.monto_solicitado, true) }}</td>
              <td>{{ fmtMoneda(f.monto_pagado, true) }}</td>
              <td>{{ f.numero_proforma || '—' }}</td>
              <td><span class="badge pg-estado" :class="'pg-estado--' + estadoDe(f).clase">{{ estadoDe(f).texto }}</span></td>
              <td class="pg-acciones">
                <button class="btn btn-outline btn-sm" v-can="'ot_editar'" @click="editar(f)">
                  {{ estadoDe(f).clase === 'vacio' ? 'Cargar reclamo' : 'Editar' }}
                </button>
              </td>
            </template>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useApi } from '../../composables/useApi'
import { useToast, errMsg } from '../../composables/useToast'

const { fetchJSON } = useApi()
const toast = useToast()

const filas = ref([])
const total = ref(0)
const limite = ref(30)
const loading = ref(true)
const busqueda = ref('')

const editando = ref(null)   // N° de OT de la fila en edición
const guardando = ref(false)
const form = ref({ fecha_reclamo: '', monto_solicitado: '', monto_pagado: '', numero_proforma: '' })

let timer = null
let pedido = 0               // descarta respuestas viejas si se escribe más rápido de lo que responde el servidor

const cargar = async () => {
  const mio = ++pedido
  loading.value = true
  try {
    const q = busqueda.value.trim()
    const r = await fetchJSON(`/ordenes/garantias/reclamos${q ? `?busqueda=${encodeURIComponent(q)}` : ''}`)
    if (mio !== pedido) return
    filas.value = r.data || []
    total.value = r.total || 0
    limite.value = r.limite || 30
    editando.value = null
  } catch (err) {
    if (mio === pedido) toast.error('Error cargando garantías: ' + errMsg(err))
  } finally {
    if (mio === pedido) loading.value = false
  }
}

const onBuscar = () => {
  clearTimeout(timer)
  timer = setTimeout(cargar, 350)
}

onMounted(cargar)
onUnmounted(() => clearTimeout(timer))

const resumen = computed(() => {
  if (busqueda.value.trim()) return `${total.value} resultado(s) — la búsqueda abarca todas las garantías finalizadas.`
  if (total.value > filas.value.length) return `Mostrando las últimas ${filas.value.length} de ${total.value} garantías finalizadas. Usá el buscador para ver las anteriores.`
  return `${total.value} garantía(s) finalizada(s).`
})

// ── Edición ──
const editar = (f) => {
  editando.value = f.ot
  form.value = {
    fecha_reclamo: f.fecha_reclamo || '',
    monto_solicitado: f.monto_solicitado ?? '',
    monto_pagado: f.monto_pagado ?? '',
    numero_proforma: f.numero_proforma || ''
  }
}
const cancelar = () => { editando.value = null }

const guardar = async (f) => {
  const { monto_solicitado, monto_pagado } = form.value
  for (const [v, nombre] of [[monto_solicitado, 'monto solicitado'], [monto_pagado, 'monto pagado']]) {
    if (v !== '' && v !== null && (!Number.isFinite(Number(v)) || Number(v) < 0)) return toast.error(`El ${nombre} debe ser un número mayor o igual a 0`)
  }
  guardando.value = true
  try {
    const r = await fetchJSON(`/ordenes/garantias/reclamos/${encodeURIComponent(f.ot)}`, { method: 'PUT', body: JSON.stringify(form.value) })
    // Se actualiza la fila en su lugar (sin recargar la lista: no se pierde el lugar ni la búsqueda)
    Object.assign(f, {
      fecha_reclamo: r.fecha_reclamo, monto_solicitado: r.monto_solicitado,
      monto_pagado: r.monto_pagado, numero_proforma: r.numero_proforma
    })
    editando.value = null
    toast.success(`Reclamo de la OT ${f.ot} guardado`)
  } catch (err) { toast.error(errMsg(err)) }
  finally { guardando.value = false }
}

// ── Presentación ──
const estadoDe = (f) => {
  if (f.monto_pagado !== null && f.monto_pagado !== undefined) return { clase: 'pagado', texto: 'Pagado' }
  if (f.fecha_reclamo || f.numero_proforma || (f.monto_solicitado !== null && f.monto_solicitado !== undefined)) return { clase: 'reclamado', texto: 'Reclamado' }
  return { clase: 'vacio', texto: 'Sin cargar' }
}

const moneda = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' })
const fmtMoneda = (v, guion = false) => (v === null || v === undefined) ? (guion ? '—' : moneda.format(0)) : moneda.format(v)

// fecha_reclamo es un día calendario (AAAA-MM-DD): se formatea sin pasar por Date, para que
// la zona horaria no la corra un día.
const fmtFechaReclamo = (d) => { if (!d) return '—'; const [a, m, dia] = d.split('-'); return `${dia}/${m}/${a}` }
const fmtFechaHora = (s) => {
  if (!s) return '—'
  const utc = s.includes('T') ? s : s.replace(' ', 'T') + 'Z'
  return new Date(utc).toLocaleDateString('es-AR')
}
</script>

<style scoped>
.pg-barra { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-bottom: 8px; }
.pg-barra .search-input { flex: 1; min-width: 240px; }
.pg-resumen { font-size: 0.85rem; color: var(--muted); margin: 0 0 10px; }
.pg-tabla td, .pg-tabla th { vertical-align: middle; }
.pg-sub { color: var(--muted); }
.pg-num { min-width: 110px; }
.pg-acciones { white-space: nowrap; }
.pg-acciones .btn + .btn { margin-left: 6px; }
.pg-editando { background: var(--border-soft); }
.pg-estado--pagado { background: var(--success); color: #fff; }
.pg-estado--reclamado { background: var(--warning); color: #fff; }
.pg-estado--vacio { background: var(--muted); color: #fff; }
</style>
