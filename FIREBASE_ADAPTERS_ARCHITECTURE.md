# Arquitectura de adaptadores Firebase

Fecha: 2026-06-25  
Estado: Fase 1 preparada, no conectada a produccion.

## Objetivo

Crear una frontera estable entre los dashboards y el backend. Cuando se migre cada modulo, las paginas deberian depender de adaptadores de dominio y no de clientes concretos como Supabase o Firebase.

Esta fase no cambia el proveedor activo. Supabase sigue conectado a las paginas actuales.

## Estructura creada

```text
js/adapters/
  contracts.js
  firebase-firestore-adapter.js
  firebase-auth-adapter.js
  users-adapter.js
  profesores-adapter.js
  familias-adapter.js
  alumnos-adapter.js
  asignaciones-adapter.js
  solicitudes-adapter.js
  clases-adapter.js
  pagos-adapter.js
  documentos-adapter.js
  notificaciones-adapter.js
  configuracion-adapter.js
  index.js
```

## Contratos

`js/adapters/contracts.js` define:

- Dominios soportados.
- Colecciones Firestore canonicas.
- Metodos base comunes.
- Metodos esperados por dominio.
- Helpers de respuesta `{ data, error }`, limpieza de payloads y normalizacion de IDs.

La forma de respuesta replica el patron actual de Supabase para reducir cambios futuros en UI.

## Adaptador Firestore generico

`js/adapters/firebase-firestore-adapter.js` centraliza operaciones CRUD:

- `getById(id)`
- `list(options)`
- `create(payload, options)`
- `update(id, payload)`
- `upsert(id, payload)`
- `remove(id)`

`list(options)` acepta:

- `filters`: lista de `{ field, operator, value }`.
- `orderBy`: lista de `{ field, direction }`.
- `limit`: numero maximo de documentos.

Los adaptadores de dominio no deberian importar directamente funciones Firestore salvo casos especiales como Storage o realtime.

## Responsabilidades por dominio

| Dominio | Adaptador | Responsabilidad |
| --- | --- | --- |
| `auth` | `firebase-auth-adapter.js` | Envolver la capa Firebase Auth de transicion con contrato estable. |
| `users` | `users-adapter.js` | Perfil base, rol, estado activo y consultas por rol. |
| `profesores` | `profesores-adapter.js` | Perfil profesor y revision/verificacion. |
| `familias` | `familias-adapter.js` | Perfil familia. |
| `alumnos` | `alumnos-adapter.js` | Estudiantes por familia o UID de alumno. |
| `asignaciones` | `asignaciones-adapter.js` | Relacion profesor-familia-alumno-materia. |
| `solicitudes` | `solicitudes-adapter.js` | Solicitudes de clase y asignacion de profesor. |
| `clases` | `clases-adapter.js` | Clases por profesor, familia o alumno y cambios de estado. |
| `pagos` | `pagos-adapter.js` | Pagos por familia/estado y validacion. |
| `documentos` | `documentos-adapter.js` | Metadatos Firestore y subida/URL Firebase Storage futura. |
| `notificaciones` | `notificaciones-adapter.js` | Listado, contador realtime y marcado como leido. |
| `configuracion` | `configuracion-adapter.js` | Configuracion privada y publica. |

## Registro central

`js/adapters/index.js` exporta todos los adaptadores como `firebaseAdapters` y tambien por nombre. En fases futuras, los dashboards deberian importar de este archivo o de un registro de proveedor equivalente.

Ejemplo futuro:

```js
import { clases, pagos } from '../../js/adapters/index.js';

const { data, error } = await clases.listByTeacher(usuario.uid);
```

## Estrategia de sustitucion futura

1. Mantener dashboards usando Supabase directamente hasta validar cada dominio.
2. Migrar un dashboard o modulo a la vez.
3. Sustituir consultas directas `db.from(...)` por llamadas a adaptadores.
4. Comparar resultados contra Supabase durante una ventana de doble lectura.
5. Activar escrituras Firebase solo cuando reglas, indices y datos importados esten listos.
6. Eliminar imports Supabase solo cuando ningun dashboard dependa de ellos.

## Consideraciones tecnicas

- Los adaptadores usan modulos Firebase CDN porque el proyecto no tiene bundler.
- La prueba de Fase 1 es estatica para no requerir Storage, Auth ni datos reales.
- Los metodos de documentos ya estan preparados para Firebase Storage, pero no deben usarse en produccion hasta que el bucket este operativo.
- `notificaciones` usa `readAt == null` como criterio de no leido para alinearse con las reglas actuales.
- Las consultas compuestas necesitaran indices adicionales cuando se conecten pantallas reales.
- Las validaciones de negocio complejas, como solapes de clases o calculo definitivo de comisiones, no deben vivir solo en cliente.

## Regla de corte

Ninguna pagina debe importar esta capa hasta la fase especifica de migracion del modulo. La validacion `npm run test:adapters` comprueba que los entrypoints actuales de produccion no importan `js/adapters/`.
