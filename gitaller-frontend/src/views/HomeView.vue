<template>
  <div class="main-menu">
    <h1>🚗 {{ configStore.config.nombre_taller }}</h1>
    <p>Sistema de gestión de órdenes de trabajo</p>

    <div class="role-buttons">
      <button class="role-btn" @click="$router.push('/admin')" v-can="'usuario_gestionar'">
        <span class="role-icon">⚙️</span>
        Administración
      </button>
      <button class="role-btn" @click="$router.push('/asesor')" v-can="'ot_ver_lista'">
        <span class="role-icon">👔</span>
        Asesor de Servicio
      </button>
      <button class="role-btn" @click="$router.push('/jefe')" v-can="'tarea_gestionar_todas'">
        <span class="role-icon">🔧</span>
        Jefe de Taller
      </button>
      <button class="role-btn" @click="$router.push('/mecanico')" v-can="'tarea_ver_propias'">
        <span class="role-icon">🛠️</span>
        Mecánico
      </button>
      <button class="role-btn" @click="goTo('sala')">
        <span class="role-icon">📺</span>
        Sala de Espera
      </button>
    </div>
  </div>
</template>

<script setup>
import { useRouter } from 'vue-router'
import { useConfigStore } from '../stores/useConfigStore';

const router = useRouter()
const configStore = useConfigStore();

const goTo = (routeName) => {
  router.push({ name: routeName })
}
</script>

<style scoped>
.main-menu {
    text-align: center;
    margin: 60px 0;
}

.main-menu h1 {
    font-size: 2.5rem;
    color: var(--primary);
    margin-bottom: 10px;
}

.main-menu p {
    font-size: 1.15rem;
    color: var(--muted);
    margin-bottom: 40px;
}

.role-buttons {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 20px;
}

.role-btn {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    background: white;
    border: 2px solid var(--primary);
    padding: 24px 36px;
    border-radius: 14px;
    font-size: 1.05rem;
    font-weight: 600;
    color: var(--primary);
    cursor: pointer;
    transition: all 0.25s;
    min-width: 190px;
    box-shadow: 0 4px 10px rgba(0, 0, 0, 0.06);
}

.role-icon { font-size: 2rem; }

.role-btn:hover {
    background: var(--primary);
    color: white;
    transform: translateY(-4px);
    box-shadow: 0 10px 20px rgba(0, 86, 167, 0.25);
}

@media (max-width: 480px) {
    .main-menu { margin: 30px 0; }
    .role-btn {
        padding: 18px 20px;
        font-size: 1rem;
        min-width: 100%;
        flex-direction: row;
    }
}
</style>
