// Descarga de archivos Excel (.xlsx) ya generados por el backend, abstrayendo
// la diferencia entre navegador y la app de escritorio Tauri (mismo criterio
// que usePdfOutput.js: en Tauri se usa el diálogo nativo "Guardar como").
import { useToast, errMsg } from './useToast'

const isTauri = () =>
  typeof window !== 'undefined' && window.__TAURI_INTERNALS__ !== undefined

const nombreSeguro = (filename) => (filename || 'planilla.xlsx').replace(/[\\/:*?"<>|]/g, '_')

export function useXlsxOutput() {
  const toast = useToast()

  const descargarXLSX = async (blob, filename = 'planilla.xlsx') => {
    const nombre = nombreSeguro(filename)

    if (isTauri()) {
      try {
        const { save } = await import('@tauri-apps/plugin-dialog')
        const { writeFile } = await import('@tauri-apps/plugin-fs')
        const destino = await save({
          defaultPath: nombre,
          filters: [{ name: 'Excel', extensions: ['xlsx'] }]
        })
        if (!destino) return false // el usuario canceló
        await writeFile(destino, new Uint8Array(await blob.arrayBuffer()))
        toast.success('Planilla guardada correctamente.')
        return true
      } catch (err) {
        toast.error('No se pudo guardar la planilla: ' + errMsg(err))
        return false
      }
    }

    const blobUrl = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = blobUrl
    a.download = nombre
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(blobUrl), 5000)
    return true
  }

  return { descargarXLSX, isTauri }
}
