<template>
  <div class="nps-panel" v-can="'informe_nps'">
    <div class="nps-head">
      <div>
        <h3>📋 Planilla NPS (Excel)</h3>
        <p class="text-muted nps-sub">
          Incluye las OT <strong>abiertas</strong> en el período. Se llamará <strong>{{ titulo || '—' }}</strong>.
        </p>
      </div>
    </div>

    <div class="dashboard-controls">
      <div class="date-group">
        <label>Desde:</label>
        <input type="date" v-model="desde" class="form-control date-input" />
      </div>
      <div class="date-group">
        <label>Hasta:</label>
        <input type="date" v-model="hasta" class="form-control date-input" />
      </div>
      <button class="btn" @click="descargar" :disabled="!periodoValido || ocupado">
        {{ ocupado === 'descargar' ? 'Generando...' : '⬇ Descargar planilla' }}
      </button>
      <button class="btn btn-outline" @click="guardarEnCarpeta" :disabled="!periodoValido || ocupado || !estado.carpeta"
        :title="estado.carpeta ? 'Guarda una copia en ' + estado.carpeta : 'Configure la carpeta en Configuración'">
        {{ ocupado === 'guardar' ? 'Guardando...' : '💾 Guardar en carpeta' }}
      </button>
    </div>
    <p v-if="errorPeriodo" class="nps-error">{{ errorPeriodo }}</p>

    <div class="nps-auto" v-if="estado.carpeta !== null">
      <template v-if="!estado.carpeta">
        ⚠️ El informe automático no está activo: falta definir la <strong>carpeta de informes</strong> en Configuración.
      </template>
      <template v-else-if="!estado.auto_activo">
        El informe automático está desactivado. Carpeta: <code>{{ estado.carpeta }}</code>
      </template>
      <template v-else>
        ⏱️ Cada 1 y 16 el sistema guarda solo la planilla en <code>{{ estado.carpeta }}</code>.
        <span v-if="ultimoAuto">Último: <strong>{{ tituloDe(ultimoAuto.desde, ultimoAuto.hasta) }}</strong> ({{ ultimoAuto.filas }} OT, {{ formatFecha(ultimoAuto.generado_en) }}).</span>
        <span v-else>Todavía no se generó ninguno.</span>
        <span v-if="falloReciente" class="nps-error"> ⚠️ El último intento falló: {{ falloReciente.error }}</span>
      </template>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useApi } from '../../composables/useApi'
import { useToast, errMsg } from '../../composables/useToast'
import { useXlsxOutput } from '../../composables/useXlsxOutput'
import { useAuthStore } from '../../stores/useAuthStore'

const { fetchJSON, API_BASE, getToken } = useApi()
const toast = useToast()
const { descargarXLSX } = useXlsxOutput()

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
const pad = (n) => String(n).padStart(2, '0')
const iso = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`

// Por defecto, la última quincena completa (misma regla que el informe automático).
const quincenaPorDefecto = () => {
  const hoy = new Date()
  const y = hoy.getFullYear(), m = hoy.getMonth() + 1, d = hoy.getDate()
  if (d >= 16) return { desde: iso(y, m, 1), hasta: iso(y, m, 15) }
  const py = m === 1 ? y - 1 : y, pm = m === 1 ? 12 : m - 1
  return { desde: iso(py, pm, 16), hasta: iso(py, pm, new Date(py, pm, 0).getDate()) }
}

// "Octubre 1ro al 15" (misma convención que el backend).
const tituloDe = (d1, d2) => {
  const a = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d1 || ''), b = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d2 || '')
  if (!a || !b || d1 > d2) return ''
  const dia = (x) => (Number(x[3]) === 1 ? '1ro' : String(Number(x[3])))
  const mes = (x) => MESES[Number(x[2]) - 1]
  if (d1 === d2) return `${mes(a)} ${dia(a)}`
  if (a[1] === b[1] && a[2] === b[2]) return `${mes(a)} ${dia(a)} al ${Number(b[3])}`
  return `${mes(a)} ${dia(a)} al ${mes(b)} ${Number(b[3])}`
}

const def = quincenaPorDefecto()
const desde = ref(def.desde)
const hasta = ref(def.hasta)
const ocupado = ref('')
const estado = ref({ carpeta: null, auto_activo: true, historial: [] })

const titulo = computed(() => tituloDe(desde.value, hasta.value))
const periodoValido = computed(() => !!titulo.value)
const errorPeriodo = computed(() => (desde.value && hasta.value && desde.value > hasta.value ? 'La fecha "Desde" no puede ser posterior a "Hasta".' : ''))

const ultimoAuto = computed(() => estado.value.historial.find(h => h.origen === 'auto' && !h.error))
const falloReciente = computed(() => {
  const ultimo = estado.value.historial.find(h => h.origen === 'auto')
  return ultimo && ultimo.error ? ultimo : null
})

const formatFecha = (s) => {
  if (!s) return ''
  const d = new Date(String(s).replace(' ', 'T') + 'Z')
  return isNaN(d) ? s : d.toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })
}

const cargarEstado = async () => {
  try { estado.value = await fetchJSON('/reporte-nps/estado') }
  catch { estado.value = { carpeta: null, auto_activo: true, historial: [] } }
}

const descargar = async () => {
  ocupado.value = 'descargar'
  try {
    const res = await fetch(`${API_BASE}/reporte-nps/xlsx?desde=${desde.value}&hasta=${hasta.value}`, {
      headers: getToken() ? { Authorization: `Bearer ${getToken()}` } : {}
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw body
    }
    const nombre = decodeURIComponent(res.headers.get('X-Nombre-Archivo') || `${titulo.value}.xlsx`)
    await descargarXLSX(await res.blob(), nombre)
    cargarEstado()
  } catch (err) {
    toast.error(errMsg(err))
  } finally {
    ocupado.value = ''
  }
}

const guardarEnCarpeta = async () => {
  ocupado.value = 'guardar'
  try {
    const r = await fetchJSON('/reporte-nps/guardar', { method: 'POST', body: JSON.stringify({ desde: desde.value, hasta: hasta.value }) })
    toast.success(`Planilla guardada: ${r.ruta}`)
    cargarEstado()
  } catch (err) {
    toast.error(errMsg(err))
  } finally {
    ocupado.value = ''
  }
}

// Sin el permiso no se consulta (el backend respondería 403 y el panel ni se muestra).
const puede = useAuthStore().usuario?.permisos?.includes('informe_nps')
onMounted(() => { if (puede) cargarEstado() })
</script>

<style scoped>
.nps-panel { border: 1px solid var(--border-soft); border-radius: var(--radius-sm); padding: 14px 16px; margin-bottom: 18px; background: var(--surface); }
.nps-head h3 { margin: 0 0 2px; }
.nps-sub { margin: 0 0 10px; font-size: 0.9rem; }
.nps-auto { margin-top: 10px; font-size: 0.88rem; color: var(--muted); }
.nps-auto code { background: var(--border-soft); padding: 1px 6px; border-radius: 4px; }
.nps-error { color: var(--danger, #c0392b); font-size: 0.88rem; margin: 6px 0 0; }
</style>
