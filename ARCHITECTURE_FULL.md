# ARCHITECTURE_FULL - ClasesDe10

Actualizado: 2026-06-16

## Tesis arquitectonica

ClasesDe10 debe operar con una sola fuente de verdad: Supabase. La web publica debe seguir siendo estatica y rapida, Netlify debe servir como CDN/deploy, y Google Sheets/Apps Script debe quedar como legado controlado hasta migrar o apagar sus automatizaciones.

La arquitectura optima hoy no es "mas framework". Es una base estatica con backend gestionado, RLS fuerte, automatizaciones puntuales y documentacion operacional. El siguiente salto solo tiene sentido cuando el producto necesite SEO programatico a gran escala, billing complejo o matching automatizado real.

## Inventario resumido

- Archivos trazables por `rg --files`: 74.
- HTML: 31 paginas.
- Formularios: 10.
- Botones detectados en HTML: 139.
- Enlaces detectados: 284.
- Supabase SQL: 5 archivos.
- Apps Script legacy: 3 archivos.
- CSS: 2 archivos.
- JS frontend: 12 archivos tras centralizar `supabase-config.js`.
- PWA: `manifest.json`, `service-worker.js`, `offline.html`, `js/pwa.js`.

## Componentes vivos

| Componente | Estado | Funcion | Fuente de verdad |
|---|---:|---|---|
| Web estatica | Vivo | Captacion, SEO, formularios, login | Git repo `web/` |
| Netlify | Vivo | Hosting, redirects, headers, cache | `netlify.toml` |
| Supabase Auth | Vivo | Registro/login por rol | Supabase |
| Supabase Postgres | Vivo | Operacion del negocio | Supabase |
| Supabase Storage | Vivo | Documentos privados | Supabase |
| Edge Function `enviar-notificacion` | Vivo | Notificaciones/email | Supabase + Resend |
| Google Sheets | Legacy | Operativa historica | Sheet externo |
| Apps Script | Legacy | Gmail, resumen, matching Gemini | `clasp-project/main.gs` |
| Gemini en Apps Script | Legacy | Matching antiguo | Apps Script |

## Componentes redundantes

| Redundancia | Evidencia | Decision |
|---|---|---|
| `ClasesDe10-completo.gs` y `clasp-project/main.gs` | Misma longitud y mismas funciones | Mantener solo `clasp-project/main.gs` tras confirmar apagado legacy |
| `matching-ia-gemini.gs` vs matching dentro de `main.gs` | `matchingIA` esta aislado y `matchingIACompleto` vive integrado | Marcar como obsoleto |
| Supabase y Sheets como datos operativos | La web ya no llama Apps Script | Supabase gana |
| Config Supabase duplicada en JS | URL/anon key repetidas | Centralizado en `js/supabase-config.js` |

## Flujos principales

### Lead publico

1. Usuario llega por SEO o marca.
2. Completa formulario en `contacto`, `para-padres` o `para-profesores`.
3. `js/public-leads.js` valida y normaliza.
4. Inserta en `leads_publicos` con anon key.
5. Admin revisa leads en dashboard.
6. Pendiente ideal: automatizar scoring, asignacion y notificacion.

### Registro

1. Usuario entra en `/pages/registro.html`.
2. `js/auth.js` llama a Supabase Auth.
3. Trigger `handle_new_auth_user` crea `usuarios` y perfil asociado.
4. RLS determina acceso a dashboards.

### Documentos

1. Familia/profesor sube documento.
2. Storage bucket `documentos` privado.
3. RLS valida carpeta/usuario.
4. Acceso via signed URL temporal.

### Notificaciones

1. Sistema o admin invoca Edge Function.
2. Se valida `NOTIFICATION_SECRET` o JWT admin.
3. Se inserta en `notificaciones`.
4. Si existe `RESEND_API_KEY`, se envia email.

## Variables de entorno

| Variable | Ubicacion | Criticidad |
|---|---|---:|
| `SUPABASE_URL` | Edge Function / config | Alta |
| `SUPABASE_ANON_KEY` | Frontend publico | Publica |
| `SUPABASE_SERVICE_ROLE_KEY` | Edge Function | Critica |
| `NOTIFICATION_SECRET` | Edge Function | Critica |
| `RESEND_API_KEY` | Edge Function | Alta |
| `GA4_MEASUREMENT_ID` | Analitica | Media |
| `CLARITY_ID` | Analitica | Media |
| `META_PIXEL` | Analitica | Media |

## Endpoints externos

- Supabase project: `https://hxxajibgmtvcbeqguaqr.supabase.co`.
- Supabase JS CDN: `https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js`.
- Resend API: `https://api.resend.com/emails`.
- Google Fonts: `https://fonts.googleapis.com`, `https://fonts.gstatic.com`.
- GA4: `https://www.googletagmanager.com`, `https://www.google-analytics.com`.
- Microsoft Clarity: `https://www.clarity.ms`.
- Meta Pixel: `https://connect.facebook.net`, `https://www.facebook.com`.
- Legacy Apps Script: Gmail, Sheets, Gemini API.

## Tablas Supabase

`usuarios`, `profesores`, `familias`, `alumnos`, `asignaciones`, `disponibilidad`, `solicitudes`, `clases`, `pagos`, `documentos`, `incidencias`, `notificaciones`, `auditoria`, `configuracion`, `leads_publicos`, `alumno_invitaciones`.

## Triggers Supabase

- `trg_*_updated_at`.
- `trg_clases_comision`.
- `trg_new_auth_user`.
- `trg_leads_publicos_updated_at`.
- `trg_validar_solape_clase`.

## Riesgo arquitectonico principal

El riesgo no es tecnico puro. Es operativo: si Sheets/Apps Script sigue activo con datos reales, hay dos sistemas de negocio. El CTO decision es migrar, congelar o apagar. No debe quedar en un limbo.

