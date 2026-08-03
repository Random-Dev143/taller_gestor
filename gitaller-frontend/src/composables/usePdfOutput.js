// Composable central para "mostrar" y "descargar" un PDF ya generado
// (como Blob), abstrayendo la diferencia entre navegador y la app de
// escritorio Tauri.
//
// Por qué hace falta:
// - En el navegador, `window.open(blobUrl, '_blank')` abre una pestaña
//   nueva con el PDF, y `<a download>` dispara la descarga nativa.
// - El webview de Tauri NO soporta pestañas nuevas (no hay multi-window
//   por defecto) y bloquea/ignora la navegación a blob: URLs y el flujo
//   de descarga del navegador. Ahí hay que escribir el archivo a disco
//   con el plugin de fs y abrirlo con el lector de PDF del sistema
//   (plugin opener), o dejar elegir dónde guardarlo (plugin dialog).
import { useToast, errMsg } from './useToast'

const isTauri = () =>
  typeof window !== 'undefined' && window.__TAURI_INTERNALS__ !== undefined

async function blobToUint8Array(blob) {
  const buffer = await blob.arrayBuffer()
  return new Uint8Array(buffer)
}

// Sanitiza el nombre de archivo: sin espacios raros ni caracteres que
// puedan romper una ruta de Windows.
function nombreSeguro(filename) {
  return (filename || 'documento.pdf').replace(/[\\/:*?"<>|]/g, '_')
}

export function usePdfOutput() {
  const toast = useToast()

  // Previsualizar: en navegador abre una pestaña nueva. En Tauri escribe
  // un archivo temporal en la carpeta de caché de la app y lo abre con la
  // aplicación de PDF por defecto del sistema operativo.
  const previsualizarPDF = async (blob, filename = 'documento.pdf') => {
    const nombre = nombreSeguro(filename)

    if (isTauri()) {
      try {
        const { writeFile, mkdir, BaseDirectory } = await import('@tauri-apps/plugin-fs')
        const { openPath } = await import('@tauri-apps/plugin-opener')
        const { appCacheDir, join } = await import('@tauri-apps/api/path')

        await mkdir('pdf-preview', { baseDir: BaseDirectory.AppCache, recursive: true }).catch(() => {})

        const bytes = await blobToUint8Array(blob)
        await writeFile(`pdf-preview/${nombre}`, bytes, { baseDir: BaseDirectory.AppCache })

        const rutaCompleta = await join(await appCacheDir(), 'pdf-preview', nombre)
        await openPath(rutaCompleta)
      } catch (err) {
        toast.error('No se pudo abrir la previsualización: ' + errMsg(err))
      }
      return
    }

    // Navegador: comportamiento original, pestaña nueva con el blob.
    const blobUrl = URL.createObjectURL(blob)
    window.open(blobUrl, '_blank')
  }

  // Descargar: en navegador dispara la descarga estándar. En Tauri abre
  // el diálogo nativo "Guardar como" y escribe el archivo ahí.
  const descargarPDF = async (blob, filename = 'documento.pdf') => {
    const nombre = nombreSeguro(filename)

    if (isTauri()) {
      try {
        const { save } = await import('@tauri-apps/plugin-dialog')
        const { writeFile } = await import('@tauri-apps/plugin-fs')

        const destino = await save({
          defaultPath: nombre,
          filters: [{ name: 'PDF', extensions: ['pdf'] }]
        })
        if (!destino) return // el usuario canceló el diálogo

        const bytes = await blobToUint8Array(blob)
        await writeFile(destino, bytes)
        toast.success('PDF guardado correctamente.')
      } catch (err) {
        toast.error('No se pudo guardar el PDF: ' + errMsg(err))
      }
      return
    }

    // Navegador: link temporal con atributo download.
    const blobUrl = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = blobUrl
    a.download = nombre
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(blobUrl), 5000)
  }

  return { previsualizarPDF, descargarPDF, isTauri }
}
