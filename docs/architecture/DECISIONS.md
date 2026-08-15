# Decisiones de arquitectura

Actualizado: 2026-07-07

## ADR-001 - Firebase Spark como fuente de verdad

Estado: aceptada.

Decision: Firebase Auth, Firestore, Storage, Hosting y FCM son la plataforma
operativa. Supabase queda solo como compatibilidad de API durante la migracion de
codigo antiguo y no debe recibir nuevas funcionalidades.

## ADR-002 - Sin Firebase Cloud Functions en produccion

Estado: aceptada.

Decision: `firebase.json` no define `functions`, `functions/index.js` no existe
y `functions/package.json` solo contiene motores compartidos CommonJS. Cualquier
automatizacion obligatoria debe funcionar sin Blaze.

## ADR-003 - Worker gratuito en GitHub Actions

Estado: aceptada.

Decision: `scripts/firebase-automation-worker.mjs` ejecuta las tareas de fondo
con Firebase Admin SDK desde `.github/workflows/firebase-automation.yml`.

Consecuencia: la plataforma no tiene triggers instantaneos de servidor, pero los
hitos de producto son de horas/dias y la latencia horaria es suficiente.

## ADR-004 - Compatibilidad Supabase sobre Firebase

Estado: aceptada.

Decision: los imports historicos de `supabase-client.js` se mantienen, pero
exportan `firebase-data-client.js`. Esto reduce riesgo sin mantener Supabase como
backend real.

## ADR-005 - Apps Script y Sheets son legado

Estado: aceptada.

Decision: `legacy/apps-script` y `migration-private` se conservan para auditoria
e historico. No forman parte de produccion.

## ADR-006 - PWA y APK/TWA sobre la misma web

Estado: aceptada.

Decision: la app movil se construye como TWA sobre `https://clasesde10.com`, con
manifest, service worker y `assetlinks.json`. Las actualizaciones se publican en
la web; la APK solo envuelve el acceso.

## ADR-007 - Pagos por Bizum centralizado

Estado: aceptada.

Decision: la familia paga a ClasesDe10 y el admin paga despues al profesor. El
sistema registra dia de pago, justificante, clases cubiertas, validacion admin e
importe proporcional por duracion.

## ADR-008 - Guardias obligatorios

Estado: aceptada.

Decision: CI y auditorias deben fallar si reaparece un deploy de Functions,
dependencias `firebase-functions`, scripts `--only functions` o validaciones de
un `functions/index.js` inexistente.
