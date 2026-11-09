import { useApi } from './useApi'
import { useToast, errMsg } from './useToast'
import { useConfigStore } from '../stores/useConfigStore'
import { usePdfOutput } from './usePdfOutput'

// Escapa el texto del usuario (antes se inyectaba tal cual en innerHTML, así que
// un "<" o un "&" escrito por el mecánico rompía o ensuciaba el PDF) y convierte
// los saltos de línea (Enter) en <br> para que se respeten en el documento.
const escaparHtml = (str) => String(str ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')

const textoAHtml = (str) => escaparHtml(str).replace(/\r\n|\r|\n/g, '<br>')

// Horas decimales (1.5) -> "1h 30m". El valor crudo de la base es un decimal
// largo (ej. 1.2833333), que mostrado tal cual con "hs" no se entiende.
const formatearDuracion = (horasDecimal) => {
  const totalMin = Math.round((Number(horasDecimal) || 0) * 60)
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  if (h === 0) return `${m}m`
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}

export function usePdfGenerator() {
  const { fetchJSON, API_BASE } = useApi()
  const toast = useToast()
  const configStore = useConfigStore()
  const { previsualizarPDF } = usePdfOutput()

  const generarExplicacionPDF = async (ot) => {
    try {
      // jsPDF + html2canvas pesan ~600kb juntos y antes se importaban de
      // forma estática al inicio del archivo, así que Vite los metía en el
      // bundle principal de la app (se descargaban en cada visita, aunque
      // la persona nunca generara un PDF). Con import() dinámico, Vite los
      // separa en un chunk aparte que solo se descarga la primera vez que
      // se llama a esta función.
      const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([
        import('jspdf'),
        import('html2canvas')
      ])

      const data = await fetchJSON(`/ordenes/${ot}/explicacion`)
      const { orden, explicacion, aportes, jefe, tiempos_mecanicos } = data
      const safeAportes = aportes || []

      // 1. Preparamos los arrays para separar las causas de las reparaciones
      // (cada ítem ya queda como HTML seguro: texto escapado + saltos de línea)
      let causasAgrupadas = explicacion?.causa ? [textoAHtml(explicacion.causa)] : []
      let reparacionesAgrupadas = []

      // Si el backend no manda tiempos_mecanicos (versión vieja), no se
      // muestra la hora por aporte salvo que el aporte tenga una cargada.
      const tiempoLegacy = (ap) => (Number(ap.horas) > 0 ? ` - ${formatearDuracion(ap.horas)}` : '')

      // 2. Analizamos cada aporte del mecánico
      safeAportes.forEach(ap => {
        let texto = ap.actividades || ''
        const quien = escaparHtml(ap.nombre || ap.legajo)

        // Si el texto tiene el formato estructurado del Modal del Mecánico...
        if (texto.includes('CAUSA DEL DESPERFECTO:')) {
          // Lo partimos en dos usando la etiqueta como tijera
          const partes = texto.split('REPARACIÓN REALIZADA:')
          const causaStr = partes[0].replace('CAUSA DEL DESPERFECTO:', '').trim()
          const repStr = partes[1] ? partes[1].trim() : ''

          // Guardamos cada parte en su lista correspondiente
          if (causaStr) causasAgrupadas.push(`• ${textoAHtml(causaStr)} (Mec: ${quien})`)
          if (repStr) reparacionesAgrupadas.push(`<div style="margin-bottom: 5px;">• ${textoAHtml(repStr)} <b>(Mec: ${quien}${tiempoLegacy(ap)})</b></div>`)
        } else {
          // Si es un aporte viejo que no tiene ese formato, va directo a reparación
          reparacionesAgrupadas.push(`<div style="margin-bottom: 5px;">• ${textoAHtml(texto)} <b>(Mec: ${quien}${tiempoLegacy(ap)})</b></div>`)
        }
      })

      // 3. Unimos los textos para inyectarlos en el HTML
      const textoCausasFinal = causasAgrupadas.join('<br>')
      let textoActividades = reparacionesAgrupadas.join('')
      if (!textoActividades) textoActividades = 'Sin registros de reparación aún.'

      // Tiempo real trabajado por cada mecánico en la OT (una sola vez por
      // mecánico, aunque haya escrito más de un aporte).
      const tiemposValidos = (tiempos_mecanicos || []).filter(t => Number(t.horas) > 0)
      if (tiemposValidos.length) {
        const detalle = tiemposValidos
          .map(t => `${escaparHtml(t.nombre || t.legajo)}${t.es_auxiliar ? ' (auxiliar)' : ''}: <b>${formatearDuracion(t.horas)}</b>`)
          .join(' &nbsp;|&nbsp; ')
        textoActividades += `<div style="margin-top: 8px; padding-top: 6px; border-top: 1px dashed #999;">Tiempo trabajado &rarr; ${detalle}</div>`
      }

      let firmaMecanico = ''
      if (safeAportes.length > 0) {
        if (safeAportes[0].firma_path) {
          firmaMecanico = `<img src="${API_BASE.replace('/api', '')}${safeAportes[0].firma_path}" style="max-height: 50px;">`
        } else {
          firmaMecanico = `<span style="font-family: monospace; font-size: 14px;">${safeAportes[0].nombre || safeAportes[0].legajo}</span>`
        }
      }

      let firmaJefe = ''
      if (orden.controlada && jefe) {
        if (jefe.firma_path) {
          firmaJefe = `<img src="${API_BASE.replace('/api', '')}${jefe.firma_path}" style="max-height: 50px;">`
        } else {
          firmaJefe = `<span style="font-family: monospace; font-size: 14px;">${jefe.nombre || jefe.legajo}</span>`
        }
      }

    const formatearFecha = (fechaStr) => {
        if (!fechaStr) return '';
        // Reemplaza el espacio por T y añade la Z de UTC
        const utcStr = fechaStr.includes('T') ? fechaStr : fechaStr.replace(' ', 'T') + 'Z';
        return new Date(utcStr).toLocaleDateString('es-AR');
      };

    
      const div = document.createElement('div')
      div.style.cssText = 'width: 800px; padding: 30px; font-family: Arial, sans-serif; background: white; color: black;'
      const conf = configStore.config || {};
      div.innerHTML = `
        <div style="font-size: 11px; line-height: 1.4;">
                <strong style="font-size: 14px;">${conf.nombre_taller || 'TALLER OFICIAL'}</strong><br>
                ${conf.slogan ? `${conf.slogan}<br>` : ''}
                ${conf.direccion ? `${conf.direccion}<br>` : ''}
                ${conf.cuit ? `CUIT: ${conf.cuit}<br>` : ''}
                ${conf.telefono ? `Taller: ${conf.telefono}<br>` : ''}
                ${conf.email ? `<span style="color: blue;">${conf.email}</span>` : ''}
        </div>
        <h2 style="text-align: right; color: #7f7f7f; font-weight: normal; margin-bottom: 5px;">DATOS DE ORDEN DE TRABAJO</h2>
        <table style="width: 100%; border-collapse: collapse; text-transform: uppercase; font-size: 11px;">
            <tr>
                <td style="border: 1px solid black; padding: 8px; font-weight: bold; width: 25%;">NOMBRE DEL CLIENTE</td>
                <td colspan="2" style="border: 1px solid black; padding: 8px;">${orden.cliente || ''}</td>
                <td style="border: 1px solid black; padding: 8px; font-weight: bold; width: 20%;">NUMERO DE ORDEN</td>
                <td style="border: 1px solid black; padding: 8px; font-weight: bold; font-size: 14px;">${orden.ot || ''}</td>
            </tr>
            <tr>
                <td style="border: 1px solid black; padding: 8px; font-weight: bold;">ALTA DE ORDEN</td>
                <td colspan="2" style="border: 1px solid black; padding: 8px;">${formatearFecha(orden.fecha_apertura)}</td>
                <td style="border: 1px solid black; padding: 8px; font-weight: bold;">CIERRE DE ORDEN</td>
                <td style="border: 1px solid black; padding: 8px;">${formatearFecha(orden.fecha_cierre)}</td>
            </tr>
            <tr>
                <td style="border: 1px solid black; padding: 8px; font-weight: bold;">MODELO</td>
                <td style="border: 1px solid black; padding: 8px;">${orden.unidad || ''}</td>
                <td style="border: 1px solid black; padding: 8px; font-weight: bold; text-align: center; width: 15%;">PATENTE</td>
                <td style="border: 1px solid black; padding: 8px;">${orden.patente || ''}</td>
                <td style="border: 1px solid black; padding: 8px; font-weight: bold;">KM: <span style="font-weight:normal;">${orden.kilometraje || ''}</span></td>
            </tr>
            <tr>
                <td style="border: 1px solid black; padding: 8px; font-weight: bold; vertical-align: top; height: 60px;">CAUSAS / PROBLEMAS</td>
                <td colspan="4" style="border: 1px solid black; padding: 8px; vertical-align: top;">${textoCausasFinal}</td>
            </tr>
            <tr>
                <td style="border: 1px solid black; padding: 8px; font-weight: bold; vertical-align: top; height: 120px;">REPARACION<br><span style="font-size: 9px; font-weight: normal;">(Registro de actividades)</span></td>
                <td colspan="4" style="border: 1px solid black; padding: 8px; vertical-align: top;">${textoActividades}</td>
            </tr>
        </table>
        <div style="display: flex; justify-content: space-between; margin-top: 80px; padding: 0 40px;">
            <div style="text-align: center; width: 200px; border-top: 1px solid black; padding-top: 5px;">
                <div style="height: 50px; display: flex; justify-content: center; align-items: flex-end; margin-top: -60px; margin-bottom: 10px;">
                    ${firmaMecanico}
                </div>
                <strong style="font-size: 12px;">Firma Mecánico</strong>
            </div>
            <div style="text-align: center; width: 200px; border-top: 1px solid black; padding-top: 5px;">
                <div style="height: 50px; display: flex; justify-content: center; align-items: flex-end; margin-top: -60px; margin-bottom: 10px;">
                    ${firmaJefe}
                </div>
                <strong style="font-size: 12px;">Firma Jefe de Taller</strong>
            </div>
        </div>
      `

      document.body.appendChild(div)

      setTimeout(async () => {
        try {
          const canvas = await html2canvas(div, { scale: 2, useCORS: true })
          const imgData = canvas.toDataURL('image/png')
          const pdf = new jsPDF('p', 'mm', 'a4')
          const imgWidth = 210
          const imgHeight = (canvas.height * imgWidth) / canvas.width
          
          // Con saltos de línea el contenido puede superar una hoja A4. Si es
          // así, se reparte en páginas; si entra en una, queda igual que antes.
          const alturaUtil = 287 // 297mm - 10mm de margen superior
          pdf.addImage(imgData, 'PNG', 0, 10, imgWidth, imgHeight)
          // Páginas siguientes: la misma imagen desplazada hacia arriba; lo
          // que queda fuera de la hoja no se imprime. Si entra en una hoja,
          // el bucle no corre y el resultado es idéntico al anterior.
          for (let n = 1; n * alturaUtil < imgHeight; n++) {
            pdf.addPage()
            pdf.addImage(imgData, 'PNG', 0, -n * alturaUtil, imgWidth, imgHeight)
          }
          const pdfBlob = pdf.output('blob')
          await previsualizarPDF(pdfBlob, `explicacion_ot_${orden.ot || ot}.pdf`)
          
          document.body.removeChild(div)
        } catch (err) {
          toast.error('Error generando PDF: ' + err.message)
          if (document.body.contains(div)) document.body.removeChild(div)
        }
      }, 500)

    } catch (err) {
      toast.error('Error al obtener datos para el PDF: ' + errMsg(err))
    }
  }

  return { generarExplicacionPDF }
}
