# TODO - ClasesDe10

Actualizado: 2026-06-16

## Prioridad 1 - Produccion y fuente de verdad

- [ ] Activar Firebase Auth Email/Password.
  - `https://console.firebase.google.com/u/0/project/clasesde10-50add/authentication/providers`
- [x] Crear Firestore Database en `eur3`.
- [x] Activar delete protection de Firestore.
- [ ] Crear Firebase Storage.
  - `https://console.firebase.google.com/u/0/project/clasesde10-50add/storage`
- [x] Publicar reglas `firebase/firestore.rules`.
- [x] Endurecer reglas Firestore para perfiles antes de activar Auth.
- [x] Configurar y desplegar Firebase Hosting.
  - `https://clasesde10-50add.web.app`
- [ ] Publicar reglas `firebase/storage.rules` cuando Storage exista.
- [ ] Crear primer usuario admin en Firebase Auth y documento `users/{uid}`.
  - `https://console.firebase.google.com/u/0/project/clasesde10-50add/authentication/users`
- [x] Preparar script interno `firebase/bootstrap-admin-user.mjs`.
- [x] Preparar adaptador frontend `js/firebase-auth.js` sin conectarlo aun a UI.
- [ ] Definir/importar datos reales solo tras validar reglas Firebase.
- [x] Migrar primero formularios publicos de `leads_publicos` a Firestore `leadsPublicos`.
- [ ] Configurar Supabase Auth redirect URLs:
  - `https://clasesde10.com/pages/login.html`
  - `https://clasesde10.com/pages/reset-password.html`
  - `https://clasesde10.com/pages/registro.html`
- [ ] Crear primer usuario admin en Supabase.
- [ ] Aplicar/verificar migracion `004_produccion_total.sql` en produccion.
- [ ] Configurar secretos Supabase Edge Function:
  - `SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `NOTIFICATION_SECRET`
  - `RESEND_API_KEY`
- [ ] Validar RLS por rol con usuarios reales: admin, familia, profesor, alumno.
- [x] Confirmar escritura publica en Firestore `leadsPublicos` con lead tecnico temporal.
- [ ] Migrar lectura/gestion de leads del panel admin a Firestore.
  - `https://console.firebase.google.com/u/0/project/clasesde10-50add/firestore/databases/-default-/data/~2FleadsPublicos`
- [ ] Instalar Supabase CLI para validar migraciones y Edge Functions con runtime real.
- [ ] Anadir antispam server-side para leads publicos: Turnstile, rate limit o Edge Function.
- [x] Anadir honeypot cliente a formularios publicos.

## Prioridad 2 - Apps Script y Google Sheets legacy

- [ ] Revisar triggers activos en Google Apps Script.
- [x] Exportar datos utiles de Google Sheet legacy.
- [x] Auditar Excel exportado antes de importar a Firebase.
- [x] Deduplicar `PROFESORES` por email y descartar emails invalidos.
- [x] Importar profesores validos a Firestore como inactivos/pendientes de revision.
- [x] Apagar Apps Script remoto como sistema operativo.
- [x] Crear manifiesto Firestore y paquete privado de archivo legacy Sheets.
- [ ] Subir archivo historico a Firebase Storage cuando Storage exista.
- [ ] Revisar manualmente subconjunto real de `FAMILIAS` y `ALUMNOS`.
- [ ] Decidir fecha de apagado de:
  - `procesarEmailsNuevos`
  - `generarResumenMensual`
  - `matchingIACompleto`
  - `onEdit`
- [ ] Migrar matching/resumen a Firebase si sigue siendo necesario.
- [ ] Eliminar `ClasesDe10-completo.gs` y `matching-ia-gemini.gs` cuando se confirme que `clasp-project/main.gs` es el unico artefacto historico necesario.

## Prioridad 3 - Calidad y crecimiento

- [ ] Ejecutar Lighthouse/PageSpeed en produccion tras desplegar.
- [x] Autenticar y enlazar Netlify CLI al sitio `clasesde10`.
- [ ] Desbloquear creditos de Netlify o mover DNS del dominio a Firebase Hosting.
- [ ] Configurar IDs reales en `js/analytics.js` o migrar a variables inyectadas.
- [ ] Revisar Search Console despues del nuevo sitemap.
- [ ] Medir conversion de formularios publicos.
- [ ] Evaluar migrar CSS/JS inline de `js/nav.js` a clases CSS para endurecer CSP.
- [ ] Eliminar `_gen.py` cuando el equipo confirme que solo usa Node para generar SEO.

## Checks locales ya completados

- [x] PWA creada: manifest, service worker, offline y prompt instalable.
- [x] Formularios publicos mejorados.
- [x] Eventos inline eliminados.
- [x] Codigo muerto `css/shared.js` y `js/seo-components.js` eliminado.
- [x] Configuracion Supabase frontend centralizada.
- [x] Permiso de insert de `leads_publicos` reducido a `anon, authenticated`.
- [x] `sitemap.xml` actualizado a `lastmod` 2026-06-16.
- [x] `IMPLEMENTATION_LOG.md` creado para separar cambios reales de documentacion.
- [x] Firebase SDK importado en `js/firebase-client.js`.
- [x] Arquitectura Firebase definitiva documentada en `FIREBASE_ARCHITECTURE.md`.
- [x] Adaptador Firebase Auth preparado para login/registro/reset futuro.
- [x] Reglas base de Firestore y Storage preparadas.
- [x] `firebase.json` preparado para Firebase CLI.
- [x] `.firebaserc` preparado para `clasesde10-50add`.
- [x] Auditoria Sheets -> Firebase documentada.
- [x] Reglas e indices Firestore desplegados.
- [x] Firebase Hosting desplegado y verificado.
- [x] CSP actualizada para Firebase CDN, Auth, Firestore, Storage, Functions y Analytics.
- [x] Netlify/robots bloquean documentos internos.
- [x] Browser movil sin overflow, imagenes rotas ni errores de consola en paginas clave.
- [x] Documentacion CTO ampliada creada: arquitectura full, seguridad, SEO, UX, rendimiento, alternativas, escalabilidad y roadmap.
