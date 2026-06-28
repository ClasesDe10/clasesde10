# Auditoria tecnica final - ClasesDe10

Fecha: 2026-06-28

## Estado ejecutivo

La plataforma esta publicada en Firebase Hosting como produccion principal y `clasesde10.com` apunta correctamente a Firebase. La aplicacion pasa las auditorias automaticas de calidad, PWA, responsive, hosting, seguridad basica, adaptadores, IA, perfiles, pagos, calendario, notificaciones, finanzas y smoke tests admin principales.

Se han aplicado mejoras de hardening sin migraciones masivas ni cambios funcionales arriesgados:

- Indices Firestore adicionales para consultas operativas de solicitudes, matching, clases, pagos, documentos e incidencias.
- Reglas de Firebase Storage mas estrictas para limitar tamano y tipos MIME permitidos.
- Auditoria de hosting reforzada para validar headers de seguridad reales en produccion.
- Nueva auditoria `audit:production-readiness` integrada en `check:quality`.
- Linea base explicita para evitar que aumenten nuevas dependencias runtime de Supabase durante la migracion.

## Evidencia verificada

Comandos ejecutados y resultado:

- `npm.cmd audit --omit=dev`: 0 vulnerabilidades.
- `npm.cmd run check:functions`: 0 vulnerabilidades en Functions y sintaxis OK.
- `npm.cmd run check:quality`: OK.
- `npm.cmd run audit:hosting`: OK contra `https://clasesde10-50add.web.app`.
- `npm.cmd run audit:production-readiness`: OK.
- `npm.cmd run audit:storage`: APIs activas, pero bucket no existe.
- `npm.cmd run audit:mobile:public`: 27 pantallas/rutas publicas, 0 fallos responsive.
- `npm.cmd run audit:pwa:mobile`: manifest, service worker, offline y touch OK.
- `npm.cmd run audit:mobile:admin`: login admin OK y 39 comprobaciones responsive admin sin fallos.
- `npm.cmd run audit:admin:requests`: Solicitudes OK, matching automatico visible.
- `npm.cmd run audit:admin:professors`: Profesores OK, 26 profesores detectados, perfiles visibles.
- `npm.cmd run audit:admin:classes`: Clases/finanzas por clase OK.
- `npm.cmd run audit:admin:payments`: Pagos OK.
- `npm.cmd run audit:admin:notifications`: Chat/notificaciones OK.
- `npm.cmd run audit:admin:control`: Centro de control OK.
- `npm.cmd run audit:admin:finance`: Finanzas OK.
- `npm.cmd run audit:ux:public`: Login/registro OK.
- `npm.cmd run audit:ux:admin`: Sidebar admin y chats OK.
- `npx.cmd firebase-tools deploy --only firestore:indexes --project clasesde10-50add`: indices desplegados correctamente.

## Bloqueos reales restantes

### Firebase Storage

Estado: bloqueado externamente.

Pruebas:

- `npm.cmd run audit:storage` confirma que `firebasestorage.googleapis.com` y `storage.googleapis.com` estan activos.
- No existe bucket `clasesde10-50add.firebasestorage.app`.
- No existe bucket `clasesde10-50add.appspot.com`.
- `npm.cmd run firebase:storage:create-default` devuelve `403 PERMISSION_DENIED`.
- `npx.cmd firebase-tools deploy --only storage --project clasesde10-50add` devuelve: "Firebase Storage has not been set up on project 'clasesde10-50add'."

Impacto:

- Las reglas Storage endurecidas estan preparadas en el repositorio, pero no pueden desplegarse hasta inicializar Firebase Storage.
- Las subidas reales de documentos/fotos dependen de que exista el bucket.

### Supabase legacy runtime

Estado: deuda tecnica controlada, no eliminada.

Inventario actual:

- 6 archivos runtime con dependencia Supabase legacy.
- 91 llamadas `db.from()` detectadas por el auditor dedicado.
- 2 llamadas `db.storage.from()`.
- 0 llamadas `db.auth()`.
- 0 canales realtime Supabase.

Archivos:

- `pages/dashboard/admin.html`
- `pages/dashboard/alumno.html`
- `pages/dashboard/familia.html`
- `pages/dashboard/profesor.html`
- `js/chat-widget.js`
- `js/document-storage-provider.js`

Impacto:

- Auth ya esta centralizado fuera de Supabase.
- La migracion completa a Firebase como backend unico requiere mover dashboards privados y storage/documentos a Firestore/Storage cuando el bucket este activo.

## Riesgos operativos observados

- Produccion tiene 26 profesores, pero el panel indica 0 verificados en centro de control. Esto limita el matching asignable aunque el modulo funcione.
- El modulo de pagos esta tecnicamente disponible, pero los datos reales aun son escasos; faltan operaciones reales para validar conciliacion a escala.
- Netlify conserva configuracion legacy como artefacto de rollback, aunque DNS ya apunta a Firebase.

## Conclusion

El proyecto queda endurecido y verificado con estandares razonables para la fase actual: hosting, PWA, seguridad frontend, reglas Firestore, indices, funciones, checks y smoke tests principales estan operativos. Lo que impide afirmar "Firebase backend unico" no es un fallo de codigo nuevo, sino dos limites demostrados: Storage sin inicializar y dashboards legacy que aun leen Supabase.
