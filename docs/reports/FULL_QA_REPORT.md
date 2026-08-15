# Full QA Report - ClasesDe10

Fecha: 2026-06-25 20:07 Europe/Madrid

## Alcance probado

- Produccion Firebase Hosting: `https://clasesde10-50add.web.app`.
- Dominio principal: `https://clasesde10.com`.
- Dominio `www`: `https://www.clasesde10.com`.
- Login y registro con Firebase Auth.
- Formularios publicos y escritura en Firestore.
- Panel administrador y secciones operativas/legacy.
- Configuracion Firebase Hosting, PWA y service worker.
- Estado DNS autoritativo en Hostalia.
- Acceso a Supabase por navegador.

## Comprobaciones automatizadas

Comandos ejecutados:

- `npm run audit:hosting`: OK.
- `npm run test:auth:functional`: OK. Crea, autentica y limpia usuario temporal de Firebase Auth.
- `npm run test:adapters`: OK. Valida 13 dominios de adaptadores.
- `npm run audit:supabase`: OK como auditoria; confirma llamadas runtime activas a Supabase.
- `npm run audit:auth`: OK. Firebase Auth disponible, admin existe, proveedor Email/Password.
- `firebase deploy --only hosting --project clasesde10-50add`: OK.

## Resultado funcional

### Web publica

OK:

- `/`
- `/pages/login.html`
- `/pages/registro.html`
- `/pages/reset-password.html`
- `/contacto.html`
- `/para-padres.html`
- `/para-profesores.html`

Los formularios publicos escriben correctamente en Firestore `leadsPublicos`.

Leads verificados durante QA:

- Contacto: `qa-contacto-codex@example.com`.
- Familia: `qa-familia-codex@example.com`.
- Profesor: `qa-profesor-codex3@example.com`.

### Firebase Auth

OK:

- Registro de familia desde UI.
- Registro de profesor desde UI.
- Creacion de `users/{uid}` en Firestore.
- Login admin con `contacto.clasesde10@gmail.com`.
- Redireccion del admin a `/pages/dashboard/admin`.
- Envio de enlaces de Auth con dominios autorizados.

Se limpiaron los usuarios temporales creados durante QA en Firebase Auth y Firestore.

### Panel administrador

OK:

- Login admin carga el panel.
- Dashboard carga con fallback Firebase cuando Supabase no responde.
- Leads carga datos reales desde Firestore.
- Secciones legacy ya no quedan bloqueadas indefinidamente en `Cargando...`.

Secciones comprobadas en Chrome real:

- Dashboard.
- Profesores.
- Familias.
- Alumnos.
- Solicitudes.
- Clases.
- Pagos.
- Leads.
- Documentos.
- Incidencias.

## Fallos reales detectados

### 1. Supabase legacy no esta disponible

Error exacto en navegador:

```text
net::ERR_NAME_NOT_RESOLVED
https://hxxajibgmtvcbeqguaqr.supabase.co
```

Impacto:

- Profesores legacy.
- Familias legacy.
- Alumnos legacy.
- Solicitudes legacy.
- Clases legacy.
- Pagos legacy.
- Documentos legacy.
- Incidencias legacy.
- Metricas antiguas del dashboard.

Estado tras la correccion aplicada:

- La interfaz ya no se queda colgada en `Cargando...`.
- Leads Firebase sigue funcionando.
- Los modulos legacy muestran estado vacio/error segun la respuesta de Supabase.

### 2. Supabase dashboard no permite verificar proyecto

Intento realizado:

- Login en `https://supabase.com/dashboard/sign-in` con credenciales disponibles.
- Resultado: la pantalla queda en `Signing in...` sin avanzar ni mostrar error recuperable.

Conclusion:

- No se ha podido comprobar desde Supabase Console si el proyecto esta pausado, eliminado o inaccesible.
- El fallo operativo desde produccion queda demostrado por DNS: el host Supabase configurado no resuelve.

### 3. `www.clasesde10.com` aun devuelve 404

Resultado:

- `https://clasesde10.com`: OK 200.
- `https://clasesde10-50add.web.app`: OK 200.
- `https://www.clasesde10.com`: 404.

DNS autoritativo en Hostalia:

- `clasesde10.com A 199.36.158.100`: OK.
- `clasesde10.com TXT hosting-site=clasesde10-50add`: OK.
- `www.clasesde10.com CNAME clasesde10-50add.web.app`: OK.
- `_acme-challenge.www.clasesde10.com TXT LtpaKSyfq73psiVycwKtmzgclH__jL0Ytdj52bR2mIU`: OK.

Estado Firebase Hosting API:

- `clasesde10.com`: `HOST_MISMATCH`, `OWNERSHIP_PENDING`, certificado temporal activo.
- `www.clasesde10.com`: `HOST_MISMATCH`, `OWNERSHIP_PENDING`, `CERT_PROPAGATING`, redirect a `clasesde10.com`.

Conclusion:

- DNS autoritativo ya esta correcto.
- Firebase Hosting todavia no ha activado completamente el custom domain `www`.
- El dominio raiz ya sirve la web.

## Cambio aplicado durante QA

Archivo modificado:

- `pages/dashboard/admin.html`

Cambio:

- Se agrego un manejador comun para errores de carga en modulos legacy.
- Si una seccion dependiente de Supabase falla, se reemplaza el estado colgado por un mensaje visible.
- No se migro ningun dato.
- No se modifico Auth.
- No se elimino Supabase.

## Estado actual de produccion

Funciona:

- Web publica en `https://clasesde10.com`.
- Web publica en `https://clasesde10-50add.web.app`.
- Login admin Firebase.
- Registro familia/profesor Firebase.
- Leads publicos en Firestore.
- Vista admin de Leads.

No funciona completamente:

- `https://www.clasesde10.com` hasta que Firebase active el custom domain.
- Modulos legacy que dependen de Supabase, porque el host Supabase configurado no resuelve DNS.

## Prioridad recomendada

1. Esperar/revalidar Firebase Hosting custom domains hasta que `www.clasesde10.com` deje de devolver 404.
2. Decidir si se recupera Supabase legacy o se acelera migracion Firebase de los modulos operativos.
3. Migrar primero `solicitudes` y `asignaciones/emparejamientos`, porque son el centro operativo del negocio.
4. Despues migrar profesores, familias, alumnos, clases, pagos y documentos.

