# Sistema de notificaciones ClasesDe10

## Objetivo

Firestore `notificaciones` es la fuente de verdad. El chat, las automatizaciones, Cloud Functions y el panel admin escriben ahi los eventos importantes. La UI solo lee, marca como leido y registra tokens push del dispositivo.

## Colecciones

| Coleccion | Uso |
| --- | --- |
| `notificaciones/{id}` | Historial interno por usuario: titulo, cuerpo, tipo, prioridad, canales, payload y estado de lectura. |
| `notificationTokens/{id}` | Token FCM web por usuario/dispositivo. Lo escribe el propio usuario al activar avisos. |
| `configuracion/notificaciones` | Configuracion privada de admin: canales, tipos de evento y roles activos. |
| `configuracionPublica/notificaciones` | Configuracion publica minima, especialmente `fcmVapidKey`. |
| `notificationPreferences/{uid}` | Preparado para preferencias individuales por usuario. |

## Flujo

1. Un evento ocurre: mensaje, solicitud, pago, clase sin marcar, documento, incidencia, perfil actualizado.
2. Codigo de confianza escribe un documento en `notificaciones`.
3. La app lo muestra en la pestana Chat / Notificaciones.
4. Si el documento incluye canal `push`, `sendPushOnNotificationCreated` busca tokens activos y envia FCM.
5. El service worker muestra la notificacion en segundo plano y abre la URL de accion al tocarla.

## Eventos principales

- `chat_message`
- `class_reminder`
- `class_confirmation_needed`
- `class_unmarked_after_1h`
- `class_schedule_change`
- `class_incident`
- `weekly_payment_due`
- `family_payment_pending`
- `teacher_payout_pending`
- `payment_overdue`
- `request_created`
- `matching_ready`
- `matching_no_match`
- `assignment_created`
- `verification_pending`
- `document_review_pending`
- `profile_updated`
- `admin_manual`

## Panel admin

El panel de notificaciones dentro del chat permite:

- enviar avisos manuales por rol;
- activar/desactivar canales `internal`, `browser` y `push`;
- activar/desactivar eventos criticos;
- guardar la clave publica FCM/VAPID sin tocar codigo.

## Push real

Para push web persistente hacen falta dos piezas:

- clave publica FCM/VAPID guardada en `configuracionPublica/notificaciones.fcmVapidKey`;
- funciones desplegadas, especialmente `sendPushOnNotificationCreated`.

Si falta la clave VAPID, la app mantiene notificaciones internas y avisos locales mientras el navegador esta abierto.

## Seguridad

- Los usuarios solo leen sus notificaciones y marcan `readAt/leida`.
- Los usuarios solo escriben sus propios tokens push.
- Solo admin escribe configuracion y avisos manuales.
- Las notificaciones automaticas se crean desde Cloud Functions o el worker autorizado.

## Automatizaciones cubiertas

- Clases proximas.
- Clases finalizadas sin marcar.
- Confirmacion de asistencia pendiente.
- Incidencias por discrepancia/cancelacion/reprogramacion.
- Pagos familiares pendientes o vencidos.
- Solicitudes Bizum de profesores pendientes.
- Nuevos mensajes.
- Nuevas solicitudes y matching listo.
- Nuevas asignaciones.
- Documentos/verificaciones pendientes.
- Cambios relevantes de perfil.

## Siguiente mejora

Cuando el volumen suba, anadir preferencias por usuario en `notificationPreferences/{uid}` y resumen diario para eventos no urgentes.
