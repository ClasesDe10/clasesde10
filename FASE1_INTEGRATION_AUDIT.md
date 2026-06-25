# Auditoria de integracion de Fase 1

Fecha: 2026-06-25  
Alcance: verificacion de integracion de la capa `js/adapters/` creada en Fase 1.  
Restricciones respetadas: no se realizan migraciones, no se modifica `auth-provider.js`, no se cambian dashboards.

## 1. Resumen ejecutivo

La Fase 1 creo correctamente una capa de adaptadores Firebase, pero esa capa esta todavia aislada de produccion. Esto es coherente con el objetivo original de preparacion, no de corte.

Conclusiones principales:

- Los 12 adaptadores creados estan sin uso en runtime de produccion.
- Los dashboards y flujos de auth siguen llamando directamente a Supabase.
- El 100% de los accesos runtime detectados a `db.from()`, `db.auth()`, `db.storage()` y `db.channel()` siguen sin pasar por la nueva capa de adaptadores.
- Existen duplicidades intencionadas entre la logica Supabase actual y los adaptadores Firebase nuevos.
- Los tests actuales validan estructura, existencia de contratos y aislamiento, pero no validan funcionalidad real contra Firebase.
- Hay dos dominios runtime relevantes sin adaptador dedicado en Fase 1: `disponibilidad` e `incidencias`.

Recomendacion: estamos preparados para iniciar la Fase 2 solo si la Fase 2 se limita a autenticacion y se aborda como migracion controlada de `auth`, no como migracion de dashboards ni datos operativos. Antes del corte real de auth deben anadirse pruebas funcionales de Firebase Auth y una estrategia de compatibilidad para perfiles/roles.

## 2. Comprobaciones realizadas

Comandos ejecutados:

```powershell
rg -n "js/adapters|firebaseAdapters|adapters/|\.\/adapters|\.\.\/adapters" . -S
rg -n "db\.(from|auth|storage|channel)\b|\.rpc\(" pages js scripts -S
rg -o "db\.(from|auth|storage|channel)\b" pages js -S
rg -n "TODO|FIXME|placeholder|mock|stub|pendiente|Future|futura|not wired|not connected|intentionally unused|requires|requiere" js\adapters scripts\phase1-adapters-test.mjs FIREBASE_ADAPTERS_ARCHITECTURE.md FASE1_REPORT.md -S
Get-Content scripts\phase1-adapters-test.mjs
```

## 3. Adaptadores creados actualmente sin uso

Resultado: todos los adaptadores de Fase 1 estan sin uso por paginas/dashboards runtime.

La busqueda de imports de `js/adapters/` solo encontro referencias en:

- Documentacion: `FASE1_REPORT.md`, `FIREBASE_ADAPTERS_ARCHITECTURE.md`.
- Test: `scripts/phase1-adapters-test.mjs`.
- La propia capa: `js/adapters/index.js`.

No hay imports desde:

- `pages/login.html`
- `pages/registro.html`
- `pages/reset-password.html`
- `pages/dashboard/admin.html`
- `pages/dashboard/profesor.html`
- `pages/dashboard/familia.html`
- `pages/dashboard/alumno.html`
- `js/auth.js`
- `js/auth-provider.js`
- `js/document-storage-provider.js`
- `js/notifications-provider.js`

| Adaptador | Uso runtime actual | Observacion |
| --- | --- | --- |
| `firebase-auth-adapter.js` | Sin uso | Envuelve `firebase-auth.js`, pero produccion sigue exportando `auth.js` via `auth-provider.js`. |
| `users-adapter.js` | Sin uso | Preparado para `users/{uid}`. |
| `profesores-adapter.js` | Sin uso | Preparado para perfiles profesor. |
| `familias-adapter.js` | Sin uso | Preparado para perfiles familia. |
| `alumnos-adapter.js` | Sin uso | Preparado para alumnos por familia/alumno. |
| `asignaciones-adapter.js` | Sin uso | Preparado para relaciones profesor-alumno. |
| `solicitudes-adapter.js` | Sin uso | Preparado para solicitudes. |
| `clases-adapter.js` | Sin uso | Preparado para clases por participante. |
| `pagos-adapter.js` | Sin uso | Preparado para pagos. |
| `documentos-adapter.js` | Sin uso | Preparado para Firestore + Storage futuro. |
| `notificaciones-adapter.js` | Sin uso | Preparado para `onSnapshot`. |
| `configuracion-adapter.js` | Sin uso | Preparado para configuracion privada/publica. |
| `firebase-firestore-adapter.js` | Sin uso directo runtime | Utilidad base usada por adaptadores, no por paginas. |
| `index.js` | Sin uso runtime | Registro central futuro. |

## 4. Modulos runtime que siguen llamando directamente a Supabase

Total de accesos directos detectados en `pages/` y `js/`: 97.

Desglose por API:

| API Supabase | Conteo |
| --- | ---: |
| `db.from` | 84 |
| `db.auth` | 10 |
| `db.storage` | 2 |
| `db.channel` | 1 |

Desglose por archivo:

| Archivo | Conteo directo | Tipo principal |
| --- | ---: | --- |
| `pages/dashboard/admin.html` | 34 | `db.from` sobre vistas/tablas admin. |
| `pages/dashboard/familia.html` | 23 | `db.from` sobre familias, alumnos, clases, pagos, documentos, solicitudes. |
| `pages/dashboard/profesor.html` | 17 | `db.from` sobre profesores, clases, asignaciones, documentos, disponibilidad. |
| `pages/dashboard/alumno.html` | 10 | `db.from` sobre alumnos, clases, asignaciones y vistas. |
| `js/auth.js` | 7 | `db.auth`. |
| `pages/reset-password.html` | 2 | `db.auth`. |
| `js/document-storage-provider.js` | 2 | `db.storage`. |
| `js/notifications-provider.js` | 1 | `db.channel`. |
| `pages/login.html` | 1 | `db.auth`. |

Ademas existen archivos de soporte Supabase:

- `js/supabase-client.js`
- `js/supabase-config.js`
- `js/supabase-client.example.js`

## 5. Porcentaje de codigo que sigue accediendo a Supabase sin abstraccion

Medicion usada: llamadas runtime a `db.from()`, `db.auth`, `db.storage` y `db.channel` en `pages/` y `js/`.

| Metrica | Resultado |
| --- | ---: |
| Accesos directos Supabase detectados | 97 |
| Accesos a Supabase a traves de `js/adapters/` | 0 |
| Porcentaje de accesos Supabase no abstraidos | 100% |

Interpretacion:

- La capa de adaptadores existe, pero no ha absorbido ningun flujo runtime.
- La Fase 1 esta integrada a nivel de codigo disponible y test estructural, no a nivel de consumo real por la aplicacion.
- Esto no contradice el objetivo de Fase 1, porque se pidio mantener Supabase activo y no cambiar dashboards.

## 6. Dashboards o paginas que deberan modificarse para consumir adaptadores

Orden recomendado por menor riesgo:

| Pagina/modulo | Adaptadores necesarios | Riesgo |
| --- | --- | --- |
| `pages/login.html` | `auth` | Medio. Debe coordinarse con `auth-provider.js` y `js/auth.js`. |
| `pages/reset-password.html` | `auth` | Medio. Cambia flujo PKCE Supabase por Firebase reset/update password. |
| `pages/registro.html` | `auth`, `users`, `profesores`, `familias`, `alumnos` | Medio-alto. Registro de alumno depende de invitaciones. |
| `js/auth.js` o sustituto futuro | `auth`, `users` | Alto. Es el punto central de sesion/roles. |
| `js/document-storage-provider.js` | `documentos` | Alto si Storage no esta operativo. |
| `js/notifications-provider.js` | `notificaciones` | Medio. Cambia Realtime Supabase por Firestore listeners. |
| `pages/dashboard/alumno.html` | `alumnos`, `clases`, `asignaciones` | Medio-alto. Usa vistas SQL. |
| `pages/dashboard/profesor.html` | `profesores`, `clases`, `asignaciones`, `documentos`, `disponibilidad` | Alto. Falta adaptador dedicado de `disponibilidad`. |
| `pages/dashboard/familia.html` | `familias`, `alumnos`, `clases`, `asignaciones`, `solicitudes`, `pagos`, `documentos` | Alto. Mezcla lecturas, escrituras y documentos. |
| `pages/dashboard/admin.html` | Todos los adaptadores + agregados admin | Muy alto. Usa vistas SQL y multiples tablas. |

Brecha detectada:

- `disponibilidad` se usa en el dashboard profesor, pero no tiene adaptador dedicado.
- `incidencias` se usa en el dashboard admin, pero no tiene adaptador dedicado.
- Si se quiere que los dashboards no dependan de backend concreto, ambos dominios deben entrar en la capa antes de migrar esos dashboards.

## 7. Duplicidades entre logica antigua y nueva arquitectura

| Area | Logica antigua | Logica nueva | Tipo de duplicidad |
| --- | --- | --- | --- |
| Auth | `js/auth.js` con Supabase Auth | `js/firebase-auth.js` + `firebase-auth-adapter.js` | Intencionada para transicion. |
| Perfil usuario | `usuarios` en Supabase desde `js/auth.js` y dashboards | `users-adapter.js` sobre `users/{uid}` | Requiere mapa de campos `rol/role`, `activo/active`. |
| Profesores/familias/alumnos | Consultas directas `db.from(...)` | Adaptadores Firestore por dominio | Doble modelo hasta migrar dashboards. |
| Clases/pagos/solicitudes | SQL directo y vistas Supabase | Adaptadores CRUD Firestore | Falta logica de negocio avanzada en adaptadores. |
| Documentos | `document-storage-provider.js` con Supabase Storage | `documentos-adapter.js` con Firebase Storage | Nueva implementacion no debe activarse hasta Storage. |
| Notificaciones | `notifications-provider.js` con Supabase Realtime | `notificaciones-adapter.js` con `onSnapshot` | Doble realtime hasta corte. |
| Configuracion | Tabla `configuracion` Supabase | `configuracion-adapter.js` | Preparado, sin consumo real. |

La duplicidad es esperada en una migracion incremental. El riesgo aparece si se activan escrituras en ambos lados sin sincronizacion.

## 8. Placeholders, TODOs, mocks o implementaciones incompletas

No se detectaron `TODO`, `FIXME`, `mock` ni `stub` dentro de `js/adapters/`.

Si hay implementaciones incompletas desde el punto de vista funcional:

| Adaptador | Estado | Motivo |
| --- | --- | --- |
| `firebase-auth-adapter.js` | Parcial | Envuelve `firebase-auth.js`, pero no esta conectado a produccion ni probado funcionalmente en esta capa. |
| `documentos-adapter.js` | Parcial/bloqueado | Depende de Firebase Storage operativo. No debe usarse aun en produccion. |
| `notificaciones-adapter.js` | Parcial | Implementa listener Firestore, pero no esta validado con datos reales ni indices. |
| `clases-adapter.js` | Parcial | No implementa validacion de solapes ni calculo definitivo de comisiones/importes. |
| `pagos-adapter.js` | Parcial | Usa `new Date().toISOString()` en `validatedAt`; para produccion convendria `serverTimestamp()` y validacion admin. |
| `solicitudes-adapter.js` | Parcial | `assignTeacher` no valida existencia del profesor ni consistencia del estado. |
| `users/profesores/familias/alumnos/asignaciones` | Inicial | CRUD y consultas basicas, sin reglas de negocio completas. |
| `configuracion-adapter.js` | Inicial | Lectura/escritura simple; no valida schema de claves. |

Comentarios como "not connected" o "intentionally unused" existen en los archivos, pero describen el aislamiento previsto de Fase 1. No son mocks.

## 9. Calidad de tests actuales

Test existente:

```powershell
npm run test:adapters
```

Resultado esperado actual:

```text
Phase 1 adapter validation passed (12 domains).
```

Que valida realmente:

- Existen archivos de adaptador para los 12 dominios declarados.
- Cada adaptador expone los metodos esperados por contrato.
- `js/adapters/index.js` registra todos los dominios.
- Los entrypoints de produccion no importan `js/adapters/`.

Que no valida:

- Conexion real con Firebase Auth.
- Lecturas reales Firestore.
- Escrituras reales Firestore.
- Firebase Storage.
- Listeners realtime con `onSnapshot`.
- Reglas de seguridad.
- Indices Firestore.
- Compatibilidad de datos Supabase -> Firestore.
- Comportamiento de dashboards.

Conclusion: los tests actuales son estructurales, no funcionales. Son adecuados para Fase 1, pero insuficientes para Fase 2 si se va a cortar auth.

## 10. Preparacion para Fase 2: migracion de autenticacion

Estamos parcialmente preparados para iniciar Fase 2.

Puntos a favor:

- Firebase Auth ya tiene capa de transicion en `js/firebase-auth.js`.
- Existe `firebase-auth-adapter.js`.
- `auth-provider.js` centraliza el punto de corte futuro.
- El usuario admin Firebase existe segun el estado previo del proyecto.
- La prueba garantiza que Fase 1 no se conecto accidentalmente a produccion.

Bloqueos o precauciones antes del corte de auth:

- `auth-provider.js` sigue exportando Supabase y no debe tocarse hasta iniciar Fase 2 formalmente.
- `pages/login.html` y `pages/reset-password.html` aun llaman `db.auth` directamente, por fuera de `auth-provider.js`.
- `pages/registro.html` mantiene dependencia del flujo Supabase/CDN.
- `js/auth.js` mezcla sesion, roles y perfil `usuarios`; hay que mapearlo a `users/{uid}`.
- El flujo de alumno con invitacion no esta resuelto completamente en Firebase.
- Los tests no validan login/logout/reset reales.

Recomendacion clara:

Si. Se puede iniciar Fase 2, pero solo con alcance acotado a autenticacion:

1. Crear pruebas funcionales de auth Firebase antes del corte.
2. Migrar primero `js/auth.js` o crear un reemplazo completo compatible con su API.
3. Eliminar llamadas directas `db.auth` de `pages/login.html` y `pages/reset-password.html`.
4. Mantener dashboards sin migrar datos.
5. No tocar documentos, notificaciones ni dashboards en la misma fase.
6. Posponer registro de alumno con invitaciones si no se completa el modelo `studentInvites`.

No estamos preparados para iniciar una Fase 2 amplia que incluya dashboards o datos operativos. Para eso faltan adaptadores de `disponibilidad` e `incidencias`, indices/reglas adicionales, pruebas funcionales y migracion de datos.

## 11. Estado final de integracion

| Pregunta | Respuesta |
| --- | --- |
| Adaptadores creados sin uso | Todos los de Fase 1. |
| Runtime con Supabase directo | Login, reset, auth core, storage provider, notifications provider y los 4 dashboards. |
| Porcentaje de accesos Supabase no abstraidos | 100% de 97 llamadas detectadas. |
| Dashboards a modificar despues | Admin, profesor, familia, alumno. |
| Duplicidades | Si, intencionadas para transicion. |
| Placeholders/mocks/TODOs | No como marcadores explicitos; si hay implementaciones parciales. |
| Tests actuales | Estructurales, no funcionales. |
| Preparados para Fase 2 auth | Si, con alcance estricto y pruebas funcionales previas. |
