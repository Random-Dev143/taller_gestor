# Planilla NPS quincenal + carga de clientes desde planillas

## Qué incluye
1. **Importación de clientes/unidades** desde las planillas Excel (Agenda → "📥 Importar planillas").
2. **Planilla NPS** generable desde Informes (botón "Descargar planilla" / "Guardar en carpeta").
3. **Informe automático**: los días 1 y 16 el sistema guarda solo la planilla en una carpeta configurable. No envía nada a nadie.
4. **Anulación de OT** (rojo en los tableros) y **motivo manual "Otros"**.

## Permisos nuevos (asignar en Roles; el Administrador los recibe solo)
| Permiso | Para qué | Sugerido |
|---|---|---|
| `agenda_importar` | Importar planillas y aprobar cambios | Asesor / Admin |
| `informe_nps` | Descargar/guardar la planilla NPS (contiene datos de contacto) | Asesor / Admin |
| `ot_anular` | Anular y reactivar OT | Jefe de taller |

## Base de datos (migración 019, solo agrega)
`clientes.cuit`, `unidades.chasis`, `ordenes.anulada/anulada_motivo/anulada_por/anulada_en/motivo_descarte_manual`,
`configuracion.nps_concesionario/nps_sede/carpeta_informes/informe_auto_activo`, tablas `informes_generados`,
`importaciones`, `importacion_items`. Antes de aplicar el primer cambio de una importación se hace un backup.

## Planilla NPS: reglas
- Filas: OT **abiertas** (`fecha_apertura`) entre las fechas elegidas, ordenadas por número de OT. `Mes` = 1° del mes de apertura (`Oct-26`).
- Pestaña y archivo: `Octubre 1ro al 15`, `Octubre 16 al 31`, `Octubre 28 al Noviembre 5`.
- Se parte de `templates/planilla_nps.xlsx` (estilo, anchos, tema, lista del desplegable `S2:S11` y `Hoja1` idénticos a la planilla original).
- Dato desconocido → celda **vacía y amarilla** (Nombre, IDCliente, Contacto, Teléfono, Mail, Modelo, Patente). `Celular` siempre vacío y sin pintar.
- Chasis desconocido: otra marca → `X111111`; Iveco (`es_no_iveco = 0`) → celda **roja** vacía.
- `Nombre` y `Modelo` se recortan a 30 caracteres, como en la planilla original.
- `MotivoDescarte` solo admite la lista del desplegable (validación con error).

### Motivo de descarte (primera regla que aplica)
1. **Otros**: cargado a mano en la OT (Editar OT → "Motivo de descarte NPS").
2. **Anulada**: OT anulada por el jefe.
3. **Otra marca**: `es_no_iveco = 1`.
4. **Abierta**: sin fecha de cierre.
5. **Empresa propia**: garantía + cliente IVEMAR o DIRECTORIO.
6. **Interna**: cliente IVEMAR o DIRECTORIO.
7. **Pre entrega**: garantía + tarea "PDI" o "Pre entrega de unidad".
8. **Saneamientos**: garantía + tarea "Campaña <NC>".
9. **Seguros**: garantía + tarea "Poliza <N> <texto>".
10. **Usados**: garantía + tarea "Garantía repuestos <texto>".

(Empresa propia va antes que Interna porque es más específica: si no, la regla de Interna la taparía siempre.)
Las reglas están en `services/nps-motivos.js`, con pruebas en `tests/nps-motivos.test.js`.

## Informe automático
- Cada 60 s el cron revisa si hay un período cerrado sin generar: del día 16 → genera 1–15; del día 1 → genera 16–fin de mes anterior.
- Si la PC estaba apagada, se genera en el primer arranque posterior. Queda registro en `informes_generados` (no se duplica).
- Si la carpeta no es accesible, reintenta cada hora y muestra el error en Informes.
- Configuración → "Informe NPS": carpeta (debe existir en la PC **servidor**), código de concesionario/sede, activar/desactivar.

## Importación de planillas
1. **Analizar** (no escribe nada): se leen los `.xlsx` (varios a la vez), se ordenan por la columna `Mes` y se comparan con la base en dos pasadas:
   - *Por OT*: si la OT existe, la patente debe coincidir; si no, la fila se omite y se avisa.
   - *Por patente*: si la OT no existe se busca la unidad por patente.
   Para cada patente gana el dato más reciente; `#N/A`, vacíos, `X111111` y CUIT placeholder nunca se importan.
2. **Altas y datos faltantes** (CUIT, chasis, contacto, mail, teléfono, modelo, unidades nuevas): se aprueban juntos; nunca pisan un dato existente.
3. **Conflictos** (la base ya tiene otro valor) y **cambios de cliente** (la unidad figura a nombre de otro): uno por uno, con caja de texto para el valor final y botones Aceptar/Rechazar. Cambiar el cliente reasigna la unidad (sus OT la siguen); el cliente destino se busca por CUIT, luego por nombre y si no existe se crea.
4. Reimportar las mismas planillas es seguro (idempotente).

## Empaquetado (`pkg`)
- `templates/**/*` está declarado como asset (la plantilla se lee con `fs`).
- `overrides.traverse = 0.3.9`: la 0.3.10 arrastra paquetes que `pkg` no puede empaquetar y rompía `exceljs` dentro del `.exe`.

## Parche 06 integrado
Este documento describe una parte de un único parche (06) que se aplica sobre `dev` (ya con el parche 05, mecánico auxiliar)
y reúne, en este orden: editar unidades, corrección de aportes (migración 017), panel de garantías (018)
y la planilla NPS / carga de clientes (019). Se aplica con un solo `git am`.
Las migraciones no chocan entre sí: cada una toca tablas/columnas distintas y el migrador registra por nombre.
