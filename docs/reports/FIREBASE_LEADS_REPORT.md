# Firebase Leads - Corte parcial admin

Fecha: 2026-06-25

## Objetivo

Completar el primer corte de datos no-auth hacia Firebase: leads publicos.

Los formularios publicos ya escribian en Firestore `leadsPublicos`. Este bloque migra la seccion de leads del panel admin para que tambien lea y actualice Firestore, eliminando la dependencia de `leads_publicos` en Supabase dentro de esa seccion.

## Cambios realizados

| Archivo | Cambio |
| --- | --- |
| `js/adapters/leads-adapter.js` | Nuevo adaptador de dominio para `leadsPublicos`. |
| `js/adapters/contracts.js` | Agrega dominio `leads`. |
| `js/adapters/index.js` | Exporta `leads`. |
| `pages/dashboard/admin.html` | La seccion Leads usa el adaptador `leads` para contador, listado, filtros y cambios de estado. |
| `firebase/firestore.indexes.json` | Agrega indice `tipo + estado + createdAt` para filtros combinados. |
| `scripts/phase1-adapters-test.mjs` | Permite que `admin.html` importe adaptadores porque ya tiene un modulo migrado. |

## Alcance

Migrado:

- Contador de leads nuevos en sidebar admin.
- Listado de leads.
- Filtro por tipo.
- Filtro por estado.
- Cambio de estado a `contactado` o `cerrado`.

No migrado:

- Dashboard admin general.
- Solicitudes.
- Clases.
- Pagos.
- Documentos.
- Incidencias.
- Profesores, familias, alumnos.

## Validacion

Comandos ejecutados:

```powershell
npm.cmd run test:adapters
npm.cmd run test:auth:functional
npm.cmd run audit:auth
npx.cmd --yes firebase-tools deploy --only firestore:indexes --project clasesde10-50add --non-interactive
npx.cmd --yes firebase-tools hosting:channel:deploy fase2-auth --project clasesde10-50add --expires 7d --non-interactive
```

Resultados:

- `test:adapters`: OK, 13 dominios.
- `test:auth:functional`: OK.
- `audit:auth`: Firebase Auth sigue con 1 usuario admin; el usuario temporal del test fue eliminado.
- Indices Firestore desplegados correctamente.
- Preview Firebase actualizado.
- Validacion HTTP del preview: `admin.html` no contiene `leads_publicos` ni `db.from('leads_publicos')`.

Preview:

```text
https://clasesde10-50add--fase2-auth-ws7x8zcz.web.app
```

## Estado

Leads publicos quedan como primer modulo de datos cerrado sobre Firebase para escritura publica y gestion admin basica.
