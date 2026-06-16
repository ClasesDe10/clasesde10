# FIREBASE_IMPORT_LOG - ClasesDe10

Actualizado: 2026-06-16

## Estado Firebase

| Servicio | Estado |
|---|---|
| Firestore | Creado en `eur3` |
| Firestore rules | Desplegadas |
| Firestore indexes | Desplegados |
| Firestore delete protection | Activada |
| Firestore PITR | Desactivado para evitar coste no aprobado |
| Reglas Auth/perfiles | Endurecidas para `users`, `profesores` y `familias` |
| Firebase Auth | Pendiente de inicializacion en consola |
| Firebase Storage | Pendiente de inicializacion / posible Blaze |

## Importacion ejecutada

Origen:

- `C:\Users\migue\Downloads\CD10\clasesde10-sheets-export.xlsx`
- Hoja: `PROFESORES`

Destino:

- Firestore `profesores`
- Firestore `importAudits/sheets_profesores_2026_06_16`
- Firestore `importAudits/sheets_full_audit_2026_06_16`
- Firestore `legacyImports/sheets_export_2026_06_16`

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

## Archivo legacy creado

Se creo un paquete privado local fuera del repo y fuera del publish root:

- `C:\Users\migue\Downloads\CD10\migration-private\sheets-2026-06-16`

Contiene candidatos de revision para familias/alumnos y resumen de auditoria.
No se sube a GitHub ni a Netlify porque contiene datos personales legacy.

## Datos no importados

- `FAMILIAS`: contiene duplicados masivos y pocos datos de contacto reales.
- `ALUMNOS`: contiene asignaciones anómalas y miles de campos corruptos.
- `CLASES`: no tiene registros reales.
- `RESUMEN MENSUAL`: vacia y derivada.
- `LOG PARSEO`: archivo historico, no dato operativo.
- `MATCHING LOG`: sin confirmaciones, no apto para crear asignaciones reales.
- `LOG WEB`: test/archivo historico.

Se dejo constancia agregada en Firestore, pero no se importo PII cruda a
colecciones vivas. Motivo: `FAMILIAS` tiene 32 emails unicos validos frente a
5427 filas duplicadas, y `ALUMNOS` requiere reconstruir relaciones reales antes
de crear documentos operativos.

## Pendientes bloqueados

1. Activar Firebase Authentication con Email/Password desde consola.
2. Inicializar Firebase Storage desde consola. Si exige plan Blaze, decidir
   facturacion antes de continuar.
3. Crear primer usuario admin en Firebase Auth.
4. Crear documento `users/{uid}` con `role = admin`.
5. Migrar lectura/gestion de leads del panel admin a Firestore.
