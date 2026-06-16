# DECISIONS - ClasesDe10

## ADR-001 - Fuente de verdad por fases

Estado: aceptada.

Contexto: existen varios sistemas historicos: Supabase, Google Sheets/Apps
Script y Firebase en migracion. La web ya no debe crear nuevas dependencias en
Sheets ni Apps Script.

Decision: Firebase es la fuente de verdad objetivo. Firestore ya recibe
`leadsPublicos` y profesores importados. Supabase sigue como fuente operativa
temporal para Auth, dashboards y datos relacionales legacy hasta migrar rol por
rol.

Consecuencia: no se crean nuevas funcionalidades sobre Sheets ni Apps Script.
Cualquier flujo nuevo debe ir a Firebase salvo que se documente como puente de
migracion.

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

## ADR-011 - Firebase importado con migracion incremental

Estado: aceptada.

Contexto: se va a migrar a Firebase, pero el proyecto actual es estatico y no tiene npm/bundler. Cambiar todos los flujos de golpe romperia Auth, dashboards, documentos y RLS equivalente.

Decision: crear `js/firebase-client.js` con SDK modular via CDN oficial y migrar
por capas seguras. Primero Firestore, reglas, importacion limpia y formularios
publicos. Despues Auth, dashboards, Storage y Functions.

Consecuencia: Firebase ya recibe captacion publica y datos validados. Supabase
sigue operativo para las piezas que aun no tienen reemplazo probado.

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

## ADR-015 - Formularios publicos a Firestore primero

Estado: aceptada.

Contexto: los formularios publicos eran el flujo mas sencillo de aislar de
Supabase porque no dependen de login, dashboards ni datos relacionales.

Decision: escribir los formularios de contacto, familia y profesor directamente
en Firestore `leadsPublicos`, con reglas anonimas estrictas de solo creacion.

Consecuencia: la captacion nueva deja de depender de Supabase/Sheets. Durante la
transicion, los leads nuevos se revisan en Firebase Console hasta migrar el
panel admin a Firebase Auth/Firestore.

## ADR-016 - Auth Firebase preparado pero no activado en UI

Estado: aceptada.

Contexto: Firebase Auth aun no esta inicializado en consola y `firebase auth:export`
devuelve `CONFIGURATION_NOT_FOUND`. Cambiar `login.html`, `registro.html` o los
dashboards ahora cortaria el acceso de usuarios actuales.

Decision: crear `js/firebase-auth.js` con una API equivalente a `js/auth.js`
para login, registro, reset, logout, `requireAuth` y redireccion por rol, pero
mantener las paginas productivas sobre Supabase hasta crear el primer admin y
validar reglas/usuarios en Firebase.

Consecuencia: la migracion de Auth queda preparada y reversible. El cambio de
UI se hara en un paso posterior pequeno, probado y con rollback claro.
