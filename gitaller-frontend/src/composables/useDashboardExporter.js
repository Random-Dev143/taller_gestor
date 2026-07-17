import { useToast } from './useToast'

/**
 * Exportador de dashboards a PDF con paginación "consciente de bloques".
 *
 * El enfoque ingenuo (una sola captura gigante de toda la pantalla) rompe
 * cualquier gráfico que quede justo en el borde de una hoja A4, porque
 * jsPDF no sabe dónde puede cortar una imagen sin arruinarla. Acá se hace
 * lo contrario: cada sección del dashboard (KPIs, cada gráfico, cada tabla)
 * se captura como una imagen INDEPENDIENTE, y el armado del PDF decide,
 * bloque por bloque, si entra en el espacio restante de la página actual
 * o si conviene saltar a una hoja nueva — nunca corta un bloque a la mitad.
 * Si un bloque individual es más alto que una página completa (por ejemplo
 * una tabla muy larga), se lo escala para que entre entero en una sola hoja.
 */
export function useDashboardExporter() {
  const toast = useToast()

  const PAGE_W = 210   // A4 vertical, en mm
  const PAGE_H = 297
  const MARGIN = 12

  const exportarDashboardPDF = async ({ titulo, subtitulo, blocks, filename }) => {
    const elementos = blocks.filter(Boolean)
    if (elementos.length === 0) {
      toast.error('No hay contenido para exportar todavía.')
      return
    }

    try {
      // Mismo criterio que en usePdfGenerator.js: se cargan estas librerías
      // pesadas recién cuando hace falta generar un PDF, no en el bundle
      // inicial de la app.
      const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([
        import('jspdf'),
        import('html2canvas')
      ])

      const pdf = new jsPDF('p', 'mm', 'a4')
      const usableWidth = PAGE_W - MARGIN * 2
      let cursorY = MARGIN
      let pagina = 1

      const dibujarEncabezado = () => {
        pdf.setFontSize(15)
        pdf.setTextColor(0, 86, 167)
        pdf.text(titulo, MARGIN, cursorY)
        cursorY += 6
        if (subtitulo) {
          pdf.setFontSize(9)
          pdf.setTextColor(100, 100, 100)
          pdf.text(subtitulo, MARGIN, cursorY)
          cursorY += 6
        }
        pdf.setDrawColor(220, 220, 220)
        pdf.line(MARGIN, cursorY, PAGE_W - MARGIN, cursorY)
        cursorY += 6
        pdf.setTextColor(0, 0, 0)
      }

      const dibujarPiePagina = () => {
        pdf.setFontSize(8)
        pdf.setTextColor(150, 150, 150)
        const fecha = new Date().toLocaleString('es-AR')
        pdf.text(`IVEMAR · Generado el ${fecha}`, MARGIN, PAGE_H - 6)
        pdf.text(`Página ${pagina}`, PAGE_W - MARGIN - 15, PAGE_H - 6)
        pdf.setTextColor(0, 0, 0)
      }

      dibujarEncabezado()

      for (const el of elementos) {
        // Se capturan solo estos nodos del DOM real (no toda la pantalla),
        // por eso cada gráfico/tabla queda como una imagen atómica.
        const canvas = await html2canvas(el, {
          scale: 2,
          useCORS: true,
          backgroundColor: '#ffffff'
        })
        const imgData = canvas.toDataURL('image/png')

        let imgWidth = usableWidth
        let imgHeight = (canvas.height * imgWidth) / canvas.width

        const maxHeightEnPagina = PAGE_H - MARGIN * 2
        // Bloque más alto que una hoja entera: se reescala para que entre
        // completo en una sola página en vez de cortarse.
        if (imgHeight > maxHeightEnPagina) {
          imgHeight = maxHeightEnPagina
          imgWidth = (canvas.width * imgHeight) / canvas.height
        }

        // Si no entra en lo que queda de la página actual, se pasa de hoja
        // ANTES de dibujar (así el bloque nunca queda partido al medio).
        if (cursorY + imgHeight > PAGE_H - MARGIN) {
          dibujarPiePagina()
          pdf.addPage()
          pagina++
          cursorY = MARGIN
        }

        const x = MARGIN + (usableWidth - imgWidth) / 2
        pdf.addImage(imgData, 'PNG', x, cursorY, imgWidth, imgHeight)
        cursorY += imgHeight + 6
      }

      dibujarPiePagina()

      const blob = pdf.output('blob')
      const blobUrl = URL.createObjectURL(blob)

      // Igual que el resto del sistema: se previsualiza en una pestaña nueva
      // en vez de forzar la descarga directa.
      window.open(blobUrl, '_blank')

      return { pdf, blobUrl, descargar: () => pdf.save(filename || 'informe.pdf') }
    } catch (err) {
      toast.error('Error generando el PDF del dashboard: ' + err.message)
    }
  }

  return { exportarDashboardPDF }
}
