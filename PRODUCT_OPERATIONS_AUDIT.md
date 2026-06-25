# PRODUCT_OPERATIONS_AUDIT - ClasesDe10

Actualizado: 2026-06-25

## Resumen ejecutivo

La web ya tiene Firebase Auth, Firebase Hosting y captacion publica de leads en Firestore. Sin embargo, el producto operativo todavia no esta unificado: los dashboards de admin, familia, profesor y alumno siguen usando Supabase para la mayoria de datos diarios.

Esto produce una experiencia inconsistente:

- El login puede funcionar con Firebase.
- Los formularios publicos guardan leads en Firestore.
- El panel admin puede ver leads Firebase.
- Pero solicitudes, alumnos, profesores, familias, clases, pagos, documentos, disponibilidad, notificaciones y emparejamientos siguen dependiendo de Supabase.

La prioridad profesional no es seguir migrando al azar, sino cerrar el ciclo operativo principal:

1. Captar familia/profesor.
2. Crear perfil real.
3. Crear alumno.
4. Crear solicitud.
5. Emparejar profesor-alumno.
6. Mostrar asignacion a admin, familia, profesor y alumno.
7. Crear clases.
8. Registrar pagos/documentos.

## Estado real por flujo

| Flujo | Estado actual | Backend usado | Riesgo |
| --- | --- | --- | --- |
| Web publica | Funciona en Firebase Hosting | Firebase Hosting | Bajo |
| Dominio propio | DNS correcto, Firebase validando SSL/custom domain | Firebase Hosting + DNS Hostalia | Medio temporal |
| Login | Migrado a Firebase Auth | Firebase Auth + Firestore `users` | Bajo |
| Registro familia/profesor | Crea usuario Firebase y `users/{uid}` | Firebase Auth + Firestore | Medio |
| Registro alumno | Bloqueado por invitaciones no migradas | Firebase Auth parcial | Alto |
| Formularios publicos | Guardan en `leadsPublicos` | Firestore | Bajo |
| Leads admin | Migrado a Firestore | Firestore | Bajo |
| Dashboard admin resumen | Fallback Firebase, metricas legacy no fiables | Firestore + Supabase legacy | Medio |
| Profesores admin | Sigue Supabase | Supabase | Alto |
| Familias admin | Sigue Supabase | Supabase | Alto |
| Alumnos admin | Sigue Supabase | Supabase | Alto |
| Solicitudes admin | Sigue Supabase | Supabase | Alto |
| Emparejamiento admin | Existe en Supabase: asignar profesor a solicitud | Supabase | Alto |
| Clases admin | Sigue Supabase | Supabase | Alto |
| Pagos admin/familia | Sigue Supabase + Storage legacy | Supabase | Alto |
| Documentos | Sigue Supabase Storage | Supabase Storage | Alto |
| Notificaciones | Sigue Supabase realtime | Supabase realtime | Medio |

## Hallazgos tecnicos verificados

Comandos ejecutados:

- `npm.cmd run audit:hosting`: OK.
- `npm.cmd run audit:supabase`: 6 archivos runtime con Supabase, 81 consultas, 2 llamadas storage y 1 canal realtime.
- `npm.cmd run test:adapters`: OK, 13 dominios de adaptadores.
- `npm.cmd run audit:auth`: Firebase Auth disponible, 2 usuarios, proveedor `password`.

Dependencias Supabase runtime actuales:

| Archivo | Dependencia principal |
| --- | --- |
| `pages/dashboard/admin.html` | Admin operativo: profesores, familias, alumnos, solicitudes, emparejamientos, clases, pagos, documentos, incidencias |
| `pages/dashboard/familia.html` | Hijos, solicitudes, pagos, documentos, invitaciones alumno |
| `pages/dashboard/profesor.html` | Perfil, disponibilidad, clases, ingresos, documentos |
| `pages/dashboard/alumno.html` | Asignaciones y clases |
| `js/document-storage-provider.js` | Supabase Storage para documentos |
| `js/notifications-provider.js` | Supabase realtime para notificaciones |

## Login y roles

### Lo que funciona

- `pages/login.html` usa `auth-provider.js`.
- `auth-provider.js` apunta ya a Firebase Auth.
- Login redirige por rol:
  - `admin` -> `/pages/dashboard/admin.html`
  - `profesor` -> `/pages/dashboard/profesor.html`
  - `familia` -> `/pages/dashboard/familia.html`
  - `alumno` -> `/pages/dashboard/alumno.html`
- `users/{uid}` es la fuente de rol en Firebase.

### Riesgos

- El usuario puede autenticarse en Firebase pero entrar en dashboards que consultan Supabase con IDs legacy.
- Registro familia/profesor crea `users/{uid}`, pero no garantiza que exista el perfil completo en `familias/{uid}` o `profesores/{uid}`.
- Registro alumno esta bloqueado: el codigo devuelve error porque las invitaciones de alumno no estan migradas.
- Email del admin no esta verificado segun `audit:auth`, aunque puede iniciar sesion.

## Captacion publica

### Lo que funciona

- `js/public-leads.js` guarda en Firestore `leadsPublicos`.
- Valida tipo `contacto`, `familia`, `profesor`.
- Guarda metadata util: materia, nivel, zona, modalidad, presupuesto, UTM, pagina origen, privacidad.
- Admin ya puede ver esos leads en la seccion Leads.

### Hueco de producto

Un lead no se convierte automaticamente en:

- familia real,
- profesor real,
- alumno,
- solicitud,
- asignacion.

Ahora mismo hay una separacion entre "captacion" y "operacion". El admin ve el lead, pero no hay flujo completo de convertirlo en expediente operativo Firebase.

## Registro familia/profesor/alumno

### Familia

El registro crea cuenta Firebase, pero el dashboard familia operativo sigue esperando datos legacy de Supabase (`familias`, `usuarios`, `alumnos`, `solicitudes`, `pagos`).

Riesgo: una familia nueva creada solo en Firebase puede iniciar sesion pero no tener todas las pantallas funcionales.

### Profesor

El registro crea cuenta Firebase, pero el panel profesor sigue usando Supabase para perfil, disponibilidad, documentos, clases e ingresos.

Riesgo: un profesor nuevo en Firebase puede entrar, pero su operativa profesional no esta completamente conectada.

### Alumno

El registro alumno por invitacion esta explicitamente bloqueado hasta migrar invitaciones:

- Parametros esperados: `?rol=alumno&token=...`
- Estado actual: devuelve error indicando que faltan invitaciones Firebase.

## Emparejamientos

### Flujo actual encontrado

El emparejamiento operativo existe en `pages/dashboard/admin.html` dentro de Solicitudes:

1. Familia crea solicitud en `pages/dashboard/familia.html`.
2. La solicitud se guarda en Supabase `solicitudes`.
3. Admin ve solicitudes en panel admin.
4. Admin pulsa `Asignar`.
5. Se abre modal `Asignar profesor`.
6. Se cargan profesores verificados desde Supabase.
7. Al guardar:
   - `solicitudes.estado = 'asignada'`
   - `solicitudes.profesor_asignado_id = profId`
   - `solicitudes.fecha_asignacion = now`

### Problema

Ese emparejamiento no esta en Firebase. Firestore ya tiene coleccion prevista `asignaciones`, pero el dashboard admin todavia no la usa para crear/ver emparejamientos.

### Lo que deberia existir en Firebase

Coleccion `solicitudes/{solicitudId}`:

- `familyUid`
- `studentId`
- `materia`
- `nivel`
- `preferenciaHorario`
- `observaciones`
- `status`: `nueva`, `en_revision`, `asignada`, `cerrada`, `cancelada`
- `assignedTeacherUid`
- `assignedAt`
- `createdAt`
- `updatedAt`

Coleccion `asignaciones/{assignmentId}`:

- `requestId`
- `familyUid`
- `studentId`
- `teacherUid`
- `materias`
- `status`: `activa`, `pausada`, `finalizada`
- `source`: `admin_manual`, `matching_asistido`
- `adminNotes`
- `createdAt`
- `updatedAt`

Coleccion `clases/{classId}`:

- `assignmentId`
- `familyUid`
- `studentId`
- `teacherUid`
- `fecha`
- `horaInicio`
- `horaFin`
- `materia`
- `estado`
- `precioTotal`
- `comision`
- `notasAdmin`
- `notasProfesor`

## Donde debe ver el admin los emparejamientos

Recomendacion de producto:

1. Mantener `Solicitudes` para demanda entrante.
2. Crear seccion `Emparejamientos` o renombrar `Asignaciones`.
3. En `Solicitudes`, el boton `Asignar` debe crear/actualizar:
   - `solicitudes/{id}`
   - `asignaciones/{id}`
4. En `Emparejamientos`, el admin debe poder ver:
   - familia,
   - alumno,
   - materia/nivel,
   - profesor asignado,
   - estado,
   - fecha de asignacion,
   - proxima clase,
   - notas internas.
5. Familia/profesor/alumno deben ver la misma asignacion filtrada por su rol.

## Riesgos de rendimiento y datos

- Firestore necesita indices por:
  - `solicitudes.status + createdAt`
  - `solicitudes.familyUid + createdAt`
  - `asignaciones.teacherUid + active/status + createdAt`
  - `asignaciones.familyUid + active/status + createdAt`
  - `asignaciones.studentId + active/status + createdAt`
  - `clases.teacherUid + fecha`
  - `clases.familyUid + fecha`
  - `clases.studentUid/studentId + fecha`
- Si se duplican `teacherUid` y `profesor_id` sin una tabla de correspondencias, habra errores de permisos y datos invisibles.
- Hay que decidir una convencion unica: en Firebase usar `uid` de Auth como identificador principal para usuarios, profesores y familias.

## Prioridades recomendadas

### P0 - Estabilizar operacion visible

1. Mantener web publica y login estables.
2. No cortar Supabase para dashboards hasta migrar el ciclo operativo minimo.
3. Mantener fallback admin Firebase para no mostrar errores legacy como averia general.

### P1 - Cerrar ciclo familia -> solicitud -> asignacion

1. Migrar `familia.html` a Firebase para:
   - perfil familia,
   - hijos/alumnos,
   - crear solicitudes.
2. Migrar `admin.html` seccion Solicitudes a Firebase.
3. Implementar `asignaciones` Firebase desde el modal de asignar profesor.
4. Crear vista admin de Emparejamientos.

### P2 - Cerrar ciclo profesor

1. Migrar perfil profesor.
2. Migrar disponibilidad.
3. Permitir que admin asigne profesores Firebase verificados.
4. Mostrar asignaciones y clases al profesor.

### P3 - Cerrar alumno

1. Migrar invitaciones alumno.
2. Activar registro alumno por token.
3. Mostrar asignaciones y clases del alumno.

### P4 - Pagos, documentos y notificaciones

1. Migrar documentos a Firebase Storage.
2. Migrar pagos a Firestore.
3. Sustituir realtime Supabase por Firestore listeners o notificaciones simples.

## Siguiente trabajo recomendado

La siguiente fase no debe ser "migrar todo". Debe ser:

**Fase Operativa 1: Solicitudes y Emparejamientos Firebase**

Objetivo:

- Que una familia Firebase pueda crear un alumno y una solicitud.
- Que el admin vea esa solicitud en Firebase.
- Que el admin asigne un profesor.
- Que esa asignacion quede visible en una seccion admin `Emparejamientos`.

Archivos probables:

- `js/adapters/solicitudes-adapter.js`
- `js/adapters/asignaciones-adapter.js`
- `js/adapters/profesores-adapter.js`
- `js/adapters/alumnos-adapter.js`
- `pages/dashboard/admin.html`
- `pages/dashboard/familia.html`
- `firebase/firestore.indexes.json`
- `firebase/firestore.rules`

No tocar todavia:

- pagos,
- documentos,
- notificaciones,
- historicos Supabase,
- dashboard profesor completo.

Esta fase da retorno alto porque convierte Firebase en backend real de operacion, no solo login/leads.
