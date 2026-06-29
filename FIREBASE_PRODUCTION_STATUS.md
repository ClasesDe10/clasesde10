# Estado de produccion Firebase

Fecha: 2026-06-29

## Resultado

Firebase Hosting produccion esta desplegado y validado en:

```text
https://clasesde10-50add.web.app
```

Tambien sigue disponible el canal preview:

```text
https://clasesde10-50add--fase2-auth-ws7x8zcz.web.app
```

## Cambios ya activos en Firebase Hosting

- Login/registro/reset usan Firebase Auth.
- `js/auth.js` delega en `firebase-auth-adapter.js`.
- El admin de Firebase puede iniciar sesion con password.
- Los formularios publicos escriben en Firestore `leadsPublicos`.
- La seccion Leads del panel admin lee/actualiza Firestore.
- Si Supabase legacy falla en metricas admin, el panel muestra aviso y mantiene accesibles los modulos migrados.

## Validaciones ejecutadas

```powershell
npm.cmd run test:auth:functional
npm.cmd run audit:auth
npm.cmd run test:adapters
npx.cmd --yes firebase-tools deploy --only hosting --project clasesde10-50add --non-interactive
```

Validacion HTTP produccion:

| Ruta | Estado | Observacion |
| --- | ---: | --- |
| `/` | 200 | Home disponible. |
| `/pages/login.html` | 200 | Sin Supabase Auth. |
| `/pages/registro.html` | 200 | Sin Supabase Auth. |
| `/pages/reset-password.html` | 200 | Usa Firebase Auth reset. |
| `/pages/dashboard/admin.html` | 200 | Conserva Supabase para legacy, pero Leads ya no usa `leads_publicos`. |
| `/js/auth.js` | 200 | Usa Firebase Auth adapter. |
| `/js/adapters/leads-adapter.js` | 200 | Disponible. |

## Estado de usuarios

Firebase Auth:

- Usuarios: 1.
- Admin: `contacto.clasesde10@gmail.com`.
- UID: `dZPatwwkRZNrth5cF1fhoHgBEo12`.
- Provider: password.
- Disabled: false.
- Login real: OK.

## Estado actual de hosting

- DNS personalizado `clasesde10.com` apunta a Firebase Hosting.
- Netlify queda fuera de produccion: sitio legacy desactivado y repo GitHub desvinculado el 2026-06-29.

## Lo que NO esta hecho todavia

- Dashboards de datos siguen en Supabase legacy excepto Leads.
- Documentos siguen en Supabase Storage.
- Notificaciones siguen en Supabase Realtime.
- Profesores, familias, alumnos, clases, pagos, solicitudes e incidencias siguen legacy.

## Siguiente bloqueo externo

Firebase Hosting es la unica produccion visible en `clasesde10.com`.

Netlify no debe usarse para nuevos despliegues. El sitio legacy `clasesde10` en Netlify quedo desactivado tras confirmar que `clasesde10.com` y `www.clasesde10.com` resuelven contra Firebase Hosting.
