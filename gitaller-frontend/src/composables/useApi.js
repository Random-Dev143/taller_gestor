export function useApi() {
    // Detectamos si estamos corriendo dentro de la ventana de Tauri
    const isTauri = window.__TAURI_INTERNALS__ !== undefined;

    // El puerto de la API ahora se puede configurar a través de una variable de entorno
    // en el frontend para que coincida con la configuración del backend.
    const port = import.meta.env.VITE_API_PORT || 5881;

    const API_BASE = import.meta.env.VITE_API_BASE
        || (isTauri 
            ? `http://127.0.0.1:${port}/api` 
            : `${window.location.protocol}//${window.location.hostname}:${port}/api`);

    const parseBody = async (res) => {
        const text = await res.text()
        if (!text) return null
        try {
            return JSON.parse(text)
        } catch {
            // El backend puede devolver HTML/texto plano en errores no controlados
            return { message: text }
        }
    }

    const fetchJSON = async (endpoint, options = {}) => {
        const url = endpoint.startsWith('http') ? endpoint : `${API_BASE}${endpoint}`

        let res
        try {
            res = await fetch(url, {
                headers: { 'Content-Type': 'application/json' },
                cache: 'no-cache',
                credentials: 'include',
                ...options,
            })
        } catch (networkErr) {
            // fetch lanza TypeError cuando no hay conexión con el servidor
            return Promise.reject({ error: 'No se pudo conectar con el servidor. Verifique la red o que el backend esté activo.' })
        }

        const body = await parseBody(res)

        if (!res.ok) {
            return Promise.reject(body || { error: `Error ${res.status}` })
        }

        return body
    }

    return {
        fetchJSON,
        API_BASE
    }
}
