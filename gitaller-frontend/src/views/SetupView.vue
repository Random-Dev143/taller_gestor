<template>
  <div class="login-container">
    <div class="card login-box" style="max-width: 500px;">
      <div class="brand-header">
        <h1>⚙️ Configuración Inicial</h1>
        <p class="subtitle">Define el rol de esta computadora en el taller.</p>
      </div>

      <div v-if="!modoSeleccionado">
        <button class="btn btn-primary w-100 mb-15" @click="seleccionarServidor" :disabled="iniciando">
          <span style="font-size: 1.2rem;">🖥️</span> 
          {{ iniciando ? 'Iniciando servidor...' : 'Esta PC es el Servidor Principal' }}
        </button>
        <button class="btn btn-secondary w-100" @click="modoSeleccionado = 'cliente'" :disabled="iniciando">
          <span style="font-size: 1.2rem;">💻</span> Esta PC es una Terminal Cliente
        </button>
      </div>

      <div v-else-if="modoSeleccionado === 'cliente'">
        <div class="form-group mb-15 text-left">
          <label>Ingresa la IP de la PC Servidor:</label>
          <input type="text" v-model="ipServidor" class="form-control" placeholder="Ej: 192.168.1.50" autofocus />
        </div>
        <button class="btn btn-success w-100 mb-10" @click="guardarCliente" :disabled="!ipServidor">
          Conectar y Guardar
        </button>
        <button class="btn btn-outline w-100" @click="modoSeleccionado = null">
          Volver
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { invoke } from '@tauri-apps/api/core'
import { useToast } from '../composables/useToast'

const router = useRouter()
const toast = useToast()
const modoSeleccionado = ref(null)
const ipServidor = ref('')
const iniciando = ref(false)

const seleccionarServidor = async () => {
    iniciando.value = true
    try {
        // Le damos la orden a Rust de levantar Node.js
        await invoke('start_server')
        localStorage.setItem('app_modo', 'servidor')
        toast.success('Servidor configurado e iniciado correctamente')
        router.push('/login')
    } catch (error) {
        toast.error('Error al iniciar el servidor: ' + error)
        iniciando.value = false
    }
}

const guardarCliente = () => {
    localStorage.setItem('app_modo', 'cliente')
    localStorage.setItem('server_ip', ipServidor.value.trim())
    toast.success('Modo Cliente configurado')
    
    // Forzamos la recarga para que useApi.js tome la nueva IP
    window.location.href = '/login'
}
</script>

<style scoped>
.login-container { display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: -20px; background: linear-gradient(135deg, #0056a7 0%, #003f7d 100%); }
.login-box { width: 100%; text-align: center; padding: 40px 30px; }
.brand-header h1 { color: var(--primary); margin-bottom: 5px; }
.subtitle { color: var(--muted); font-size: 0.95rem; margin-bottom: 25px; }
.mb-10 { margin-bottom: 10px; }
.mb-15 { margin-bottom: 15px; }
.text-left { text-align: left; }
</style>