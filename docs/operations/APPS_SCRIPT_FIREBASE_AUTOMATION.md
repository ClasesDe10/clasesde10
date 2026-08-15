# Apps Script -> automatizacion Firebase sin Blaze

Actualizado: 2026-07-07

## Objetivo

Sustituir el Apps Script historico por una automatizacion sobre Firebase que no
dependa de Gmail, Google Sheets ni Cloud Functions.

## Sustitucion funcional

| Apps Script historico | Sustitucion actual |
| --- | --- |
| Formularios externos por `doPost` | Formularios escriben en Firestore |
| Procesar familias/profesores | Worker procesa leads y crea solicitudes/perfiles |
| Matching determinista/IA | Worker calcula ranking; Gemini es opcional |
| Reintentos de alumnos pendientes | Worker escanea solicitudes pendientes |
| Resumen mensual | Worker crea metricas y snapshots |
| Correos/Gmail legacy | Eliminado como fuente operativa |

## Estado actual

Activo:

- Firebase Hosting/Auth/Firestore/Storage/FCM.
- `scripts/firebase-automation-worker.mjs`.
- `.github/workflows/firebase-automation.yml`.
- Reglas e indices de Firebase.
- Panel admin sobre Firebase/compatibilidad Firebase.

No activo:

- Cloud Functions.
- Apps Script.
- Supabase Edge Functions.

## Por que no Cloud Functions

El despliegue de Firebase Functions exige activar Blaze para habilitar servicios
de build/artefactos. Eso contradice el requisito de coste 0. La solucion activa
es el worker de GitHub Actions, que cubre las tareas periodicas necesarias.

## Activacion del worker

El repo necesita uno de estos secretos en GitHub Actions:

- `FIREBASE_SERVICE_ACCOUNT_JSON`
- `FIREBASE_SERVICE_ACCOUNT_BASE64`

Opcional:

- `GEMINI_API_KEY`

El workflow falla explicitamente si faltan credenciales, para evitar una falsa
sensacion de automatizacion activa.
