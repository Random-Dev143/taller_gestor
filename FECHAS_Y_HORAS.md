# Fechas y horas: convención de la app

## Regla
- La base guarda **todas las fechas en UTC**, formato `YYYY-MM-DD HH:MM:SS` (sin zona).
- La persona **ve y edita en su hora local** (Argentina, GMT-3, sin horario de verano).
- Nunca hacer `new Date("2026-10-05 15:00:00")`: el navegador lo toma como hora **local** y corre todo 3 h.
  Usar siempre los helpers de `gitaller-frontend/src/utils/fechas.js`.

## Helpers (`src/utils/fechas.js`)
| Función | Uso |
|---|---|
| `parseUtc(valor)` | fecha de la base → `Date` (null si no hay o es inválida) |
| `utcAInputLocal(valor)` | base → valor de `<input type="datetime-local">` en hora local |
| `inputLocalAUtc(valor)` | input (hora local) → UTC para la base |
| `fechaParaGuardar(input, original)` | qué enviar al guardar: si no se tocó el campo reenvía el original; si se cambió, convierte a UTC; vacío → `undefined` (no se modifica) |
| `diasDesde(valor)` | días transcurridos desde una fecha de la base |

## Horas (`src/utils/horas.js`)
- `redondear1(n)`: redondea al décimo **solo para mostrar**.
- El tiempo real de una actividad se calcula con todos sus decimales y **se guarda así**. El modal de editar actividad
  lo muestra redondeado y **solo lo envía si la persona lo modifica** (si no viaja en el `PUT`, el backend no lo toca).

## Qué se corrigió
- Editar OT: la fecha de apertura/cierre se mostraba en UTC y se guardaba lo tipeado como si fuera UTC.
- Editar actividad: "Forzar inicio/fin" se corría +3 h en cada guardado (se mostraba mal y se reenviaba siempre).
- Antigüedad de la OT (badge "estancada") e historial del cliente: ahora usan el instante UTC real.
- Alta de OT: envía la hora local como instante UTC explícito, sin depender del huso del servidor.
- Datos guardados antes del arreglo desde el modal de editar OT quedaron en hora local (no se corrigen automáticamente).

## Pruebas
- Frontend: `npm test` en `gitaller-frontend` (usa `node --test`, sin dependencias nuevas).
- Backend: `tests/actividades-tiempo-real.test.js`.

## Vista del mecánico
Una tarjeta por OT: #OT, patente, unidad, cliente, tiempo **Asignado** (suma de lo estimado en sus actividades) y **Ocupado**
(horas propias + sesión en curso), y la lista de sus actividades con botones por fila. La OT con trabajo activo va primera y en
verde; el resto de la más vieja a la más nueva por fecha de apertura (`GET /actividades/mecanico/:legajo` ahora devuelve
`fecha_apertura` y ordena por ella). La lógica está en `src/utils/ordenesMecanico.js`.
