import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import { useAuthStore } from './stores/useAuthStore'
import './style.css'

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