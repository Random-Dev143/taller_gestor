import test from 'node:test'
import assert from 'node:assert/strict'

process.env.TZ = 'America/Argentina/Buenos_Aires'
const { agruparOrdenes, horasOcupadasOrden } = await import('../src/utils/ordenesMecanico.js')

const t = (id, ot, apertura, estado = 'Asignada', extra = {}) => ({
  id, ot, fecha_apertura: apertura, mi_estado: estado, patente: 'AA111BB', unidad: 'U', cliente: 'C',
  tiempo_estimado: 1, mi_tiempo_real: 0, ...extra
})

test('una tarjeta por OT, de la más vieja a la más nueva', () => {
  const r = agruparOrdenes([
    t(3, '300', '2026-10-03 12:00:00'), t(1, '100', '2026-10-01 12:00:00'), t(2, '200', '2026-10-02 12:00:00'),
    t(4, '100', '2026-10-01 12:00:00')
  ])
  assert.deepEqual(r.map(o => o.ot), ['100', '200', '300'])
  assert.equal(r[0].tareas.length, 2)
})

test('la OT con trabajo activo va primera aunque sea la más nueva', () => {
  const r = agruparOrdenes([
    t(1, '100', '2026-10-01 12:00:00'), t(2, '200', '2026-10-02 12:00:00'),
    t(3, '300', '2026-10-03 12:00:00', 'En Curso')
  ])
  assert.deepEqual(r.map(o => o.ot), ['300', '100', '200'])
  assert.equal(r[0].activa, true)
  assert.equal(r[1].activa, false)
})

test('dentro de la OT: la tarea en curso primero y el resto por orden de asignación', () => {
  const r = agruparOrdenes([
    t(5, '100', '2026-10-01 12:00:00'), t(9, '100', '2026-10-01 12:00:00', 'En Curso'), t(2, '100', '2026-10-01 12:00:00', 'Pausada')
  ])
  assert.deepEqual(r[0].tareas.map(x => x.id), [9, 2, 5])
})

test('tiempo asignado = suma de lo estimado; ocupado = propias + sesión viva', () => {
  const r = agruparOrdenes([
    t(1, '100', '2026-10-01 12:00:00', 'En Curso', { tiempo_estimado: 2, mi_tiempo_real: 0.5, mi_sesion_inicio: '2026-10-05 15:00:00' }),
    t(2, '100', '2026-10-01 12:00:00', 'Pausada', { tiempo_estimado: 1.5, mi_tiempo_real: 1 })
  ])
  assert.equal(r[0].asignado, 3.5)
  assert.equal(horasOcupadasOrden(r[0], Date.parse('2026-10-05T16:00:00Z')), 2.5) // 0.5 + 1 viva + 1
})

test('OT sin fecha de apertura va al final y no rompe el orden', () => {
  const r = agruparOrdenes([t(1, '100', null), t(2, '200', '2026-10-02 12:00:00')])
  assert.deepEqual(r.map(o => o.ot), ['200', '100'])
})
