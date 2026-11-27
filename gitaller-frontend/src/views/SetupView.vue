<template>
  <div class="auth-screen">
    <div class="auth-card" style="max-width: 480px;">
      <div class="auth-brand">
        <span class="auth-mark" aria-hidden="true">G</span>
        <h1>Configuración inicial</h1>
        <p>Definí el rol de esta computadora en el taller.</p>
      </div>

      <div v-if="!modoSeleccionado">
        <button class="btn btn-primary w-100" style="margin-bottom: 12px;" @click="seleccionarServidor" :disabled="iniciando">
          <AppIcon name="monitor" />
          {{ iniciando ? 'Iniciando servidor...' : 'Esta PC es el Servidor Principal' }}
        </button>
        <button class="btn btn-secondary w-100" @click="modoSeleccionado = 'cliente'" :disabled="iniciando">
          <AppIcon name="monitor" /> Esta PC es una Terminal Cliente
        </button>
      </div>

      <div v-else-if="modoSeleccionado === 'cliente'">
        <div class="form-group">
          <label>Ingresa la IP de la PC Servidor:</label>
          <input type="text" v-model="ipServidor" class="form-control" placeholder="Ej: 192.168.1.50" autofocus />
        </div>
        <button class="btn btn-success w-100" style="margin-bottom: 10px;" @click="guardarCliente" :disabled="!ipServidor">
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
.btn { min-height: 42px; }
</style>