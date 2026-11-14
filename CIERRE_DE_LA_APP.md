# Cierre de la app (botón X)

## Qué pasaba
`App.vue` cancela el cierre normal de la ventana (`event.preventDefault()`) para hacer un checkpoint de la base antes
de salir, y después cierra "a mano" con `getCurrentWindow().destroy()`. En Tauri 2 `destroy()` exige el permiso
**`core:window:allow-destroy`**, que es distinto de `allow-close` y no viene en `core:default`. Como no estaba declarado,
`destroy()` era rechazado en silencio y la ventana quedaba trabada: la X no hacía nada.

## Qué se corrigió
- `src-tauri/capabilities/default.json`: se agregó `core:window:allow-destroy` (cierre) y `dialog:allow-open`
  (botón "Examinar…" de la carpeta de informes, que tampoco estaba autorizado).
- `App.vue`: si `destroy()` fallara por cualquier motivo, se cierra con `exit(0)` (`process:default` ya lo permite) y
  Rust detiene el backend. Un segundo clic en la X ya no lanza otro checkpoint, y el watchdog no intenta revivir el
  backend mientras se está cerrando.
- Backup (`utils/cron.js`): ahora se escribe en `taller_*.db.tmp` y se renombra al terminar. Un archivo `.db` de backup
  siempre está completo, aunque el cierre mate al servidor a mitad. Los `.tmp` viejos (> 1 h) se limpian solos y no
  cuentan para la rotación.

## Sobre la base de datos al cerrar
SQLite en modo WAL es atómico ante la muerte del proceso: un `kill` del backend no la corrompe. Lo que se hace antes
de cerrar es un checkpoint (`wal_checkpoint(TRUNCATE)`) para dejar todo volcado en el `.db` principal, y además el
backend hace uno solo cada 3 minutos.

## Regla para el futuro
Cada API de Tauri que se use en el código necesita su permiso en `src-tauri/capabilities/`. La prueba
`tests/tauri-permisos.test.js` (`npm test` en el frontend) falla si falta alguno de los que usa la app.
