# FIREBASE_CUTOVER_MAP - ClasesDe10

Actualizado: 2026-06-25

## Estado resumido

La web publica y los formularios nuevos ya estan en Firebase/Firestore. La
parte privada sigue usando Supabase para Auth, consultas operativas y Storage
legacy. Se han creado capas puente para que el corte futuro toque el menor
numero de archivos posible:

- `js/auth-provider.js`: punto unico de cambio Supabase Auth -> Firebase Auth.
- `js/document-storage-provider.js`: punto unico de cambio Supabase Storage -> Firebase Storage.
- `js/notifications-provider.js`: punto unico de cambio Supabase Realtime -> Firestore `onSnapshot`.
- `scripts/supabase-runtime-audit.mjs`: inventario mecanico de dependencias runtime.
- `scripts/hosting-audit.mjs`: validacion Firebase Hosting/PWA/headers.

## Bloqueos comprobados

| Bloqueo | Prueba | Error exacto |
|---|---|---|
| Firebase Auth no inicializado | `scripts/firebase-auth-audit.mjs` | `CONFIGURATION_NOT_FOUND` |
| Inicializar Auth por API | `scripts/firebase-auth-enable-email.mjs` | `BILLING_NOT_ENABLED : Identity Platform feature requires billing to be enabled.` |
| Firebase Storage no inicializado | `firebase deploy --only storage --dry-run` | `Firebase Storage has not been set up... click 'Get Started'` |
| Crear default bucket por API | `scripts/firebase-storage-create-default.mjs` | `403 PERMISSION_DENIED` |
| Netlify deploy publico | `netlify deploy --prod` | `Account credit usage exceeded - new deploys are blocked until credits are added` |
| DNS dominio | `Resolve-DnsName` | `clasesde10.com A -> 75.2.60.5`, `www -> helpful-fenglisu-f1d7b9.netlify.app` |

No hay `gcloud` ni ADC local en rutas estandar. La sesion disponible es Firebase CLI OAuth.
`cloudbilling.googleapis.com/v1/projects/clasesde10-50add/billingInfo` devuelve
`billingEnabled: false`. IAM lista una service account
`firebase-adminsdk-fbsvc@clasesde10-50add.iam.gserviceaccount.com`, pero no hay
clave local ni ADC para usarla. Con el OAuth actual, `testIamPermissions` permite
consultar/crear default bucket en IAM, pero la API real de Storage devuelve
`403 PERMISSION_DENIED`.

## Inventario Supabase runtime

Ejecutar:

```powershell
node scripts\supabase-runtime-audit.mjs
```

Resumen actual:

| Tipo | Total |
|---|---:|
| Archivos runtime con dependencia Supabase | 10 |
| Consultas `db.from(...)` | 84 |
| Buckets Storage directos en UI | 0 |
| Llamadas Storage via provider | 2 en `js/document-storage-provider.js` |
| Suscripciones realtime directas en UI | 0 |
| Suscripciones realtime via provider | 1 |

Archivos runtime:

| Archivo | Papel actual | Sustitucion Firebase |
|---|---|---|
| `js/auth.js` | Supabase Auth real tras `auth-provider` | Cambiar `auth-provider.js` para exportar desde `firebase-auth.js`; despues eliminar `auth.js`, `supabase-client.js`, `supabase-config.js` |
| `pages/login.html` | Login UI y escucha PKCE Supabase | Quitar CDN/import Supabase; usar `onAuthChange` desde `auth-provider`; limpiar flujo `?code=` Supabase |
| `pages/registro.html` | Registro UI; CDN Supabase heredado | Quitar CDN Supabase cuando `auth-provider` apunte a Firebase |
| `pages/reset-password.html` | Reset Supabase `updateUser` | Reescribir con Firebase Auth o reemplazar por flujo `sendPasswordResetEmail`/action code |
| `pages/dashboard/admin.html` | Panel admin Supabase | Migrar a Firestore queries/agregados o Cloud Functions |
| `pages/dashboard/familia.html` | Panel familia Supabase | Migrar a Firestore por `familyUid`; Storage ya abstraido |
| `pages/dashboard/profesor.html` | Panel profesor Supabase | Migrar a Firestore por `teacherUid`; Storage ya abstraido |
| `pages/dashboard/alumno.html` | Panel alumno Supabase | Migrar a Firestore por `studentUid` |
| `js/utils.js` | Badge notificaciones; delega en provider | No requiere tocar UI |
| `js/notifications-provider.js` | Supabase realtime `notificaciones` | Reemplazar internamente por Firestore `onSnapshot` |
| `js/analytics.js` | Comentarios legacy Supabase | Actualizar comentarios al proveedor neutro/Firebase |

## Tablas y equivalencias

| Supabase | Uso real | Firebase destino | Estado destino |
|---|---|---|---|
| `usuarios` | perfil, rol, updates de perfil | `users/{uid}` | reglas preparadas |
| `profesores` | perfil profesor, verificacion, comision | `profesores/{uid}` | import parcial creado |
| `familias` | perfil familia | `familias/{uid}` | reglas preparadas |
| `alumnos` | hijos/alumnos | `alumnos/{id}` con `familyUid/studentUid` | reglas preparadas |
| `asignaciones` | profesor-alumno activo | `asignaciones/{id}` | reglas preparadas |
| `clases` | clases y estado | `clases/{id}` | reglas preparadas |
| `pagos` | pagos familiares | `pagos/{id}` | reglas preparadas |
| `documentos` | metadatos de archivos | `documentos/{id}` + Firebase Storage | reglas preparadas, Storage bloqueado |
| `solicitudes` | solicitudes de profesor | `solicitudes/{id}` o `asignaciones` pendientes | pendiente modelado final |
| `incidencias` | incidencias admin | `incidencias/{id}` o `notificaciones/auditLogs` | pendiente reglas especificas si se conserva |
| `disponibilidad` | disponibilidad profesor | `profesores/{uid}/disponibilidad/{id}` o top-level `disponibilidad` | pendiente reglas |
| `alumno_invitaciones` | invitaciones alumno | `studentInvites/{token}` | pendiente reglas/flujo |
| `leads_publicos` | historico Supabase leads | `leadsPublicos` | ya migrado para formularios nuevos |
| `notificaciones` | badge realtime | `notificaciones/{id}` | reglas preparadas |
| `v_dashboard_admin` | agregados admin | consulta agregada Firestore o Cloud Function | pendiente |
| `v_clases_completas` | vista join clases/alumnos/profesores | denormalizar campos en `clases` | pendiente |
| `v_resumen_profesor_mes` | resumen mensual profesor | agregados en `clases` o Cloud Function | pendiente |

## Storage

| Supabase bucket | Llamadas actuales | Provider actual | Firebase destino |
|---|---:|---|---|
| `documentos` | 5, ya centralizadas | `js/document-storage-provider.js` | Firebase Storage `users/{uid}/...` o `documentos/{uid}/...` |

Cuando Storage exista, solo debe cambiar `js/document-storage-provider.js`.
Los dashboards ya no llaman directamente a `db.storage.from(...)`.

## Realtime

| Archivo | Canal Supabase | Sustitucion |
|---|---|---|
| `js/notifications-provider.js` | `db.channel("notif-${usuarioId}")` + `postgres_changes` | `onSnapshot(query(collection(firebaseDb, "notificaciones"), where("userUid", "==", uid), where("readAt", "==", null)))` |

## Modulos eliminables despues del corte Auth/Storage

Eliminar inmediatamente despues de que Auth, reset y dashboards apunten a Firebase:

- `js/auth.js`
- `js/supabase-client.js`
- `js/supabase-config.js`
- `js/supabase-client.example.js`
- `<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js...">` de paginas privadas

Mantener archivado hasta fin de migracion operativa:

- `supabase/` migraciones y Edge Function como referencia historica.
- `SETUP-SUPABASE.md` solo hasta validar que no queda rollback activo.

## Porcentaje real de migracion

Estimacion por superficie funcional:

| Area | Estado | Peso aprox. |
|---|---|---:|
| Hosting/PWA/SEO publico en Firebase | completo | 20% |
| Formularios publicos a Firestore | completo | 15% |
| Firestore reglas/modelo base | mayormente completo | 15% |
| Auth privada | bloqueada por Auth no inicializado | 0% |
| Storage privado | preparado, bloqueado por bucket | 3% |
| Dashboards privados | aun Supabase | 5% |
| Datos legacy limpios | parcial profesores/leads | 10% |

Total real estimado: **55-60%**.

El porcentaje subira rapido tras desbloquear Auth/Storage porque ya existen
`firebase-auth.js`, `auth-provider.js`, reglas, Hosting y provider de documentos.
