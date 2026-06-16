# SYSTEM_MAP - ClasesDe10

Actualizado: 2026-06-16

## Mapa logico

```mermaid
flowchart TD
  SEO["Google / SEO local"] --> WEB["Netlify static web"]
  DIRECT["Marca / enlaces directos"] --> WEB
  WEB --> PWA["PWA install + offline"]
  WEB --> FORMS["Public forms"]
  FORMS --> LEADS["Firestore leadsPublicos"]
  WEB --> FIREBASE["Firebase client"]
  FIREBASE --> FSTORE["Firestore eur3"]
  WEB --> AUTH["Supabase Auth"]
  AUTH --> ROLES["Roles: admin, familia, profesor, alumno"]
  ROLES --> DASH["Dashboards privados"]
  DASH --> DB["Supabase Postgres + RLS"]
  DASH --> STORAGE["Supabase Storage documentos"]
  DB --> EDGE["Edge Function enviar-notificacion"]
  EDGE --> RESEND["Resend email"]
  WEB --> ANALYTICS["GA4 / Clarity / Meta si hay IDs"]
  GAS["Apps Script legacy no-op"] -.historico.-> SHEETS["Google Sheets legacy"]
  GAS -.apagado.-> GMAIL["Gmail legacy"]
  GAS -.apagado.-> GEMINI["Gemini matching legacy"]
```

## Mapa de carpetas

| Ruta | Papel |
|---|---|
| `/web` | Aplicacion publicable |
| `/web/pages` | Auth y app privada |
| `/web/pages/dashboard` | Dashboards por rol |
| `/web/clases-particulares` | SEO programatico local |
| `/web/js` | Clientes Firebase/Supabase, auth, analytics, PWA, utilidades |
| `/web/firebase` | Reglas e indices Firestore/Storage |
| `/web/css` | Estilos publicos y dashboard |
| `/web/supabase` | Migraciones y Edge Function |
| `/clasp-project` | Apps Script legacy canonico |
| `/Versiones` | Zips historicos |

## Flujos de datos

| Flujo | Entrada | Proceso | Salida |
|---|---|---|---|
| Captacion familia | Formulario publico | Validacion JS + Firestore rules | Lead en Firestore |
| Captacion profesor | Formulario publico | Validacion JS + Firestore rules | Lead en Firestore |
| Registro familia/profesor | Supabase Auth | Trigger DB crea perfil | Dashboard privado |
| Registro alumno | Invitacion | Trigger enlaza alumno | Dashboard alumno |
| Clase | Admin/profesor | DB calcula comision | Clase + pago/reporting |
| Documento | Upload dashboard | Storage privado | Signed URL |
| Notificacion | Edge Function | Validacion secret/admin | DB + email |

## Automatizaciones

| Automatizacion | Ubicacion | Estado |
|---|---|---:|
| Crear perfil tras Auth | Supabase trigger | Viva |
| Calcular comision | Supabase trigger | Viva |
| Validar solape de clase | Supabase trigger | Viva |
| PWA cache/offline | Service worker | Viva |
| Gmail ingestion | Apps Script | Apagada/no-op |
| Resumen mensual | Apps Script | Apagada/no-op |
| Matching Gemini | Apps Script | Apagada/no-op |

## Contratos criticos

- Firestore permite crear leads anonimos, pero no leerlos ni modificarlos.
- Las paginas privadas deben ser `noindex`.
- Los documentos deben vivir en bucket privado.
- El service worker no debe cachear dashboards/login/registro/reset.
- Apps Script no debe aceptar webapp anonima si no es parte del sistema actual.

