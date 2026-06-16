# FIREBASE_CONSOLE_GUIDE - ClasesDe10

Actualizado: 2026-06-16

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

   Accion: crear usuario con email real. Despues copiar el `UID` y darselo a
   Codex para crear `users/{uid}` con `role = admin`.

3. Inicializar Storage:
   `https://console.firebase.google.com/u/0/project/clasesde10-50add/storage`

   Accion: pulsar `Comenzar`. Si Firebase exige plan Blaze o facturacion, parar
   y confirmar antes de continuar.

## URLs utiles para revisar datos

- Leads publicos nuevos:
  `https://console.firebase.google.com/u/0/project/clasesde10-50add/firestore/databases/-default-/data/~2FleadsPublicos`
- Profesores importados:
  `https://console.firebase.google.com/u/0/project/clasesde10-50add/firestore/databases/-default-/data/~2Fprofesores`
- Auditorias de importacion:
  `https://console.firebase.google.com/u/0/project/clasesde10-50add/firestore/databases/-default-/data/~2FimportAudits`
- Reglas Firestore:
  `https://console.firebase.google.com/u/0/project/clasesde10-50add/firestore/databases/-default-/rules`
- Indices Firestore:
  `https://console.firebase.google.com/u/0/project/clasesde10-50add/firestore/databases/-default-/indexes`

## No hacer sin confirmacion

- No activar Blaze/facturacion sin decision expresa.
- No borrar Supabase todavia.
- No borrar colecciones Firestore importadas.
- No pegar claves privadas, JSON de service account ni codigos de login en chat.
