# Rollback Fase 2 Auth

Fecha: 2026-06-25

## Objetivo

Volver de Firebase Auth a Supabase Auth si el corte limitado de autenticacion falla.

## Commit de rollback

La Fase 2 Auth debe quedar en un commit unico. Para revertirla:

```powershell
git revert <commit-fase2-auth>
```

Si el commit todavia no se ha subido:

```powershell
git reset --hard HEAD~1
```

Usar `git reset --hard` solo si no hay trabajo posterior que conservar.

## Archivos que revierte

- `js/auth.js`
- `js/firebase-auth.js`
- `js/adapters/firebase-auth-adapter.js`
- `js/adapters/contracts.js`
- `pages/login.html`
- `pages/registro.html`
- `pages/reset-password.html`
- `scripts/phase1-adapters-test.mjs`
- `scripts/firebase-auth-functional-test.mjs`
- `package.json`
- `FASE2_AUTH_REPORT.md`
- `FASE2_AUTH_ROLLBACK.md`

## Que NO cambia esta fase

- `js/auth-provider.js`
- Dashboards
- Supabase client/config
- Tablas Supabase
- Firebase Storage
- Documentos
- Notificaciones
- Clases, pagos, alumnos, profesores o familias operativos

## Validacion despues de rollback

Ejecutar:

```powershell
rg -n "db\.auth|supabase-client|@supabase/supabase-js" js\auth.js pages\login.html pages\registro.html pages\reset-password.html -S
npm.cmd run test:adapters
```

Tras rollback, se espera que `js/auth.js`, `login.html` y `reset-password.html` vuelvan a mostrar dependencias Supabase Auth.

## Riesgos del rollback

- Usuarios creados en Firebase Auth durante la ventana de prueba quedaran en Firebase si no se eliminan.
- Usuarios que hayan cambiado contrasena en Firebase no habran cambiado contrasena en Supabase.
- No se elimina ningun dato Supabase al hacer rollback.
