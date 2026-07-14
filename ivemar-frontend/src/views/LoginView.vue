<template>
  <div class="login-container">
    <div class="card login-box">
      <div class="brand-header">
        <h1>🚗 IVEMAR</h1>
        <p class="subtitle">Gestión Integral de Taller</p>
      </div>

      <!-- FORMULARIO DE INGRESO -->
      <form v-if="!mostrandoRegistro" @submit.prevent="ejecutarLogin">
        <h2 class="mb-15">Iniciar Sesión</h2>
        <div class="form-group mb-15 text-left">
          <label>Correo Electrónico</label>
          <input type="email" v-model="formLogin.email" class="form-control" required autofocus />
        </div>
        <div class="form-group mb-15 text-left">
          <label>Contraseña</label>
          <input type="password" v-model="formLogin.password" class="form-control" required />
        </div>
        <button type="submit" class="btn btn-primary w-100" :disabled="procesando">
          {{ procesando ? 'Verificando...' : 'Ingresar' }}
        </button>
        <div class="mt-15 toggle-link">
          ¿No tienes acceso? <a href="#" @click.prevent="mostrandoRegistro = true">Solicitar cuenta</a>
        </div>
      </form>

      <!-- FORMULARIO DE REGISTRO -->
      <form v-else @submit.prevent="ejecutarRegistro">
        <h2 class="mb-15">Solicitar Cuenta</h2>
        <div class="form-group mb-10 text-left">
          <label>Nombre y Apellido</label>
          <input type="text" v-model="formRegistro.nombre_completo" class="form-control" required />
        </div>
        <div class="form-group mb-10 text-left">
          <label>Correo Electrónico</label>
          <input type="email" v-model="formRegistro.email" class="form-control" required />
        </div>
        <div class="form-group mb-15 text-left">
          <label>Crear Contraseña</label>
          <input type="password" v-model="formRegistro.password" class="form-control" minlength="6" required />
        </div>
        <button type="submit" class="btn btn-success w-100" :disabled="procesando">
          {{ procesando ? 'Registrando...' : 'Enviar Solicitud' }}
        </button>
        <div class="mt-15 toggle-link">
          <a href="#" @click.prevent="mostrandoRegistro = false">← Volver al login</a>
        </div>
      </form>

    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/useAuthStore'
import { useToast, errMsg } from '../composables/useToast'

const router = useRouter()
const authStore = useAuthStore()
const toast = useToast()

const mostrandoRegistro = ref(false)
const procesando = ref(false)

const formLogin = ref({ email: '', password: '' })
const formRegistro = ref({ email: '', password: '', nombre_completo: '' })

const ejecutarLogin = async () => {
  procesando.value = true
  try {
    await authStore.login(formLogin.value.email, formLogin.value.password)
    toast.success(`Bienvenido, ${authStore.usuario.nombre}`)
    router.push({ name: 'home' })
  } catch (err) {
    toast.error(errMsg(err))
  } finally {
    procesando.value = false
  }
}

const ejecutarRegistro = async () => {
  procesando.value = true
  try {
    await authStore.register(formRegistro.value.email, formRegistro.value.password, formRegistro.value.nombre_completo)
    toast.success('Solicitud enviada. Un administrador debe aprobar tu cuenta.')
    mostrandoRegistro.value = false
    formRegistro.value = { email: '', password: '', nombre_completo: '' }
  } catch (err) {
    toast.error(errMsg(err))
  } finally {
    procesando.value = false
  }
}
</script>

<style scoped>
.login-container {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 100vh;
  margin: -20px;
  background: linear-gradient(135deg, #0056a7 0%, #003f7d 100%);
}
.login-box {
  width: 100%;
  max-width: 400px;
  text-align: center;
  padding: 40px 30px;
}
.brand-header h1 {
  color: var(--primary);
  margin-bottom: 5px;
}
.subtitle {
  color: var(--muted);
  font-size: 0.95rem;
  margin-bottom: 25px;
}
.text-left { text-align: left; }
.mb-10 { margin-bottom: 10px; }
.mb-15 { margin-bottom: 15px; }
.toggle-link { font-size: 0.9rem; color: var(--text-soft); }
.toggle-link a { font-weight: bold; text-decoration: none; }
</style>