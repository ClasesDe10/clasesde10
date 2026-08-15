# Arquitectura Firebase - ClasesDe10

Actualizado: 2026-07-07

## Objetivo

Mantener ClasesDe10 completamente operativo en Firebase Spark, sin activar
Blaze y sin desplegar Cloud Functions. Firebase es la fuente de verdad y GitHub
Actions ejecuta las automatizaciones que necesitan permisos de servidor.

## Servicios Firebase

| Servicio | Uso | Estado |
| --- | --- | --- |
| Firebase Hosting | Web estatica, PWA, headers, dominio canonico | Activo |
| Firebase Auth | Login, roles y sesiones | Activo |
| Firestore | Datos operativos | Activo |
| Firebase Storage | Justificantes y documentos | Activo con reglas |
| Firebase Cloud Messaging | Push web/PWA | Activo mediante worker |
| Cloud Functions | No usado | Excluido por coste/Blaze |

## Modelo operativo

| Coleccion | Uso |
| --- | --- |
| `users` | Perfil base y rol canonico |
| `familias` | Perfil familiar |
| `profesores` | Perfil profesor |
| `alumnos` | Hijos/alumnos |
| `asignaciones` | Relacion profesor-alumno-familia |
| `clases` | Clases puntuales y recurrentes materializadas |
| `paymentSchedules` | Dia/frecuencia de pago familiar o cobro profesor |
| `pagos` | Justificantes, importes, clases cubiertas y validacion |
| `documentos` | Metadata de Storage |
| `chats` | Conversaciones por asignacion |
| `notificaciones` | Avisos internos y push pendientes |
| `incidencias` | Problemas operativos y resolucion asistida |
| `systemJobs` | Cola interna del worker |
| `automationEvents` | Trazabilidad de automatizaciones |
| `platformHealthChecks` | Latidos y estado del worker |

## Automatizacion sin Blaze

El worker gratuito vive en:

- `.github/workflows/firebase-automation.yml`
- `scripts/firebase-automation-worker.mjs`
- `functions/platform-automation-engine.js`
- `functions/rules-engine.js`

La carpeta `functions/` no es un deploy target. Solo conserva motores
compartidos que tambien usan tests locales.

## Seguridad

- Ninguna clave privada se publica en frontend.
- El worker usa `FIREBASE_SERVICE_ACCOUNT_JSON` o
  `FIREBASE_SERVICE_ACCOUNT_BASE64` como secreto de GitHub Actions.
- Firestore Rules y Storage Rules son parte del deploy.
- Los usuarios no pueden escribir campos de admin, validarse pagos a si mismos
  ni manipular jobs/metricas.

## Coste

Coste objetivo: 0 EUR. La arquitectura depende de cuotas gratuitas de Firebase
Spark y GitHub Actions. Si en el futuro se quiere servidor instantaneo por
evento, debe tratarse como una decision nueva porque Cloud Functions exige Blaze
para desplegar.
