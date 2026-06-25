# Auditoria de identidades Supabase -> Firebase

Fecha: 2026-06-25  
Alcance: inventario de identidades previo a Fase 2 Auth.  
Restricciones respetadas: no se modifica codigo, no se migran usuarios, no se crean ni sincronizan cuentas.

## 1. Resumen ejecutivo

El inventario verificable en Firebase esta completo y es consistente:

- Firebase Auth contiene 1 usuario.
- Firestore contiene 1 documento `users/{uid}`.
- El usuario Firebase tiene documento de perfil compatible.
- El unico usuario verificado es el administrador `contacto.clasesde10@gmail.com`.

No ha sido posible inventariar usuarios reales de Supabase con los accesos/configuracion actuales porque la URL Supabase registrada en el repositorio no resuelve DNS:

```text
https://hxxajibgmtvcbeqguaqr.supabase.co
getaddrinfo ENOTFOUND hxxajibgmtvcbeqguaqr.supabase.co
```

Conclusion principal: no se puede certificar que todos los usuarios necesarios para produccion existan ya en Firebase Auth hasta obtener un inventario real de Supabase. Con los datos verificables hoy, Firebase solo tiene preparado el usuario admin.

## 2. Comprobaciones realizadas

### 2.1 Fuentes locales

Archivos revisados:

- `.firebaserc`
- `js/supabase-config.js`
- `firebase/bootstrap-admin-user.mjs`
- `scripts/firebase-auth-audit.mjs`
- `supabase/seed.sql`
- busqueda local de dumps/backups/exportaciones de usuarios

Resultado:

- Proyecto Firebase: `clasesde10-50add`.
- URL Supabase configurada: `https://hxxajibgmtvcbeqguaqr.supabase.co`.
- No existe `.env` local con `SUPABASE_SERVICE_ROLE_KEY`.
- No se encontraron dumps/exportaciones locales de usuarios Supabase.

### 2.2 Firebase Auth

Comandos/consultas usados:

```powershell
npm.cmd run audit:auth
```

Tambien se verifico por REST con el token local de Firebase CLI:

```text
https://identitytoolkit.googleapis.com/v1/projects/clasesde10-50add/accounts:query
```

Resultado:

| Campo | Valor |
| --- | --- |
| Auth disponible | Si |
| Usuarios Firebase Auth | 1 |
| Proveedores | `password` |
| Admin detectado | Si |

Usuario Firebase Auth:

| UID | Email | Provider | Email verificado | Disabled |
| --- | --- | --- | --- | --- |
| `dZPatwwkRZNrth5cF1fhoHgBEo12` | `contacto.clasesde10@gmail.com` | `password` | `false` | `false` |

### 2.3 Firestore `users/{uid}`

Consulta usada:

```text
GET https://firestore.googleapis.com/v1/projects/clasesde10-50add/databases/(default)/documents/users?pageSize=1000
```

Resultado:

| UID | Email | Role | Active | Nombre | Apellidos |
| --- | --- | --- | --- | --- | --- |
| `dZPatwwkRZNrth5cF1fhoHgBEo12` | `contacto.clasesde10@gmail.com` | `admin` | `true` | `Miguel` | `null` |

Compatibilidad del perfil:

| Requisito | Estado |
| --- | --- |
| Documento `users/{uid}` existe | OK |
| UID coincide con Firebase Auth | OK |
| Email coincide con Firebase Auth | OK |
| Rol compatible (`role`) | OK |
| Estado activo (`active`) | OK |

### 2.4 Supabase

Consultas intentadas contra REST:

```text
/rest/v1/usuarios
/rest/v1/usuarios?rol=eq.admin
/rest/v1/usuarios?rol=eq.profesor
/rest/v1/usuarios?rol=eq.familia
/rest/v1/usuarios?rol=eq.alumno
/rest/v1/profesores
/rest/v1/familias
/rest/v1/alumnos?usuario_id=not.is.null
```

Error obtenido:

```text
TypeError: fetch failed
cause: getaddrinfo ENOTFOUND hxxajibgmtvcbeqguaqr.supabase.co
```

Comprobacion DNS adicional:

```powershell
Test-NetConnection hxxajibgmtvcbeqguaqr.supabase.co -Port 443 -InformationLevel Detailed
```

Resultado:

```text
WARNING: Name resolution of hxxajibgmtvcbeqguaqr.supabase.co failed
PingSucceeded: False
RemoteAddress:
```

Estado del inventario Supabase:

| Grupo | Estado | Motivo |
| --- | --- | --- |
| Admins | No verificable | URL Supabase no resuelve y no hay service role/local dump. |
| Profesores | No verificable | URL Supabase no resuelve y no hay service role/local dump. |
| Familias | No verificable | URL Supabase no resuelve y no hay service role/local dump. |
| Alumnos con acceso | No verificable | URL Supabase no resuelve y no hay service role/local dump. |

## 3. Cruce de identidades

### 3.1 Firebase Auth vs Firestore

| Caso | Resultado |
| --- | --- |
| Firebase Auth sin `users/{uid}` | 0 |
| `users/{uid}` sin Firebase Auth | 0 |
| Roles inconsistentes en Firebase/Firestore | 0 |
| Usuarios Firebase huerfanos | 0 |

Detalle:

| UID | Email | Estado |
| --- | --- | --- |
| `dZPatwwkRZNrth5cF1fhoHgBEo12` | `contacto.clasesde10@gmail.com` | Completo: Auth + `users/{uid}` admin activo. |

### 3.2 Supabase vs Firebase

No se puede calcular un cruce real porque falta el inventario Supabase.

| Caso solicitado | Estado |
| --- | --- |
| Supabase presentes pero no Firebase | No verificable |
| Firebase presentes pero no Supabase | No verificable |
| Roles inconsistentes Supabase/Firebase | No verificable |
| Usuarios huerfanos entre sistemas | No verificable |

Unico dato seguro:

- Firebase contiene el admin `contacto.clasesde10@gmail.com`.
- No hay evidencia verificable local de otros usuarios de produccion ya migrados a Firebase Auth.

## 4. Porcentaje real de migracion de identidades

Hay dos porcentajes posibles:

### 4.1 Porcentaje verificable dentro de Firebase

Este porcentaje mide consistencia interna Firebase Auth -> Firestore:

```text
Usuarios Firebase Auth con users/{uid} compatible / usuarios Firebase Auth totales
1 / 1 = 100%
```

Resultado: 100% de los usuarios Firebase inventariados tienen perfil compatible en Firestore.

### 4.2 Porcentaje global Supabase -> Firebase

Este porcentaje requiere el denominador Supabase:

```text
Usuarios necesarios de Supabase presentes en Firebase / usuarios necesarios de Supabase
```

Resultado: no calculable con rigor en este momento.

Motivo:

- Supabase no es accesible con la URL configurada.
- No hay `SUPABASE_SERVICE_ROLE_KEY` disponible.
- No hay export local de `auth.users` ni de `public.usuarios`.
- La anon key publica no pudo llegar al endpoint porque DNS falla antes de RLS.

Estimacion segura minima:

- Si el unico usuario necesario para produccion fuera el admin conocido, la cobertura seria 100%.
- Si existen profesores, familias o alumnos con acceso en Supabase, la cobertura Firebase Auth actual seria inferior y probablemente incompleta, porque Firebase Auth solo contiene 1 usuario.

Por tanto, el porcentaje real global debe marcarse como **NO VERIFICABLE** hasta recuperar acceso Supabase o un export fiable.

## 5. Riesgos antes del corte de Auth

| Riesgo | Impacto | Estado |
| --- | --- | --- |
| Usuarios Supabase no inventariados | Corte de Auth podria dejar usuarios sin acceso | Alto |
| Firebase Auth solo tiene 1 usuario | Profesores/familias/alumnos existentes no podrian entrar si existen en Supabase | Alto |
| `users/{uid}` solo existe para admin | Roles de usuarios migrados faltantes bloquearian dashboards | Alto |
| Email admin no verificado | Puede afectar flujos que dependan de email verification | Medio |
| Registro de alumno depende de invitaciones Supabase | No debe migrarse en Fase 2 limitada | Medio-alto |
| URL Supabase configurada no resuelve | Produccion Supabase actual podria estar mal configurada o el project ref podria ser incorrecto | Critico para auditoria |

## 6. Plan exacto para sincronizar identidades faltantes antes del corte

Este plan no se ha ejecutado. Es la secuencia recomendada antes de activar Firebase Auth en produccion.

### Paso 1. Obtener inventario Supabase fiable

Opcion preferente: usar `SUPABASE_SERVICE_ROLE_KEY` contra la URL correcta.

Datos necesarios:

- `auth.users`: `id`, `email`, `email_confirmed_at`, `created_at`, `last_sign_in_at`.
- `public.usuarios`: `id`, `auth_id`, `email`, `nombre`, `apellidos`, `telefono`, `rol`, `activo`.
- `public.profesores`: `id`, `usuario_id`, `estado_verificacion`.
- `public.familias`: `id`, `usuario_id`.
- `public.alumnos`: `id`, `usuario_id`, `familia_id`, `activo`.
- `public.alumno_invitaciones`: solo para usuarios alumno/invitaciones pendientes.

SQL recomendado:

```sql
select id, auth_id, email, nombre, apellidos, telefono, rol, activo, created_at
from public.usuarios
order by created_at asc;

select u.id, u.auth_id, u.email, u.nombre, u.apellidos, u.rol, u.activo, p.id as profesor_id, p.estado_verificacion
from public.usuarios u
join public.profesores p on p.usuario_id = u.id;

select u.id, u.auth_id, u.email, u.nombre, u.apellidos, u.rol, u.activo, f.id as familia_id
from public.usuarios u
join public.familias f on f.usuario_id = u.id;

select u.id, u.auth_id, u.email, u.nombre, u.apellidos, u.rol, u.activo, a.id as alumno_id
from public.usuarios u
join public.alumnos a on a.usuario_id = u.id
where u.rol = 'alumno';
```

### Paso 2. Exportar Firebase Auth y Firestore actual

Ya validado:

```powershell
npm.cmd run audit:auth
```

Adicionalmente, exportar `users/{uid}` por REST/Admin SDK para comparar por UID y email.

### Paso 3. Crear mapa de identidad

Campos minimos:

| Campo | Fuente |
| --- | --- |
| `supabase_user_id` | `public.usuarios.id` |
| `supabase_auth_id` | `public.usuarios.auth_id` |
| `email` | Supabase/Firebase |
| `firebase_uid` | Firebase Auth |
| `role` | `public.usuarios.rol` |
| `active` | `public.usuarios.activo` |
| `profile_status` | Firestore `users/{uid}` |

Regla de match:

1. Match por email normalizado.
2. Si ya existe `firebase_uid`, comprobar que `users/{uid}.email` coincide.
3. No intentar conservar Supabase `auth_id` como UID Firebase; guardarlo como `legacy.supabaseAuthId`.

### Paso 4. Crear usuarios faltantes en Firebase Auth

No ejecutado.

Para cada usuario Supabase activo sin Firebase Auth:

- Crear Firebase Auth user con email.
- Marcar `emailVerified` segun `email_confirmed_at`, si se dispone.
- No migrar password directamente salvo que exista hash compatible y se decida importar con `auth:import`.
- Si no se importan hashes, generar flujo de reset password obligatorio.

### Paso 5. Crear/actualizar `users/{uid}`

No ejecutado.

Payload recomendado:

```json
{
  "email": "usuario@example.com",
  "nombre": "Nombre",
  "apellidos": "Apellidos",
  "telefono": null,
  "role": "profesor|familia|alumno|admin",
  "active": true,
  "legacy": {
    "supabaseUserId": "...",
    "supabaseAuthId": "..."
  },
  "createdAt": "serverTimestamp",
  "updatedAt": "serverTimestamp"
}
```

### Paso 6. Verificar cobertura

Antes del corte, exigir:

| Check | Umbral |
| --- | --- |
| Usuarios activos Supabase con Firebase Auth | 100% |
| Usuarios activos Supabase con `users/{uid}` | 100% |
| Roles Supabase vs Firestore | 100% coincidentes |
| Emails duplicados o ambiguos | 0 |
| Firebase Auth sin Firestore profile | 0 |
| Firestore profile sin Firebase Auth | 0 |

### Paso 7. Prueba de acceso controlada

Antes de cambiar `auth-provider.js` o `js/auth.js`:

- Probar login admin.
- Probar login de un profesor real.
- Probar login de una familia real.
- Probar usuario desactivado.
- Probar reset password.
- Probar que alumno con invitacion no queda habilitado si no se migra ese flujo.

## 7. Recomendacion para Fase 2 Auth

No recomiendo cortar Auth a Firebase todavia si existen usuarios de produccion en Supabase distintos del admin.

Si la produccion actual solo necesita el admin `contacto.clasesde10@gmail.com`, entonces Firebase esta preparado para ese unico usuario verificado.

Si hay profesores, familias o alumnos con acceso en Supabase, primero hay que recuperar inventario Supabase real y sincronizar esas identidades. El corte sin ese paso podria bloquear accesos.

## 8. Estado final

| Elemento | Estado |
| --- | --- |
| Firebase Auth inventariado | Completo |
| Firestore `users/{uid}` inventariado | Completo |
| Supabase usuarios inventariado | Bloqueado por DNS/config |
| Usuarios Firebase sin perfil | 0 |
| Perfiles Firestore sin Auth | 0 |
| Roles inconsistentes Firebase/Firestore | 0 |
| Porcentaje Firebase interno | 100% |
| Porcentaje global Supabase -> Firebase | No verificable |
| Usuarios migrados verificados | 1 admin |
