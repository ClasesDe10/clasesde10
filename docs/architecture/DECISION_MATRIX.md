# Matriz de decision - arquitectura gratuita

Actualizado: 2026-07-07

Escala: 1 bajo, 5 alto. El criterio principal es mantener el producto operativo
sin coste fijo ni dependencia de Firebase Blaze.

## Backend y datos

| Opcion | Coste 0 | Riesgo migracion | Seguridad | Encaje actual | Total |
| --- | ---: | ---: | ---: | ---: | ---: |
| Firebase Spark + Firestore actual | 5 | 5 | 4 | 5 | 19 |
| Supabase como backend principal | 4 | 2 | 4 | 2 | 12 |
| Postgres propio | 2 | 1 | 3 | 1 | 7 |
| Neon + API propia | 3 | 2 | 4 | 2 | 11 |
| Appwrite/self-host | 3 | 1 | 3 | 1 | 8 |

Decision: mantener Firebase Spark como fuente de verdad.

## Automatizaciones

| Opcion | Coste 0 | Latencia | Mantenibilidad | Encaje | Total |
| --- | ---: | ---: | ---: | ---: | ---: |
| GitHub Actions worker horario | 5 | 3 | 4 | 5 | 17 |
| Cloudflare Workers Cron | 5 | 4 | 3 | 3 | 15 |
| Google Apps Script triggers | 5 | 3 | 2 | 2 | 12 |
| Supabase Edge Functions | 4 | 4 | 2 | 2 | 12 |
| Firebase Cloud Functions | 1 | 5 | 4 | 5 | 15 |

Decision: GitHub Actions worker. Es suficiente para avisos de 24h/48h,
impagos, push, jobs y conciliaciones, y reutiliza el modelo de datos actual sin
activar Blaze.

## Hosting

| Opcion | Coste 0 | Seguridad | PWA/TWA | Encaje | Total |
| --- | ---: | ---: | ---: | ---: | ---: |
| Firebase Hosting | 5 | 4 | 5 | 5 | 19 |
| Cloudflare Pages | 5 | 5 | 4 | 3 | 17 |
| Netlify | 4 | 4 | 4 | 2 | 14 |
| Vercel | 4 | 4 | 4 | 2 | 14 |

Decision: Firebase Hosting. Es el dominio productivo actual y evita partir Auth,
Firestore, Storage y PWA entre proveedores.

## Pagos

| Opcion | Coste 0 | Automatizacion | Complejidad | Encaje actual | Total |
| --- | ---: | ---: | ---: | ---: | ---: |
| Bizum centralizado + justificante | 5 | 3 | 5 | 5 | 18 |
| Stripe Bizum | 2 | 5 | 3 | 2 | 12 |
| Redsys/TPV | 2 | 4 | 2 | 2 | 10 |
| Transferencia manual | 5 | 2 | 4 | 3 | 14 |

Decision: Bizum centralizado con justificantes y revision admin. Stripe/Redsys
quedan como compatibilidad futura, no como dependencia de produccion.
