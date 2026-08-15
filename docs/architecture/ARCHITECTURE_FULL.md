# Arquitectura completa vigente

Actualizado: 2026-07-07

## Tesis

La mejor arquitectura gratuita para este proyecto concreto es Firebase Spark
como plataforma operativa y GitHub Actions como runtime servidor programado. No
se mantiene una tecnologia por inercia: Supabase, Netlify y Apps Script quedan
fuera del camino critico porque ya no aportan ventaja suficiente frente al coste
de duplicar sistemas.

## Componentes vivos

| Componente | Estado | Funcion |
| --- | --- | --- |
| Firebase Hosting | Vivo | Web estatica, PWA, headers, dominio |
| Firebase Auth | Vivo | Identidad y roles |
| Firestore | Vivo | Datos operativos |
| Firebase Storage | Vivo | Documentos/justificantes |
| Firebase Cloud Messaging | Vivo | Push |
| GitHub Actions worker | Vivo | Automatizaciones de fondo |
| `functions/` | Vivo como libreria | Motores compartidos, no deploy |
| TWA Android | Vivo | APK/AAB sobre la web |

## Componentes historicos

| Componente | Estado | Motivo |
| --- | --- | --- |
| Supabase SQL/Edge | Historico | Migracion y referencia |
| Netlify | Historico | Produccion movida a Firebase Hosting |
| Apps Script/Sheets | Historico | Fuente antigua apagada |
| Cloud Functions | Excluido | Requiere Blaze para desplegar |

## Variables/secretos

| Variable | Uso |
| --- | --- |
| `FIREBASE_SERVICE_ACCOUNT_JSON` o `FIREBASE_SERVICE_ACCOUNT_BASE64` | Worker GitHub Actions |
| `GEMINI_API_KEY` | IA opcional |
| Firebase web config publica | SDK frontend |

No debe existir service-role key en frontend.

## Automatizaciones cubiertas

- Leads y matching.
- Clases recurrentes y puntuales.
- Confirmacion de asistencia.
- Dias de pago familiar y justificantes.
- Impagos y avisos escalados.
- Cobros a profesores.
- Notificaciones internas y push.
- Incidencias, metricas y supervision.

## Riesgo principal

El riesgo ya no es falta de servidor, sino disciplina operacional: cualquier
cambio debe probarse en produccion o con smoke real, y no debe reintroducir
servicios de pago para resolver algo que el worker horario cubre bien.
