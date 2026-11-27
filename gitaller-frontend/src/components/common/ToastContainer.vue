<template>
  <teleport to="body">
    <div class="toast-stack">
      <transition-group name="toast">
        <div v-for="t in toasts" :key="t.id" :class="['toast', `toast-${t.type}`]">
          <AppIcon :name="icon(t.type)" class="toast-icon" />
          <span class="toast-msg">{{ t.message }}</span>
          <button class="toast-close" @click="remove(t.id)">&times;</button>
        </div>
      </transition-group>
    </div>
  </teleport>
</template>

<script setup>
import { useToast } from '../../composables/useToast'

const { toasts, remove } = useToast()

const icon = (type) => ({ success: 'check', error: 'alert', info: 'info' }[type] || 'info')
</script>

<style scoped>
.toast-stack {
  position: fixed;
  top: 20px;
  right: 20px;
  z-index: 3000;
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-width: 360px;
}
.toast {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  background: var(--surface);
  color: var(--text);
  border-radius: 10px;
  box-shadow: var(--shadow-md);
  padding: 12px 14px;
  font-size: 0.9rem;
  border: 1px solid var(--border-soft); border-left: 4px solid var(--primary);
}
.toast-success { border-left-color: var(--success); }
.toast-error { border-left-color: var(--danger); }
.toast-info { border-left-color: var(--primary); }
.toast-icon { font-size: 1.15rem; margin-top: 1px; }
.toast-success .toast-icon { color: var(--success); }
.toast-error .toast-icon { color: var(--danger); }
.toast-info .toast-icon { color: var(--primary-text); }
.toast-msg { flex: 1; line-height: 1.35; }
.toast-close { background: none; border: none; cursor: pointer; font-size: 1.1rem; color: var(--muted); line-height: 1; }
.toast-close:hover { color: var(--text); }

.toast-enter-active, .toast-leave-active { transition: all 0.25s ease; }
.toast-enter-from { opacity: 0; transform: translateX(30px); }
.toast-leave-to { opacity: 0; transform: translateX(30px); }

@media (max-width: 480px) {
  .toast-stack { left: 12px; right: 12px; top: 12px; max-width: none; }
}
</style>
