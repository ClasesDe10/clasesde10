# IMPLEMENTATION_LOG - ClasesDe10

Actualizado: 2026-06-16

Este documento separa cambios reales de documentacion. Sirve para saber que se ha tocado de verdad antes de seguir.

## Cambios reales en producto/web

### Firebase

- Creado `js/firebase-client.js` con SDK modular desde CDN oficial.
- Importados servicios iniciales: App, Analytics, Auth, Firestore, Storage y Functions.
- Actualizada CSP en `netlify.toml` para permitir endpoints Firebase necesarios.
- Creado `FIREBASE_MIGRATION.md` con mapa Supabase -> Firebase y siguiente paso.
- Creado `FIREBASE_ARCHITECTURE.md` con arquitectura objetivo Firebase.
- Creados `firebase/firestore.rules`, `firebase/storage.rules`,
  `firebase/firestore.indexes.json` y `firebase.json`.
- Creado `firebase/bootstrap-admin-user.mjs` para generar el primer
  `users/{uid}` admin tras activar Firebase Auth.
- Creado `.firebaserc` apuntando a `clasesde10-50add`.
- Firestore `(default)` recreado en `eur3`.
- Reglas e indices Firestore desplegados.
- Reglas de `users`, `profesores` y `familias` endurecidas con campos
  permitidos, timestamps de servidor y limites de longitud.
- Activada delete protection en Firestore `(default)`.
- Importados 24 profesores validos/deduplicados a Firestore.
- Formularios publicos migrados a Firestore `leadsPublicos`.
- Reglas publicas de `leadsPublicos` endurecidas y probadas con lead tecnico
  temporal creado y borrado.
- Panel admin legacy actualizado con aviso y enlace a Firebase Console para
  leads nuevos mientras se migra la gestion interna.
- Creado `js/firebase-auth.js` como adaptador preparado para Firebase Auth,
  manteniendo login/registro productivos en Supabase hasta inicializar Auth.
- Auditado `clasesde10-sheets-export.xlsx`; documentado en
  `SHEETS_FIREBASE_AUDIT.md` que Google Sheets no debe migrarse 1:1.
- Creada auditoria agregada en Firestore
  `importAudits/sheets_full_audit_2026_06_16`.
- Creado manifiesto legacy en Firestore
  `legacyImports/sheets_export_2026_06_16`.
- Creado paquete privado local de revision en
  `C:\Users\migue\Downloads\CD10\migration-private\sheets-2026-06-16`.

### Apps Script legacy

- Apps Script remoto verificado: no coincidia con la copia local y seguia con
  webapp anonima.
- `appsscript.json` remoto actualizado a `MYSELF`.
- Codigo remoto sustituido por funciones no-op para cortar Gmail, Sheets,
  Gemini, `onEdit`, resumen mensual e importaciones cruzadas.

### PWA / app instalable

- Creado `manifest.json` completo con `id`, `scope`, `start_url`, iconos locales, shortcuts y `display_override`.
- Creado `service-worker.js` con cache de paginas publicas y exclusion de rutas privadas.
- Creado `offline.html`.
- Creado `js/pwa.js` para registrar service worker y mostrar tarjeta de instalacion.
- Anadidos metadatos PWA y script `js/pwa.js` en las paginas HTML.
- Ajustado prompt PWA para no mostrarse sobre login, registro ni reset de
  contrasena.
- Shortcut PWA `Solicitar profesor` apunta al formulario publico de familias.
- Creados assets locales:
  - `assets/img/logo-192.png`
  - `assets/img/logo-512.png`
  - `assets/img/logo-clasesde10.png`

### Formularios publicos

- `contacto.html`: formulario real, telefono, canal preferido, consentimiento, estado accesible y tracking tras envio.
- `para-padres.html`: campos de zona, canal, objetivo, frecuencia, inicio, presupuesto y disponibilidad.
- `para-profesores.html`: campos de zona, canal, niveles, modalidad, anos, tarifa, verificacion y disponibilidad.
- `contacto.html`, `para-padres.html`, `para-profesores.html`: honeypot
  antispam basico sin friccion para usuarios reales.
- `pages/registro.html`: consentimiento requerido y validacion antes de enviar.
- `js/public-leads.js`: validacion, normalizacion y estados accesibles de boton.

### Supabase frontend

- Creado `js/supabase-config.js` como fuente unica de `SUPABASE_URL` y `SUPABASE_ANON_KEY`.
- `js/supabase-client.js` importa ahora la configuracion comun.
- `js/public-leads.js` importa ahora la configuracion comun.

### SEO tecnico

- `sitemap.xml`: actualizado a `lastmod` 2026-06-16.
- `robots.txt`: bloquea dashboards, auth, offline, Supabase, generadores y documentos internos.
- HTML revisados con canonical, meta description, manifest y PWA script.
- `404.html`, `offline.html` y paginas privadas recibieron meta description/canonical para consistencia tecnica aunque sigan `noindex`.

### Netlify

- `netlify.toml`: headers de seguridad/cache, service worker, manifest, offline, noindex en auth/dashboards y bloqueo de documentos internos.
- CSP ajustada para quitar dependencia de imagenes WordPress y declarar fuentes/conexiones necesarias.

### Seguridad / Supabase

- `supabase/functions/enviar-notificacion/index.ts`:
  - validacion por `NOTIFICATION_SECRET` o JWT admin.
  - sanitizado HTML.
  - validacion de URL de accion.
  - compatibilidad con `SUPABASE_SERVICE_ROLE_KEY`.
  - mapeo `success/warning` a enum real `exito/advertencia`.
- `supabase/migrations/004_produccion_total.sql`:
  - `leads_publicos`.
  - `alumno_invitaciones`.
  - mejoras RLS.
  - storage privado.
  - validacion de solapes de clases.
  - insert de leads limitado a `anon, authenticated`.
- `.env.example`: variables actualizadas a dominio `.com`, `SUPABASE_SERVICE_ROLE_KEY`, `NOTIFICATION_SECRET` y Resend.

### Apps Script legacy

- `clasp-project/appsscript.json`: acceso cambiado a `MYSELF` para webapp y execution API.

### Limpieza real de codigo

- Eliminado `css/shared.js`.
- Eliminado `js/seo-components.js`.
- Generadores SEO actualizados para usar `js/nav.js`.
- Eliminados eventos inline detectados en paginas clave y dashboards.

## Documentacion creada o actualizada

- `ARCHITECTURE.md`
- `AUDIT.md`
- `DECISIONS.md`
- `TODO.md`
- `ARCHITECTURE_FULL.md`
- `SYSTEM_MAP.md`
- `TECHNICAL_DEBT.md`
- `SECURITY_AUDIT.md`
- `SEO_MASTERPLAN.md`
- `UX_AUDIT.md`
- `PERFORMANCE_AUDIT.md`
- `CRITICAL_FINDINGS.md`
- `BUSINESS_ANALYSIS.md`
- `ROADMAP_12_MONTHS.md`
- `ALTERNATIVES_ANALYSIS.md`
- `COMPETITOR_TECH_REVIEW.md`
- `SCALABILITY_REPORT.md`
- `BUSINESS_MODEL_REVIEW.md`
- `AUTOMATION_MASTERPLAN.md`
- `ARCHITECTURE_V2.md`
- `ARCHITECTURE_V3.md`
- `ARCHITECTURE_V4.md`
- `FIVE_YEAR_ROADMAP.md`
- `DECISION_MATRIX.md`
- `FIREBASE_MIGRATION.md`
- `SHEETS_FIREBASE_AUDIT.md`
- `APPS_SCRIPT_AUDIT.md`
- `FIREBASE_IMPORT_LOG.md`

## Validaciones realizadas

- 31 HTML revisados: title, H1, meta description, canonical, manifest y PWA script.
- 22 URLs del sitemap revisadas contra archivos locales.
- `node --check` en JS critico, service worker, generador SEO y Edge Function.
- Rutas locales HTTP 200: home, formularios, registro, manifest, service worker y offline.
- Browser movil: home, contacto, familias, profesores y registro sin overflow, sin imagenes rotas y sin errores de consola.
- Documentos internos bloqueados en `robots.txt` y `netlify.toml`.
- Firebase SDK CDN verificado y reglas base preparadas para despliegue en consola/CLI.
- Firestore verificado en `eur3` con 24 documentos `profesores` y auditoria.
- Apps Script remoto verificado con `MYSELF` y sin llamadas operativas a Gmail,
  UrlFetch, Gemini ni appendRow.
- Escritura anonima en `leadsPublicos` verificada con reglas Firestore.
- 2026-06-18: Netlify autenticado y enlazado al sitio `clasesde10`, pero todos
  los builds nuevos quedan en `error` por `Skipped due to account credit usage
  exceeded`.
- 2026-06-18: Firebase Hosting configurado y desplegado correctamente en
  `https://clasesde10-50add.web.app`.
- 2026-06-18: Firebase Hosting verificado con manifest PWA actualizado,
  service worker `clasesde10-pwa-v3`, exclusiones `__/` para rutas internas de
  Firebase y archivos internos (`*.md`, `firebase/*`, `supabase/*`) devolviendo
  404.
- 2026-06-18: Segunda auditoria Firebase Hosting orientada a coste cero:
  detectado y corregido acceso publico a `/.git/config`; `firebase.json`
  endurecido con exclusiones explicitas de `.git`, `.github`, `.claude`,
  `.firebase` y `.netlify`. Redespiegue validado con 53 archivos publicos.
- 2026-06-18: Prueba real de Firestore desde `web.app`: lead tecnico temporal
  creado en `leadsPublicos` mediante `js/public-leads.js` y borrado despues.
- 2026-06-18: Prueba movil Playwright en home, familias, profesores, contacto
  y login: sin overflow horizontal, formularios visibles y sin imagenes rotas.
- 2026-06-18: Creados dominios personalizados en Firebase Hosting via API REST:
  `clasesde10.com` y `www.clasesde10.com` con redireccion a apex. Estado
  pendiente por DNS externo: `HOST_MISMATCH` y `OWNERSHIP_MISSING`.
- 2026-06-18: Detectados nameservers actuales `ns10/11/12.servicio-online.net`
  y documentado corte DNS sin coste en `FIREBASE_DOMAIN_CUTOVER.md`.

## Pendiente real antes de produccion

- Desbloquear creditos/uso de Netlify o mover el dominio `clasesde10.com` a
  Firebase Hosting.
- Aplicar/verificar migraciones Supabase en staging/produccion solo si se decide
  mantener Supabase durante la transicion.
- Validar RLS con usuarios reales por rol.
- Configurar secretos reales en Supabase Edge Functions.
- Revisar triggers activos reales en Google Apps Script.
- Ejecutar Lighthouse/PageSpeed y Search Console tras deploy.
- Instalar o usar CLI de Supabase/Deno si se mantiene runtime Supabase.
