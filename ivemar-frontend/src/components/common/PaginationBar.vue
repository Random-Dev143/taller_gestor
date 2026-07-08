<template>
  <div class="pagination-bar" v-if="totalPages > 1 || total > 0">
    <span class="pagination-info">
      {{ total }} OT{{ total === 1 ? '' : 's' }} · Página {{ page }} de {{ totalPages }}
    </span>
    <div class="pagination-controls">
      <button class="btn btn-sm btn-secondary" :disabled="page <= 1" @click="$emit('cambiar-pagina', page - 1)">‹ Anterior</button>
      <button class="btn btn-sm btn-secondary" :disabled="page >= totalPages" @click="$emit('cambiar-pagina', page + 1)">Siguiente ›</button>
    </div>
  </div>
</template>

<script setup>
defineProps({
  page: { type: Number, required: true },
  totalPages: { type: Number, required: true },
  total: { type: Number, required: true }
})
defineEmits(['cambiar-pagina'])
</script>

<style scoped>
.pagination-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 15px;
  padding-top: 12px;
  border-top: 1px solid var(--border-soft);
}
.pagination-info { font-size: 0.85rem; color: var(--muted); }
.pagination-controls { display: flex; gap: 8px; }
</style>
