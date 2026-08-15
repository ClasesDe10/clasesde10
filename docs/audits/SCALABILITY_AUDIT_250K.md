# SCALABILITY_AUDIT_250K - ClasesDe10

Fecha: 2026-06-28

Objetivo: preparar ClasesDe10 para un escenario de 250.000 usuarios registrados, decenas de miles de clases semanales y crecimiento continuo sin rehacer la arquitectura central.

## Resumen ejecutivo

La plataforma ya esta sobre Firebase, con Hosting, Firestore, Auth, reglas, PWA, notificaciones, matching, pagos, calendario, reputacion y automatizaciones por GitHub Actions. La base es valida para crecer, pero antes de esta fase existian cuatro riesgos serios de escala:

1. Procesos de evento que hacian trabajo pesado directamente.
2. Consultas y workers con lecturas completas de colecciones.
3. Falta de una cola interna con reintentos, dead-letter y trazabilidad.
4. Indices insuficientes para consultas compuestas futuras de clases, pagos, matching, chats, reputacion y operaciones.

Esta fase introduce una capa de escala sin cambiar la experiencia visible del usuario: `systemJobs`, metricas periodicas, alertas operativas, indices, limites defensivos y pruebas.

## Estado de despliegue

Desplegado correctamente:

- Firestore rules.
- Firestore indexes.
- Firebase Hosting.

Implementado en codigo. Cloud Functions no forman parte de la arquitectura vigente; la ejecucion operativa queda cubierta por GitHub Actions:

- Worker `processQueuedSystemJobs`.
- Worker `writeScaleMetricSnapshot`.
- Cambio de trigger para encolar `matching.request`.
- Worker gratuito `scripts/firebase-automation-worker.mjs`.
- Workflow `.github/workflows/firebase-automation.yml`.

Conclusion actual: activar Blaze no es necesario para produccion. Para coste 0,
la cola y las automatizaciones criticas se ejecutan desde GitHub Actions cada
hora y por la noche en modo completo.

## Cambios implementados

### 1. Cola operativa interna

Nuevo modelo: `systemJobs`.

Campos principales:

- `type`: tipo de trabajo.
- `payload`: datos minimos del trabajo.
- `status`: `queued`, `processing`, `completed`, `dead_letter`, `cancelled`.
- `runAt`: momento de ejecucion.
- `priority`: prioridad numerica.
- `attempts` y `maxAttempts`: control de reintentos.
- `leaseUntil` y `workerId`: leasing para evitar ejecuciones dobles.
- `idempotencyKey`: evita duplicados.
- `trace`: contexto de trazabilidad.

Worker:

- `processQueuedSystemJobs`: reclama trabajos por lease, procesa en lotes y aplica reintentos con backoff exponencial.

Tipos iniciales soportados:

- `matching.request`
- `notification.admin`
- `notification.internal`
- `metrics.snapshot`
- `audit.event`
- `noop`

Impacto: los trabajos caros dejan de depender de un trigger directo. Si entran muchas solicitudes a la vez, se encolan y se procesan de forma controlada.

### 2. Matching desacoplado

Antes: el trigger `solicitudes/{requestId}` calculaba matching directamente.

Ahora: el trigger crea un `systemJob` idempotente `matching.request`. El procesamiento real ocurre en la cola.

Beneficios:

- Menos riesgo de timeouts.
- Menos duplicados.
- Mejor control ante picos.
- Reintentos automaticos.
- Posibilidad de priorizar solicitudes urgentes.

### 3. Observabilidad y metricas

Colecciones nuevas:

- `metricSnapshots`
- `opsAlerts`
- `deadLetters`

Worker:

- `writeScaleMetricSnapshot`: genera snapshots operativos en el barrido completo.

Metricas iniciales:

- usuarios
- profesores
- familias
- alumnos
- solicitudes
- asignaciones
- clases
- pagos
- notificaciones
- push tokens
- trabajos en cola
- trabajos fallidos permanentes
- incidencias

Alertas iniciales:

- backlog alto de jobs
- trabajos en dead-letter
- pagos vencidos
- backlog alto de notificaciones sin leer

### 4. Reintentos y dead-letter

La cola usa:

- lease temporal para evitar doble procesamiento.
- backoff exponencial.
- limite de intentos.
- `deadLetters` para errores permanentes.
- `automationEvents` para auditoria de ejecucion.

Esto prepara pagos, matching, notificaciones e IA para fallos temporales sin intervencion manual inmediata.

### 5. Indices Firestore

Se ampliaron indices para:

- `clases` por profesor, familia, alumno, estado y fecha.
- `pagos` por familia, profesor, estado, vencimiento y conciliacion.
- `notificaciones` por usuario, lectura y fecha.
- `chats` por familia/profesor y actividad.
- `mensajes` por emisor y fecha.
- `solicitudes` y `solicitudMatches` para matching.
- `profesores` y `familias` por estado, confianza y actividad.
- `automationEvents`, `systemJobs`, `deadLetters`, `metricSnapshots`, `opsAlerts`.

### 6. Reglas de seguridad

Se cerraron las nuevas colecciones operativas a admin:

- `systemJobs`
- `deadLetters`
- `metricSnapshots`
- `opsAlerts`

Los usuarios normales no pueden manipular colas, metricas ni alertas.

### 7. Reduccion de lecturas completas

Cambios aplicados:

- `generateMonthlySummary` ya no lee todas las clases historicas. Ahora consulta solo el mes correspondiente por rango de fecha.
- Matching en el worker usa limites configurables:
  - `MATCHING_TEACHER_SCAN_LIMIT`
  - `MATCHING_USER_SCAN_LIMIT`
  - `MATCHING_ASSIGNMENT_SCAN_LIMIT`
- Worker de automatizacion usa limites configurables:
  - `TRUST_CONTEXT_LIMIT`
  - `MATCHING_TEACHER_SCAN_LIMIT`
  - `MATCHING_USER_SCAN_LIMIT`
  - `MATCHING_ASSIGNMENT_SCAN_LIMIT`
- Chat admin deja de cargar todos los chats y carga los 200 mas recientes.
- Contador realtime de notificaciones escucha solo notificaciones pendientes recientes.

### 8. Cache corta en worker

Se anadio cache en memoria de 60 segundos para:

- usuarios admin
- configuracion de notificaciones

Impacto: menor latencia y menor coste en picos de notificaciones y automatizaciones.

### 9. Tests

Nuevo test:

- `scripts/scale-engine-test.mjs`

Valida:

- idempotencia estable.
- leasing.
- bloqueo por lease activo.
- completado.
- reintentos.
- dead-letter.
- redaccion de datos sensibles en auditoria.
- agregacion de metricas.
- generacion de alertas.
- sampling de trazas.

Tambien se integro en:

- `check:syntax`
- `check:quality`
- `audit:production-readiness`

## Auditoria por dominio

### Base de datos

Riesgo anterior: consultas compuestas sin indices y colecciones que podian crecer sin control.

Mitigacion aplicada:

- Indices compuestos nuevos.
- Colecciones operativas separadas.
- Reglas admin-only.
- Lecturas limitadas en procesos automaticos.

Riesgo restante:

- Falta una estrategia de particionado logico para clases y mensajes a muy largo plazo.
- A 250k usuarios conviene materializar vistas por usuario: `userFeeds/{uid}`, `teacherStats/{uid}`, `familyStats/{uid}`, `classRollups/{month}`.

### Worker gratuito

Riesgo anterior: triggers o procesos con trabajo pesado directo.

Mitigacion aplicada:

- Cola `systemJobs`.
- Jobs idempotentes.
- Reintentos y dead-letter.
- Matching diferido.
- Metric rollups.

Riesgo restante:

- Evitar fan-out masivo en una sola ejecucion del worker. El siguiente paso es
  segmentar notificaciones por lotes si crece mucho el volumen.

### Notificaciones

Riesgo anterior:

- Lectura realtime demasiado amplia.
- Sin metricas de backlog.

Mitigacion aplicada:

- Contador de no leidas limitado.
- Metricas de notificaciones.
- Alertas por backlog.

Riesgo restante:

- Para cientos de miles de usuarios se debe usar fan-out por lotes y segmentacion, no `Promise.all` masivo.

### Chat y mensajeria

Riesgo anterior:

- Admin podia cargar todos los chats.

Mitigacion aplicada:

- Admin carga los 200 chats recientes.
- Mensajes siguen limitados a 100 por conversacion.

Riesgo restante:

- Falta paginacion historica.
- Falta indice/materializacion de inbox por usuario para no depender de chats globales.

### Matching e IA

Riesgo anterior:

- Matching podia escanear todos los profesores, usuarios y asignaciones.
- IA podria ser cara si se llama sin control.

Mitigacion aplicada:

- Matching pasa por cola.
- Limites configurables de escaneo.
- Reintentos controlados.
- Indices de matching.

Riesgo restante:

- El matching profesional a escala debe usar un indice `teacherSearchIndex` mantenido por eventos, con campos normalizados: materias, niveles, modalidad, zona, disponibilidad, trustScore, carga, responseTime, acceptanceRate.
- La IA debe quedar como reranker de top N, nunca como buscador primario.
- Se debe cachear resultado IA por `requestProfileHash`.

### Calendario

Riesgo anterior:

- Procesos periodicos podian evaluar clases sin particion temporal.

Mitigacion aplicada:

- Indices por estado y fecha.
- La arquitectura de cola permite mover recordatorios e incidencias a jobs.

Riesgo restante:

- Los workers de calendario todavia deben evolucionar a consultas por ventana temporal concreta: proximas 24h, finalizadas hace 1h, pendientes vencidas.

### Pagos

Riesgo anterior:

- Conciliacion y recordatorios pueden mezclarse con escaneos amplios.

Mitigacion aplicada:

- Indices por estado, vencimiento y conciliacion.
- Alertas de pagos vencidos.
- Cola preparada para `payment.reconcile`, `payment.reminder`, `payment.deadline`.

Riesgo restante:

- Bizum manual no se puede conciliar de forma 100% automatica sin proveedor/API bancaria.
- Stripe/RedSys deben ser la via de conciliacion automatica cuando se quiera escala real.

### Storage

Riesgo actual:

- Al crecer documentos/fotos, hay que evitar listar buckets completos y controlar tamanos/formatos.

Mitigacion existente:

- Reglas de Storage ya tienen validaciones.

Siguiente paso:

- Generar miniaturas de fotos y previews de documentos mediante jobs.
- Antivirus/OCR si se aceptan documentos sensibles.

### Seguridad

Mitigacion aplicada:

- Nuevas colecciones operativas admin-only.
- Auditoria de readiness ampliada.
- Redaccion de datos sensibles en eventos de auditoria del `scale-engine`.

Riesgo restante:

- Hay que evitar guardar secretos, tokens, documentos o datos de pago completos en `payload` de jobs.

### Mantenimiento

Mejora aplicada:

- `audit:production-readiness` ahora verifica reglas, indices y Functions de escala.

Riesgo restante:

- Falta CI/CD remoto obligatorio que ejecute `check:quality` antes de cada deploy.

## Arquitectura objetivo 250k

```
Entrada usuario
  -> Firestore write minimo
  -> systemJobs
  -> Cloud Function worker por lotes
  -> auditLogs / metricSnapshots / opsAlerts
  -> notificaciones internas y push
```

Patron por dominio:

- Solicitud nueva: crear doc ligero, encolar matching.
- Matching: filtro determinista sobre indice, IA solo sobre top N, guardar ranking.
- Clase: motor de estados, eventos de historial, jobs para recordatorios.
- Pago: evento de proveedor, conciliacion idempotente, job de seguimiento.
- Notificacion: doc interno, push best-effort, dead-letter si falla.
- Reputacion: rollups incrementales, no recalculo global diario.

## Variables operativas recomendadas

- `MATCHING_TEACHER_SCAN_LIMIT`: empezar en 1000.
- `MATCHING_USER_SCAN_LIMIT`: empezar en 2000.
- `MATCHING_ASSIGNMENT_SCAN_LIMIT`: empezar en 5000.
- `TRUST_CONTEXT_LIMIT`: empezar en 2000.

Cuando haya mas volumen, estos limites no deben subirse indefinidamente. Deben sustituirse por indices materializados y rollups incrementales.

## Prioridad siguiente

1. Crear `teacherSearchIndex` y mantenerlo por eventos.
2. Crear `userInbox/{uid}/chats/{chatId}` para chat paginado por usuario.
3. Convertir recordatorios de calendario y pagos a `systemJobs`.
4. Crear rollups incrementales de dinero y clases por mes.
5. Encolar fan-out de notificaciones masivas.
6. Cachear IA por hash de solicitud/perfil.
7. Crear dashboard admin de `opsAlerts`, `deadLetters` y `metricSnapshots`.

## Porcentaje de preparacion de escala

Estimacion realista despues de esta fase:

- Base Firebase/Hosting/Auth: 80%
- Reglas e indices: 75%
- Cola y reintentos: 55%
- Observabilidad: 45%
- Matching escalable: 40%
- Chat escalable: 35%
- Pagos escalables: 45%
- Notificaciones escalables: 50%
- IA escalable: 35%
- Calendario escalable: 45%

Preparacion global para 250k usuarios: 52%.

Esto no significa que la plataforma no pueda operar ahora. Significa que ya no depende solo de ejecuciones directas y escaneos completos para crecer, pero todavia quedan materializaciones y paginacion historica para escala grande sostenida.
