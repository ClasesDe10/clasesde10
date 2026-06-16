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

## ADR-011 - Firebase importado sin sustituir Supabase todavia

Estado: aceptada.

Contexto: se va a migrar a Firebase, pero el proyecto actual es estatico y no tiene npm/bundler. Cambiar todos los flujos de golpe romperia Auth, dashboards, documentos y RLS equivalente.

Decision: crear `js/firebase-client.js` con SDK modular via CDN oficial y dejar Auth, Firestore, Storage, Functions y Analytics preparados. No se cambia todavia la fuente de verdad runtime.

Consecuencia: Firebase queda listo para el siguiente paso, pero Supabase sigue operativo hasta migrar reglas, datos y flujos por fases.

## ADR-012 - Sheets no se migra 1:1 a Firebase

Estado: aceptada.

Contexto: el Excel exportado de Google Sheets contiene datos utiles mezclados con
duplicados, logs de parseo, hojas vacias, formulas sin registros y campos
corruptos. Copiarlo entero a Firestore trasladaria deuda operativa y coste.

Decision: separar importacion viva y archivo legado. Solo `PROFESORES` queda como
candidato inmediato tras deduplicacion y validacion. `FAMILIAS`, `ALUMNOS`,
`MATCHING LOG`, `LOG PARSEO`, `CLASES` y `RESUMEN MENSUAL` no se importan en
bloque como colecciones operativas.

Consecuencia: Firebase nace como fuente de verdad limpia. Los logs y datos
historicos se conservan fuera del camino critico, preferiblemente en Storage o
en `legacyImports`/`importAudits` si hace falta trazabilidad.

## ADR-013 - Apps Script apagado como sistema operativo

Estado: aceptada.

Contexto: el Apps Script remoto no coincidia con la copia local, seguia con
webapp anonima y mezclaba Gmail, Sheets, Gemini, parseo, matching, resumen
mensual e importacion desde Supabase.

Decision: sustituir el codigo remoto por funciones no-op, cerrar webapp y
Execution API a `MYSELF`, y tratar Google Sheets solo como archivo historico.

Consecuencia: se elimina la doble fuente de verdad y se corta el flujo que
generaba datos corruptos en Sheets. Los datos utiles se migran a Firebase de
forma selectiva y auditada.

## ADR-014 - Firestore en Europa antes de datos reales

Estado: aceptada.

Contexto: Firestore se creo inicialmente en `nam5` por defecto, pero el negocio
opera en Espana y los datos de familias/profesores son europeos.

Decision: borrar la base vacia y recrearla en `eur3` antes de importar datos.

Consecuencia: Firestore queda alineado con residencia/latencia europea antes de
que existan datos reales.
