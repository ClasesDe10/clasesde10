# APPS_SCRIPT_AUDIT - ClasesDe10

Actualizado: 2026-06-16

## Estado final

Apps Script queda apagado como sistema operativo.

Cambios aplicados en el proyecto remoto:

- `webapp.access`: `MYSELF`
- `executionApi.access`: `MYSELF`
- Codigo remoto sustituido por funciones no-op.
- `doPost` ya no escribe en Google Sheets.
- Gmail parsing desactivado.
- Matching Gemini desactivado.
- Importacion desde Supabase desactivada.
- Resumen mensual en Sheets desactivado.

La ejecucion remota de `desactivarTriggersLegacy` desde CLI no tiene permisos
suficientes, pero los triggers que queden llaman a funciones no-op y no pueden
seguir escribiendo datos, enviando emails ni llamando a Gemini.

## Hallazgos principales

- El Apps Script remoto no coincidia con la copia local versionada.
- La version remota tenia webapp anonima y Execution API publica.
- El script remoto mezclaba Gmail ingestion, webhooks, Sheets, matching Gemini,
  trazas de parseo, resumen mensual e importacion desde Supabase.
- Esa mezcla genero filas repetidas y campos corruptos en `FAMILIAS`,
  `ALUMNOS`, `LOG PARSEO` y `MATCHING LOG`.
- `legacy/apps-script/ClasesDe10-completo.gs` era una copia historica.
- `legacy/apps-script/matching-ia-gemini.gs` era un modulo suelto ya absorbido en el script remoto.

## Decision tecnica

No se migra Apps Script a Firebase. Se apaga.

Motivo: Apps Script era una fuente de verdad secundaria, con parsers fragiles y
automatizaciones duplicadas. La fuente futura debe ser Firebase/Firestore, con
formularios escribiendo directamente en `leadsPublicos` y datos operativos
creados por la app.

## Que se conserva

- Google Sheet como archivo historico.
- Export local `migration-private/sheets-2026-06-16/clasesde10-sheets-export.xlsx`.
- Auditoria de importacion en Firestore `importAudits/sheets_profesores_2026_06_16`.

## Que no se conserva como sistema vivo

- Gmail polling cada 15 minutos.
- Matching Gemini sobre Sheets.
- `onEdit` para asignaciones.
- Resumen mensual desde Sheets.
- Webhook Apps Script anonimo.
- Importaciones cruzadas Supabase -> Sheets.
