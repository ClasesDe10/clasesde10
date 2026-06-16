# DECISIONS - ClasesDe10

## ADR-001 - Supabase es la fuente de verdad

Estado: aceptada.

Contexto: existen dos sistemas de datos: Supabase y Google Sheets. La web actual no llama a Apps Script; los dashboards y formularios escriben en Supabase.

Decision: mantener Supabase como fuente de verdad operativa. Google Sheets queda como legado/archivo hasta migracion o apagado.

Consecuencia: no se deben crear nuevas funcionalidades sobre Sheets. Cualquier automatizacion futura debe leer/escribir Supabase.

## ADR-002 - Apps Script cerrado por defecto

Estado: aceptada.

Contexto: `clasp-project/appsscript.json` exponia webapp anonima y Execution API publica, pero la web actual no lo usa.

Decision: cambiar acceso futuro a `MYSELF`.

Consecuencia: reduce superficie de ataque. Si se necesitara una integracion externa, debe crearse con secreto y alcance documentado.

## ADR-003 - Generador SEO canonico en Node

Estado: aceptada.

Contexto: hay generador Python y generador JS. En esta maquina no hay Python disponible; Node si esta disponible y ya valida.

Decision: usar `clases-particulares/_generar-paginas.js` como generador canonico.

Consecuencia: `_gen.py` queda legacy hasta eliminarlo en una limpieza futura.

## ADR-004 - PWA sin cache privado

Estado: aceptada.

Contexto: la web debe poder instalarse como app movil, pero dashboards y auth no deben quedar cacheados.

Decision: service worker cachea assets y paginas publicas, excluye dashboards, login, registro, reset-password, Supabase y Netlify internals.

Consecuencia: instalacion movil habilitada sin aumentar riesgo de datos privados cacheados.

## ADR-005 - Documentacion interna versionada pero bloqueada

Estado: aceptada.

Contexto: `web/` es publish root de Netlify. La documentacion interna debe versionarse pero no publicarse.

Decision: crear docs en `web/` y bloquear `ARCHITECTURE.md`, `AUDIT.md`, `DECISIONS.md`, `TODO.md` y documentos internos en Netlify/robots.

Consecuencia: el equipo tiene documentacion junto al codigo y no queda expuesta por HTTP.

## ADR-006 - Formularios publicos ligeros pero accionables

Estado: aceptada.

Contexto: los formularios anteriores recogian pocos datos de matching. Pedir demasiado reduce conversion.

Decision: anadir campos de alto valor y baja friccion: zona, canal, objetivo, frecuencia, inicio, presupuesto/tarifa y verificacion, manteniendo pocos requeridos.

Consecuencia: leads mas utiles sin convertir la landing en un cuestionario largo.

## ADR-007 - Eliminar codigo muerto confirmado

Estado: aceptada.

Contexto: `css/shared.js` y `js/seo-components.js` no tenian referencias activas.

Decision: eliminarlos y corregir generadores/documentacion.

Consecuencia: menos archivos publicados y menos ambiguedad de mantenimiento.

## ADR-008 - Edge Function compatible con enum real

Estado: aceptada.

Contexto: la Edge Function aceptaba `success/warning`, pero la base usa `exito/advertencia`.

Decision: mapear ambos vocabularios a los valores reales de Postgres.

Consecuencia: callers en ingles no rompen inserciones y la base mantiene su enum actual.

## ADR-009 - Configuracion Supabase centralizada en frontend

Estado: aceptada.

Contexto: `js/supabase-client.js` y `js/public-leads.js` repetian URL y anon key. La anon key es publica, pero duplicarla aumenta el riesgo de mantenimiento.

Decision: crear `js/supabase-config.js` como unica fuente frontend para `SUPABASE_URL` y `SUPABASE_ANON_KEY`.

Consecuencia: un cambio de proyecto Supabase se hace en un solo punto.

## ADR-010 - Leads publicos limitados a roles necesarios

Estado: aceptada.

Contexto: `leads_publicos` necesita insert anonimo para formularios publicos. La policy/grant no debe ser mas amplia de lo necesario.

Decision: cambiar la policy de insert de `TO public` a `TO anon, authenticated` y retirar `GRANT INSERT ... TO public`.

Consecuencia: se mantiene la funcionalidad publica y se reduce superficie de permisos.
