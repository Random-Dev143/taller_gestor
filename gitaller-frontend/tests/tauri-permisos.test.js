// Cada API de Tauri que el código usa necesita su permiso en src-tauri/capabilities/*.json.
// Si falta, la llamada es rechazada en silencio recién al ejecutar la app compilada. Caso real:
// App.vue llamaba a getCurrentWindow().destroy() sin `core:window:allow-destroy` y la X de la
// ventana quedaba muerta (el cierre normal ya estaba cancelado con preventDefault()).
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const raiz = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

const leerPermisos = () => {
  const dir = path.join(raiz, 'src-tauri', 'capabilities')
  const ids = new Set()
  for (const f of fs.readdirSync(dir).filter(x => x.endsWith('.json'))) {
    for (const p of JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')).permissions || []) {
      ids.add(typeof p === 'string' ? p : p.identifier)
    }
  }
  return ids
}

const archivosFuente = (dir, acc = []) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const ruta = path.join(dir, e.name)
    if (e.isDirectory()) archivosFuente(ruta, acc)
    else if (/\.(vue|js)$/.test(e.name)) acc.push(ruta)
  }
  return acc
}

// patrón en el código -> permisos que lo habilitan (cualquiera de la lista alcanza)
const REGLAS = [
  { uso: 'ventana.destroy()', patron: /getCurrentWindow\(\)\.destroy\(/, permisos: ['core:window:allow-destroy'] },
  { uso: 'ventana.close()', patron: /getCurrentWindow\(\)\.close\(/, permisos: ['core:window:allow-close'] },
  { uso: 'ventana.minimize()', patron: /getCurrentWindow\(\)\.minimize\(/, permisos: ['core:window:allow-minimize'] },
  { uso: 'ventana.maximize()', patron: /getCurrentWindow\(\)\.(toggleMaximize|maximize)\(/, permisos: ['core:window:allow-maximize', 'core:window:allow-toggle-maximize'] },
  { uso: 'ventana.setTitle()', patron: /getCurrentWindow\(\)\.setTitle\(/, permisos: ['core:window:allow-set-title'] },
  { uso: 'dialog.save()', patron: /\{\s*save\s*\}\s*=\s*await import\(['"]@tauri-apps\/plugin-dialog['"]\)/, permisos: ['dialog:allow-save', 'dialog:default'] },
  { uso: 'dialog.open()', patron: /\{\s*open\s*\}\s*=\s*await import\(['"]@tauri-apps\/plugin-dialog['"]\)/, permisos: ['dialog:allow-open', 'dialog:default'] },
  { uso: 'process.exit()', patron: /import\s*\{[^}]*\bexit\b[^}]*\}\s*from\s*['"]@tauri-apps\/plugin-process['"]/, permisos: ['process:allow-exit', 'process:default'] },
  { uso: 'process.relaunch()', patron: /import\s*\{[^}]*\brelaunch\b[^}]*\}\s*from\s*['"]@tauri-apps\/plugin-process['"]/, permisos: ['process:allow-restart', 'process:default'] },
  { uso: 'fs.writeFile()', patron: /\{[^}]*\bwriteFile\b[^}]*\}\s*=\s*await import\(['"]@tauri-apps\/plugin-fs['"]\)/, permisos: ['fs:allow-write-file'] },
  { uso: 'fs.readTextFile()', patron: /\{[^}]*\breadTextFile\b[^}]*\}\s*=\s*await import\(['"]@tauri-apps\/plugin-fs['"]\)/, permisos: ['fs:allow-read-text-file'] }
]

test('cada API de Tauri usada en el código tiene su permiso declarado', () => {
  const concedidos = leerPermisos()
  const codigo = archivosFuente(path.join(raiz, 'src')).map(f => ({ f, s: fs.readFileSync(f, 'utf8') }))
  const faltantes = []
  for (const { uso, patron, permisos } of REGLAS) {
    const donde = codigo.filter(c => patron.test(c.s)).map(c => path.relative(raiz, c.f))
    if (donde.length && !permisos.some(p => concedidos.has(p))) {
      faltantes.push(`${uso} (usado en ${donde.join(', ')}) necesita "${permisos[0]}" en src-tauri/capabilities/`)
    }
  }
  assert.deepEqual(faltantes, [])
})

test('la X de la ventana: App.vue cierra con destroy() y tiene respaldo con exit()', () => {
  const app = fs.readFileSync(path.join(raiz, 'src', 'App.vue'), 'utf8')
  assert.match(app, /onCloseRequested/)
  assert.match(app, /\.destroy\(\)/)
  assert.match(app, /exit\(0\)/, 'si destroy() fallara, exit() debe cerrar la app igual')
})
