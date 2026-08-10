# Parche: Tareas Internas — Rutinas vs. Extraordinarias

## Resumen de la lógica implementada
- **Rutina** (limpieza diaria, herramientas semanales, capacitaciones): se
  crea una sola vez, queda siempre visible para el mecánico, se opera solo
  con Iniciar/Pausar — **nunca se cierra**. No cuenta para eficacia ni
  eficiencia (no tiene un tiempo estimado real contra el cual medirse).
- **Extraordinaria** (ej. reparación de una máquina del taller): se crea
  con un tiempo estimado, el mecánico la opera igual que una tarea de OT, y
  **se puede cerrar** — la cierra el mecánico ("✅ Finalizar") o el Jefe
  ("✅ Cerrar" desde el modal de detalle). Si cuenta para eficacia y
  eficiencia, igual que una tarea de OT de cliente.
- Ninguna de las dos genera facturación ni cuenta como "OT trabajada"
  (`ot_trabajadas`) — `'0000'` nunca es una OT de cliente real.

## Backend

### `config/database.js`
Migración incremental: `ALTER TABLE actividades ADD COLUMN es_rutina
INTEGER NOT NULL DEFAULT 0`. Por defecto **extraordinaria** (0), para no
reclasificar en silencio tareas ya existentes como rutina — el Jefe las
revisa y las marca a mano si corresponde. También actualizado el `CREATE
TABLE IF NOT EXISTS actividades` para instalaciones nuevas.

### `services/informes.service.js`
- El `JOIN` de la query `sesiones` ahora trae `a.es_rutina`.
- Nuevo balde separado `hs_internas_extraordinarias` /
  `hs_estimadas_internas`, para que las extraordinarias cuenten en
  eficacia/eficiencia **sin duplicar horas** dentro de `hs_empleadas` /
  `tiempo_muerto` (que siguen usando `hs_internas`, sin cambios).
- Campos nuevos en la respuesta (además de los totales combinados, que se
  mantienen para no romper nada que ya los use):
  - `productividad_ot_porcentaje` / `productividad_interna_porcentaje`
    (Eficacia — **aditivos**, se pueden apilar).
  - `eficiencia_ot_porcentaje` / `eficiencia_interna_porcentaje`
    (Eficiencia — **no aditivos**, dos ratios independientes; `null`
    cuando el mecánico no tuvo actividad de ese tipo en el período, para
    que el frontend pueda omitir esa barra en vez de mostrar un 0% falso).

### `routes/actividades.js`
- `POST /orden/:ot`: acepta y guarda `es_rutina` en el `INSERT`.
- `POST /:id/estado`: si `nuevo_estado === 'Finalizada'` y la actividad es
  `ot='0000'` con `es_rutina=1`, rechaza la operación. Es una validación de
  **backend**, no solo ocultar el botón — así queda garantizado sin
  importar qué haga el frontend.
- **Nuevo** `POST /:id/cerrar-jefe`: cierre manual para que el Jefe cierre
  una extraordinaria que el mecánico se olvidó de cerrar. Cierra cualquier
  sesión abierta, marca a todo el equipo `Finalizada` (para que desaparezca
  de la pantalla de cada mecánico) y deja la actividad en `'Cerrada por
  Jefe'`. Rechaza rutinas igual que el endpoint anterior.

## Frontend

### `views/MecanicoView.vue`
Se agregan pestañas ("Órdenes de Trabajo" / "Orden Interna") usando la prop
`:tabs` de `NavBar` que antes estaba vacía. En la pestaña de tareas
internas: badge 🔁 junto a las rutinas, botón "✅ Finalizar" solo visible
para extraordinarias en curso o pausadas.

### `components/jefe/ModalAsignar.vue`
Al crear una tarea contra `ot === '0000'` (y solo al crear, no al editar),
aparece un toggle Rutina/Extraordinaria. El payload ya lo incluye
automáticamente (usa `...form.value`).

### `views/JefeView.vue`
Se agrega `es_rutina: datos.es_rutina || false` al body del `POST` que crea
la actividad (antes armaba el body campo por campo sin este dato).

### `components/asesor/ModalDetalleOT.vue`
(Reutilizado también por `JefeView.vue` para ver el detalle de la OT
`'0000'`.) Se agrega el badge 🔁 junto al estado cuando es rutina, y el
botón "✅ Cerrar" para extraordinarias no cerradas — llama al nuevo
endpoint `cerrar-jefe`. No hizo falta tocar el `GET /ordenes/:ot` del
backend: ya usa `SELECT a.*` así que `es_rutina` viaja solo.

### `components/informes/TableroOperativo.vue`
El gráfico único "Eficacia vs Eficiencia" se separó en **dos gráficos**:
- **Eficacia**: barra apilada (OT de cliente + Tareas internas), porque es
  aditiva — juntas suman el total.
- **Eficiencia**: barras independientes lado a lado (nunca apiladas,
  porque cada una es un ratio propio). Si el mecánico no tuvo
  extraordinarias en el período, la barra "Eficiencia Interna" no se
  dibuja en vez de mostrar 0%.

**Este archivo depende de los campos nuevos del backend** (parche 6) —
asegurate de aplicar ambos juntos, o el gráfico va a quedar con datos en
`undefined`/`0` hasta que el backend responda los campos nuevos.

## Cómo aplicar
1. Backend: reemplazá `config/database.js`, `services/informes.service.js`
   y `routes/actividades.js`. Reiniciá el backend una vez (`npm run tauri
   dev` ya lo reinicia) para que corra la migración.
2. Frontend: reemplazá `views/MecanicoView.vue`, `views/JefeView.vue`,
   `components/jefe/ModalAsignar.vue`,
   `components/asesor/ModalDetalleOT.vue`, y
   `components/informes/TableroOperativo.vue` (esta última **pisa** la
   versión del parche anterior de "rendimiento individual" — si ya la
   habías aplicado, esta la reemplaza completa, no hace falta aplicar
   ambas por separado).
3. Probá el flujo completo: Jefe crea una rutina → aparece fija en la
   pestaña "Orden Interna" del mecánico, sin botón de cerrar. Jefe crea
   una extraordinaria → el mecánico la opera y la puede finalizar; si no
   lo hace, el Jefe la cierra desde el modal de detalle de OT `'0000'`.
   Revisá que "Eficacia"/"Eficiencia" en el tablero del mecánico reflejen
   el desglose.

## Qué NO llegué a verificar
- No tengo el archivo `components/jefe/ModalAsignar.vue` completo
  confirmado contra la versión más reciente de tu repo (lo extraje del
  mismo snapshot que venís usando en toda la conversación) — si tenés
  cambios propios encima, compará antes de pisar.
- No probé el flujo end-to-end (no tengo forma de correr la app acá) —
  cualquier typo de nombre de campo entre backend/frontend, avisame con el
  error exacto y lo corrijo rápido.
