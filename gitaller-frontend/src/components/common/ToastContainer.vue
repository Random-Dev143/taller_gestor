<template>
  <teleport to="body">
    <div class="toast-stack">
      <transition-group name="toast">
        <div v-for="t in toasts" :key="t.id" :class="['toast', `toast-${t.type}`]">
          <span class="toast-icon">{{ icon(t.type) }}</span>
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

const icon = (type) => ({ success: '✅', error: '⚠️', info: 'ℹ️' }[type] || 'ℹ️')
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
  background: white;
  border-radius: 10px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
  padding: 12px 14px;
  font-size: 0.9rem;
  border-left: 4px solid #0056a7;
}
.toast-success { border-left-color: #1d8a4f; }
.toast-error { border-left-color: #b22234; }
.toast-info { border-left-color: #0056a7; }
.toast-msg { flex: 1; line-height: 1.35; }
.toast-close { background: none; border: none; cursor: pointer; font-size: 1.1rem; color: #999; line-height: 1; }
.toast-close:hover { color: #333; }

.toast-enter-active, .toast-leave-active { transition: all 0.25s ease; }
.toast-enter-from { opacity: 0; transform: translateX(30px); }
.toast-leave-to { opacity: 0; transform: translateX(30px); }

@media (max-width: 480px) {
  .toast-stack { left: 12px; right: 12px; top: 12px; max-width: none; }
}
</style>
