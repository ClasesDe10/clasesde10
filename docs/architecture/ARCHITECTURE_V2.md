# Arquitectura V2 - 12 meses

Actualizado: 2026-07-07

## Objetivo

Operar ClasesDe10 con 100-1.000 alumnos sin cambiar de stack ni asumir coste
fijo de infraestructura.

## Stack

- Firebase Hosting.
- Firebase Auth.
- Firestore.
- Firebase Storage.
- Firebase Cloud Messaging.
- GitHub Actions worker.
- PWA/TWA Android.

## Cambios clave

- Reducir HTML monolitico de paneles hacia modulos por dominio.
- Sustituir llamadas legacy `db.from()` por adaptadores Firebase directos.
- Mantener worker idempotente y observable.
- Mejorar smokes por rol: familia, profesor y admin.
- Mantener Apps Script/Supabase como historico, sin nuevas features.

## Por que no framework aun

La web estatica sigue siendo rapida, barata y suficiente. El problema principal
es calidad operacional y validacion de flujos, no renderizado.
