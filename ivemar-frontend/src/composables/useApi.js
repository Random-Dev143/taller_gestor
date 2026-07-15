export function useApi() {
    // El backend escucha en 0.0.0.0:5881, pensado para accederse desde
    // otros equipos en la red (mecánicos con tablet, TV de sala de espera).
    // Antes la URL base era un literal 'http://localhost:5881/api': eso
    // funciona en la misma PC del desarrollador, pero se rompe apenas se
    // abre la app desde cualquier otro dispositivo de la red, porque
    // "localhost" en ese dispositivo apunta a sí mismo, no al servidor.
    // Se deriva el host dinámicamente desde la URL con la que se accedió
    // al frontend, y se permite sobreescribir con una variable de entorno
    // (VITE_API_BASE) para despliegues donde el puerto/host difiera.
    const API_BASE = import.meta.env.VITE_API_BASE
        || `${window.location.protocol}//${window.location.hostname}:5881/api`

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
