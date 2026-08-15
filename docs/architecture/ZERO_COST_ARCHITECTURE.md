# Arquitectura coste 0

## Decision

ClasesDe10 usa Firebase solo en las piezas que funcionan en Spark sin activar Blaze:

- Firebase Hosting para la web estatica/PWA.
- Firebase Auth para login.
- Firestore para datos y reglas de seguridad.
- Firebase Storage para documentos.
- Firebase Cloud Messaging para push.
- Firestore `documentBlobs` como fallback temporal para documentos pequenos si
  el bucket de Storage no esta inicializado.

La ejecucion servidor que antes pertenecia a Cloud Functions pasa a GitHub Actions:

- `.github/workflows/firebase-automation.yml`
- `scripts/firebase-automation-worker.mjs`
- `functions/platform-automation-engine.js`
- `functions/rules-engine.js`

`functions/` ya no es un deploy target. Solo conserva motores CommonJS compartidos.

## Por que no Cloud Functions

Firebase Functions requiere configurar el proyecto en Blaze para desplegar y habilitar servicios de build/artefactos. Eso rompe el requisito de coste 0, aunque el uso real pudiera quedar dentro de cuotas gratuitas.

## Por que no migrar todo ahora

Supabase, Cloudflare Workers, Vercel, Netlify y Apps Script pueden resolver partes del problema, pero para este repo concreto implican migrar Auth, reglas, Storage, modelo de datos, permisos y flujos ya probados. El mayor coste tecnico no aporta una mejora real frente a mantener Firebase Spark y sustituir solo la ejecucion servidor.

## Alternativas revisadas

| Alternativa | Ventaja | Motivo de descarte para este proyecto |
| --- | --- | --- |
| Firebase Cloud Functions | Encaje nativo con Firestore | Despliegue requiere Blaze; incumple coste 0 obligatorio |
| Cloudflare Workers Cron | Muy buen runtime gratuito | Exige nuevo servidor/secretos y mantener integracion externa con Firestore Admin |
| Supabase Edge Functions | Cuota gratuita razonable | Reintroduce Supabase como backend operativo y duplica Auth/permisos |
| Google Apps Script | Gratis y con triggers | Cuotas/tiempos estrictos, historico fragil y mala trazabilidad operativa |
| Netlify Functions | Gratis con limites | Ya no es hosting canonico y el proyecto sufrio bloqueo por creditos |
| Vercel Cron | Sencillo | En Hobby, cron frecuente no encaja con barridos horarios |
| GitHub Actions worker | Sin migrar datos, programado, auditable | Latencia horaria aceptada; requiere secreto de service account |

Fuentes oficiales consultadas en julio de 2026:

- Firebase pricing: https://firebase.google.com/pricing
- Firebase pricing plans: https://firebase.google.com/docs/projects/billing/firebase-pricing-plans
- GitHub Actions billing: https://docs.github.com/billing/managing-billing-for-github-actions/about-billing-for-github-actions
- Cloudflare Workers limits: https://developers.cloudflare.com/workers/platform/limits/
- Supabase Edge Functions limits/pricing: https://supabase.com/docs/guides/functions/limits
- Apps Script quotas: https://developers.google.com/apps-script/guides/services/quotas
- Vercel Cron pricing: https://vercel.com/docs/cron-jobs/usage-and-pricing
- Netlify pricing: https://www.netlify.com/pricing/

## Garantias

- `firebase.json` no contiene `functions`.
- `functions/index.js` no existe.
- `functions/package.json` no depende de `firebase-functions` ni `stripe`.
- `npm run audit:free-infrastructure` falla si vuelve un target Blaze.
- `npm run check:quality` incluye esa auditoria.
- El workflow de GitHub Actions ejecuta la misma auditoria antes de correr automatizaciones.

## Limitacion aceptada

GitHub Actions no es instantaneo. Las automatizaciones y push se ejecutan en barridos programados. Para clases, pagos, justificantes y avisos de 24h/48h, esa latencia es compatible con el producto y evita cualquier infraestructura de pago.

Firebase Storage sigue siendo la via correcta para multimedia pesada. Mientras
el bucket no pueda inicializarse por permisos externos, el proveedor de
documentos usa Firestore como fallback troceado para archivos de hasta 5 MB.
Esto mantiene operativos justificantes, PDFs ligeros e imagenes comprimidas sin
activar servicios de pago ni exponer datos publicamente.
