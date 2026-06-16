# ARCHITECTURE_V2 - 12 meses

Actualizado: 2026-06-16

## Objetivo

Escalar ClasesDe10 a operacion estable con 100-1.000 alumnos sin cambiar innecesariamente de stack.

## Stack

- Netlify static web.
- Supabase Auth/Postgres/Storage.
- Edge Functions para notificaciones, antispam y automatizaciones ligeras.
- PWA como app movil.
- Analytics reales.

## Cambios clave

- Modularizar dashboard admin.
- Edge Function para leads con rate limit.
- Pipeline comercial.
- Tests RLS.
- Apagado controlado de Apps Script.

## Por que no framework aun

La web estatica es rapida, barata y suficiente. El problema a 12 meses es operacion, no renderizado.

