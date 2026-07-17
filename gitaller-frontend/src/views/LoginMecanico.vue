<template>
  <div class="login-container">
    <div class="card login-box">
      <div class="login-icon">🛠️</div>
      <h2>Identificación de Mecánico</h2>
      <p class="subtitle">Ingrese su número de legajo para ver sus tareas asignadas.</p>
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
      <router-link to="/" class="back-link">← Volver al menú principal</router-link>
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
  max-width: 360px;
  text-align: center;
}
.login-icon { font-size: 2.5rem; margin-bottom: 6px; }
.subtitle { color: var(--muted); font-size: 0.9rem; margin: 8px 0 18px; }
.login-box .form-control { margin-bottom: 12px; text-align: center; }
.back-link {
  display: inline-block;
  margin-top: 16px;
  font-size: 0.85rem;
  color: var(--muted);
  text-decoration: none;
}
.back-link:hover { color: var(--primary); }
</style>
