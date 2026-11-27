<template>
  <div class="inicio">
    <header class="inicio__head">
      <div>
        <h2>{{ saludo }}, {{ primerNombre }}</h2>
        <p class="text-muted">{{ fechaLarga }}</p>
      </div>
      <div class="inicio__acciones">
        <button class="btn btn-secondary btn-sm" @click="cargar" :disabled="cargando"><AppIcon name="refresh" /> Actualizar</button>
        <router-link v-if="puede('turno_gestionar')" :to="{ path: '/turnos', query: { nuevo: 1 } }" class="btn btn-secondary btn-sm"><AppIcon name="calendar" /> Nuevo turno</router-link>
        <router-link v-if="puede('ot_crear')" to="/nueva-ot" class="btn btn-sm"><AppIcon name="plus" /> Nueva OT</router-link>
      </div>
    </header>

    <div v-if="cargando && !panel" class="loading-state"><div class="spinner"></div>Cargando el estado del taller...</div>
    <template v-else-if="panel">

      <!-- ═══ Taller ahora ═══ -->
      <section class="bloque">
        <h3 class="bloque__titulo">El taller ahora</h3>
        <div class="kpis">
          <KpiCard label="En taller" icon="wrench" :value="panel.taller.en_taller" :sub="desgloseEstados" tone="primary" to="/ordenes" />
          <KpiCard label="Estancadas" icon="clock" :value="panel.taller.estancadas" :sub="`Abiertas hace más de ${panel.taller.umbral_dias_estancada} días`"
            :tone="panel.taller.estancadas > 0 ? 'danger' : 'ok'" to="/ordenes" />
          <KpiCard label="Listas para controlar" icon="check" :value="panel.taller.listas_para_controlar" sub="Con todas sus tareas terminadas"
            :tone="panel.taller.listas_para_controlar > 0 ? 'warn' : 'neutral'" to="/ordenes" />
          <KpiCard label="Sin tareas asignadas" icon="alert" :value="panel.taller.sin_tareas" sub="OT abiertas que ningún mecánico tiene"
            :tone="panel.taller.sin_tareas > 0 ? 'warn' : 'ok'" to="/ordenes" />
        </div>
      </section>

      <!-- ═══ Hoy ═══ -->
      <section v-if="puede('turno_ver') || puede('turno_gestionar')" class="bloque">
        <h3 class="bloque__titulo">Hoy</h3>
        <div class="kpis">
          <KpiCard label="Turnos de hoy" icon="calendar" :value="`${panel.turnos_hoy.llegaron} / ${panel.turnos_hoy.total}`"
            :sub="`Llegaron · ${panel.turnos_hoy.confirmados} confirmados, ${panel.turnos_hoy.sin_confirmar} sin confirmar`"
            :progreso="panel.turnos_hoy.total ? (panel.turnos_hoy.llegaron / panel.turnos_hoy.total) * 100 : null" to="/turnos" />
          <KpiCard label="Confirmados sin OT" icon="phone" :value="panel.pendientes.turnos_confirmados_sin_ot" sub="Hoy y mañana: generá la OT cuando lleguen"
            :tone="panel.pendientes.turnos_confirmados_sin_ot > 0 ? 'warn' : 'ok'" to="/turnos" />
          <KpiCard label="Ocupación de hoy" icon="target"
            :value="panel.turnos_hoy.abierto ? `${panel.turnos_hoy.horas_comprometidas} / ${panel.turnos_hoy.horas_disponibles} h` : 'Cerrado'"
            :sub="panel.turnos_hoy.horas_prioritarias ? `+ ${panel.turnos_hoy.horas_prioritarias} h de garantías y retrabajos` : 'Horas de turnos sobre horas de mecánicos'"
            :progreso="panel.turnos_hoy.horas_disponibles ? (panel.turnos_hoy.horas_comprometidas / panel.turnos_hoy.horas_disponibles) * 100 : null" />
          <KpiCard v-if="puede('informe_operativo') || puede('informe_financiero')" label="Presupuestos sin respuesta" icon="file"
            :value="panel.pendientes.presupuestos_sin_respuesta" :sub="panel.pendientes.presupuestos_sin_respuesta ? `${moneda(panel.pendientes.presupuestos_monto)} esperando al cliente` : 'No hay presupuestos pendientes'"
            :tone="panel.pendientes.presupuestos_sin_respuesta > 0 ? 'warn' : 'ok'" :to="{ path: '/informes', query: { tab: 'turnos' } }" />
        </div>
      </section>

      <!-- ═══ Mes ═══ -->
      <section class="bloque">
        <h3 class="bloque__titulo">{{ panel.mes ? `Mes en curso · ${nombreMes}` : 'Pendientes administrativos' }}</h3>
        <div class="kpis">
          <template v-if="panel.mes">
            <KpiCard label="OT finalizadas" icon="check" :value="panel.mes.finalizadas" :delta="variacion(panel.mes.finalizadas, panel.mes.anterior.finalizadas)"
              :sub="`Mismos días del mes anterior: ${panel.mes.anterior.finalizadas}`" :to="{ path: '/informes', query: { tab: 'mensual' } }" />
            <KpiCard label="Facturado" icon="trend" :value="moneda(panel.mes.facturado)" :delta="variacion(panel.mes.facturado, panel.mes.anterior.facturado)"
              :sub="`Mismos días del mes anterior: ${moneda(panel.mes.anterior.facturado)}`" :to="{ path: '/informes', query: { tab: 'mensual' } }" />
            <KpiCard label="Eficiencia" icon="target" :value="porcentaje(panel.mes.eficiencia_pct, 1)"
              :sub="`Mismos días del mes anterior: ${porcentaje(panel.mes.anterior.eficiencia_pct, 1)}`" :to="{ path: '/informes', query: { tab: 'mensual' } }" />
          </template>
          <KpiCard label="Falta cargar importes" icon="alert" :value="panel.pendientes.falta_facturar"
            :sub="`Finalizadas en los últimos 30 días sin facturación${panel.mes && panel.pendientes.descuentos_pendientes ? ` · ${panel.pendientes.descuentos_pendientes} descuento(s) por autorizar` : ''}`"
            :tone="panel.pendientes.falta_facturar > 0 ? 'warn' : 'ok'" to="/finalizadas" />
          <KpiCard v-if="!panel.mes" label="Descuentos por autorizar" icon="lock" :value="panel.pendientes.descuentos_pendientes"
            sub="Esperan aprobación del administrador" :tone="panel.pendientes.descuentos_pendientes > 0 ? 'warn' : 'ok'" />
        </div>
      </section>

      <!-- ═══ Qué hacer ═══ -->
      <div class="dos">
        <section class="card panel-lista">
          <h3>Requiere atención</h3>
          <ul v-if="tareasPendientes.length" class="lista">
            <li v-for="(t, i) in tareasVisibles" :key="i" class="fila">
              <span class="fila__icono" :class="`fila__icono--${t.tono}`"><AppIcon :name="t.icono" /></span>
              <span class="fila__txt"><strong>{{ t.titulo }}</strong><small :title="t.completo">{{ t.detalle }}</small></span>
              <router-link :to="t.to" class="btn btn-secondary btn-sm">{{ t.accion }}</router-link>
            </li>
          </ul>
          <p v-else class="vacio"><AppIcon name="check" /> Todo al día: no hay nada pendiente de resolver.</p>
          <p v-if="tareasPendientes.length > tareasVisibles.length || panel.atencion.presupuestos_total > panel.atencion.presupuestos.length" class="text-muted mas">
            y {{ tareasPendientes.length - tareasVisibles.length + Math.max(0, panel.atencion.presupuestos_total - panel.atencion.presupuestos.length) }} pendiente(s) más: se ven en Órdenes y en Informes
          </p>
        </section>

        <section v-if="puede('turno_ver') || puede('turno_gestionar')" class="card panel-lista">
          <h3>Agenda de hoy y mañana</h3>
          <ul v-if="agenda.length" class="lista">
            <li v-for="t in agenda" :key="t.id" class="fila fila--link" @click="$router.push({ path: '/turnos', query: { turno: t.id } })">
              <span class="hora num">{{ hora(t.fecha_hora) }}</span>
              <span class="fila__txt">
                <strong><span class="patente patente--mini">{{ t.patente }}</span> <span :title="$unidadCompleta(t.unidad)">{{ $modelo(t.unidad) }}</span></strong>
                <small>{{ t.cliente }}<template v-if="t.tipo !== 'normal'"> · {{ t.tipo === 'garantia' ? 'Garantía' : 'Retrabajo' }}</template></small>
              </span>
              <span class="estado"><span class="dot" :style="{ background: colorEstado(t.estado) }"></span>{{ textoEstado(t.estado) }}</span>
            </li>
          </ul>
          <p v-else class="vacio">No hay turnos para hoy ni para mañana.</p>
        </section>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useApi } from '../composables/useApi'
import { useToast, errMsg } from '../composables/useToast'
import { useAuthStore } from '../stores/useAuthStore'
import { moneda, porcentaje, variacion } from '../utils/formato'
import { parseUtc } from '../utils/fechas'
import { modeloUnidad } from '../utils/unidad'
import KpiCard from '../components/common/KpiCard.vue'

const { fetchJSON } = useApi()
const toast = useToast()
const authStore = useAuthStore()
const puede = (p) => (authStore.usuario?.permisos || []).includes(p)

const panel = ref(null)
const agenda = ref([])
const cargando = ref(true)

const primerNombre = computed(() => (authStore.usuario?.nombre_completo || authStore.usuario?.email || '').split(/[\s@]/)[0])
const saludo = computed(() => { const h = new Date().getHours(); return h < 12 ? 'Buen día' : h < 20 ? 'Buenas tardes' : 'Buenas noches' })
const fechaLarga = computed(() => new Date().toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }))
const nombreMes = computed(() => new Date().toLocaleDateString('es-AR', { month: 'long', year: 'numeric' }))

const ORDEN_ESTADOS = [['En Proceso', 'en proceso'], ['En Espera', 'en espera'], ['Espera de Repuestos', 'esperando repuestos'], ['Trabajos de Terceros', 'en terceros']]
const desgloseEstados = computed(() => {
  const e = panel.value?.taller.por_estado || {}
  const partes = ORDEN_ESTADOS.filter(([k]) => e[k]).map(([k, t]) => `${e[k]} ${t}`)
  return partes.length ? partes.join(' · ') : 'No hay órdenes abiertas'
})

const hora = (v) => { const d = parseUtc(v); return d ? d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false }) : '' }
const ESTADOS = {
  sin_confirmar: ['Sin confirmar', 'var(--amber)'], confirmado: ['Confirmado', 'var(--success)'], reprogramar: ['Reprogramar', 'var(--violet)'],
  ot_creada: ['OT creada', 'var(--primary-text)'], no_asistio: ['No asistió', 'var(--muted)'], cancelado: ['Cancelado', 'var(--danger)']
}
const textoEstado = (e) => ESTADOS[e]?.[0] || e
const colorEstado = (e) => ESTADOS[e]?.[1] || 'var(--muted)'

// Lista única, ordenada por urgencia: primero quien está esperando en el taller, después lo que se demora.
const tareasPendientes = computed(() => {
  const a = panel.value?.atencion; if (!a) return []
  const t = []
  for (const x of a.turnos_confirmados) t.push({ icono: 'calendar', tono: 'warn', titulo: `Turno confirmado a las ${hora(x.fecha_hora)}: falta generar la OT`, detalle: `${x.patente} · ${modeloUnidad(x.unidad)} · ${x.cliente}`, completo: x.unidad, accion: 'Abrir turno', to: { path: '/turnos', query: { turno: x.id } } })
  for (const x of a.listas) t.push({ icono: 'check', tono: 'ok', titulo: `OT ${x.ot} lista para controlar`, detalle: `${x.patente} · ${modeloUnidad(x.unidad)} · ${x.cliente}`, completo: x.unidad, accion: 'Controlar', to: { path: '/ordenes', query: { q: x.ot } } })
  for (const x of a.estancadas) t.push({ icono: 'clock', tono: 'danger', titulo: `OT ${x.ot} abierta hace ${x.dias} días`, detalle: `${x.patente} · ${modeloUnidad(x.unidad)} · ${x.estado_actual}`, completo: x.unidad, accion: 'Ver OT', to: { path: '/ordenes', query: { q: x.ot } } })
  for (const x of a.presupuestos) t.push({ icono: 'file', tono: 'warn', titulo: `Presupuesto de la OT ${x.ot} sin respuesta hace ${x.dias} días`, detalle: `${x.patente} · ${modeloUnidad(x.unidad)}${x.monto ? ' · ' + moneda(x.monto) : ''}`, completo: x.unidad, accion: 'Ver OT', to: { path: '/ordenes', query: { q: x.ot } } })
  return t
})

const MAX_FILAS = 8
const tareasVisibles = computed(() => tareasPendientes.value.slice(0, MAX_FILAS))

const cargar = async () => {
  cargando.value = true
  try {
    panel.value = await fetchJSON('/analitica/panel')
    if (puede('turno_ver') || puede('turno_gestionar')) {
      const f = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      const hoy = new Date(); const manana = new Date(); manana.setDate(manana.getDate() + 1)
      const lista = await fetchJSON(`/turnos?desde=${f(hoy)}&hasta=${f(manana)}`)
      agenda.value = lista.filter(t => !['cancelado', 'reprogramar'].includes(t.estado)).slice(0, 12)
    }
  } catch (err) { toast.error('No se pudo cargar el panel: ' + errMsg(err)) }
  finally { cargando.value = false }
}

let timer = null
onMounted(() => { cargar(); timer = setInterval(cargar, 60000) })
onBeforeUnmount(() => clearInterval(timer))
</script>

<style scoped>
.inicio__head { display: flex; align-items: flex-end; justify-content: space-between; flex-wrap: wrap; gap: 12px; margin-bottom: 22px; }
.inicio__head h2 { margin: 0; font-size: 1.5rem; }
.inicio__head p { margin: 2px 0 0; }
.inicio__head p::first-letter { text-transform: uppercase; }
.inicio__acciones { display: flex; gap: 8px; flex-wrap: wrap; }
.inicio__acciones .btn { text-decoration: none; }

.bloque { margin-bottom: 24px; }
.bloque__titulo { margin: 0 0 10px; font-size: 0.74rem; font-weight: 650; letter-spacing: 0.08em; text-transform: uppercase; color: var(--text-soft); text-transform: uppercase; }
.kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap: 14px; }

.dos { display: grid; grid-template-columns: minmax(0, 3fr) minmax(0, 2fr); gap: 16px; align-items: start; }
@media (max-width: 1050px) { .dos { grid-template-columns: 1fr; } }
.panel-lista { margin-bottom: 0; padding: 18px 20px 12px; }
.panel-lista h3 { margin-bottom: 8px; }
.lista { list-style: none; margin: 0; padding: 0; }
.fila { display: flex; align-items: center; gap: 12px; padding: 10px 0; border-top: 1px solid var(--border-soft); }
.fila:first-child { border-top: none; }
.fila--link { cursor: pointer; }
.fila--link:hover { background: var(--hover-row); margin: 0 -10px; padding-left: 10px; padding-right: 10px; border-radius: 8px; }
.fila__icono { width: 34px; height: 34px; flex-shrink: 0; border-radius: 9px; display: inline-flex; align-items: center; justify-content: center; font-size: 1.1rem; background: var(--chip-bg); color: var(--text-soft); }
.fila__icono--warn { background: var(--status-warn-bg); color: var(--status-warn-text); }
.fila__icono--danger { background: var(--status-danger-bg); color: var(--status-danger-text); }
.fila__icono--ok { background: var(--status-progress-bg); color: var(--status-progress-text); }
.fila__txt { display: grid; gap: 1px; min-width: 0; flex: 1; }
.fila__txt strong { font-size: 0.9rem; font-weight: 600; }
.fila__txt small { color: var(--muted); font-size: 0.8rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fila .btn { text-decoration: none; flex-shrink: 0; }
.hora { font-weight: 700; width: 44px; flex-shrink: 0; }
.estado { display: inline-flex; align-items: center; gap: 6px; font-size: 0.78rem; color: var(--text-soft); white-space: nowrap; }
.vacio { display: flex; align-items: center; gap: 8px; padding: 18px 0; color: var(--muted); }
.vacio .icon { color: var(--success); font-size: 1.2rem; }
.mas { font-size: 0.82rem; margin: 4px 0 8px; }
</style>
