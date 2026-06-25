# Fase 2 Auth - Informe de ejecucion

Fecha: 2026-06-25  
Alcance: migracion limitada exclusivamente a autenticacion.

## Resultado

Se sustituyeron las operaciones de autenticacion Supabase por Firebase Auth usando la arquitectura de adaptadores.

Supabase no se elimino y sigue activo para dashboards, Storage, notificaciones y datos operativos legacy.

## Cambios realizados

| Archivo | Cambio |
| --- | --- |
| `js/auth.js` | Mantiene la API publica existente, pero delega en `firebase-auth-adapter.js`. |
| `js/firebase-auth.js` | Refuerza sesion actual, perfil `users/{uid}`, login, logout, registro basico, reset y confirmacion de password reset. |
| `js/adapters/firebase-auth-adapter.js` | Expone metodos Firebase Auth para login, registro, reset y confirmacion de reset. |
| `js/adapters/contracts.js` | Actualiza contrato `auth` con metodos de reset por `oobCode`. |
| `pages/login.html` | Elimina Supabase Auth directo y usa `auth-provider.js`, que ahora delega en Firebase. |
| `pages/registro.html` | Elimina CDN Supabase no necesario para registro Auth. |
| `pages/reset-password.html` | Sustituye PKCE Supabase por validacion/confirmacion Firebase con `oobCode`. |
| `scripts/firebase-auth-functional-test.mjs` | Prueba real contra Firebase Auth con usuario temporal. |
| `scripts/phase1-adapters-test.mjs` | Ajusta aislamiento: dashboards y proveedores no-auth siguen sin importar adaptadores. |
| `package.json` | Agrega `test:auth:functional`. |
| `FASE2_AUTH_ROLLBACK.md` | Plan de rollback. |

## Operaciones migradas

| Operacion | Estado |
| --- | --- |
| Login | Firebase Auth |
| Logout | Firebase Auth |
| Registro familia/profesor | Firebase Auth + `users/{uid}` |
| Registro alumno | Bloqueado temporalmente; no se migro alumnos/invitaciones |
| Sesion actual | Firebase Auth |
| Perfil/rol | Firestore `users/{uid}` |
| Recuperacion de contrasena | Firebase Auth |
| Cambio de contrasena por enlace | Firebase Auth `oobCode` |

## Compatibilidad temporal

`getUsuarioActual()` devuelve un objeto compatible con la forma anterior:

- `rol` y `role`
- `activo` y `active`
- `auth_id`
- `id`
- `uid`

Si en el futuro `users/{uid}` incluye `legacy.supabaseUserId` o `legacy.supabaseAuthId`, se usan para mantener compatibilidad con datos Supabase legacy.

## Lo que sigue usando Supabase

Sin cambios:

- `pages/dashboard/admin.html`
- `pages/dashboard/profesor.html`
- `pages/dashboard/familia.html`
- `pages/dashboard/alumno.html`
- `js/document-storage-provider.js`
- `js/notifications-provider.js`
- `js/supabase-client.js`
- `js/supabase-config.js`

## Pruebas ejecutadas

```powershell
npm.cmd run test:adapters
npm.cmd run test:auth:functional
npm.cmd run audit:auth
rg -n "db\.auth|supabase-client|@supabase/supabase-js" js\auth.js pages\login.html pages\registro.html pages\reset-password.html -S
git diff -- js\auth-provider.js
```

Resultados:

- `test:adapters`: OK.
- `test:auth:functional`: OK.
- Usuario temporal Firebase Auth creado, autenticado, consultado y eliminado.
- Admin Firebase encontrado: `contacto.clasesde10@gmail.com`.
- Admin no esta deshabilitado.
- `audit:auth` vuelve a mostrar 1 usuario despues del test, confirmando limpieza del temporal.
- `auth-provider.js` no tiene diff.
- No quedan llamadas `db.auth`, `supabase-client` ni CDN Supabase en `js/auth.js`, `login.html`, `registro.html` ni `reset-password.html`.

## Verificacion admin

Verificado:

- Existe en Firebase Auth.
- UID: `dZPatwwkRZNrth5cF1fhoHgBEo12`.
- Email: `contacto.clasesde10@gmail.com`.
- Provider: `password`.
- Disabled: `false`.
- Perfil `users/{uid}` ya existia segun auditoria previa.

No verificado:

- Login real con password del admin.

Motivo:

- La contrasena del admin no esta disponible en el entorno.
- Firebase no permite comprobar una contrasena sin intentar login con esa contrasena.

Para ejecutar esa comprobacion:

```powershell
$env:FIREBASE_ADMIN_TEST_PASSWORD='PASSWORD_REAL'
npm.cmd run test:auth:functional
Remove-Item Env:\FIREBASE_ADMIN_TEST_PASSWORD
```

## Riesgos conocidos

| Riesgo | Estado |
| --- | --- |
| Usuarios Supabase no migrados a Firebase no podran entrar | Sigue vigente. Solo hay 1 usuario Firebase verificado. |
| Registro de alumno con invitacion | Bloqueado intencionadamente, no migrado. |
| Dashboards profesor/familia/alumno con datos Supabase | No migrados; pueden requerir `legacy.supabaseUserId` para usuarios existentes. |
| Reset custom page | Requiere que el enlace de Firebase incluya `oobCode` hacia esta pagina. Si Firebase usa handler hospedado por defecto, habra que ajustar plantilla/action URL en Firebase Console. |
| Email admin no verificado | Sigue como `false` en Firebase Auth. |

## Conclusion

La Fase 2 Auth queda implementada como corte limitado de autenticacion:

- Firebase Auth es la capa usada por `js/auth.js`.
- `auth-provider.js` no se modifico.
- No se migraron dashboards ni datos operativos.
- Supabase sigue disponible para legacy.

El siguiente paso recomendado no es migrar datos grandes todavia. Es probar manualmente login admin con la contrasena real y, si funciona, desplegar una preview/produccion controlada.
