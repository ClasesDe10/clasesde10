# FIREBASE_IMPORT_LOG - ClasesDe10

Actualizado: 2026-06-16

## Estado Firebase

| Servicio | Estado |
|---|---|
| Firestore | Creado en `eur3` |
| Firestore rules | Desplegadas |
| Firestore indexes | Desplegados |
| Firebase Auth | Pendiente de inicializacion en consola |
| Firebase Storage | Pendiente de inicializacion / posible Blaze |

## Importacion ejecutada

Origen:

- `C:\Users\migue\Downloads\CD10\clasesde10-sheets-export.xlsx`
- Hoja: `PROFESORES`

Destino:

- Firestore `profesores`
- Firestore `importAudits/sheets_profesores_2026_06_16`

Resultado:

| Metrica | Valor |
|---|---:|
| Filas brutas `PROFESORES` | 28 |
| Profesores importados | 24 |
| Emails invalidos omitidos | 1 |
| Duplicados por email omitidos | 3 |

Decision: solo se importaron profesores con email valido y deduplicado. Los
documentos quedan como `status = pendiente_revision` y `active = false` para
que ningun dato legacy quede operativo sin revision humana.

## Datos no importados

- `FAMILIAS`: contiene duplicados masivos y pocos datos de contacto reales.
- `ALUMNOS`: contiene asignaciones anómalas y miles de campos corruptos.
- `CLASES`: no tiene registros reales.
- `RESUMEN MENSUAL`: vacia y derivada.
- `LOG PARSEO`: archivo historico, no dato operativo.
- `MATCHING LOG`: sin confirmaciones, no apto para crear asignaciones reales.
- `LOG WEB`: test/archivo historico.

## Pendientes bloqueados

1. Activar Firebase Authentication con Email/Password desde consola.
2. Inicializar Firebase Storage desde consola. Si exige plan Blaze, decidir
   facturacion antes de continuar.
3. Crear primer usuario admin en Firebase Auth.
4. Crear documento `users/{uid}` con `role = admin`.
5. Migrar lectura/gestion de leads del panel admin a Firestore.
