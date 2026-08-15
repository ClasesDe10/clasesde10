# Worker gratuito sin Cloud Functions

## Decision final

El proyecto no necesita pasar a Blaze para ejecutar las automatizaciones criticas. Produccion queda en Firebase Spark para Hosting/Auth/Firestore/Storage y mueve toda la ejecucion servidor a un worker gratuito de GitHub Actions.

Este enfoque no despliega nada en Google Cloud, no habilita `cloudbuild.googleapis.com` ni `artifactregistry.googleapis.com`, y por tanto evita el bloqueo de Firebase Functions en proyectos sin Blaze.

## Como funciona

GitHub Actions arranca un runner, instala solo dependencias de produccion y ejecuta:

```bash
npm run automation:matching -- --critical --limit=25
```

El worker usa Firebase Admin SDK con una cuenta de servicio guardada como secreto de GitHub. Firestore sigue siendo el backend; lo que cambia es quien ejecuta las tareas periodicas.

## Frecuencia

- Cada 2 horas: modo `critical`, para formularios nuevos, cuentas familiares asistidas, clases, pagos, justificantes, incidencias, recordatorios y jobs pendientes, con un consumo de cuota compatible con Spark.
- Cada noche a las 03:17 UTC: modo `full`, para analitica, confianza, escala y limpiezas mas pesadas.
- Manual desde GitHub Actions: modos `critical`, `full` o `trust`, con opcion `dry_run`.

La frecuencia de 10 minutos da continuidad a los avisos cuando el panel admin está cerrado. Mientras el panel está abierto, la bandeja muestra además los formularios en tiempo real.

## Que sustituye de Functions

Sustituye las automatizaciones periodicas y los triggers que pueden resolverse por barrido:

1. Lee `leadsPublicos` con `estado = nuevo`.
2. Si el lead es `familia`, crea `solicitudes/lead_{leadId}`, avisa al equipo y enlaza la solicitud con la cuenta cuando la familia completa la activación segura.
3. Si el lead es `profesor`, calcula precio sugerido y diagnostico.
4. Calcula top 5 profesores para solicitudes nuevas.
5. Procesa propuestas de horario del chat y eventos pendientes.
6. Procesa clases finalizadas sin confirmar.
7. Crea avisos de asistencia pasadas 24h.
8. Calcula pagos pendientes y vencidos segun calendario de pago familiar.
9. Escala impagos con avisos cordiales y deduplicados.
10. Reabre seguimiento cuando un justificante queda pendiente o vencido.
11. Concilia pagos verificados con sus clases.
12. Crea incidencias operativas solo cuando aportan algo accionable.
13. Entrega push FCM para notificaciones pendientes, sin Cloud Functions.
14. Actualiza seguimiento, confianza, supervision y metricas.

## Lo que no intentamos hacer aqui

- No sustituye un webhook HTTP instantaneo de Stripe. Ahora los pagos van por Bizum centralizado, asi que no es necesario para produccion.
- No hace push en milisegundos. Los avisos salen en el siguiente barrido. Para ClasesDe10 esto es aceptable porque los hitos importantes son 24h/48h, vencimientos y seguimiento.

## Como se usa la IA

La IA no sustituye las reglas. Primero se calcula una lista segura de candidatos con datos reales:

- materia
- nivel
- modalidad
- zona
- disponibilidad
- carga actual
- verificacion del profesor

Despues, si `GEMINI_API_KEY` esta configurada, Gemini recibe solo esos candidatos y devuelve JSON con:

- `teacherUid`
- `score`
- `reason`
- `risks`

No puede inventar profesores fuera de la lista porque el worker ignora cualquier `teacherUid` que no venga del ranking base.

## Activacion

El workflow esta en:

`.github/workflows/firebase-automation.yml`

Necesita uno de estos secretos de GitHub Actions. Si no existe, el workflow falla en rojo para que no parezca que esta funcionando:

- `FIREBASE_SERVICE_ACCOUNT_JSON`
- `FIREBASE_SERVICE_ACCOUNT_BASE64`

Para activar IA:

- `GEMINI_API_KEY`

No se guardan credenciales en el repositorio.

## Pasos de activacion sin pagar

1. En Firebase Console, abre el proyecto `clasesde10-50add`.
2. Ve a Project settings > Service accounts.
3. Genera una clave privada nueva de la cuenta de servicio.
4. En GitHub, ve al repo `ClasesDe10/clasesde10`.
5. Abre Settings > Secrets and variables > Actions.
6. Crea `FIREBASE_SERVICE_ACCOUNT_JSON` con el JSON completo de la clave.
7. Ve a Actions > Firebase automation worker without Blaze.
8. Ejecuta manualmente `Run workflow` con `mode = critical`, `limit = 1` y `dry_run = true`.
9. Si pasa, ejecuta `mode = critical` y `dry_run = false`.
10. A partir de ahi el horario cada 10 minutos queda activo.

## Senales de que esta funcionando

- En GitHub Actions aparece una ejecucion verde cada 10 minutos.
- Firestore recibe documentos `workerHeartbeats` con `status = finished`.
- Las notificaciones de pagos vencidos, clases sin marcar y jobs pendientes aparecen sin desplegar Functions.
- Los push se marcan en cada documento `notificaciones/{id}` con `push.delivery = github_actions_worker`.
- Si Firestore agota cuota gratuita, el worker registra `quota_exhausted` y reintenta en la siguiente ejecucion.

## Comandos locales

Autoprueba sin Firebase:

```bash
npm run automation:matching -- --self-test
```

Ejecucion real:

```bash
npm run automation:matching
```

Ejecucion sin escribir:

```bash
npm run automation:matching -- --dry-run
```

Ejecucion local usando el login de Firebase CLI:

```bash
npm run automation:matching:cli -- --critical --limit=25 --dry-run
```

Auditoria de coste cero:

```bash
npm run audit:free-infrastructure
```
