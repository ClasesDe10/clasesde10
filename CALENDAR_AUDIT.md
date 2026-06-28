# Auditoria e implementacion del sistema de calendario

Fecha: 2026-06-28

## Objetivo

El calendario debe soportar el ciclo completo de una clase: creacion, modificacion, reprogramacion, cancelacion, confirmacion por profesor, confirmacion por familia, pago, incidencias, recordatorios y futura sincronizacion con calendarios externos.

## Estado anterior detectado

- El sistema mezclaba estados legacy (`programada`) con estados nuevos sin una normalizacion central.
- Las pantallas de admin, profesor, familia y alumno llamaban directamente a estados concretos y podian dejar clases fuera.
- El profesor podia marcar clases, pero no existia un resumen central de asistencia ni una deteccion robusta de discrepancias.
- La familia podia confirmar clases, pero no se generaba una incidencia estructurada cuando reportaba problemas.
- Las notificaciones automatizadas solo cubrian parcialmente clases sin marcar y pagos.
- No habia arquitectura preparada para Google Calendar o iCalendar.
- Algunas consultas usaban combinaciones de filtros que pueden romper en Firestore o exigir indices innecesarios.

## Arquitectura creada

### Motor central

Archivo: `js/calendar-engine.js`

Responsabilidades:

- Normalizar estados de clase.
- Mantener compatibilidad con `programada` como alias legacy de `confirmada`.
- Calcular inicio, fin, duracion y finalizacion real de una clase.
- Validar horarios antes de guardar.
- Construir payloads consistentes para admin, profesor y familia.
- Calcular resumen de asistencia:
  - `pendiente`
  - `pendiente_familia`
  - `pendiente_profesor`
  - `confirmada_por_ambas_partes`
  - `incidencia`
  - `discrepancia`
- Crear payloads de incidencias.
- Detectar ventanas de recordatorio de 24h y 2h.

### Sincronizacion futura

Archivo: `js/calendar-sync.js`

Responsabilidades:

- Generar eventos iCalendar.
- Generar calendarios `.ics`.
- Generar URLs de Google Calendar tipo template.
- Dejar metadatos preparados para una futura integracion OAuth con Google Calendar.

La integracion push con Google Calendar queda preparada a nivel de estructura, pero no activada porque requiere OAuth y consentimiento de usuario.

## Estados soportados

- `pendiente`: clase creada pero pendiente de cerrar detalles.
- `confirmada`: clase activa y prevista.
- `programada`: alias legacy compatible, se muestra como `confirmada`.
- `realizada`: clase marcada como dada.
- `cancelada`: clase cancelada.
- `reprogramada`: clase cambiada de fecha u hora.
- `pagada`: estado visual derivado cuando una clase realizada tiene pago validado.

## Flujo de admin

El admin crea o edita clases desde el panel.

Validaciones:

- Profesor obligatorio.
- Alumno obligatorio.
- Fecha obligatoria.
- Materia obligatoria.
- Hora de inicio y fin obligatorias.
- Fin posterior a inicio.
- Duracion maxima de 8 horas.
- El importe del profesor no puede superar el total de la familia.

Al guardar:

- Se escriben campos legacy y Firebase equivalentes.
- Se calcula duracion.
- Se calcula margen.
- Se guarda `familyUid` cuando el alumno lo tiene.
- Se conserva el horario anterior si se reprograma.
- Se guarda metadata de calendario.
- Se notifica a profesor y familia cuando hay nueva clase, cancelacion o cambio de horario.

## Flujo de profesor

El profesor puede registrar una clase terminada como:

- `realizada`
- `cancelada`
- `reprogramada`

Al marcar:

- Se escribe `teacherConfirmationStatus`.
- Se escribe `teacherAttendanceStatus`.
- Se actualiza `attendanceStatus`.
- Si cancela o reprograma, se abre estado de incidencia.

## Flujo de familia

La familia puede confirmar una clase terminada como:

- `realizada`
- `incidencia`

Al marcar incidencia:

- Se actualiza la clase.
- Se crea un documento en `incidencias`.
- El admin puede leer y gestionar esa incidencia.

## Automatizaciones

Archivo: `scripts/firebase-automation-worker.mjs`

Procesos añadidos:

- Recordatorios de clase 24h antes.
- Recordatorios de clase 2h antes.
- Aviso si una clase lleva mas de una hora terminada y nadie la ha marcado.
- Escalado a incidencia si sigue sin marcar 24h despues.
- Recordatorio a familia si el profesor marco realizada y falta confirmacion familiar.
- Recordatorio a profesor si la familia confirmo y falta confirmacion del profesor.
- Creacion idempotente de incidencias si hay discrepancia, cancelacion o reprogramacion.
- Conservacion de recordatorios de pago semanal y pagos Bizum pendientes.

Todas las notificaciones usan claves idempotentes para evitar duplicados.

## Reglas de seguridad

Archivo: `firebase/firestore.rules`

Se valida que:

- El profesor solo pueda modificar campos de registro/asistencia de sus clases.
- La familia solo pueda confirmar asistencia de sus clases.
- Las familias/profesores participantes puedan crear incidencias vinculadas a sus clases.
- Solo admin pueda actualizar o borrar incidencias.
- Las incidencias solo sean leibles por admin o participantes de la clase.

## Consultas revisadas

Se eliminaron filtros `in()` por estado en pantallas donde podian combinarse con otros `in()`.

Estrategia actual:

- Firestore filtra por usuario/alumno/fecha.
- El motor de calendario filtra estados scheduled en cliente.
- Esto evita errores de Firestore y reduce dependencia de indices compuestos.

## Pruebas

Pruebas creadas o actualizadas:

- `scripts/calendar-engine-test.mjs`
- `scripts/calendar-notifications-test.mjs`

Cobertura:

- Normalizacion de estados.
- Validacion de horarios.
- Payloads de admin/profesor/familia.
- Incidencias.
- Ventanas de recordatorio.
- ICS y URL de Google Calendar.
- Presencia de reglas, automatizaciones y UI conectada.

## Pendiente futuro

- Activar OAuth real de Google Calendar por usuario.
- Crear feed `.ics` autenticado por usuario si se quiere suscripcion continua.
- Crear UI para descargar/exportar calendario.
- Anadir push notifications reales desde FCM cuando el usuario instale la PWA y acepte permisos.
- Crear panel admin dedicado de incidencias de calendario si el volumen crece.
