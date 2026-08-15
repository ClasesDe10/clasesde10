# PERFORMANCE_AUDIT - ClasesDe10

Actualizado: 2026-06-16

## Resumen

La arquitectura estatica es una ventaja clara. El mayor riesgo de rendimiento esta en CSS global, Google Fonts, dashboards grandes y posibles terceros de analitica cuando se activen IDs reales.

## Estado local

- HTML estatico servido en local con 200 en rutas criticas.
- PWA creada con cache de assets y navegacion offline.
- Service worker excluye rutas privadas.
- Assets principales locales.
- Analitica cargada de forma diferida.

## Riesgos Core Web Vitals

| Metrica | Riesgo | Motivo | Accion |
|---|---|---|---|
| LCP | Medio | Google Fonts y hero visual | Preload/preconnect o self-host fonts |
| CLS | Bajo/medio | Imagenes con dimensiones mayormente estables | Auditar imagenes nuevas |
| INP | Medio | Dashboards con mucho JS inline | Modularizar dashboards |
| TTFB | Bajo | Netlify CDN estatico | Confirmar headers en produccion |

## Acciones recomendadas

1. Ejecutar Lighthouse en produccion.
2. Preconnect a Google Fonts o self-host.
3. Mantener analytics lazy.
4. Dividir dashboard admin en modulos.
5. Evitar imagenes externas en above-the-fold.
6. Mantener `service-worker.js` con `no-store`.

## Escalabilidad frontend

Hasta 100k visitas/mes, el cuello de botella no debe ser Netlify si se mantienen paginas estaticas. El cuello sera conversion, leads, Supabase y operacion humana.

