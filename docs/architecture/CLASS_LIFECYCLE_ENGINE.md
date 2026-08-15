# Motor de ciclo de vida de clases

Este motor centraliza la verdad de negocio de una clase particular. Los paneles pueden seguir escribiendo datos operativos (`estado`, asistencia y pagos), pero el worker deriva el estado profesional en `lifecycleStatus` y deja trazabilidad en `classLifecycleEvents` y `auditLogs`.

## Estados principales

| Estado | Significado | Automatizaciones |
| --- | --- | --- |
| `solicitud_enviada` | Una familia ha pedido profesor. | Registro de solicitud y matching. |
| `solicitud_aceptada` | El admin ha asignado profesor. | Crea `asignaciones`, historial y evento de automatizacion. |
| `clase_programada` | Hay fecha/hora y participantes. | Aparece en paneles y agenda. |
| `recordatorio_enviado` | La clase esta en ventana de aviso. | Notificaciones de 24h/2h desde el worker. |
| `clase_iniciada` | La clase esta ocurriendo segun fecha/hora. | Estado operativo para paneles. |
| `clase_finalizada` | La hora de fin ya paso. | Prepara solicitud de confirmacion. |
| `pendiente_confirmacion` | Falta confirmacion de profesor o familia. | Notificaciones y posible incidencia si queda sin marcar. |
| `pendiente_pago` | Clase confirmada y pendiente de cobro familiar. | Aviso a familia y admin. |
| `pago_recibido` | Pago familiar validado. | Desbloquea liquidacion al profesor. |
| `comision_liquidada` | Cobro familiar y pago al profesor conciliados. | Actualiza auditoria financiera. |
| `valoracion_pendiente` | Falta valorar o revisar la clase. | Avisos a familia/profesor. |
| `clase_archivada` | Clase cerrada historicamente. | Queda disponible para reporting. |
| `cancelada` | Clase cancelada. | Incidencia/seguimiento si aplica. |
| `reprogramada` | Fecha u hora cambiada. | Mantiene la agenda viva con la nueva fecha. |
| `incidencia_abierta` | Hay discrepancia o problema. | Aviso al admin y registro de incidencia. |

## Como se ejecuta

`scripts/firebase-automation-worker.mjs` llama a `processClassLifecycle()` varias veces durante la pasada automatizada: antes de recordatorios, despues de confirmar asistencia y despues de conciliar pagos. Esto permite que una misma ejecucion recoja cambios de calendario, asistencia y pagos sin depender de accion manual.

Cada transicion escribe:

- `clases/{id}.lifecycleStatus`, `lifecycleTargetStatus`, `lifecyclePreviousStatus`, `lifecycleTimestamps.*`.
- `classLifecycleEvents/{transitionId}` con estado anterior, siguiente, asistencia y pagos.
- `auditLogs/{transitionId}` para revision administrativa.
- Notificaciones idempotentes a familia, profesor o admin cuando el estado requiere accion.
- Contadores del worker para estadisticas operativas.

## Reglas de diseno

- El motor es idempotente: repetir el worker no duplica notificaciones ni eventos del mismo tramo.
- Las reprogramaciones usan una huella de fecha/hora en el historial para no mezclar ciclos distintos.
- Las incidencias dominan el ciclo: si hay discrepancia o incidencia abierta, el estado pasa a `incidencia_abierta`.
- Los pagos se separan en cobro familiar (`pendiente_pago` -> `pago_recibido`) y liquidacion al profesor (`comision_liquidada`).
- La clase solo se archiva cuando ya esta revisada y ha pasado el periodo de cierre.
