# Apps Script -> Firebase Automation

## Objetivo

Sustituir el Apps Script historico por una automatizacion en Firebase que no dependa de Gmail ni de Google Sheets como backend operativo.

## Mapa de sustitucion

| Apps Script historico | Motivo original | Sustitucion Firebase preparada |
| --- | --- | --- |
| `doPost` | Recibir formularios externos | Formularios publicos escriben en `leadsPublicos`; `processPublicLead` procesa cada lead |
| `procesarProfesor` | Registrar candidato profesor y generar diagnostico | `processPublicLead` calcula precio sugerido, diagnostico y notifica a administradores |
| `procesarFamilia` | Registrar solicitud de familia/alumno | `processPublicLead` crea `solicitudes/lead_{leadId}` y conserva snapshot de familia/alumno |
| `procesarEmailsNuevos` | Convertir correos de formularios en filas | Eliminado como dependencia; la fuente pasa a ser Firestore |
| `buscarMejorProfesor` | Matching determinista profesor/alumno | `generateMatchesForRequest` calcula candidatos por materia, nivel, modalidad, zona y carga |
| `buscarMejorProfesorGemini` / `matchingIACompleto` | Reordenar candidatos con Gemini | `callGeminiIfConfigured` usa Gemini si existe `GEMINI_API_KEY`; si no, usa ranking determinista |
| `procesarAlumnosPendientes` | Reintentar matching pendiente | `scanPendingMatching` revisa solicitudes nuevas cada hora |
| `onEdit` / `asignarEnAlumnos_` | Crear asignacion al elegir profesor | `createAssignmentOnRequestAssigned` crea `asignaciones` al marcar una solicitud como asignada |
| `generarResumenMensual` | Resumen mensual administrativo | `generateMonthlySummary` genera `resumenMensual/{YYYY-MM}` el dia 1 |

## Colecciones nuevas

- `automationEvents`: auditoria de automatizaciones ejecutadas.
- `matchingRuns`: ejecuciones de matching.
- `solicitudMatches`: candidatos propuestos por solicitud.
- `resumenMensual`: resumen mensual calculado.

## Estado actual

Preparado en codigo:

- Cloud Functions v2 en `functions/index.js`.
- Configuracion de Functions en `firebase.json`.
- Reglas Firestore para que administradores puedan leer las colecciones nuevas.
- Panel admin con bloque de recomendaciones en el modal de asignar profesor.

Publicado ya:

- Hosting.
- Reglas Firestore.
- Panel admin actualizado.

Bloqueado por Firebase:

- Despliegue de Cloud Functions. Error exacto obtenido: el proyecto `clasesde10-50add` debe estar en plan Blaze para habilitar `artifactregistry.googleapis.com`.

## Activacion pendiente

Cuando el proyecto este en Blaze:

```bash
npx firebase-tools deploy --only functions --project clasesde10-50add
```

Opcional para matching con Gemini:

- Configurar `GEMINI_API_KEY` como variable/secret de Functions.
- Sin esa clave, el matching queda activo en modo determinista.
