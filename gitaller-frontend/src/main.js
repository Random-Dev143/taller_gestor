import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import { useAuthStore } from './stores/useAuthStore'
import { initRuntimePort } from './runtimePort'
import './style.css'

// Antes de montar: si estamos en Tauri, intentamos leer el puerto real
// donde quedó escuchando el backend (puede diferir del default si se
// cambió desde Configuración). useApi.js usa este valor al armar la URL
// base de todos los pedidos a la API.
await initRuntimePort()

const app = createApp(App)

app.use(createPinia())
app.use(router)

app.directive('can', {
    mounted(el, binding) {
        const authStore = useAuthStore()
        const permisosUsuario = authStore.usuario?.permisos || []
        const permisoRequerido = binding.value

        // Si el usuario no tiene la clave exacta en su array, removemos el elemento
        if (!permisosUsuario.includes(permisoRequerido)) {
            el.parentNode?.removeChild(el)
        }
    }
})

app.mount('#app')