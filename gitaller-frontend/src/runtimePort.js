// src/runtimePort.js
//
// El puerto del backend se define en runtime (pantalla de Configuración,
// guardado en la tabla `configuracion`), no en tiempo de build. Antes,
// useApi.js solo sabía leer `VITE_API_PORT` (una variable fijada al
// compilar) o el default 5881 — si alguien cambiaba el puerto desde la
// app, el frontend ya compilado (el .exe de Tauri) quedaba sin enterarse
// y dejaba de poder conectarse.
//
// Este módulo resuelve eso para clientes Tauri (PC servidor o PC cliente
// corriendo el .exe): al arrancar server.js escribe el puerto real en el
// que quedó escuchando en `%APPDATA%\GITaller\runtime-port.json` (ver
// server.js, dentro de iniciarServidor). Acá lo leemos ANTES de montar la
// app, para que useApi.js arme la URL base contra el puerto correcto
// desde el primer request.
//
// Los clientes que entran por navegador (celulares, TV, por red local)
// no tienen acceso al filesystem del servidor, así que para ellos este
// mecanismo no aplica — siguen dependiendo de VITE_API_PORT/el default
// 5881, o de que se les pase el puerto correcto en la URL si el taller
// cambió el default.

let runtimePort = null;

export async function initRuntimePort() {
    const isTauri = typeof window !== 'undefined' && window.__TAURI_INTERNALS__ !== undefined;
    if (!isTauri) return; // navegador por red: no hay filesystem que leer

    try {
        const { dataDir, join } = await import('@tauri-apps/api/path');
        const { readTextFile, exists } = await import('@tauri-apps/plugin-fs');

        // dataDir() = %APPDATA% en Windows (SIN el identifier de la app),
        // igual que process.env.APPDATA del lado del backend en Node.
        // appDataDir() en cambio agrega el identifier (com.RandomDev.GiTaller)
        // y NO coincide con la carpeta real donde escribe el backend.
        const raiz = await dataDir();
        const archivo = await join(raiz, 'GITaller', 'runtime-port.json');

        if (!(await exists(archivo))) {
            // Primer arranque, o el backend todavía no terminó de levantar
            // y escribir el archivo. No es un error: useApi.js cae al
            // default (VITE_API_PORT o 5881).
            return;
        }

        const contenido = await readTextFile(archivo);
        const { port } = JSON.parse(contenido);
        if (Number.isInteger(port) && port > 0) {
            runtimePort = port;
        }
    } catch (error) {
        // No bloqueamos el arranque de la app por esto: si falla, useApi.js
        // sigue funcionando con el puerto default de siempre.
        console.warn('[runtimePort] No se pudo leer el puerto real del backend, se usará el default:', error);
    }
}

export function getRuntimePort() {
    return runtimePort;
}
