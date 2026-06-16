# SECURITY_AUDIT - ClasesDe10

Actualizado: 2026-06-16

## Resumen

La seguridad base es razonable si Supabase RLS esta correctamente desplegado. La anon key publica no es un secreto. El mayor riesgo real es una mala policy, una variable service role expuesta, una automatizacion legacy activa o spam contra el endpoint publico de leads.

## Hallazgos

| Severidad | Hallazgo | Estado |
|---:|---|---|
| Alta | Apps Script podia publicarse anonimamente | Corregido localmente a `MYSELF` |
| Alta | Validacion RLS por rol pendiente en produccion | Pendiente |
| Alta | `leads_publicos` era insertable por rol agregado `public` | Corregido a `anon, authenticated` |
| Media | Formularios publicos sin rate limit/captcha server-side | Pendiente |
| Media | CSP aun permite `unsafe-inline` | Pendiente por inline JS/CSS |
| Media | Edge Function dependia de enum incompatible | Corregido |
| Media | Edge Function necesitaba secret/admin auth | Corregido |
| Baja | Anon key en frontend | Aceptado: es publica por diseno |

## Superficie de ataque

- Formularios publicos.
- Supabase Auth.
- Supabase anon key.
- Edge Function.
- Storage signed URLs.
- Apps Script legacy si sigue desplegado.
- Dashboards con permisos por rol.

## Reglas CTO

1. Service role key solo en Supabase Edge Functions o backend.
2. Ningun dashboard indexable.
3. Ningun bucket publico para documentos.
4. Ningun Apps Script anonimo si no hay necesidad.
5. Ningun dato operativo en Sheets tras declarar Supabase fuente de verdad.

## Pendientes de seguridad

- Instalar Supabase CLI y ejecutar test RLS por rol.
- Crear suite de pruebas con usuarios seed: admin, familia, profesor, alumno.
- Revisar en Google Apps Script si hay triggers activos reales.
- Meter antispam: Turnstile o Edge Function con rate limit por IP/email.
- Migrar scripts inline para retirar `unsafe-inline`.

# Actualizacion 2026-06-16

- Firestore `users`, `profesores` y `familias` ya limita campos, longitudes y
  timestamps en creacion/actualizacion propia.
- Firestore delete protection activada.
- Formularios publicos incorporan honeypot cliente para reducir spam basico
  antes de escribir en Firestore.
- PITR no activado para evitar coste no aprobado.
