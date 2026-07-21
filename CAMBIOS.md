# Rediseño: cada mecánico maneja su parte de forma independiente

Tenías razón: la arquitectura anterior no podía soportar esto. `actividades.estado`
era un único campo compartido por todo el equipo — cuando cualquiera daba "play",
el sistema entendía que *la tarea* (no la persona) pasaba a "En Curso", y de ahí
el bug: reanudar afectaba a todos.

## Qué cambió de fondo

Antes: el estado y el cronómetro vivían en `actividades` (una fila = un estado para
todo el equipo).

Ahora: el estado y el cronómetro viven **por mecánico**, en `actividad_mecanicos`
(estado propio: Asignada/En Curso/Pausada/Finalizada, horas propias, informe propio).
`actividades.estado` pasa a ser un **resumen calculado** a partir de esas filas
individuales — se sigue usando para todo lo que necesita "una foto general" (la
vista del Jefe, el estado de la OT, los badges), pero ya no es la fuente de verdad.

### Tabla nueva/ampliada: `actividad_mecanicos`
Se agregaron 3 columnas:
- `estado` — el estado individual de ESE mecánico en ESA tarea.
- `tiempo_real` — sus horas acumuladas, independientes de sus compañeros.
- `informe` — su propio texto de "qué hice", sin depender de que el resto también escriba.

### Tabla `tiempos_actividad`
Se agregó `legajo_mecanico`: cada sesión de cronómetro (play→pausa) ahora sabe de
quién es. Antes el cronómetro era "de la tarea", sin dueño — por eso era imposible
separar el trabajo de cada uno.

### `sincronizarEstadoActividad()` (nueva función, en `database.js`)
Recalcula el estado "de la tarea" mirando a todo el equipo:
- Si alguien está En Curso → la tarea se ve En Curso.
- Si nadie está En Curso, nadie quedó sin arrancar, y al menos uno Finalizó → la tarea
  se considera Finalizada (a los que quedaron en "Pausada" sin cerrar formalmente no
  los bloquea: son compañeros que entregaron la posta o no volvieron a loguearse ese día).
- Si el Jefe la cerró a mano ("Cerrada por Jefe"), eso manda salvo que alguien la reabra.
- Cualquier otro caso intermedio → Pausada.

Se llama automáticamente cada vez que un mecánico cambia su propio estado.

## Cómo quedan mapeados tus 3 casos de uso

**Caso 1 (cada uno con su parte, en paralelo):**
Mec 1 y Mec 2 dan play cada uno por separado → dos filas en `actividad_mecanicos`,
cada una "En Curso" con su propio cronómetro corriendo. Mec 1 finaliza y escribe su
informe → su fila pasa a Finalizada, desaparece de SU lista, pero Mec 2 sigue viendo
la tarea "En Curso" (porque él sigue trabajando) y su cronómetro no se tocó.

**Caso 2 (posta / handoff):**
Mec 1 pausa (su fila → Pausada, guarda su informe). Mec 2 da play (su fila → En Curso,
inicia su propio cronómetro). El estado general de la tarea sigue "En Curso" mientras
Mec 2 trabaja. Al finalizar Mec 2, como nadie quedó "En Curso" y hay al menos un
"Finalizada" (Mec 2) sin nadie "sin arrancar", la tarea general pasa a Finalizada —
aunque Mec 1 haya quedado técnicamente en "Pausada" para siempre (ya escribió lo suyo).

**Caso 3 (ausencia y retorno):**
Mec 1 arranca. Se pausa (fin de jornada, manual o por el cron de las 18hs). Mec 2 da
play al día siguiente sin tocar el estado de Mec 1. Al tercer día Mec 1 reanuda (su
propia fila vuelve a En Curso) sin afectar a Mec 2, que quedó pausado el día anterior.
Mec 1 finaliza → tarea general Finalizada. Mec 2, que nunca finalizó, sigue apareciendo
en SU lista (porque su fila individual no es "Finalizada") con dos botones disponibles:
"Reanudar" (por si necesita volver a trabajar en algo) o "Finalizar mi parte" (solo
completar su informe sin reabrir nada). Esto lo ves reflejado en la UI con el aviso
amarillo "Un compañero ya cerró esta tarea..." en `MecanicoView.vue`.

## Endpoints que cambiaron

- `POST /actividades/:id/estado` — ahora requiere `legajo_mecanico` en el body (el
  mecánico logueado, ya disponible en el frontend). Cada llamado afecta solo a su fila
  en `actividad_mecanicos`. El chequeo de "¿tengo otra tarea en curso en otro lado?"
  también es por persona: no revienta el trabajo de un compañero en otra tarea.
- `POST /actividades/:id/informe` (nuevo) — un mecánico puede guardar/actualizar su
  informe sin necesariamente cambiar de estado (por si quiere ir anotando mientras
  trabaja, sin esperar a pausar o finalizar).
- `GET /actividades/mecanico/:legajo` — devuelve `mi_estado`, `mi_tiempo_real`,
  `mi_informe` (tu fila individual) además de `estado` (el agregado del equipo).
  Se sigue mostrando una tarea mientras TU parte no esté Finalizada, aunque el
  agregado ya diga "Finalizada" (para cubrir el Caso 3).
- `PUT /actividades/:id` (editar equipo desde el modal del Jefe) — ya NO borra y
  recrea todo el equipo (eso hubiera destruido el progreso individual de quien
  seguía en el equipo). Solo agrega a los nuevos integrantes y quita a los que
  sacaron, preservando estado/horas/informe de los que se mantienen.
- El cron de pausa/reanudación automática (mediodía) también pasa a ser por persona.

## Reportes (`informes.service.js`)
Como ahora cada sesión de `tiempos_actividad` sabe de quién es, el reporte de
Rendimiento le acredita las horas EXACTAS a quien las trabajó (mejora respecto
al parche anterior, que repartía la sesión completa entre todo el equipo por
no tener esta información).

## Migración de datos existentes
Al reiniciar el backend, la migración:
1. Agrega las columnas nuevas a `actividad_mecanicos` y `tiempos_actividad`.
2. Para actividades que ya tenían un mecánico "representante" (todo lo creado hasta
   ahora), le copia el estado y las horas actuales a SU fila individual. Si esa
   actividad tenía otros compañeros de equipo (creados con el sistema anterior, que
   no distinguía por persona), esos compañeros arrancan en 0 horas / "Asignada" —
   no hay forma de reconstruir retroactivamente cuánto había trabajado cada uno,
   porque esa información nunca se guardó separada.
3. Las sesiones de tiempo (`tiempos_actividad`) viejas se atribuyen también al
   mecánico representante, por la misma razón.

No hace falta que hagas nada manual: es automático al reiniciar `node server.js` /
`npm start`.

## Archivos modificados en este patch
- `gitaller-backend/config/database.js` — schema + `sincronizarEstadoActividad`
- `gitaller-backend/routes/actividades.js` — reescrito, estado por mecánico
- `gitaller-backend/utils/cron.js` — pausa/reanudación automática por mecánico
- `gitaller-backend/services/informes.service.js` — horas exactas por persona
- `gitaller-backend/routes/ordenes.js` — sin cambios nuevos, incluido por consistencia
- `gitaller-frontend/src/views/MecanicoView.vue` — botones por `mi_estado`, no por
  el estado agregado; muestra "Tarea: X / Yo: Y"
- `gitaller-frontend/src/components/asesor/ModalDetalleOT.vue` — sin cambios nuevos
  (ya venía del parche anterior), incluido por consistencia

## Qué quedó afuera (posible siguiente paso)
La vista del Jefe (`JefeView.vue` / `ModalDetalleOT.vue`) sigue mostrando solo el
estado agregado de la tarea, no el detalle "Mec 1: Finalizada, Mec 2: En Curso".
Funciona bien así (el Jefe ve si la tarea está resuelta o no), pero si en algún
momento querés que el Jefe vea el detalle por persona, es un cambio menor —
la información ya está disponible en el backend (`actividad_mecanicos`), solo
faltaría exponerla en `GET /ordenes/:ot` y pintarla en el modal.

---

## Siguiente paso ya implementado: detalle por mecánico en la vista del Jefe

`GET /ordenes/:ot` ahora devuelve, por cada actividad, un campo `equipo_detalle`
con el desglose "Nombre|Estado|Horas" de cada integrante del equipo (separado por
`;;`). `ModalDetalleOT.vue` lo parsea y muestra, en la columna "Mecánico" de la
tabla de tareas, una pill de color por persona con su estado individual y sus
horas propias (verde = En Curso, ámbar = Pausada, gris = Finalizada, azul =
Asignada) en vez de un solo nombre plano. Así el Jefe ve de un vistazo, por
ejemplo, "Mec 1 (Finalizada) / Mec 2 (En Curso)" en la misma tarea, sin tener
que adivinar a partir del estado agregado.

No requiere migración adicional: usa las columnas `estado`/`tiempo_real` de
`actividad_mecanicos` que ya se agregaron en el paso anterior.
