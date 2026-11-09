<template>
  <div class="modal-overlay" @click.self="cerrar">
    <div class="modal-content modal-large imp-modal">
      <button class="close-btn" @click="cerrar">&times;</button>
      <h2>Importar clientes desde planillas</h2>

      <!-- ─── 1. Elegir archivos ─── -->
      <section v-if="!imp">
        <p class="text-muted">
          Suba una o varias planillas de NPS (.xlsx). Primero se muestra qué cambiaría; <strong>nada se modifica hasta que usted lo apruebe</strong>.
        </p>
        <input ref="inputArchivos" type="file" accept=".xlsx" multiple class="form-control" @change="elegidos = Array.from($event.target.files)" />
        <p v-if="elegidos.length" class="text-muted mt-10">{{ elegidos.length }} archivo{{ elegidos.length !== 1 ? 's' : '' }} seleccionado{{ elegidos.length !== 1 ? 's' : '' }}.</p>
        <div class="acciones">
          <button class="btn" :disabled="!elegidos.length || ocupado" @click="analizar">{{ ocupado ? 'Analizando...' : 'Analizar planillas' }}</button>
        </div>

        <div v-if="pendientes.length" class="mt-15">
          <h4>Importaciones sin terminar</h4>
          <table>
            <thead><tr><th>Fecha</th><th>Archivos</th><th>Pendientes</th><th></th></tr></thead>
            <tbody>
              <tr v-for="p in pendientes" :key="p.id">
                <td>{{ formatFecha(p.creada_en) }}</td>
                <td>{{ p.archivos.length }} archivo(s)</td>
                <td>{{ p.pendientes }}</td>
                <td><button class="btn btn-outline btn-sm" @click="abrir(p.id)">Continuar</button></td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <!-- ─── 2. Revisar y aprobar ─── -->
      <section v-else>
        <div class="resumen">
          <div><strong>{{ imp.resumen.archivos.length }}</strong> archivo(s)</div>
          <div><strong>{{ imp.resumen.filas }}</strong> filas leídas</div>
          <div><strong>{{ imp.resumen.patentes }}</strong> unidades distintas</div>
          <div class="estado-tag" :class="'estado-' + imp.estado">{{ imp.estado }}</div>
        </div>
        <ul class="errores" v-if="archivosConError.length">
          <li v-for="a in archivosConError" :key="a.nombre">⚠️ {{ a.nombre }}: {{ a.error }}</li>
        </ul>
        <details v-if="imp.resumen.advertencias?.length" class="advertencias">
          <summary>⚠️ {{ imp.resumen.advertencias.length }} fila(s) omitidas por inconsistencias</summary>
          <ul><li v-for="(a, i) in imp.resumen.advertencias" :key="i">{{ a.archivo }} · fila {{ a.fila }}: {{ a.detalle }}</li></ul>
        </details>

        <div class="tabs">
          <button v-for="t in tabs" :key="t.id" :class="['tab', { activa: tab === t.id }]" @click="cambiarTab(t.id)">
            {{ t.label }} <span class="contador">{{ pendientesDe(t.id) }}</span>
          </button>
        </div>

        <!-- Altas y datos faltantes: se aprueban juntos -->
        <div v-if="tab === 'automaticos'">
          <p class="text-muted">
            Son datos que la base no tiene y la planilla sí (CUIT, chasis, contacto, mail, teléfono, modelo) y unidades nuevas.
            No pisan ningún dato existente.
          </p>
          <button class="btn btn-success" :disabled="ocupado || !pendientesDe('automaticos') || imp.estado !== 'pendiente'" @click="aprobarAutomaticos">
            Aprobar y aplicar {{ pendientesDe('automaticos') }} cambio(s)
          </button>
          <div class="table-wrapper mt-15" v-if="lista.length">
            <table>
              <thead><tr><th>Cambio</th><th>Patente / Cliente</th><th>Dato</th><th>Valor de la planilla</th><th>Estado</th></tr></thead>
              <tbody>
                <tr v-for="it in lista" :key="it.id">
                  <td>{{ it.tipo === 'alta' ? 'Unidad nueva' : 'Completar' }}</td>
                  <td><strong>{{ it.entidad === 'cliente' ? 'Cliente #' + it.ref : it.ref }}</strong></td>
                  <td>{{ it.tipo === 'alta' ? 'Cliente: ' + (it.valor_propuesto || '—') : etiqueta(it.campo) }}</td>
                  <td>{{ it.tipo === 'alta' ? [it.payload.unidad, it.payload.chasis].filter(Boolean).join(' · ') : it.valor_propuesto }}</td>
                  <td>{{ it.estado }}<span v-if="it.detalle" class="text-muted"> — {{ it.detalle }}</span></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- Conflictos y cambios de cliente: se resuelven de a uno -->
        <div v-else>
          <p class="text-muted" v-if="tab === 'conflicto'">
            La base ya tiene un valor distinto. Puede corregir el texto del medio y aceptar, o rechazar para dejar el dato actual.
          </p>
          <p class="text-muted" v-else>
            La unidad figura a nombre de otro cliente. Al aceptar, la unidad (y sus OT) pasan al cliente indicado; se busca por CUIT y si no existe se crea.
          </p>
          <div v-if="!lista.length" class="empty-state">No hay cambios para mostrar.</div>
          <div v-for="it in lista" :key="it.id" class="conflicto" :class="{ resuelto: it.estado !== 'pendiente' }">
            <div class="conf-titulo">
              <strong>{{ it.entidad === 'cliente' ? 'Cliente #' + it.ref : it.ref }}</strong> · {{ tab === 'cliente_distinto' ? 'Cliente' : etiqueta(it.campo) }}
              <span class="text-muted origen">{{ it.origen }}</span>
            </div>
            <div class="conf-valores">
              <div><label>Actual</label><div class="valor">{{ it.valor_actual || '—' }}</div></div>
              <div><label>Planilla</label><div class="valor">{{ it.valor_propuesto }}</div></div>
              <div class="grow">
                <label>Valor final</label>
                <input class="form-control" v-model="valores[it.id]" :disabled="it.estado !== 'pendiente'" />
              </div>
              <div class="conf-botones" v-if="it.estado === 'pendiente'">
                <button class="btn btn-success btn-sm" :disabled="ocupado" @click="resolver(it, 'aprobar')">✔ Aceptar</button>
                <button class="btn btn-secondary btn-sm" :disabled="ocupado" @click="resolver(it, 'rechazar')">✖ Rechazar</button>
              </div>
              <div v-else class="conf-botones"><span :class="'estado-' + it.estado">{{ it.estado }}</span></div>
            </div>
            <div v-if="it.detalle" class="text-muted detalle">{{ it.detalle }}</div>
          </div>
        </div>

        <div class="paginacion" v-if="totalPaginas > 1">
          <button class="btn btn-outline btn-sm" :disabled="pagina <= 1" @click="irAPagina(pagina - 1)">‹</button>
          <span>Página {{ pagina }} de {{ totalPaginas }}</span>
          <button class="btn btn-outline btn-sm" :disabled="pagina >= totalPaginas" @click="irAPagina(pagina + 1)">›</button>
        </div>

        <div class="acciones">
          <button class="btn btn-secondary" @click="imp = null; cargarPendientes()">← Otra importación</button>
          <button v-if="imp.estado === 'pendiente'" class="btn btn-danger" :disabled="ocupado" @click="cancelarImportacion">Cancelar importación</button>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useImportacion } from '../../composables/useImportacion'
import { useToast, errMsg } from '../../composables/useToast'

const emit = defineEmits(['close', 'cambios'])
const api = useImportacion()
const toast = useToast()

const elegidos = ref([])
const inputArchivos = ref(null)
const pendientes = ref([])
const imp = ref(null)
const ocupado = ref(false)
const tab = ref('automaticos')
const lista = ref([])
const pagina = ref(1)
const totalPaginas = ref(1)
const valores = ref({})
const huboCambios = ref(false)

const tabs = [
  { id: 'automaticos', label: 'Altas y datos faltantes' },
  { id: 'conflicto', label: 'Conflictos' },
  { id: 'cliente_distinto', label: 'Cambios de cliente' }
]
const ETIQUETAS = { cuit: 'CUIT', unidad: 'Modelo', chasis: 'Chasis', contacto: 'Contacto', telefono: 'Teléfono', correo: 'Mail', cliente: 'Cliente' }
const etiqueta = (c) => ETIQUETAS[c] || c

const archivosConError = computed(() => (imp.value?.resumen.archivos || []).filter(a => a.error))
const formatFecha = (s) => {
  const d = new Date(String(s || '').replace(' ', 'T') + 'Z')
  return isNaN(d) ? s : d.toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })
}

const pendientesDe = (id) => {
  if (!imp.value) return 0
  const tipos = id === 'automaticos' ? ['completar', 'alta'] : [id]
  return (imp.value.conteo || []).filter(c => tipos.includes(c.tipo) && c.estado === 'pendiente').reduce((a, c) => a + c.n, 0)
}

const cargarPendientes = async () => {
  try { pendientes.value = (await api.listar()).filter(p => p.estado === 'pendiente') } catch { pendientes.value = [] }
}

const refrescarImp = async () => { imp.value = await api.obtener(imp.value.id) }

const cargarLista = async () => {
  const tipos = tab.value === 'automaticos' ? ['completar', 'alta'] : [tab.value]
  // "Altas y datos faltantes" junta dos tipos: se piden por separado y se unen (el backend filtra por un tipo).
  const respuestas = await Promise.all(tipos.map(t => api.items(imp.value.id, { tipo: t, page: pagina.value, limit: tab.value === 'automaticos' ? 15 : 10 })))
  lista.value = respuestas.flatMap(r => r.data)
  totalPaginas.value = Math.max(...respuestas.map(r => r.totalPages))
  for (const it of lista.value) if (!(it.id in valores.value)) valores.value[it.id] = it.valor_final || it.valor_propuesto
}

const abrir = async (id) => {
  try {
    imp.value = await api.obtener(id)
    tab.value = 'automaticos'; pagina.value = 1
    await cargarLista()
  } catch (e) { toast.error(errMsg(e)) }
}

const analizar = async () => {
  ocupado.value = true
  try {
    const r = await api.analizar(elegidos.value)
    await abrir(r.id)
    toast.success('Análisis listo. Revise los cambios antes de aprobar.')
  } catch (e) { toast.error(errMsg(e)) }
  finally { ocupado.value = false }
}

const cambiarTab = async (id) => { tab.value = id; pagina.value = 1; await cargarLista() }
const irAPagina = async (n) => { pagina.value = n; await cargarLista() }

const aprobarAutomaticos = async () => {
  if (!confirm(`Se van a aplicar ${pendientesDe('automaticos')} cambios (altas y datos faltantes). Se hace un backup antes. ¿Continuar?`)) return
  ocupado.value = true
  try {
    const r = await api.aprobarAutomaticos(imp.value.id)
    huboCambios.value = true
    toast.success(`Aplicados: ${r.aplicado}. Omitidos: ${r.omitido}. Con error: ${r.error}.`)
    await refrescarImp(); await cargarLista()
  } catch (e) { toast.error(errMsg(e)) }
  finally { ocupado.value = false }
}

const resolver = async (it, accion) => {
  ocupado.value = true
  try {
    await api.resolver(it.id, accion, accion === 'aprobar' ? valores.value[it.id] : undefined)
    if (accion === 'aprobar') huboCambios.value = true
    await refrescarImp(); await cargarLista()
  } catch (e) { toast.error(errMsg(e)) }
  finally { ocupado.value = false }
}

const cancelarImportacion = async () => {
  if (!confirm('Se descartan todos los cambios pendientes de esta importación (los ya aplicados se mantienen). ¿Cancelar?')) return
  try { await api.cancelar(imp.value.id); await refrescarImp(); await cargarLista() }
  catch (e) { toast.error(errMsg(e)) }
}

const cerrar = () => { if (huboCambios.value) emit('cambios'); emit('close') }

onMounted(cargarPendientes)
</script>

<style scoped>
.imp-modal { max-height: 88vh; overflow-y: auto; }
.acciones { display: flex; gap: 10px; margin-top: 16px; }
.resumen { display: flex; gap: 22px; align-items: center; flex-wrap: wrap; margin: 10px 0; }
.estado-tag { padding: 2px 10px; border-radius: 10px; background: var(--border-soft); font-size: 0.8rem; text-transform: uppercase; }
.errores { color: var(--danger, #c0392b); }
.advertencias { margin: 8px 0; font-size: 0.88rem; }
.tabs { display: flex; gap: 6px; border-bottom: 1px solid var(--border-soft); margin: 14px 0; }
.tab { background: none; border: none; padding: 8px 14px; cursor: pointer; border-bottom: 3px solid transparent; color: var(--muted); font-weight: 600; }
.tab.activa { color: var(--primary-dark); border-bottom-color: var(--primary); }
.contador { background: var(--border-soft); border-radius: 10px; padding: 1px 8px; font-size: 0.78rem; margin-left: 4px; }
.conflicto { border: 1px solid var(--border-soft); border-radius: var(--radius-sm); padding: 10px 12px; margin-bottom: 10px; background: var(--surface); }
.conflicto.resuelto { opacity: 0.6; }
.conf-titulo { margin-bottom: 6px; }
.origen { margin-left: 8px; font-size: 0.78rem; }
.conf-valores { display: flex; gap: 14px; align-items: flex-end; flex-wrap: wrap; }
.conf-valores label { display: block; font-size: 0.75rem; color: var(--muted); }
.conf-valores .valor { padding: 6px 0; min-width: 130px; word-break: break-word; }
.grow { flex: 1; min-width: 200px; }
.conf-botones { display: flex; gap: 6px; }
.detalle { font-size: 0.82rem; margin-top: 4px; }
.paginacion { display: flex; gap: 12px; align-items: center; justify-content: center; margin-top: 12px; }
.estado-aplicado { color: var(--success, #2e7d32); font-weight: 600; }
.estado-rechazado, .estado-cancelada { color: var(--muted); }
.estado-error { color: var(--danger, #c0392b); font-weight: 600; }
</style>
