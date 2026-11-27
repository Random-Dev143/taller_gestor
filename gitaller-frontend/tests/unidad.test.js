import test from 'node:test'
import assert from 'node:assert/strict'
import { modeloUnidad, unidadCompleta } from '../src/utils/unidad.js'

test('muestra solo el modelo cuando viene "Marca TIPO, MODELO"', () => {
  assert.equal(modeloUnidad('Iveco PESADOS, CURSOR 450E33'), 'CURSOR 450E33')
  assert.equal(modeloUnidad('Chevrolet CAMIONETAS, S10 XLT'), 'S10 XLT')
})

test('si el modelo tiene comas, conserva todo lo que sigue a la primera', () => {
  assert.equal(modeloUnidad('Iveco LIVIANOS, DAILY 70C16, 2020'), 'DAILY 70C16, 2020')
})

test('sin coma devuelve el texto tal cual (dato cargado a mano)', () => {
  assert.equal(modeloUnidad('Daily 70C16'), 'Daily 70C16')
})

test('tolera espacios raros, vacíos y valores nulos', () => {
  assert.equal(modeloUnidad('  Iveco   PESADOS ,   CURSOR  450E33  '), 'CURSOR 450E33')
  assert.equal(modeloUnidad(''), '')
  assert.equal(modeloUnidad(null), '')
  assert.equal(modeloUnidad(undefined), '')
})

test('si después de la coma no hay nada, no deja la unidad en blanco', () => {
  assert.equal(modeloUnidad('Iveco PESADOS,'), 'Iveco PESADOS')
})

test('unidadCompleta normaliza espacios para el tooltip', () => {
  assert.equal(unidadCompleta('  Iveco  PESADOS,  CURSOR 450E33 '), 'Iveco PESADOS, CURSOR 450E33')
})
