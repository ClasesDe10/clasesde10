# Documentacion de ClasesDe10

La documentacion se agrupa por tema para no mezclarla con el codigo de produccion.

## Carpetas

- `architecture/`: arquitectura, decisiones tecnicas, modelos de datos y mapas del sistema.
- `audits/`: auditorias, revisiones, hallazgos y diagnosticos.
- `reports/`: informes de fase, QA e implementacion.
- `operations/`: Firebase, hosting, migraciones, automatizaciones y guias operativas.
- `product/`: estrategia, producto, negocio, SEO y roadmap.
- `backlog/`: deuda tecnica, errores y tareas pendientes.
- `manuals/`: PDFs y guias finales.

## Regla de orden

El codigo que ejecuta la app se mantiene fuera de `docs/`: `pages/`, `js/`, `css/`, `functions/`, `firebase/`, `scripts/`, `assets/`, `supabase/`, `manifest.json` y `service-worker.js`.

Las salidas generadas por pruebas o navegadores van en `output/`, que esta ignorado por Git.

## Fuente vigente

La arquitectura vigente esta en:

- `architecture/ARCHITECTURE.md`
- `architecture/ZERO_COST_ARCHITECTURE.md`
- `operations/FREE_AUTOMATION_WORKER.md`

Informes anteriores a 2026-07-07 pueden conservar contexto historico, pero no
deben contradecir una regla basica: produccion no despliega Firebase Cloud
Functions ni depende de Supabase real o Apps Script.
