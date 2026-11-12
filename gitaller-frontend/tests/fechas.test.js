// Corre con: npm test  (node --test, sin dependencias)
import test from 'node:test'
import assert from 'node:assert/strict'

// Hora de Argentina (GMT-3, sin horario de verano), como el taller.
process.env.TZ = 'America/Argentina/Buenos_Aires'

const { parseUtc, utcAInputLocal, inputLocalAUtc, fechaParaGuardar, diasDesde } = await import('../src/utils/fechas.js')
const { redondear1, formatoHoras, horasVivas } = await import('../src/utils/horas.js')

test('UTC de la base -> hora local del input (GMT-3)', () => {
  assert.equal(utcAInputLocal('2026-10-05 15:00:00'), '2026-10-05T12:00')
  assert.equal(utcAInputLocal('2026-10-05 02:30:00'), '2026-10-04T23:30') // cruza de día
  assert.equal(utcAInputLocal(null), '')
  assert.equal(utcAInputLocal('basura'), '')
})

test('hora local del input -> UTC de la base', () => {
  assert.equal(inputLocalAUtc('2026-10-05T12:00'), '2026-10-05 15:00:00')
  assert.equal(inputLocalAUtc('2026-10-04T23:30'), '2026-10-05 02:30:00')
  assert.equal(inputLocalAUtc(''), '')
})

test('ida y vuelta no corre la hora (el bug de +3 h por cada guardado)', () => {
  const original = '2026-10-05 15:00:00'
  let v = original
  for (let i = 0; i < 5; i++) v = inputLocalAUtc(utcAInputLocal(v)).slice(0, 16)
  assert.equal(v, original.slice(0, 16))
})

test('fechaParaGuardar: sin tocar reenvía el original (conserva los segundos)', () => {
  assert.equal(fechaParaGuardar('2026-10-05T12:00', '2026-10-05 15:00:37'), '2026-10-05 15:00:37')
})

test('fechaParaGuardar: si la persona cambia la hora se convierte a UTC', () => {
  assert.equal(fechaParaGuardar('2026-10-05T13:30', '2026-10-05 15:00:37'), '2026-10-05 16:30:00')
})

test('fechaParaGuardar: campo vacío no se modifica (undefined)', () => {
  assert.equal(fechaParaGuardar('', '2026-10-05 15:00:00'), undefined)
  assert.equal(fechaParaGuardar('2026-10-05T12:00', null), '2026-10-05 15:00:00')
})

test('parseUtc acepta con y sin zona y devuelve null si es inválida', () => {
  assert.equal(parseUtc('2026-10-05 15:00:00').toISOString(), '2026-10-05T15:00:00.000Z')
  assert.equal(parseUtc('2026-10-05T15:00:00Z').toISOString(), '2026-10-05T15:00:00.000Z')
  assert.equal(parseUtc('2026-10-05T15:00:00.000Z').toISOString(), '2026-10-05T15:00:00.000Z')
  assert.equal(parseUtc('x'), null)
})

test('diasDesde cuenta días sobre el instante UTC real', () => {
  const ahora = new Date('2026-10-12T15:00:00Z')
  assert.equal(diasDesde('2026-10-05 15:00:00', ahora), 7)
  assert.equal(diasDesde('2026-10-05 16:00:00', ahora), 6)
  assert.equal(diasDesde(null, ahora), 0)
})

test('redondear1: al décimo más cercano, para mostrar', () => {
  assert.equal(redondear1(1.2333333), 1.2)
  assert.equal(redondear1(1.25), 1.3)
  assert.equal(redondear1(1.15), 1.2)
  assert.equal(redondear1(0), 0)
  assert.equal(redondear1(null), 0)
  assert.equal(redondear1('2.04'), 2)
})

test('formatoHoras y horasVivas', () => {
  assert.equal(formatoHoras(1.5), '1:30:00')
  assert.equal(formatoHoras(0), '0:00:00')
  const inicio = '2026-10-05 15:00:00'
  const ahora = Date.parse('2026-10-05T16:30:00Z')
  assert.equal(horasVivas({ mi_tiempo_real: 1, mi_sesion_inicio: inicio }, ahora), 2.5)
  assert.equal(horasVivas({ mi_tiempo_real: 1 }, ahora), 1)
})
