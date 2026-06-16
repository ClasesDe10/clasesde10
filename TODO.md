# TODO - ClasesDe10

Actualizado: 2026-06-16

## Prioridad 1 - Produccion y fuente de verdad

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
- [ ] Confirmar que `leads_publicos` recibe metadata nueva de formularios.
- [ ] Instalar Supabase CLI para validar migraciones y Edge Functions con runtime real.
- [ ] Anadir antispam server-side para leads publicos: Turnstile, rate limit o Edge Function.

## Prioridad 2 - Apps Script y Google Sheets legacy

- [ ] Revisar triggers activos en Google Apps Script.
- [ ] Exportar datos utiles de Google Sheet legacy.
- [ ] Decidir fecha de apagado de:
  - `procesarEmailsNuevos`
  - `generarResumenMensual`
  - `matchingIACompleto`
  - `onEdit`
- [ ] Migrar matching/resumen a Supabase si sigue siendo necesario.
- [ ] Eliminar `ClasesDe10-completo.gs` y `matching-ia-gemini.gs` cuando se confirme que `clasp-project/main.gs` es el unico artefacto historico necesario.

## Prioridad 3 - Calidad y crecimiento

- [ ] Ejecutar Lighthouse/PageSpeed en produccion tras desplegar.
- [ ] Instalar Netlify CLI si se quiere validar deploy preview, headers y redirects desde terminal.
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
- [x] Netlify/robots bloquean documentos internos.
- [x] Browser movil sin overflow, imagenes rotas ni errores de consola en paginas clave.
- [x] Documentacion CTO ampliada creada: arquitectura full, seguridad, SEO, UX, rendimiento, alternativas, escalabilidad y roadmap.
