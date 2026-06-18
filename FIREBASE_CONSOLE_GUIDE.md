# FIREBASE_CONSOLE_GUIDE - ClasesDe10

Actualizado: 2026-06-18

## Proyecto

- Proyecto Firebase: `clasesde10-50add`
- Consola principal: `https://console.firebase.google.com/u/0/project/clasesde10-50add/overview`

## Pasos que debe hacer Miguel

1. Activar Authentication Email/Password:
   `https://console.firebase.google.com/u/0/project/clasesde10-50add/authentication/providers`

   Accion: entrar en `Email/Password`, activar el primer interruptor y guardar.
   No hace falta activar passwordless/email link.

2. Crear el primer usuario admin:
   `https://console.firebase.google.com/u/0/project/clasesde10-50add/authentication/users`

   Accion: crear usuario con email real. Despues copiar el `UID`.

   Con el UID, crear el perfil admin desde terminal:

   `node firebase/bootstrap-admin-user.mjs <UID> <EMAIL> "Miguel"`

3. Inicializar Storage:
   `https://console.firebase.google.com/u/0/project/clasesde10-50add/storage`

   Accion: pulsar `Comenzar`. Si Firebase exige plan Blaze o facturacion, parar
   y confirmar antes de continuar.

## URLs utiles para revisar datos

- Web publicada en Firebase Hosting:
  `https://clasesde10-50add.web.app`
- Panel de Hosting:
  `https://console.firebase.google.com/u/0/project/clasesde10-50add/hosting/sites`
- Dominios Firebase Hosting:
  `https://console.firebase.google.com/u/0/project/clasesde10-50add/hosting/sites/clasesde10-50add/domains`
- Leads publicos nuevos:
  `https://console.firebase.google.com/u/0/project/clasesde10-50add/firestore/databases/-default-/data/~2FleadsPublicos`
- Profesores importados:
  `https://console.firebase.google.com/u/0/project/clasesde10-50add/firestore/databases/-default-/data/~2Fprofesores`
- Auditorias de importacion:
  `https://console.firebase.google.com/u/0/project/clasesde10-50add/firestore/databases/-default-/data/~2FimportAudits`
- Auditoria completa Sheets:
  `https://console.firebase.google.com/u/0/project/clasesde10-50add/firestore/databases/-default-/data/~2FimportAudits~2Fsheets_full_audit_2026_06_16`
- Manifiesto legacy Sheets:
  `https://console.firebase.google.com/u/0/project/clasesde10-50add/firestore/databases/-default-/data/~2FlegacyImports~2Fsheets_export_2026_06_16`
- Reglas Firestore:
  `https://console.firebase.google.com/u/0/project/clasesde10-50add/firestore/databases/-default-/rules`
- Indices Firestore:
  `https://console.firebase.google.com/u/0/project/clasesde10-50add/firestore/databases/-default-/indexes`

## No hacer sin confirmacion

- No activar Blaze/facturacion sin decision expresa.
- No borrar Supabase todavia.
- No borrar colecciones Firestore importadas.
- No pegar claves privadas, JSON de service account ni codigos de login en chat.

## Bloqueo externo actual

- Netlify/GitHub no publica los commits nuevos porque la cuenta devuelve:
  `Skipped due to account credit usage exceeded`.
- Para que `https://clasesde10.com` vuelva a actualizarse en Netlify hay que
  resolver el bloqueo de creditos en:
  `https://app.netlify.com/projects/clasesde10`
- Alternativa recomendada si se quiere centralizar en Firebase: conectar el
  dominio personalizado en Firebase Hosting y cambiar DNS cuando este validado.

## Corte gratis a Firebase Hosting

- `clasesde10.com` y `www.clasesde10.com` ya estan creados en Firebase Hosting.
- Falta cambiar DNS en el proveedor actual (`ns10/11/12.servicio-online.net`).
- Registros exactos documentados en `FIREBASE_DOMAIN_CUTOVER.md`.
- No se ha activado Blaze ni facturacion.
