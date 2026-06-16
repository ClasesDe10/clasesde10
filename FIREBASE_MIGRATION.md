# FIREBASE_MIGRATION - ClasesDe10

Actualizado: 2026-06-16

## Estado

Firebase queda importado en la web, Firestore esta creado en Europa, las reglas
estan desplegadas y los formularios publicos ya escriben en `leadsPublicos`.
Supabase sigue activo para Auth, dashboards y datos operativos legacy.

Archivo creado:

- `js/firebase-client.js`
- `js/firebase-auth.js`

SDK cargado desde CDN oficial:

- `firebase-app`
- `firebase-analytics`
- `firebase-auth`
- `firebase-firestore`
- `firebase-storage`
- `firebase-functions`

Version CDN usada:

- `12.14.0`

## Configuracion Firebase

Proyecto:

- `projectId`: `clasesde10-50add`
- `authDomain`: `clasesde10-50add.firebaseapp.com`
- `storageBucket`: `clasesde10-50add.firebasestorage.app`
- `measurementId`: `G-5B8GTQJQQW`

## Decision tecnica

No se usa `npm install firebase` todavia porque este proyecto no tiene `package.json`, bundler ni build step. Meter npm ahora cambiaria la arquitectura. Para este paso, el camino seguro es usar imports ESM desde CDN.

## Mapa inicial Supabase -> Firebase

| Supabase | Firebase destino propuesto |
|---|---|
| Supabase Auth | Firebase Auth |
| `usuarios` | Firestore `users` |
| `profesores` | Firestore `profesores` |
| `familias` | Firestore `familias` |
| `alumnos` | Firestore `alumnos` |
| `asignaciones` | Firestore `asignaciones` |
| `disponibilidad` | Campo/mapa en `profesores` salvo que haga falta coleccion |
| `solicitudes` | Firestore `leadsPublicos` o `solicitudes` autenticadas en fase posterior |
| `clases` | Firestore `clases` |
| `pagos` | Firestore `pagos` |
| `documentos` | Firestore `documentos` + Firebase Storage |
| `incidencias` | Firestore `incidencias` en fase posterior |
| `notificaciones` | Firestore `notificaciones` |
| `auditoria` | Firestore `auditLogs` o Cloud Logging |
| `configuracion` | Firestore `configuracion` / `configuracionPublica` |
| `leads_publicos` | Firestore `leadsPublicos` |
| `alumno_invitaciones` | Firestore `alumnoInvitaciones` en fase posterior |
| Edge Function `enviar-notificacion` | Cloud Functions for Firebase |
| Supabase Storage `documentos` | Firebase Storage |

## Reglas preparadas

Archivos creados:

- `firebase/firestore.rules`
- `firebase/storage.rules`
- `firebase/firestore.indexes.json`
- `firebase.json`
- `firebase/bootstrap-admin-user.mjs`

Decision: usar colecciones con IDs basados en `auth.uid` para `users`,
`profesores` y `familias`. Firestore no tiene joins/RLS como Postgres; por eso
las relaciones operativas (`alumnos`, `asignaciones`, `clases`, `pagos`) guardan
`familyUid`, `teacherUid`, `studentUid` o mapas de participantes cuando hace
falta autorizar lecturas sin consultas cruzadas fragiles.

## Auditoria Google Sheets

Archivo de auditoria:

- `SHEETS_FIREBASE_AUDIT.md`

Conclusion: no se debe importar el Google Sheet completo como dato vivo.
`PROFESORES` es candidato a importacion limpia. `FAMILIAS`, `ALUMNOS`, logs,
matching, resumen y clases requieren limpieza, archivo o descarte parcial.

## Siguiente paso recomendado

1. Activar Firebase Authentication con Email/Password.
2. Inicializar Firebase Storage si se acepta el requisito de facturacion.
3. Crear primer usuario admin y documento `users/{uid}`.
4. Migrar Auth y dashboards despues, rol por rol.
5. Importar solo datos de Sheets validados, no el libro entero.

## Enlaces directos Firebase Console

- Authentication providers:
  `https://console.firebase.google.com/u/0/project/clasesde10-50add/authentication/providers`
- Authentication users:
  `https://console.firebase.google.com/u/0/project/clasesde10-50add/authentication/users`
- Storage:
  `https://console.firebase.google.com/u/0/project/clasesde10-50add/storage`
- Leads publicos:
  `https://console.firebase.google.com/u/0/project/clasesde10-50add/firestore/databases/-default-/data/~2FleadsPublicos`

## Estado aplicado el 2026-06-16

- Firestore `(default)` recreado en `eur3`.
- Reglas Firestore desplegadas.
- Indices Firestore desplegados.
- Firestore delete protection activada.
- Reglas de `users`, `profesores` y `familias` endurecidas antes de activar
  Firebase Auth.
- Importados 24 profesores validos/deduplicados desde Sheets.
- Creado `importAudits/sheets_profesores_2026_06_16`.
- Creado `importAudits/sheets_full_audit_2026_06_16` con auditoria agregada
  completa del Excel sin PII cruda.
- Creado `legacyImports/sheets_export_2026_06_16` con manifiesto del archivo
  historico privado.
- Apps Script remoto cerrado y sustituido por funciones no-op.
- Formularios publicos migrados de Supabase a Firestore `leadsPublicos`.
- Reglas de `leadsPublicos` validadas con lead tecnico temporal creado y borrado.
- Creado `js/firebase-auth.js` como capa de transicion Auth/Firestore con API
  compatible con `js/auth.js`. No esta conectado todavia a las paginas porque
  Firebase Auth sigue sin inicializar.
- Firebase Auth sigue pendiente porque la API devolvio `CONFIGURATION_NOT_FOUND`
  hasta inicializarlo desde consola.
- Firebase Storage sigue pendiente porque Firebase exige configurarlo desde
  consola y puede requerir plan Blaze.

## No hacer todavia

- No borrar Supabase.
- No cambiar login/registro hasta tener Firebase Auth y reglas.
- No esperar ver leads nuevos en el panel admin legacy de Supabase.
- No migrar documentos sin reglas de Storage.
- No importar datos sin export limpio desde Supabase o CSV validado.
