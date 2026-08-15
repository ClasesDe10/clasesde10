# Migracion Firebase - estado actual

Actualizado: 2026-07-07

## Estado

La migracion operativa a Firebase esta consolidada: la produccion usa Firebase
Hosting, Auth, Firestore, Storage y FCM. Las referencias `supabase-client.js`
son una capa de compatibilidad que delega en Firebase, no una dependencia real
de Supabase.

## Arquitectura final vigente

- Frontend estatico/PWA.
- Firebase Spark para identidad, datos, documentos y hosting.
- GitHub Actions worker para automatizaciones de servidor.
- Apps Script, Sheets y Supabase como historico/compatibilidad, no como sistema
  operativo.

## No hacer

- No activar Blaze para desplegar Cloud Functions.
- No introducir nuevas funciones en Supabase Edge Functions.
- No crear nuevos flujos en Apps Script.
- No guardar service-role keys ni credenciales privadas en frontend.

## Validacion

Comandos obligatorios antes de desplegar:

```bash
npm run audit:free-infrastructure
npm run audit:production-readiness
npm run check:automation
```
