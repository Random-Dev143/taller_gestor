<template>
  <teleport to="body">
    <transition name="session-modal">
      <div v-if="mostrarAvisoExpiracion" class="session-overlay">
        <div class="session-card" role="alertdialog" aria-live="assertive">
          <div class="session-icon">⏰</div>
          <h3>Tu sesión está por vencer</h3>
          <p>
            Por seguridad, la sesión se cierra sola si no hay actividad.
            Se cerrará en:
          </p>
          <div class="session-countdown">
            {{ minutosRestantesExpiracion }}:{{ segundosRestantesExpiracion }}
          </div>
          <p class="session-nota">
            Antes de cerrarla guardamos un respaldo de la base de datos, así que puede tardar unos segundos.
          </p>
          <button class="btn btn-success session-btn" :disabled="manteniendo" @click="onMantenerSesion">
            {{ manteniendo ? 'Renovando...' : 'Mantener sesión' }}
          </button>
        </div>
      </div>
    </transition>
  </teleport>
</template>

<script setup>
import { ref } from 'vue'
import { useAuthStore } from '../../stores/useAuthStore'
import { useToast, errMsg } from '../../composables/useToast'
import { storeToRefs } from 'pinia'

const authStore = useAuthStore()
const { mostrarAvisoExpiracion, minutosRestantesExpiracion, segundosRestantesExpiracion } = storeToRefs(authStore)
const toast = useToast()

const manteniendo = ref(false)

const onMantenerSesion = async () => {
  manteniendo.value = true
  try {
    await authStore.mantenerSesion()
    toast.success('Sesión renovada')
  } catch (err) {
    toast.error(errMsg(err))
  } finally {
    manteniendo.value = false
  }
}
</script>

<style scoped>
.session-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 4000;
}
.session-card {
  background: var(--surface);
  color: var(--text);
  border-radius: 14px;
  box-shadow: var(--shadow-md);
  padding: 28px 32px;
  max-width: 380px;
  width: 90%;
  text-align: center;
  border-top: 4px solid var(--danger, #e5484d);
}
.session-icon { font-size: 2.2rem; margin-bottom: 6px; }
.session-card h3 { margin: 0 0 10px; }
.session-card p { margin: 0 0 8px; color: var(--muted); font-size: 0.92rem; line-height: 1.4; }
.session-countdown {
  font-size: 2.4rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  margin: 14px 0;
  color: var(--danger, #e5484d);
}
.session-nota { font-size: 0.8rem; }
.session-btn { width: 100%; margin-top: 10px; }

.session-modal-enter-active, .session-modal-leave-active { transition: opacity 0.2s ease; }
.session-modal-enter-from, .session-modal-leave-to { opacity: 0; }
</style>
