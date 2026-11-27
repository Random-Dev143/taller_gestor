<template>
  <div class="auth-screen">
    <div class="auth-card">
      <div class="auth-brand">
        <img v-if="configStore.config.logo_path" :src="configStore.getLogoUrl()" class="auth-logo" alt="" />
        <span v-else class="auth-mark" aria-hidden="true">G</span>
        <h1>{{ configStore.config.nombre_taller }}</h1>
        <p>Gestión integral de taller</p>
      </div>

      <!-- FORMULARIO DE INGRESO -->
      <form v-if="!mostrandoRegistro" @submit.prevent="ejecutarLogin">
        <h2 >Iniciar Sesión</h2>
        <div class="form-group">
          <label>Correo Electrónico</label>
          <input type="email" v-model="formLogin.email" class="form-control" required autofocus />
        </div>
        <div class="form-group">
          <label>Contraseña</label>
          <div class="password-field">
            <input :type="mostrarPassword ? 'text' : 'password'" v-model="formLogin.password" class="form-control"
                   required @keyup="chequearMayus" @blur="capsLockActivo = false" />
            <button type="button" class="btn-toggle-password" @click="mostrarPassword = !mostrarPassword"
                    :title="mostrarPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'">
              <AppIcon :name="mostrarPassword ? 'eye-off' : 'eye'" />
            </button>
          </div>
          <span v-if="capsLockActivo" class="alerta-mayus"><AppIcon name="alert" /> Bloq Mayús está activado</span>
        </div>
        <button type="submit" class="btn btn-primary w-100" :disabled="procesando">
          {{ procesando ? 'Verificando...' : 'Ingresar' }}
        </button>
        <div class="auth-link">
          ¿No tienes acceso? <a href="#" @click.prevent="mostrandoRegistro = true">Solicitar cuenta</a>
        </div>
      </form>

      <!-- FORMULARIO DE REGISTRO -->
      <form v-else @submit.prevent="ejecutarRegistro">
        <h2 >Solicitar Cuenta</h2>
        <div class="form-group">
          <label>Nombre y Apellido</label>
          <input type="text" v-model="formRegistro.nombre_completo" class="form-control" required />
        </div>
        <div class="form-group">
          <label>Correo Electrónico</label>
          <input type="email" v-model="formRegistro.email" class="form-control" required />
        </div>
        <div class="form-group">
          <label>Crear Contraseña</label>
          <div class="password-field">
            <input :type="mostrarPasswordRegistro ? 'text' : 'password'" v-model="formRegistro.password" class="form-control"
                   minlength="6" required @keyup="chequearMayusRegistro" @blur="capsLockActivoRegistro = false" />
            <button type="button" class="btn-toggle-password" @click="mostrarPasswordRegistro = !mostrarPasswordRegistro"
                    :title="mostrarPasswordRegistro ? 'Ocultar contraseña' : 'Mostrar contraseña'">
              <AppIcon :name="mostrarPasswordRegistro ? 'eye-off' : 'eye'" />
            </button>
          </div>
          <span v-if="capsLockActivoRegistro" class="alerta-mayus"><AppIcon name="alert" /> Bloq Mayús está activado</span>
        </div>
        <button type="submit" class="btn btn-success w-100" :disabled="procesando">
          {{ procesando ? 'Registrando...' : 'Enviar Solicitud' }}
        </button>
        <div class="auth-link">
          <a href="#" @click.prevent="mostrandoRegistro = false"><AppIcon name="arrow-left" /> Volver al login</a>
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
.auth-logo { max-height: 48px; max-width: 200px; margin-bottom: 6px; }
.password-field { position: relative; display: flex; align-items: center; }
.password-field .form-control { padding-right: 42px; width: 100%; }
.btn-toggle-password {
  position: absolute; right: 4px; width: 32px; height: 32px; display: inline-flex; align-items: center; justify-content: center;
  background: none; border: none; border-radius: 6px; cursor: pointer; color: var(--muted); font-size: 1.1rem;
}
.btn-toggle-password:hover { color: var(--text); background: var(--hover-row); }
.alerta-mayus { display: flex; align-items: center; gap: 5px; margin-top: 6px; font-size: 0.8rem; color: var(--warning); font-weight: 600; }
</style>
