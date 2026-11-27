<template>
  <div class="cruzados">
    <div class="header-row">
      <div class="rango">
        <label>Desde <input type="date" v-model="desde" @change="cargar" /></label>
        <label>Hasta <input type="date" v-model="hasta" @change="cargar" /></label>
      </div>
      <div class="presets">
        <button class="btn btn-secondary btn-sm" @click="preset('30')">Últimos 30 días</button>
        <button class="btn btn-secondary btn-sm" @click="preset('mes')">Este mes</button>
        <button class="btn btn-secondary btn-sm" @click="preset('mesAnt')">Mes anterior</button>
        <button class="btn btn-secondary btn-sm" @click="preset('90')">90 días</button>
      </div>
    </div>

    <div v-if="cargando && !d" class="loading-state"><div class="spinner"></div>Calculando...</div>
    <template v-else-if="d">
      <!-- ═══ KPIs ═══ -->
      <div class="kpis">
        <KpiCard label="Asistencia a turnos" icon="check" :value="porcentaje(d.asistencia.pct_asistencia, 1)"
          :sub="`${d.asistencia.llegaron} de ${d.asistencia.vencidos} turnos vencidos llegaron`" :tone="tonoMin(d.asistencia.pct_asistencia, 80, 60)" />
        <KpiCard label="No-show" icon="alert" :value="porcentaje(d.asistencia.pct_no_show, 1)"
          :sub="`Cancelados: ${porcentaje(d.asistencia.pct_cancelados, 1)} de los agendados`" :tone="tonoMax(d.asistencia.pct_no_show, 15, 30)" />
        <KpiCard label="Aprobación de presupuestos" icon="file" :value="porcentaje(d.presupuestos.pct_aprobacion, 1)"
          :sub="`${d.presupuestos.respondidos} respondidos de ${d.presupuestos.cantidad} cargados`" :tone="tonoMin(d.presupuestos.pct_aprobacion, 70, 50)" />
        <KpiCard label="Presupuestado" icon="trend" :value="moneda(d.presupuestos.monto_total)"
          :sub="`Aprobado: ${moneda(estado('aprobado').monto)} · Pendiente: ${moneda(estado('pendiente').monto)}`" tone="primary" />
        <KpiCard label="Llegan a horario" icon="clock" :value="porcentaje(d.puntualidad.pct_a_horario, 1)"
          :sub="d.puntualidad.con_ot ? `Demora promedio ${d.puntualidad.minutos_promedio} min (±30 min = a horario)` : 'Todavía no hay turnos con OT'" :tone="tonoMin(d.puntualidad.pct_a_horario, 70, 50)" />
        <KpiCard label="Estimado vs real" icon="target" :value="d.estimado_vs_real.desvio_pct === null ? '—' : `${d.estimado_vs_real.desvio_pct > 0 ? '+' : ''}${numero(d.estimado_vs_real.desvio_pct, 1)}%`"
          :sub="d.estimado_vs_real.ots ? `${d.estimado_vs_real.horas_reales} h reales vs ${d.estimado_vs_real.horas_estimadas} h estimadas (${d.estimado_vs_real.ots} OT)` : 'Sin OT finalizadas con horas estimadas'"
          :tone="d.estimado_vs_real.desvio_pct === null ? 'neutral' : Math.abs(d.estimado_vs_real.desvio_pct) <= 15 ? 'ok' : 'warn'" />
        <KpiCard label="OT con turno" icon="calendar" :value="porcentaje(d.origen_ots.pct_con_turno, 1)"
          :sub="`${d.origen_ots.con_turno} con turno · ${d.origen_ots.mostrador} por mostrador`" tone="primary" />
        <KpiCard label="Retrabajos" icon="wrench" :value="porcentaje(d.origen_ots.pct_retrabajo, 1)"
          :sub="`${d.origen_ots.retrabajos} de ${d.origen_ots.total} OT abiertas · ${d.origen_ots.garantias} garantías`" :tone="tonoMax(d.origen_ots.pct_retrabajo, 3, 8)" />
      </div>

      <div class="dos">
        <!-- ═══ Embudo ═══ -->
        <section class="card">
          <h3>Del turno a la facturación</h3>
          <p class="text-muted nota">Cada etapa cuenta los turnos del período que llegaron hasta ahí.</p>
          <ol class="embudo">
            <li v-for="e in d.embudo" :key="e.clave">
              <div class="embudo__cab">
                <span>{{ e.etiqueta }}</span>
                <span class="num"><strong>{{ e.n }}</strong>
                  <small v-if="e.pct_base !== null"> · {{ porcentaje(e.pct_base, 0) }} {{ e.base_texto }}</small></span>
              </div>
              <div class="barra"><div class="barra__fill" :style="{ width: (e.pct_total || 0) + '%' }"></div></div>
            </li>
          </ol>
          <p class="salidas num">
            Fuera del embudo: <strong>{{ salidas.no_asistio }}</strong> no asistieron · <strong>{{ salidas.cancelados }}</strong> cancelados · <strong>{{ salidas.reprogramar }}</strong> a reprogramar
          </p>
        </section>

        <!-- ═══ Por día de la semana ═══ -->
        <section class="card">
          <h3>Turnos por día de la semana</h3>
          <p class="text-muted nota">Sirve para ver qué días conviene reforzar la confirmación.</p>
          <ul class="dias">
            <li v-for="x in d.por_dia" :key="x.dia">
              <span class="dias__n">{{ x.dia }}</span>
              <div class="apilada" :title="`${x.llegaron} llegaron · ${x.no_asistio} no asistieron · ${x.total - x.llegaron - x.no_asistio} otros`">
                <span class="apilada__ok" :style="{ width: ancho(x.llegaron) }"></span>
                <span class="apilada__no" :style="{ width: ancho(x.no_asistio) }"></span>
                <span class="apilada__otro" :style="{ width: ancho(x.total - x.llegaron - x.no_asistio) }"></span>
              </div>
              <span class="dias__t num">{{ x.total }}</span>
            </li>
          </ul>
          <div class="leyenda"><span><i class="c-ok"></i>Llegaron</span><span><i class="c-no"></i>No asistieron</span><span><i class="c-otro"></i>Pendientes / otros</span></div>

          <div class="mini">
            <div>
              <h4>Tipo de turno</h4>
              <ul><li v-for="t in d.por_tipo" :key="t.tipo"><span>{{ nombreTipo(t.tipo) }}</span><strong class="num">{{ t.total }}</strong></li></ul>
            </div>
            <div>
              <h4>Cómo se confirmaron</h4>
              <ul><li v-for="c in d.confirmacion" :key="c.via"><span>{{ nombreVia(c.via) }}</span><strong class="num">{{ c.total }}</strong></li></ul>
            </div>
          </div>
        </section>
      </div>

      <!-- ═══ Presupuestos ═══ -->
      <div class="dos">
        <section class="card">
          <h3>Presupuestos por estado</h3>
          <div class="table-wrapper">
            <table>
              <thead><tr><th>Estado</th><th class="r">Cantidad</th><th class="r">Monto</th></tr></thead>
              <tbody>
                <tr v-for="e in d.presupuestos.por_estado" :key="e.estado">
                  <td><span class="status-tag" :class="claseEstado(e.estado)">{{ nombreEstado(e.estado) }}</span></td>
                  <td class="r num">{{ e.cantidad }}</td>
                  <td class="r num">{{ moneda(e.monto) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p class="pie num">
            Respuesta promedio: <strong>{{ d.presupuestos.horas_respuesta_promedio === null ? '—' : formatoHoras(d.presupuestos.horas_respuesta_promedio) }}</strong>
            · Ampliaciones o nuevas versiones: <strong>{{ porcentaje(d.presupuestos.pct_revisiones, 0) }}</strong>
          </p>
          <p v-if="d.presupuestos.aprobados_finalizados.ots" class="pie num">
            De los aprobados, <strong>{{ d.presupuestos.aprobados_finalizados.ots }}</strong> OT ya finalizaron y se facturaron por <strong>{{ moneda(d.presupuestos.aprobados_finalizados.facturado) }}</strong>.
          </p>
        </section>

        <section class="card">
          <h3>Presupuestos esperando respuesta</h3>
          <p class="text-muted nota">Con más de {{ d.presupuestos.umbral_dias }} días sin respuesta. Son los que conviene llamar.</p>
          <div v-if="d.presupuestos.sin_respuesta_antiguos.length" class="table-wrapper">
            <table>
              <thead><tr><th>OT</th><th>Vehículo</th><th class="r">Días</th><th class="r">Monto</th></tr></thead>
              <tbody>
                <tr v-for="p in d.presupuestos.sin_respuesta_antiguos" :key="p.id" class="clic" @click="$router.push({ path: '/ordenes', query: { q: p.ot } })">
                  <td><strong>{{ p.ot }}</strong></td>
                  <td><span class="patente patente--mini">{{ p.patente }}</span> <span :title="$unidadCompleta(p.unidad)">{{ $modelo(p.unidad) }}</span><br><small class="text-muted">{{ p.cliente }}</small></td>
                  <td class="r num">{{ p.dias }}</td>
                  <td class="r num">{{ p.monto ? moneda(p.monto) : '—' }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p v-else class="vacio"><AppIcon name="check" /> No hay presupuestos demorados.</p>
        </section>
      </div>

      <details class="definiciones">
        <summary>Cómo se calculan estas cifras</summary>
        <ul>
          <li><strong>Asistencia / no-show:</strong> sobre los turnos del período que ya pasaron (antes de hoy), sin contar cancelados ni a reprogramar. "Llegó" = se generó la OT.</li>
          <li><strong>Embudo:</strong> cada turno cuenta en una etapa si cumplió esa condición. "Con presupuesto" y "aprobado" miran los PDF cargados en el legajo de la OT.</li>
          <li><strong>Llegan a horario:</strong> diferencia entre la hora del turno y la apertura de la OT; hasta 30 minutos se considera a horario.</li>
          <li><strong>Estimado vs real:</strong> horas estimadas al dar el turno contra horas empleadas, solo en OT finalizadas.</li>
          <li><strong>Presupuestos:</strong> se cuentan por fecha de carga. La aprobación parcial cuenta como aprobada. Los dados de baja no se incluyen.</li>
        </ul>
      </details>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useApi } from '../../composables/useApi'
import { useToast, errMsg } from '../../composables/useToast'
import { moneda, numero, porcentaje } from '../../utils/formato'
import KpiCard from '../common/KpiCard.vue'

const { fetchJSON } = useApi()
const toast = useToast()

const pad = (n) => String(n).padStart(2, '0')
const iso = (f) => `${f.getFullYear()}-${pad(f.getMonth() + 1)}-${pad(f.getDate())}`
const hoy = new Date()
const haceDias = (n) => { const f = new Date(); f.setDate(f.getDate() - n); return iso(f) }
const desde = ref(haceDias(29))
const hasta = ref(iso(hoy))
const d = ref(null)
const cargando = ref(false)

const cargar = async () => {
  if (desde.value > hasta.value) { toast.error('La fecha "Desde" no puede ser posterior a "Hasta"'); return }
  cargando.value = true
  try { d.value = await fetchJSON(`/analitica/turnos-presupuestos?desde=${desde.value}&hasta=${hasta.value}`) }
  catch (err) { toast.error(errMsg(err)) }
  finally { cargando.value = false }
}

const preset = (clave) => {
  const h = new Date()
  if (clave === '30') { desde.value = haceDias(29); hasta.value = iso(h) }
  if (clave === '90') { desde.value = haceDias(89); hasta.value = iso(h) }
  if (clave === 'mes') { desde.value = iso(new Date(h.getFullYear(), h.getMonth(), 1)); hasta.value = iso(h) }
  if (clave === 'mesAnt') { desde.value = iso(new Date(h.getFullYear(), h.getMonth() - 1, 1)); hasta.value = iso(new Date(h.getFullYear(), h.getMonth(), 0)) }
  cargar()
}

// Semáforos: más es mejor (asistencia) o menos es mejor (no-show, retrabajos).
const tonoMin = (v, ok, warn) => v === null || v === undefined ? 'neutral' : v >= ok ? 'ok' : v >= warn ? 'warn' : 'danger'
const tonoMax = (v, ok, warn) => v === null || v === undefined ? 'neutral' : v <= ok ? 'ok' : v <= warn ? 'warn' : 'danger'

const estado = (e) => d.value.presupuestos.por_estado.find(x => x.estado === e) || { cantidad: 0, monto: 0 }
const salidas = computed(() => d.value.asistencia)
const maxDia = computed(() => Math.max(1, ...d.value.por_dia.map(x => x.total)))
const ancho = (n) => `${(n / maxDia.value) * 100}%`

const NOMBRE_TIPO = { normal: 'Normales', garantia: 'Garantías', retrabajo: 'Retrabajos' }
const NOMBRE_VIA = { llamado: 'Por llamado', asesor: 'Marcado por el asesor', otorgado_con_antelacion: 'Otorgado con poca antelación', email: 'Por correo', sin_confirmar: 'Sin confirmar' }
const nombreTipo = (t) => NOMBRE_TIPO[t] || t
const nombreVia = (v) => NOMBRE_VIA[v] || v
const NOMBRE_ESTADO = { pendiente: 'Pendiente', aprobado: 'Aprobado', aprobado_parcial: 'Aprobado parcial', rechazado: 'Rechazado' }
const CLASE_ESTADO = { pendiente: 'status-warn', aprobado: 'status-progress', aprobado_parcial: 'status-done', rechazado: 'status-danger' }
const nombreEstado = (e) => NOMBRE_ESTADO[e] || e
const claseEstado = (e) => CLASE_ESTADO[e] || ''
const formatoHoras = (h) => h < 48 ? `${numero(h, 1)} h` : `${numero(h / 24, 1)} días`

onMounted(cargar)
</script>

<style scoped>
.rango { display: flex; gap: 14px; flex-wrap: wrap; }
.rango label { display: inline-flex; align-items: center; gap: 8px; font-size: 0.88rem; color: var(--text-soft); }
.rango input { width: auto; }
.presets { display: flex; gap: 6px; flex-wrap: wrap; margin-left: auto; }
.kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 14px; margin-bottom: 20px; }
.dos { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; margin-bottom: 16px; align-items: start; }
@media (max-width: 1100px) { .dos { grid-template-columns: 1fr; } }
.card { margin-bottom: 0; }
.card h3 { margin-bottom: 2px; }
.nota { font-size: 0.84rem; margin: 0 0 14px; }

.embudo { list-style: none; margin: 0; padding: 0; display: grid; gap: 12px; }
.embudo__cab { display: flex; justify-content: space-between; gap: 12px; font-size: 0.88rem; margin-bottom: 4px; }
.embudo__cab small { color: var(--muted); }
.barra { height: 10px; background: var(--border-soft); border-radius: 6px; overflow: hidden; }
.barra__fill { height: 100%; background: var(--primary); border-radius: 6px; min-width: 2px; }
.salidas { margin: 16px 0 0; padding-top: 12px; border-top: 1px solid var(--border-soft); font-size: 0.84rem; color: var(--text-soft); }

.dias { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
.dias li { display: grid; grid-template-columns: 34px 1fr 28px; align-items: center; gap: 10px; }
.dias__n { font-size: 0.82rem; font-weight: 600; color: var(--text-soft); }
.dias__t { text-align: right; font-weight: 650; font-size: 0.86rem; }
.apilada { display: flex; height: 14px; background: var(--border-soft); border-radius: 6px; overflow: hidden; }
.apilada__ok { background: var(--success); } .apilada__no { background: var(--danger); } .apilada__otro { background: var(--muted); opacity: 0.55; }
.leyenda { display: flex; flex-wrap: wrap; gap: 14px; margin: 12px 0 0; font-size: 0.78rem; color: var(--text-soft); }
.leyenda i { display: inline-block; width: 10px; height: 10px; border-radius: 3px; margin-right: 6px; }
.c-ok { background: var(--success); } .c-no { background: var(--danger); } .c-otro { background: var(--muted); opacity: 0.55; }
.mini { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-top: 18px; padding-top: 14px; border-top: 1px solid var(--border-soft); }
.mini h4 { margin: 0 0 6px; font-size: 0.74rem; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-soft); }
.mini ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; font-size: 0.86rem; }
.mini li { display: flex; justify-content: space-between; gap: 10px; }

.r { text-align: right; }
.clic { cursor: pointer; }
.pie { margin: 12px 0 0; font-size: 0.86rem; color: var(--text-soft); }
.vacio { display: flex; align-items: center; gap: 8px; padding: 12px 0; color: var(--muted); }
.vacio .icon { color: var(--success); }
.definiciones { margin-top: 8px; font-size: 0.86rem; color: var(--text-soft); }
.definiciones summary { cursor: pointer; font-weight: 600; }
.definiciones ul { margin: 8px 0 0; padding-left: 18px; display: grid; gap: 4px; }
</style>
