# AUDIT - ClasesDe10

Fecha: 2026-06-16

## Resultado Ejecutivo

La base actual es viable y simple: web estatica en Netlify, Supabase como
backend legacy y Firebase como destino de migracion. Los mayores riesgos eran
duplicidad historica con Google Sheets/Apps Script, archivos muertos, PWA
incompleta, formularios pobres para matching y pequenas inconsistencias en la
Edge Function. Se corrigieron mejoras seguras y se documentan los pendientes que
requieren consola/credenciales de produccion.

## Auditoria Arquitectura

### Hallazgos

- Supabase aun cubre la operativa principal: auth, roles, dashboards, storage,
  RLS y notificaciones.
- Firebase Firestore ya cubre captacion publica y profesores importados.
- Apps Script/Sheets no es consumido por la web actual y queda apagado no-op.
- `legacy/apps-script/ClasesDe10-completo.gs` es copia historica local previa.
- `legacy/apps-script/matching-ia-gemini.gs` duplica parcialmente logica ya integrada en Apps Script legacy.
- `css/shared.js` y `js/seo-components.js` eran codigo muerto; eliminados.
- Habia dos generadores SEO; el JS debe ser el canonico porque Node esta disponible y Python no.

### Riesgos

- Apps Script legacy puede seguir teniendo triggers activos, pero el codigo
  remoto ya no escribe, envia emails ni llama a Gemini.
- Google Sheet contiene datos operativos historicos; solo se importo lo validado.
- No se pudo verificar Supabase en produccion sin credenciales/sesion admin.
- No se pudo ejecutar `deno check` porque Deno no esta instalado.
- No se pudo inspeccionar Supabase/Netlify por CLI porque `supabase` y `netlify` no estan instalados localmente.

## Auditoria SEO Tecnico

### Estado final local

- 31 HTML revisados.
- 22 bloques JSON-LD parsean correctamente.
- 22 URLs en sitemap, todas canonicas `https://clasesde10.com`.
- `lastmod` del sitemap actualizado a 2026-06-16 tras los cambios.
- Robots bloquea dashboards, auth, offline, Supabase, docs internos y generadores.
- Canonical, OG, Twitter Cards y manifest presentes en paginas relevantes.
- No hay referencias locales rotas detectadas.

### Pendiente

- Validar Search Console real tras despliegue.
- Revisar rendimiento y cobertura en PageSpeed/Lighthouse sobre produccion.

## Auditoria PWA / Mobile

### Corregido

- `manifest.json` enriquecido con `id`, `scope`, `display_override`, iconos maskable y shortcuts.
- `service-worker.js` creado con cache seguro y exclusion de rutas privadas.
- `offline.html` creado.
- `js/pwa.js` creado para registro e instalacion en Android/iOS.
- Metadatos mobile anadidos a HTML.

### Validacion

- Browser movil: sin overflow horizontal en paginas clave.
- Browser movil: sin imagenes rotas.
- Browser movil: sin errores/warnings de consola.
- Browser integrado no expone `navigator.serviceWorker`; la registracion se valido por codigo y disponibilidad HTTP, no por API runtime.

## Auditoria Formularios

### Mejoras aplicadas

- Formularios publicos con `method="post"`, `required`, `autocomplete`, `maxlength`, consentimiento explicito.
- Captura mejorada:
  - Familias: zona, canal, objetivo, frecuencia, inicio, presupuesto, disponibilidad.
  - Profesores: zona, canal, niveles, modalidad, anos, tarifa, verificacion, disponibilidad.
  - Contacto: telefono y canal preferido.
- Eventos de analitica tras envio exitoso, sin bloquear el lead.
- Estado accesible via `role=status`.

### Pendiente

- Leads publicos ya escriben en Firestore `leadsPublicos`; probado con lead
  tecnico temporal creado y borrado.
- Definir proceso comercial de conversion de lead a familia/profesor.

## Auditoria Supabase

### Tablas principales

- `usuarios`, `profesores`, `familias`, `alumnos`, `asignaciones`, `disponibilidad`, `solicitudes`, `clases`, `pagos`, `documentos`, `incidencias`, `notificaciones`, `auditoria`, `configuracion`, `leads_publicos`, `alumno_invitaciones`.

### Vistas usadas

- `v_dashboard_admin`
- `v_clases_completas`
- `v_resumen_profesor_mes`

### Mejoras/validaciones

- Edge Function acepta `SUPABASE_SERVICE_ROLE_KEY` y fallback legacy `SUPABASE_SERVICE_KEY`.
- Edge Function mapea `success/warning` a enum real `exito/advertencia`.
- `leads_publicos` incluye constraints de email/longitudes.
- `leads_publicos` ya no concede insert al rol agregado `public`; queda limitado a `anon` y `authenticated`.
- Configuracion publica de Supabase centralizada en `js/supabase-config.js`.
- Storage privado con signed URLs.
- Los formularios publicos ya no escriben en Supabase; `leads_publicos` queda
  como tabla legacy hasta migrar el panel admin.

### Pendiente

- Ejecutar migraciones en staging/produccion y probar RLS por rol.
- Configurar `NOTIFICATION_SECRET` en Supabase.
- Validar redirect URLs de Supabase Auth.
- Instalar Supabase CLI para probar migraciones y Edge Functions con el runtime real.

## Auditoria Netlify

### Estado

- Dominio canonico configurado.
- Headers de seguridad presentes.
- Service worker con cache `no-store`.
- Docs internos bloqueados: `ARCHITECTURE.md`, `AUDIT.md`, `DECISIONS.md`, `TODO.md`, `ERRORES.md`, guias y setup.
- HTML publico con cache moderado; assets con cache largo.

### Pendiente

- Confirmar variables reales en panel Netlify.
- Confirmar que Netlify deploya directamente desde GitHub y retirar workflow fallido si existe fuera de este workspace.
- Instalar Netlify CLI si se quiere validar headers/redirects contra un deploy preview antes de produccion.

## Auditoria Apps Script / Sheets

### Estado

- `legacy/apps-script/clasp-project/main.js` es el artefacto canonico local archivado.
- Manifest cerrado de `ANYONE_ANONYMOUS`/`ANYONE` a `MYSELF`.
- Apps Script no es dependido por la web actual.

### Pendiente Critico

- Revisar en Google Apps Script si existen triggers activos.
- Exportar/migrar datos utiles del Sheet a Supabase.
- Apagar triggers legacy cuando Supabase cubra matching/resumen.

## Matriz de Comprobaciones

1. Inventario de archivos raiz.
2. Inventario de archivos `web`.
3. Estado git en `web`.
4. Hash de Apps Script duplicado.
5. Manifest Apps Script valido.
6. Busqueda de dependencias Google/Sheets/Apps Script.
7. Busqueda de uso real de Apps Script desde web.
8. Inventario de tablas Supabase.
9. Inventario de policies RLS.
10. Inventario de funciones/triggers SQL.
11. Inventario de queries frontend Supabase.
12. Validacion JS publicos.
13. Validacion generator JS.
14. Validacion JSON manifest/appsscript.
15. Validacion HTML/PWA por 31 HTML.
16. Validacion JSON-LD por 22 bloques.
17. Validacion sitemap.
18. Validacion robots.
19. Validacion Netlify redirects/headers.
20. Validacion service worker estatica.
21. Validacion endpoints locales `service-worker.js`, `manifest.json`, `offline.html`.
22. Browser movil home.
23. Browser movil contacto.
24. Browser movil familias.
25. Browser movil profesores.
26. Browser movil registro.
27. Browser movil SEO matematicas.
28. Browser movil offline.
29. Browser menu hamburguesa.
30. Browser consola errores/warnings.
31. Busqueda de eventos inline.
32. Busqueda de referencias muertas `shared.js`/`seo-components.js`.

## Estado Final de Auditoria Local

- Checks locales automatizados: OK.
- Browser movil: OK salvo limitacion de service worker API del Browser integrado.
- Produccion real: pendiente de validacion con credenciales/accesos externos.
