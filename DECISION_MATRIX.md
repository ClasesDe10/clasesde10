# DECISION_MATRIX - ClasesDe10

Actualizado: 2026-06-16

Escala: 1 bajo, 5 alto. Peso implicito: simplicidad, riesgo y velocidad pesan mas que sofisticacion.

## Backend/fuente de verdad

| Opcion | Coste | Mantenibilidad | Seguridad | Escala | Velocidad | Total |
|---|---:|---:|---:|---:|---:|---:|
| Supabase actual | 4 | 4 | 4 | 4 | 5 | 21 |
| Firebase | 4 | 3 | 4 | 5 | 4 | 20 |
| Postgres propio | 3 | 2 | 3 | 5 | 2 | 15 |
| Neon + API propia | 3 | 3 | 4 | 5 | 3 | 18 |
| Appwrite | 4 | 3 | 3 | 4 | 3 | 17 |

Decision: Supabase actual.

## Hosting frontend

| Opcion | Coste | DX | Rendimiento | Seguridad | Encaje | Total |
|---|---:|---:|---:|---:|---:|---:|
| Netlify actual | 4 | 4 | 5 | 4 | 5 | 22 |
| Vercel | 3 | 5 | 5 | 4 | 4 | 21 |
| Cloudflare Pages | 5 | 4 | 5 | 5 | 4 | 23 |
| S3/CloudFront | 4 | 2 | 5 | 4 | 3 | 18 |

Decision: mantener Netlify; reconsiderar Cloudflare si coste/CDN se vuelve critico.

## Frontend

| Opcion | Simplicidad | SEO | Mantenibilidad | Escala contenido | Total |
|---|---:|---:|---:|---:|---:|
| HTML estatico actual | 5 | 4 | 3 | 3 | 15 |
| Astro | 4 | 5 | 5 | 5 | 19 |
| Next.js | 3 | 5 | 4 | 5 | 17 |
| WordPress | 3 | 4 | 3 | 4 | 14 |

Decision: HTML ahora, Astro como V3 probable si crece SEO programatico.

## Automatizacion

| Opcion | Valor | Riesgo | Coste | Control | Total |
|---|---:|---:|---:|---:|---:|
| Manual curado | 4 | 5 | 2 | 5 | 16 |
| Reglas deterministas | 5 | 4 | 4 | 5 | 18 |
| IA generativa directa | 4 | 2 | 3 | 2 | 11 |
| IA asistida con revision | 5 | 4 | 3 | 4 | 16 |

Decision: reglas primero, IA asistida despues.

