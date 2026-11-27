<template>
  <div class="auth-screen">
    <div class="auth-card" style="max-width: 380px;">
      <div class="auth-brand">
        <span class="auth-mark" aria-hidden="true"><AppIcon name="wrench" /></span>
        <h1>Identificación de mecánico</h1>
        <p>Ingresá tu número de legajo para ver tus tareas.</p>
      </div>
      <input
        type="text"
        v-model="legajo"
        placeholder="Ej: 1234"
        class="form-control"
        @keyup.enter="ingresar"
        autofocus
      />
      <p v-if="error" class="alert">{{ error }}</p>
      <button @click="ingresar" class="btn btn-primary w-100">Ver mis tareas</button>
      <router-link to="/" class="back-link"><AppIcon name="arrow-left" /> Volver al menú principal</router-link>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()
const legajo = ref('')
const error = ref('')

const ingresar = () => {
  const value = legajo.value.trim()
  if (!value) {
    error.value = 'Debe ingresar su legajo'
    return
  }
  error.value = ''
  localStorage.setItem('legajoMecanico', value)
  router.push({ name: 'mecanico-tareas' })
}
</script>

<style scoped>
.auth-card .form-control { margin-bottom: 12px; text-align: center; min-height: 48px; font-size: 1.1rem; }
.auth-card .btn { min-height: 48px; font-size: 1rem; }
.back-link { display: inline-flex; align-items: center; gap: 6px; margin-top: 18px; font-size: 0.88rem; color: var(--muted); text-decoration: none; }
.back-link:hover { color: var(--primary-text); }
</style>