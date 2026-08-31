// src/composables/useSessionExpiry.js
//
// El JWT dura 12hs (ver routes/auth.js). Sin este composable, si alguien
// deja la app abierta toda la noche, el token vence en silencio: al volver,
// cualquier acción falla con 401 sin aviso previo, y la sesión se corta de
// golpe sin darle chance al backend de dejar la base en un estado prolijo
// (checkpoint del WAL + backup) antes de ese corte.
//
// Este composable decodifica el `exp` del JWT (sin verificar firma — eso ya
// lo hace el backend en cada pedido; acá solo es para la UX) y arma un
// aviso: X minutos antes de vencer, dispara un modal con cuenta regresiva.
// Si la persona confirma "mantener sesión", se pide un token nuevo. Si no
// hace nada y el tiempo llega a cero, se cierra la sesión sola —pero antes
// de cerrarla, se le pide al backend un checkpoint seguro (ver
// routes/sistema.js) para minimizar cualquier inconsistencia entre el
// WAL y el .db principal.

import { ref, computed } from 'vue';

const AVISO_MINUTOS_ANTES = 2;

const mostrarAviso = ref(false);
const segundosRestantes = ref(0);
let intervaloCountdown = null;
let timeoutAviso = null;

function decodificarExp(token) {
    try {
        const payloadBase64 = token.split('.')[1];
        // atob espera base64 estándar; el JWT usa base64url (- y _ en vez de + y /)
        const base64 = payloadBase64.replace(/-/g, '+').replace(/_/g, '/');
        const payload = JSON.parse(atob(base64));
        return payload.exp ? payload.exp * 1000 : null; // exp viene en segundos, JS usa ms
    } catch (error) {
        console.warn('[useSessionExpiry] No se pudo decodificar el token:', error);
        return null;
    }
}

export function useSessionExpiry({ getToken, refrescarToken, cerrarSesionSegura }) {
    function limpiarTimers() {
        if (timeoutAviso) clearTimeout(timeoutAviso);
        if (intervaloCountdown) clearInterval(intervaloCountdown);
        timeoutAviso = null;
        intervaloCountdown = null;
    }

    function programarAviso() {
        limpiarTimers();
        mostrarAviso.value = false;

        const token = getToken();
        if (!token) return;

        const expMs = decodificarExp(token);
        if (!expMs) return;

        const ahora = Date.now();
        const msHastaAviso = expMs - ahora - AVISO_MINUTOS_ANTES * 60 * 1000;
        const msHastaExpirar = expMs - ahora;

        if (msHastaExpirar <= 0) {
            // El token ya venció (ej: la PC estuvo suspendida/hibernada más
            // tiempo del que duraba la sesión) — cerramos directo, sin
            // esperar a mostrar un aviso para algo que ya pasó.
            cerrarPorExpiracion();
            return;
        }

        if (msHastaAviso <= 0) {
            // Ya estamos dentro de la ventana de aviso (por ejemplo, si la
            // app se acaba de abrir con un token que vence en breve)
            dispararAviso(msHastaExpirar);
            return;
        }

        timeoutAviso = setTimeout(() => dispararAviso(AVISO_MINUTOS_ANTES * 60 * 1000), msHastaAviso);
    }

    function dispararAviso(msRestantes) {
        mostrarAviso.value = true;
        segundosRestantes.value = Math.max(0, Math.round(msRestantes / 1000));

        intervaloCountdown = setInterval(() => {
            segundosRestantes.value -= 1;
            if (segundosRestantes.value <= 0) {
                cerrarPorExpiracion();
            }
        }, 1000);
    }

    async function cerrarPorExpiracion() {
        limpiarTimers();
        mostrarAviso.value = false;
        // Best-effort: si el checkpoint falla (ej: el token ya venció del
        // todo y el backend rechaza el pedido), igual seguimos con el
        // cierre de sesión — no queremos que la persona quede trabada.
        try { await cerrarSesionSegura(); } catch (error) { console.warn('[useSessionExpiry] Checkpoint seguro falló, se cierra sesión igual:', error); }
    }

    async function mantenerSesion() {
        try {
            await refrescarToken();
            programarAviso(); // el token nuevo vence más tarde: reprogramamos todo
        } catch (error) {
            // Si el refresh falla (ej: el token ya venció, o el usuario fue
            // desactivado), no tiene sentido seguir esperando: cerramos.
            console.warn('[useSessionExpiry] No se pudo renovar la sesión:', error);
            await cerrarPorExpiracion();
        }
    }

    function detener() {
        limpiarTimers();
        mostrarAviso.value = false;
    }

    const minutosRestantes = computed(() => Math.floor(segundosRestantes.value / 60));
    const segundosDisplay = computed(() => String(segundosRestantes.value % 60).padStart(2, '0'));

    return {
        mostrarAviso,
        segundosRestantes,
        minutosRestantes,
        segundosDisplay,
        programarAviso,
        mantenerSesion,
        detener
    };
}
