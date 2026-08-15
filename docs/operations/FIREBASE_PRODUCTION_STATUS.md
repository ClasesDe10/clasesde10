# Estado de produccion Firebase

Actualizado: 2026-07-07

## Produccion

Dominio canonico:

```text
https://clasesde10.com
```

Dominio Firebase:

```text
https://clasesde10-50add.web.app
```

## Activo

- Firebase Hosting.
- Firebase Auth.
- Firestore.
- Firebase Storage con reglas.
- Fallback Firestore para documentos pequenos si Storage no tiene bucket.
- Firebase Cloud Messaging.
- PWA y TWA Android.
- Worker gratuito de GitHub Actions.

## Fuera de produccion

- Netlify.
- Supabase real.
- Apps Script.
- Firebase Cloud Functions.

## Comandos de salud

```bash
npm run audit:hosting
npm run audit:free-infrastructure
npm run audit:production-readiness
npm run audit:supabase
npm run check:automation
```

## Regla operativa

Si una funcionalidad necesita backend, primero debe entrar en el worker gratuito
o en Firestore Rules. Activar Blaze, Cloud Functions o una pasarela externa es
una decision nueva, no el camino por defecto.

## Storage

El bucket de Firebase Storage sigue siendo recomendable para documentos grandes
y chat multimedia. Si no existe, `js/document-storage-provider.js` guarda
documentos y justificantes habituales en `documentBlobs` / `documentBlobChunks`
con limite de 5 MB y acceso por reglas
de propietario/admin. Es un puente de coste 0, no sustituto permanente para
archivos pesados.
