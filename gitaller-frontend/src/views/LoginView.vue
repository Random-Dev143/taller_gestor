<template>
  <div class="login-container">
    <div class="card login-box">
      <div class="brand-header">
        <h1>🚗 {{ configStore.config.nombre_taller }}</h1>
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
          <div class="password-field">
            <input :type="mostrarPassword ? 'text' : 'password'" v-model="formLogin.password" class="form-control"
                   required @keyup="chequearMayus" @blur="capsLockActivo = false" />
            <button type="button" class="btn-toggle-password" @click="mostrarPassword = !mostrarPassword"
                    :title="mostrarPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'">
              {{ mostrarPassword ? '🙈' : '👁️' }}
            </button>
          </div>
          <span v-if="capsLockActivo" class="alerta-mayus">⚠️ Bloq Mayús está activado</span>
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
          <div class="password-field">
            <input :type="mostrarPasswordRegistro ? 'text' : 'password'" v-model="formRegistro.password" class="form-control"
                   minlength="6" required @keyup="chequearMayusRegistro" @blur="capsLockActivoRegistro = false" />
            <button type="button" class="btn-toggle-password" @click="mostrarPasswordRegistro = !mostrarPasswordRegistro"
                    :title="mostrarPasswordRegistro ? 'Ocultar contraseña' : 'Mostrar contraseña'">
              {{ mostrarPasswordRegistro ? '🙈' : '👁️' }}
            </button>
          </div>
          <span v-if="capsLockActivoRegistro" class="alerta-mayus">⚠️ Bloq Mayús está activado</span>
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
import { useConfigStore } from '../stores/useConfigStore'

const router = useRouter()
const authStore = useAuthStore()
const toast = useToast()
const configStore = useConfigStore()

const mostrandoRegistro = ref(false)
const procesando = ref(false)

const mostrarPassword = ref(false)
const capsLockActivo = ref(false)
const mostrarPasswordRegistro = ref(false)
const capsLockActivoRegistro = ref(false)

// getModifierState('CapsLock') es soportado por todos los navegadores
// modernos; si no lo estuviera, simplemente no se muestra la alerta.
const chequearMayus = (evento) => {
  if (typeof evento.getModifierState === 'function') {
    capsLockActivo.value = evento.getModifierState('CapsLock')
  }
}
const chequearMayusRegistro = (evento) => {
  if (typeof evento.getModifierState === 'function') {
    capsLockActivoRegistro.value = evento.getModifierState('CapsLock')
  }
}

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

.password-field { position: relative; display: flex; align-items: center; }
.password-field .form-control { padding-right: 40px; width: 100%; }
.btn-toggle-password {
  position: absolute; right: 6px; background: none; border: none; cursor: pointer;
  font-size: 1.1rem; line-height: 1; padding: 4px 6px;
}
.alerta-mayus { display: block; margin-top: 6px; font-size: 0.8rem; color: #b8860b; font-weight: 600; }
</style>
