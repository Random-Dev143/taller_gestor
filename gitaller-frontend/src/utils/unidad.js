// La unidad se guarda como "Marca TIPO, MODELO" (ej. "Iveco PESADOS, CURSOR 450E33"
// o "Chevrolet CAMIONETAS, S10 XLT"). En pantalla alcanza con el modelo: la marca y
// el tipo son ruido, y el texto completo sigue disponible como tooltip (ver `unidadCompleta`).
// No se toca el dato guardado: informes, PDFs y la planilla NPS siguen usando el texto completo.

const limpiar = (v) => String(v ?? '').replace(/\s+/g, ' ').trim()

// "Iveco PESADOS, CURSOR 450E33" -> "CURSOR 450E33"
// Si no hay coma (dato cargado a mano, "Daily 70C16") se muestra tal cual.
export function modeloUnidad(unidad) {
  const texto = limpiar(unidad)
  const i = texto.indexOf(',')
  if (i === -1) return texto
  const modelo = texto.slice(i + 1).trim()
  return modelo || texto.slice(0, i).trim()
}

// Texto completo para tooltips (title="...").
export const unidadCompleta = (unidad) => limpiar(unidad)
