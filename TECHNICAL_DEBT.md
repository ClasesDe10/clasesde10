# TECHNICAL_DEBT - ClasesDe10

Actualizado: 2026-06-16

## Deuda priorizada

| Prioridad | Deuda | Evidencia | Riesgo | Accion |
|---:|---|---|---|---|
| P0 | Dos mundos: Supabase y Sheets legacy | Apps Script conserva Gmail/Sheets/Gemini | Doble fuente de verdad | Plan de migracion/apagado |
| P0 | Validacion real de RLS pendiente | No hay Supabase CLI ni usuarios reales locales | Fuga o bloqueo de datos | Test por rol en staging |
| P1 | CSP requiere `unsafe-inline` | HTML y dashboards tienen scripts/estilos inline | Menor defensa XSS | Mover inline a modulos/CSS |
| P1 | Dashboards grandes en HTML | Admin 1760 lineas, profesor/familia grandes | Mantenimiento lento | Extraer modulos por dominio |
| P1 | Leads publicos sin antispam server-side | Insert anon directo | Spam/coste operativo | Edge Function + Turnstile/honeypot/rate limit |
| P1 | Apps Script duplicado | Dos archivos iguales + modulo matching aislado | Confusion operacional | Mantener solo `clasp-project/main.gs` |
| P2 | Generadores SEO duplicados | Python y Node | Divergencia | Node canonico; retirar Python |
| P2 | Analitica con IDs placeholder | `js/analytics.js` | Sin atribucion real | Configurar IDs reales |
| P2 | Sin tests automatizados formales | Checks manuales/scripts ad hoc | Regresiones | Crear suite Playwright/lint |
| P3 | Google Fonts por `@import` | CSS publico/dashboard | LCP potencial | Preconnect o self-host |

## Deuda eliminada en esta fase

- PWA incompleta: resuelto.
- Iconos externos en manifest: resuelto con assets locales.
- Codigo muerto `css/shared.js` y `js/seo-components.js`: eliminado.
- Config Supabase duplicada en JS: centralizada.
- Apps Script webapp anonima: cerrada a `MYSELF`.
- RLS de `leads_publicos` demasiado amplia a rol `public`: reducida a `anon, authenticated`.

## Umbral para refactor grande

No migrar a framework hasta que ocurra al menos una de estas condiciones:

- Mas de 80 paginas SEO programaticas.
- Necesidad de render dinamico por usuario en publico.
- Equipo de 2+ developers tocando dashboards cada semana.
- Reglas de negocio demasiado grandes para HTML inline.
- Necesidad de AB testing o experimentacion sistematica.

