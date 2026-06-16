# CRITICAL_FINDINGS - ClasesDe10

Actualizado: 2026-06-16

## Hallazgos criticos

1. Supabase debe ser la fuente de verdad.
   - Evidencia: la web actual usa Supabase; Apps Script/Sheets no recibe llamadas desde la web.
   - Accion: migrar/apagar legacy.

2. Apps Script legacy era una superficie innecesaria.
   - Evidencia: `appsscript.json` permitia webapp/API amplios.
   - Accion: cerrado localmente a `MYSELF`.

3. La app no era instalable de forma completa.
   - Evidencia: faltaba service worker/offline/prompt robusto.
   - Accion: PWA completa creada.

4. Formularios publicos no capturaban suficiente informacion.
   - Evidencia: poca metadata comercial.
   - Accion: campos de cualificacion anadidos.

5. RLS necesita test real por rol.
   - Evidencia: sin Supabase CLI ni staging local.
   - Accion: crear suite RLS antes de escalar.

6. Dashboards concentran demasiada logica.
   - Evidencia: admin 1760 lineas, familia/profesor cerca de 900.
   - Accion: modularizar cuando haya siguiente ciclo de producto.

7. Leads publicos necesitan antispam server-side.
   - Evidencia: insert anon necesario pero expuesto.
   - Accion: Turnstile/rate limit/Edge Function.

8. El proyecto ya tiene base SEO viable.
   - Evidencia: sitemap, canonical, schema, paginas materia.
   - Accion: crecer por clusters con calidad.

