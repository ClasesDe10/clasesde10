# Auditoria de migracion Supabase -> Firebase

Fecha: 2026-06-25  
Alcance: auditoria tecnica completa sin migrar codigo, sin modificar `auth-provider.js` y sin eliminar Supabase.

## 1. Resumen ejecutivo

La aplicacion ya tiene una base Firebase preparada para parte de la migracion, especialmente Firestore Rules, Firestore Indexes, Hosting y un usuario administrador inicial. Sin embargo, la aplicacion privada sigue dependiendo de Supabase de forma importante.

Estado real estimado:

| Area | Dependencia Supabase actual | Estado |
| --- | ---: | --- |
| Sitio publico estatico | Baja | Principalmente HTML/CSS/JS, con formularios ya orientados a Firebase en partes del proyecto. |
| Autenticacion runtime | Alta | Login, registro, reset y sesion siguen usando `db.auth` de Supabase. |
| Dashboards privados | Muy alta | Admin, profesor, familia y alumno consultan Supabase directamente. |
| Documentos | Alta | Storage esta encapsulado, pero el proveedor activo usa Supabase Storage. |
| Notificaciones | Alta | Realtime usa canales Supabase `postgres_changes`. |
| Datos academicos/operativos | Muy alta | Clases, alumnos, profesores, familias, pagos, solicitudes, incidencias y asignaciones siguen en tablas Supabase. |
| Backend Firebase | Parcial | Firestore tiene reglas e indices iniciales, pero faltan colecciones, indices y adaptadores para cubrir todo el modelo Supabase. |

Estimacion de dependencia restante:

- Aplicacion total: 40%-45% sigue dependiendo de Supabase.
- Area privada/autenticada: 80%-90% sigue dependiendo de Supabase.
- Capa de datos operativa: 65%-75% sigue dependiendo de Supabase.
- Supabase puede eliminarse solo despues de migrar auth runtime, dashboards, documentos, notificaciones y datos relacionales.

Conclusion: eliminar Supabase hoy romperia los flujos privados principales. La ruta de menor riesgo es introducir una capa de adaptadores Firebase por modulo, migrar primero lecturas y datos menos criticos, despues operaciones transaccionales, y dejar documentos/notificaciones para cuando Firebase Storage y las reglas asociadas esten listas.

## 2. Metodologia

Comandos y comprobaciones usadas:

```powershell
node scripts\supabase-runtime-audit.mjs
rg -n "supabase|Supabase|supabase-client|@supabase/supabase-js|db\.auth|db\.from|db\.storage|db\.channel|rpc\(|\.rpc\(" pages js -S
rg -n "CREATE TABLE|CREATE POLICY|CREATE VIEW|CREATE FUNCTION|CREATE TRIGGER|storage\.buckets|GRANT|ENABLE ROW LEVEL SECURITY|RPC|FUNCTION" supabase -S
Get-Content firebase\firestore.indexes.json
Get-Content firebase\firestore.rules
Get-Content supabase\migrations\001_schema_completo.sql
Get-Content supabase\migrations\002_storage_policies.sql
Get-Content supabase\migrations\003_fixes_produccion.sql
Get-Content supabase\migrations\004_produccion_total.sql
```

Resultado del auditor runtime:

- Archivos runtime con Supabase: 10.
- Consultas detectadas: 84.
- Llamadas Storage detectadas: 2.
- Canales realtime detectados: 1.
- RPC llamadas desde frontend: 0.

## 3. Archivos que dependen de Supabase

### 3.1 Archivos runtime directos

| Archivo | Tipo de dependencia | Uso principal | Se rompe si se elimina Supabase hoy |
| --- | --- | --- | --- |
| `pages/login.html` | Supabase CDN, `supabase-client.js`, `db.auth.onAuthStateChange` | Login y redireccion segun sesion | Si. Login queda inconsistente o inutilizable. |
| `pages/registro.html` | Supabase CDN | Registro de usuarios | Si. Registro conectado al proveedor actual. |
| `pages/reset-password.html` | Supabase CDN, `db.auth.onAuthStateChange`, `db.auth.updateUser` | Recuperacion/cambio de password con PKCE Supabase | Si. Reset de password deja de funcionar. |
| `pages/dashboard/admin.html` | Supabase CDN, `db.from(...)` | Panel admin, metricas, CRUD y listados | Si. Dashboard admin pierde datos y acciones. |
| `pages/dashboard/profesor.html` | Supabase CDN, `db.from(...)` | Panel profesor, clases, alumnos, disponibilidad | Si. Dashboard profesor queda sin datos. |
| `pages/dashboard/familia.html` | Supabase CDN, `db.from(...)` | Panel familia, alumnos, clases, pagos, documentos | Si. Dashboard familia queda sin datos. |
| `pages/dashboard/alumno.html` | Supabase CDN, `db.from(...)` | Panel alumno, clases, profesor/asignaciones | Si. Dashboard alumno queda sin datos. |
| `js/auth.js` | `supabase-client.js`, `db.auth`, `db.from('usuarios')` | Sesion, login, logout, registro, perfil actual | Si. La identidad de la app depende de este modulo. |
| `js/document-storage-provider.js` | `db.storage.from('documentos')` | Upload y URLs firmadas de documentos | Si. Documentos no pueden subirse ni visualizarse. |
| `js/notifications-provider.js` | `db.channel`, `postgres_changes`, `db.from('notificaciones')` | Notificaciones realtime y estado leido/no leido | Si. Notificaciones realtime y consultas fallan. |

### 3.2 Archivos de soporte Supabase

| Archivo/directorio | Funcion | Estado para migracion |
| --- | --- | --- |
| `js/supabase-client.js` | Cliente central Supabase usado por runtime | Eliminable solo al final. |
| `js/supabase-config.js` | Configuracion URL/key Supabase | Eliminable solo al final. |
| `js/supabase-client.example.js` | Ejemplo/config auxiliar | Eliminable al final o archivable antes si no se usa. |
| `supabase/migrations/*` | Esquema, politicas, vistas, triggers y storage | Fuente de verdad para migrar datos y reglas. |
| `scripts/supabase-runtime-audit.mjs` | Auditor de dependencias | Util durante migracion; no es runtime. |
| Documentacion relacionada | Evidencia de despliegue/migracion | No afecta runtime. |

### 3.3 Dependencia indirecta importante

`js/auth-provider.js` declara que el proveedor de produccion es Supabase. Aunque no se debe modificar en esta fase, este archivo es el punto natural de corte futuro para cambiar de proveedor cuando el resto de la app tenga adaptadores Firebase suficientes.

## 4. Inventario Supabase: tablas, vistas, funciones, storage, auth y realtime

### 4.1 Tablas usadas o definidas

| Tabla Supabase | Uso actual/esperado | Riesgo de migracion |
| --- | --- | --- |
| `usuarios` | Perfil base, rol, email, estado activo, enlace con `auth.users` | Alto: es el centro de identidad. |
| `profesores` | Perfil profesor, especialidades, tarifas, verificacion | Alto: usado en dashboards y asignaciones. |
| `familias` | Perfil familia y datos administrativos | Alto: usado en alumnos, pagos y solicitudes. |
| `alumnos` | Estudiantes, familia, materias, curso, usuario opcional | Alto: aparece en casi todas las consultas privadas. |
| `asignaciones` | Relacion profesor-alumno-materia | Alto: sustituye joins SQL con denormalizacion Firestore. |
| `disponibilidad` | Franjas horarias de profesores | Medio: aislable por profesor. |
| `solicitudes` | Solicitudes de clases y asignacion de profesor | Medio-alto: workflow admin/familia. |
| `clases` | Clases, importes, estados y observaciones | Muy alto: nucleo transaccional. |
| `pagos` | Pagos, validacion, metodo, documento asociado | Alto: depende de clases, familia y documentos. |
| `documentos` | Metadatos de archivos | Alto: unido a Storage. |
| `incidencias` | Reportes y resoluciones | Medio: menos acoplado, pero con permisos por rol. |
| `notificaciones` | Notificaciones por usuario y realtime | Medio-alto: debe sustituirse por snapshot listeners. |
| `auditoria` | Auditoria de cambios | Medio: conviene mover a `auditLogs`. |
| `configuracion` | Configuracion key/value | Bajo-medio. |
| `leads_publicos` | Leads publicos y gestion admin | Bajo-medio: ya existe equivalente Firebase parcial. |
| `alumno_invitaciones` | Invitaciones para alumnos | Alto en auth: participa en `handle_new_auth_user`. |

### 4.2 Vistas Supabase usadas como modelo funcional

| Vista | Funcion | Sustitucion Firebase |
| --- | --- | --- |
| `v_clases_completas` | Une clases, alumnos, familias, profesores y usuarios | Denormalizar campos en `clases` o crear agregados `classViews`. |
| `v_resumen_profesor_mes` | Agregado mensual de clases realizadas por profesor | Crear documentos `teacherMonthlySummaries/{teacherUid_month}` con Cloud Functions o job admin. |
| `v_dashboard_admin` | KPIs globales admin | Crear `adminStats/current` y agregados incrementales o jobs programados. |

### 4.3 Funciones/triggers SQL

No hay llamadas `.rpc()` desde frontend. Aun asi, Supabase ejecuta logica backend que debe sustituirse.

| Funcion/trigger | Uso Supabase | Sustitucion Firebase |
| --- | --- | --- |
| `set_updated_at` | Actualiza `updated_at` en tablas | Usar `serverTimestamp()` en escrituras o Cloud Functions. |
| `calcular_comision_clase` | Calcula comision e importe profesor | Funcion compartida en capa de servicios; idealmente Cloud Function para escrituras criticas. |
| `handle_new_auth_user` | Crea perfil desde `auth.users`, roles e invitaciones | Firebase Auth trigger `onCreate` o script admin controlado. |
| `reparar_perfiles_faltantes` | Repara perfiles ausentes | Script Admin SDK puntual. |
| `get_rol_actual` y helpers de usuario | Base de RLS | Firestore Rules con `request.auth.uid`, custom claims y documentos `users/{uid}`. |
| `profesor_puede_ver_alumno` | Permiso por asignacion | Rules basadas en `asignaciones` o denormalizacion de `teacherUid` en `alumnos`. |
| `familia_puede_ver_alumno` | Permiso familia-alumno | Rules con `familyUid` en `alumnos`. |
| `validar_solape_clase` | Evita solapes de clases por profesor/alumno | Cloud Function transaccional o validacion en servicio admin; Firestore Rules no son adecuadas para consultas de rango complejas. |

### 4.4 Storage

| Bucket | Uso | Politicas actuales | Sustitucion Firebase |
| --- | --- | --- | --- |
| `documentos` | Upload y lectura privada de justificantes/documentos | Bucket privado; usuario lee/sube/elimina en su carpeta; admin puede operar todo | Firebase Storage bucket con rutas `documents/{ownerUid}/{documentId}/{filename}` y reglas por owner/admin. |

El codigo runtime no expone muchos nombres de bucket porque el acceso esta encapsulado en `js/document-storage-provider.js`. Ese encapsulamiento es positivo para la migracion.

### 4.5 Auth

Metodos Supabase Auth detectados:

| Metodo | Archivo | Equivalente Firebase |
| --- | --- | --- |
| `getSession` | `js/auth.js` | `onAuthStateChanged`, `currentUser`, token claims. |
| `onAuthStateChange` | `js/auth.js`, `pages/login.html`, `pages/reset-password.html` | `onAuthStateChanged`. |
| `signInWithPassword` | `js/auth.js` | `signInWithEmailAndPassword`. |
| `signOut` | `js/auth.js` | `signOut`. |
| `signUp` | `js/auth.js` | `createUserWithEmailAndPassword` o Admin SDK. |
| `resetPasswordForEmail` | `js/auth.js` | `sendPasswordResetEmail`. |
| `updateUser` | `pages/reset-password.html` | `updatePassword`. |

### 4.6 Realtime

| Uso | Archivo | Sustitucion Firebase |
| --- | --- | --- |
| Canal `postgres_changes` sobre `notificaciones` | `js/notifications-provider.js` | `onSnapshot(query(collection(db, 'notificaciones'), where('userUid', '==', uid), orderBy('createdAt', 'desc')))`. |

## 5. Que se rompe si se elimina Supabase hoy

| Area | Modulos afectados | Impacto |
| --- | --- | --- |
| Login/sesion | `pages/login.html`, `js/auth.js` | Usuarios no pueden iniciar sesion correctamente en la app privada. |
| Registro | `pages/registro.html`, `js/auth.js` | Alta de usuarios queda rota o incompleta. |
| Reset password | `pages/reset-password.html`, `js/auth.js` | Recuperacion de password deja de funcionar. |
| Panel admin | `pages/dashboard/admin.html` | KPIs, leads, profesores, familias, alumnos, clases, pagos e incidencias fallan. |
| Panel profesor | `pages/dashboard/profesor.html` | Clases, alumnos asignados, disponibilidad y acciones de profesor fallan. |
| Panel familia | `pages/dashboard/familia.html` | Alumnos, clases, pagos, solicitudes/documentos fallan. |
| Panel alumno | `pages/dashboard/alumno.html` | Vista del alumno, clases y asignaciones fallan. |
| Documentos | `js/document-storage-provider.js` | Upload y signed URLs dejan de funcionar. |
| Notificaciones | `js/notifications-provider.js` | Realtime, listado y marcado como leidas fallan. |
| Permisos por rol | RLS Supabase y `usuarios.rol` | Deben reexpresarse como Rules/custom claims. |
| Agregados SQL | Vistas Supabase | KPIs y resumenes necesitan agregados Firestore. |

## 6. Propuesta de estructura Firestore

### 6.1 Colecciones principales

| Supabase | Firestore propuesto | ID recomendado | Campos clave |
| --- | --- | --- | --- |
| `usuarios` | `users/{uid}` | Firebase Auth UID | `email`, `nombre`, `apellidos`, `displayName`, `phone`, `role`, `active`, `avatarUrl`, `createdAt`, `updatedAt`. |
| `profesores` | `profesores/{uid}` | UID del profesor | `userUid`, `dni`, `city`, `studyLevel`, `specialties`, `subjects`, `educationLevels`, `hourlyRate`, `commissionPercent`, `iban`, `bio`, `verificationStatus`, `adminNotes`, `active`, `createdAt`, `updatedAt`. |
| `familias` | `familias/{uid}` | UID de la familia | `userUid`, `address`, `city`, `postalCode`, `source`, `adminNotes`, `active`, `createdAt`, `updatedAt`. |
| `alumnos` | `alumnos/{studentId}` | UUID importado o nuevo ID Firestore | `familyUid`, `studentUid`, `nombre`, `apellidos`, `displayName`, `birthDate`, `educationLevel`, `course`, `school`, `neededSubjects`, `adminNotes`, `active`, `createdAt`, `updatedAt`. |
| `asignaciones` | `asignaciones/{assignmentId}` | UUID importado o nuevo ID | `teacherUid`, `familyUid`, `studentId`, `studentUid`, `subject`, `active`, `startDate`, `endDate`, `hourlyRate`, `notes`, `createdAt`, `updatedAt`. |
| `disponibilidad` | `disponibilidad/{slotId}` | Nuevo ID | `teacherUid`, `weekday`, `startTime`, `endTime`, `createdAt`. |
| `solicitudes` | `solicitudes/{requestId}` | UUID importado o nuevo ID | `familyUid`, `studentId`, `subject`, `level`, `schedulePreference`, `notes`, `status`, `assignedTeacherUid`, `assignedAt`, `adminNotes`, `createdAt`, `updatedAt`. |
| `clases` | `clases/{classId}` | UUID importado o nuevo ID | `studentId`, `studentUid`, `studentName`, `familyUid`, `teacherUid`, `teacherName`, `assignmentId`, `subject`, `date`, `startTime`, `endTime`, `durationMinutes`, `totalPrice`, `commissionAmount`, `teacherAmount`, `status`, `observations`, `teacherNotes`, `cancelReason`, `rescheduledFrom`, `createdAt`, `updatedAt`. |
| `pagos` | `pagos/{paymentId}` | UUID importado o nuevo ID | `familyUid`, `classId`, `documentId`, `amount`, `method`, `reference`, `status`, `familyNotes`, `adminNotes`, `validatedByUid`, `validatedAt`, `createdAt`, `updatedAt`. |
| `documentos` | `documentos/{documentId}` | UUID importado o nuevo ID | `ownerUid`, `ownerRole`, `type`, `name`, `storagePath`, `downloadUrl`, `sizeBytes`, `mimeType`, `status`, `adminNotes`, `createdAt`, `updatedAt`. |
| `incidencias` | `incidencias/{incidentId}` | UUID importado o nuevo ID | `reportedByUid`, `relatedUid`, `classId`, `type`, `description`, `status`, `priority`, `resolution`, `resolvedByUid`, `resolvedAt`, `createdAt`, `updatedAt`. |
| `notificaciones` | `notificaciones/{notificationId}` | Nuevo ID | `userUid`, `title`, `message`, `type`, `read`, `actionUrl`, `createdAt`, `readAt`. |
| `auditoria` | `auditLogs/{logId}` | Nuevo ID | `actorUid`, `action`, `collection`, `documentId`, `before`, `after`, `ip`, `userAgent`, `createdAt`. |
| `configuracion` | `configuracion/{key}` | Clave | `value`, `description`, `updatedAt`, `updatedByUid`. |
| `leads_publicos` | `leadsPublicos/{leadId}` | Nuevo ID | `tipo`, `estado`, datos de contacto, preferencias, `createdAt`, `updatedAt`. |
| `alumno_invitaciones` | `studentInvites/{inviteId}` | Token o ID seguro | `studentId`, `familyUid`, `email`, `tokenHash`, `usedAt`, `expiresAt`, `createdAt`. |

### 6.2 Subcolecciones opcionales

| Opcion | Ventaja | Riesgo |
| --- | --- | --- |
| `profesores/{uid}/disponibilidad/{slotId}` | Facilita reglas por profesor y lecturas de disponibilidad individual | Peor para consultas globales admin sin collection group. |
| `users/{uid}/notifications/{notificationId}` | Permisos simples y realtime directo por usuario | Requiere collection group para panel admin o envios masivos. |
| `alumnos/{studentId}/documents/{documentId}` | Organizacion natural de documentos por alumno | Puede duplicar `documentos` global. |

Recomendacion: mantener colecciones globales para `disponibilidad`, `notificaciones` y `documentos` al principio. Reduce cambios en dashboards y simplifica migracion incremental. Se pueden crear subcolecciones despues si aparece un patron claro.

### 6.3 Denormalizacion necesaria

Firestore no sustituye joins SQL directamente. Los documentos que mas deben denormalizar son:

- `clases`: guardar nombres de alumno/profesor, `familyUid`, `teacherUid`, `studentId`, materia e importes calculados.
- `asignaciones`: guardar `familyUid` y datos minimos del alumno para evitar joins frecuentes.
- `pagos`: guardar `familyUid`, `classId`, `documentId` y, si el dashboard lo necesita, `studentName`/`classDate`.
- `notificaciones`: guardar `userUid`, `role` opcional y estado de lectura.
- Agregados admin: guardar contadores y sumas ya calculadas en documentos de resumen.

## 7. Indices Firestore necesarios

### 7.1 Indices existentes

Ya existen en `firebase/firestore.indexes.json`:

| Coleccion | Campos |
| --- | --- |
| `leadsPublicos` | `estado ASC`, `createdAt DESC` |
| `leadsPublicos` | `tipo ASC`, `createdAt DESC` |
| `alumnos` | `familyUid ASC`, `active ASC`, `createdAt DESC` |
| `asignaciones` | `teacherUid ASC`, `active ASC`, `createdAt DESC` |
| `clases` | `teacherUid ASC`, `fecha DESC` |
| `clases` | `familyUid ASC`, `fecha DESC` |

### 7.2 Indices adicionales recomendados

| Coleccion | Indice | Motivo |
| --- | --- | --- |
| `users` | `role ASC`, `active ASC`, `createdAt DESC` | Listados admin por rol/estado. |
| `profesores` | `verificationStatus ASC`, `createdAt DESC` | Revision admin. |
| `profesores` | `city ASC`, `verificationStatus ASC`, `createdAt DESC` | Busqueda operativa por ciudad/estado. |
| `familias` | `active ASC`, `createdAt DESC` | Listado admin. |
| `alumnos` | `studentUid ASC`, `active ASC` | Panel alumno autenticado. |
| `alumnos` | `active ASC`, `createdAt DESC` | Listado admin. |
| `asignaciones` | `studentId ASC`, `active ASC`, `createdAt DESC` | Panel alumno/familia. |
| `asignaciones` | `familyUid ASC`, `active ASC`, `createdAt DESC` | Panel familia. |
| `asignaciones` | `teacherUid ASC`, `active ASC`, `subject ASC` | Filtros de profesor por materia. |
| `disponibilidad` | `teacherUid ASC`, `weekday ASC`, `startTime ASC` | Horario profesor. |
| `solicitudes` | `familyUid ASC`, `status ASC`, `createdAt DESC` | Panel familia. |
| `solicitudes` | `status ASC`, `createdAt DESC` | Bandeja admin. |
| `solicitudes` | `assignedTeacherUid ASC`, `status ASC`, `createdAt DESC` | Seguimiento por profesor asignado. |
| `clases` | `studentId ASC`, `date DESC` | Panel alumno y ficha alumno. |
| `clases` | `teacherUid ASC`, `status ASC`, `date DESC` | Panel profesor y calculo mensual. |
| `clases` | `familyUid ASC`, `status ASC`, `date DESC` | Panel familia. |
| `clases` | `status ASC`, `date DESC` | Admin por estado. |
| `clases` | `assignmentId ASC`, `date DESC` | Historial por asignacion. |
| `clases` | `monthKey ASC`, `status ASC`, `teacherUid ASC` | Resumen profesor/mes. |
| `pagos` | `familyUid ASC`, `status ASC`, `createdAt DESC` | Panel familia. |
| `pagos` | `status ASC`, `createdAt DESC` | Validacion admin. |
| `pagos` | `classId ASC` | Relacion pago-clase. |
| `pagos` | `documentId ASC` | Validacion de justificante. |
| `documentos` | `ownerUid ASC`, `status ASC`, `createdAt DESC` | Documentos por usuario. |
| `documentos` | `ownerUid ASC`, `type ASC`, `createdAt DESC` | Filtros por tipo. |
| `documentos` | `status ASC`, `createdAt DESC` | Revision admin. |
| `incidencias` | `status ASC`, `priority ASC`, `createdAt DESC` | Bandeja admin. |
| `incidencias` | `reportedByUid ASC`, `status ASC`, `createdAt DESC` | Incidencias propias. |
| `incidencias` | `relatedUid ASC`, `status ASC`, `createdAt DESC` | Incidencias relacionadas. |
| `notificaciones` | `userUid ASC`, `read ASC`, `createdAt DESC` | Badge y lista usuario. |
| `notificaciones` | `userUid ASC`, `createdAt DESC` | Feed usuario. |
| `studentInvites` | `studentId ASC`, `createdAt DESC` | Invitaciones por alumno. |
| `studentInvites` | `familyUid ASC`, `usedAt ASC`, `createdAt DESC` | Seguimiento familia. |
| `auditLogs` | `actorUid ASC`, `createdAt DESC` | Auditoria por usuario. |
| `auditLogs` | `collection ASC`, `documentId ASC`, `createdAt DESC` | Auditoria por documento. |

Notas:

- Los filtros `array-contains` sobre materias/especialidades usan indices simples automaticos, salvo que se combinen con orden/filtros adicionales.
- Firestore obliga a crear indices segun consultas reales; esta lista debe validarse modulo por modulo durante la migracion.

## 8. Politicas y reglas

### 8.1 Politicas Supabase detectadas

Las migraciones Supabase definen RLS para:

- `usuarios`: usuarios ven/actualizan su perfil; admin ve/gestiona todos.
- `profesores`: profesor ve su perfil; admin gestiona; familias pueden ver profesores asignados.
- `familias`: familia ve su perfil; admin gestiona.
- `alumnos`: familia y alumno relacionados pueden ver; admin gestiona; profesor ve alumnos asignados.
- `asignaciones`: profesor/familia relacionados ven; admin gestiona.
- `disponibilidad`: profesores gestionan su disponibilidad; admin puede ver/gestionar.
- `solicitudes`: familias crean/ven; admin gestiona.
- `clases`: profesor/familia/alumno relacionados ven; profesor actualiza ciertas clases; admin gestiona.
- `pagos`: familias crean/ven propios; admin valida/gestiona.
- `documentos`: propietario y admin acceden.
- `incidencias`: usuarios crean; relacionados/admin ven; admin resuelve.
- `notificaciones`: usuario ve/actualiza sus notificaciones.
- `leads_publicos`: insercion publica; admin lectura/gestion.
- `alumno_invitaciones`: admin/familia segun flujo de invitacion.
- Storage `documentos`: usuario opera carpeta propia; admin opera todo.

### 8.2 Estado de Firestore Rules

Ya existen reglas para:

- `leadsPublicos`
- `users`
- `profesores`
- `familias`
- `alumnos`
- `asignaciones`
- `clases`
- `pagos`
- `documentos`
- `notificaciones`
- `configuracion`
- `configuracionPublica`
- `auditLogs`
- `importAudits`
- `legacyImports`

Faltan reglas explicitas o equivalentes para:

- `solicitudes`
- `incidencias`
- `disponibilidad`
- `studentInvites`
- Agregados operativos como `adminStats` o `teacherMonthlySummaries` si se crean.

## 9. Riesgos, dependencias ocultas y rendimiento

| Riesgo | Impacto | Mitigacion |
| --- | --- | --- |
| Joins SQL convertidos a lecturas multiples | Coste y latencia altos en dashboards | Denormalizar en `clases`, `asignaciones`, `pagos` y usar agregados. |
| Vistas agregadas no existen en Firestore | KPIs admin y resumen mensual lentos o caros | Crear documentos de resumen mantenidos por Cloud Functions/jobs. |
| Triggers SQL no tienen equivalente automatico | Comisiones, updatedAt y validaciones pueden divergir | Centralizar escrituras criticas en servicios/Cloud Functions. |
| RLS Supabase no se traduce 1:1 | Posibles fugas o bloqueos de datos | Reescribir reglas con UID y probar por rol. |
| Auth ID cambia de Supabase UUID a Firebase UID | Relaciones historicas pueden romperse | Crear tabla/mapa de equivalencias durante importacion. |
| `usuarios.id` y `usuarios.auth_id` tienen doble identidad | Confusion entre ID de perfil e ID auth | Normalizar a UID Firebase como clave primaria de usuario. |
| Validacion de solape de clases | Firestore Rules no puede consultar rangos complejos eficientemente | Cloud Function transaccional o escritura admin controlada. |
| Busqueda trigram de nombres | Firestore no tiene busqueda full-text nativa | Campos normalizados, prefijos o servicio externo si hace falta. |
| Arrays combinados con filtros compuestos | Limitaciones de consultas Firestore | Disenar consultas reales antes de desplegar indices. |
| Realtime de notificaciones | Diferente modelo de suscripcion | `onSnapshot` por usuario con indice `userUid/read/createdAt`. |
| Documentos privados | Storage no esta listo en el corte final | Mantener proveedor encapsulado y cambiar solo implementacion al activar Storage. |
| Cache/PWA | Datos privados pueden quedar cacheados incorrectamente | Revisar service worker y headers antes del corte. |
| Leads publicos parcialmente migrados | Admin puede seguir leyendo Supabase | Migrar panel admin de leads antes de retirar Supabase. |
| Netlify/DNS externo | Produccion real puede seguir fuera de Firebase Hosting | Cortar DNS al final, despues de validar Firebase Hosting. |

## 10. Plan de migracion por fases

Ordenado de menor a mayor riesgo:

### Fase 0. Congelar referencia y backups

- Exportar datos Supabase.
- Guardar schema SQL, politicas y storage paths.
- Crear mapa de IDs Supabase -> Firebase.
- Confirmar reglas Firestore y entorno de preview.

Riesgo: bajo.  
Desbloquea: migracion reproducible y rollback.

### Fase 1. Adaptadores Firebase sin activar corte

- Crear interfaces de datos por dominio: auth, users, alumnos, clases, pagos, documentos, notificaciones.
- Mantener Supabase como proveedor activo.
- Crear pruebas de lectura/escritura contra emulador o proyecto Firebase.

Riesgo: bajo.  
Desbloquea: migracion modulo por modulo sin tocar pantallas completas.

### Fase 2. Migrar autenticacion en entorno controlado

- Sustituir llamadas `db.auth` por Firebase Auth dentro de la capa de auth.
- Mantener compatibilidad con roles via `users/{uid}`.
- Probar login, logout, reset y registro.

Riesgo: medio.  
Desbloquea: independencia de Supabase Auth.

### Fase 3. Migrar entidades base

- Migrar `usuarios`, `profesores`, `familias`, `alumnos`.
- Resolver equivalencias de UID.
- Validar reglas por rol.

Riesgo: medio.  
Desbloquea: dashboards con identidad Firebase.

### Fase 4. Migrar modulos de menor acoplamiento

- `leads_publicos` admin.
- `disponibilidad`.
- `solicitudes`.
- `incidencias`.
- `configuracion`.

Riesgo: medio.  
Desbloquea: reduccion rapida de consultas Supabase.

### Fase 5. Migrar asignaciones y clases

- Migrar `asignaciones`.
- Migrar `clases` con denormalizacion.
- Implementar calculo de importes/comisiones.
- Implementar validacion de solapes fuera de reglas Firestore.

Riesgo: alto.  
Desbloquea: nucleo operativo privado.

### Fase 6. Migrar pagos

- Migrar `pagos`.
- Conectar con `clases`, `familias` y documentos.
- Validar flujos admin/familia.

Riesgo: alto.  
Desbloquea: gestion economica sin Supabase.

### Fase 7. Migrar documentos cuando Storage este disponible

- Crear bucket Firebase Storage.
- Migrar objetos del bucket `documentos`.
- Crear metadatos en `documentos/{documentId}`.
- Cambiar implementacion de `document-storage-provider.js` a Firebase Storage.

Riesgo: alto.  
Desbloquea: eliminacion de Supabase Storage.

### Fase 8. Migrar notificaciones realtime

- Migrar `notificaciones`.
- Sustituir `db.channel` por `onSnapshot`.
- Probar badge, listado, marcado como leido y desconexion.

Riesgo: medio-alto.  
Desbloquea: eliminacion de Supabase Realtime.

### Fase 9. Cortar dashboards a Firebase

- Cambiar cada dashboard por modulo.
- Validar admin, profesor, familia y alumno con usuarios reales de prueba.
- Comparar contadores y listados contra Supabase antes de apagar.

Riesgo: alto.  
Desbloquea: Supabase deja de ser backend operativo.

### Fase 10. Retirar Supabase runtime

- Eliminar imports de Supabase CDN.
- Eliminar `supabase-client.js` y configuracion runtime.
- Actualizar `auth-provider.js` solo cuando todo lo anterior este validado.
- Mantener migraciones SQL archivadas como referencia historica.

Riesgo: medio.  
Desbloquea: Firebase como unico backend.

### Fase 11. Produccion unica en Firebase Hosting

- Validar headers, cache, redirects, rewrites y PWA.
- Cambiar DNS a Firebase Hosting.
- Desactivar Netlify despues de verificar trafico.

Riesgo: medio.  
Desbloquea: Firebase Hosting como unica produccion y Netlify eliminado.

## 11. Modulos eliminables despues del corte

Solo despues de completar las fases anteriores:

| Modulo | Condicion para eliminar |
| --- | --- |
| `js/supabase-client.js` | Ningun runtime importa Supabase. |
| `js/supabase-config.js` | Ningun runtime necesita URL/key Supabase. |
| Supabase CDN en HTML | Login, registro, reset y dashboards ya usan Firebase. |
| `js/supabase-client.example.js` | Configuracion Firebase documentada y estable. |
| `supabase/migrations/*` | Archivado externo confirmado; no se necesita para rollback. |
| `scripts/supabase-runtime-audit.mjs` | Auditoria final confirma cero dependencias. |
| Proyecto Supabase | Datos, storage, auth y realtime migrados y verificados. |
| Netlify | DNS y produccion real apuntan a Firebase Hosting. |

## 12. Recomendacion final

No conviene hacer una sustitucion global de Supabase por Firebase en una sola operacion. El acoplamiento actual esta concentrado en los dashboards y en `js/auth.js`, pero las dependencias reales incluyen permisos RLS, vistas SQL, triggers, storage privado y realtime.

La estrategia de menor riesgo es:

1. Mantener Supabase activo mientras se crean adaptadores Firebase.
2. Migrar primero identidad y entidades base.
3. Migrar despues modulos aislados.
4. Dejar clases/pagos/documentos/notificaciones para fases finales.
5. Cortar dashboards por rol, no toda la aplicacion a la vez.
6. Eliminar Supabase solo cuando el auditor runtime devuelva cero dependencias y los datos historicos esten verificados en Firebase.

Este informe no realiza migraciones, no modifica proveedores y no elimina codigo Supabase. Es exclusivamente inventario tecnico y plan de ejecucion.
