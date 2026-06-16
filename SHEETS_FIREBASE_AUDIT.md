# SHEETS_FIREBASE_AUDIT - ClasesDe10

Actualizado: 2026-06-16

## Objetivo

Auditar el Excel exportado desde Google Sheets antes de migrar a Firebase.
La decision clave es no copiar el sistema antiguo tal cual: Firebase debe ser
la fuente de verdad limpia, no un espejo de datos duplicados o corruptos.

Archivo auditado localmente:

- `C:\Users\migue\Downloads\CD10\clasesde10-sheets-export.xlsx`

## Inventario

| Hoja | Filas utiles | Decision |
|---|---:|---|
| `PROFESORES` | 28 | Candidata a importar tras deduplicar emails y validar campos |
| `FAMILIAS` | 5459 | No importar en bloque como dato vivo |
| `ALUMNOS` | 5461 | No importar en bloque como dato vivo |
| `CLASES` | 0 | No migrar; solo contiene formulas vacias |
| `RESUMEN MENSUAL` | 0 | No migrar; debe ser derivado desde clases reales |
| `LOG PARSEO` | 8681 | Archivo historico, no coleccion operativa |
| `MATCHING LOG` | 5519 | Archivo historico o ultimo match util, no log completo caliente |
| `LOG WEB` | 3 | Descartable o archivo historico |

## Hallazgos

- `PROFESORES` es la unica hoja con volumen pequeno y valor operativo claro.
- `FAMILIAS` tiene 5459 filas pero solo 32 emails distintos. Esto apunta a
  importaciones repetidas, pruebas o parseo incorrecto.
- `FAMILIAS` apenas tiene nombre y telefono completos; codigo postal esta vacio.
- `ALUMNOS` contiene 5461 filas, pero 5431 estan asignadas a solo 2 profesores.
  Esto no parece una base operativa fiable.
- `ALUMNOS.Modalidad Preferida` tiene miles de filas con texto corrupto masivo.
- `CLASES` no tiene registros reales, solo formulas preparadas.
- `RESUMEN MENSUAL` esta vacia y no debe guardarse como fuente de verdad.
- `LOG PARSEO` contiene 8681 avisos/fallos de parseo. Debe archivarse, no
  consultarse desde la app.
- `MATCHING LOG` no tiene confirmaciones. No debe alimentar asignaciones reales
  sin revision.

## Decision de arquitectura

Firebase sera la fuente de verdad futura, pero el historico de Sheets se separa
en dos capas:

1. Datos vivos: solo registros validados, deduplicados y utiles para operar.
2. Archivo legado: logs, parseos, matching historico y hojas corruptas guardadas
   fuera de colecciones operativas, preferiblemente en Storage.

## Modelo Firestore recomendado

| Coleccion | Uso | Fuente |
|---|---|---|
| `users` | Identidad, rol y estado | Firebase Auth + app |
| `profesores` | Perfil privado del profesor | Import limpio + dashboard |
| `familias` | Perfil privado de familia | App, no bulk import sin limpieza |
| `alumnos` | Hijos/alumnos con `familyUid` y participantes | App, import solo validado |
| `asignaciones` | Relacion profesor-alumno activa | App/admin |
| `clases` | Clases reales | App/dashboard |
| `pagos` | Pagos reales | App/dashboard |
| `documentos` | Metadatos de Storage | App/dashboard |
| `leadsPublicos` | Formularios publicos | Web |
| `notificaciones` | Avisos internos | Cloud Functions/app |
| `configuracion` | Ajustes privados | Admin |
| `configuracionPublica` | Ajustes publicos no sensibles | Web |
| `auditLogs` | Auditoria operativa | Backend/admin |
| `importAudits` | Trazabilidad de migraciones | Admin |
| `legacyImports` | Indice de archivos historicos | Admin |

## Campos a no migrar como dato vivo

- Campos constantes: estado pendiente masivo, sexo indiferente/no especifica,
  necesidades especiales `No`, horas semanales por defecto.
- Campos vacios: disponibilidad horas, codigo postal en varias hojas, resumen
  mensual, clases sin registros.
- Campos derivados: alumnos actuales, horas mes estimadas, resumen mensual,
  totales economicos que deban salir de `clases`.
- Diagnosticos largos de IA como campo principal. Si se conservan, hacerlo en
  `legacy` o archivo historico.

## Plan de importacion seguro

1. Activar Auth y Storage en Firebase.
2. Publicar `firebase/storage.rules` cuando Storage este inicializado.
3. Crear un primer usuario admin manual en Firebase Auth y `users/{uid}`.
4. Revisar manualmente el subconjunto real de `FAMILIAS` y `ALUMNOS`.
5. Importar solo familias/alumnos validados.
6. Subir logs antiguos a Storage como archivo, no a colecciones calientes.
7. Cambiar formularios publicos a `leadsPublicos` en Firestore.
8. Migrar dashboards por rol despues de probar reglas con usuarios reales.

## Importacion aplicada

- Firestore `profesores`: 24 documentos importados.
- Firestore `importAudits/sheets_profesores_2026_06_16`: auditoria creada.
- Se omitieron 1 email invalido y 3 duplicados por email.
- Los profesores importados quedan `active = false` y
  `status = pendiente_revision`.

## Proxima accion humana

En Firebase Console:

1. Activar Authentication con Email/Password.
2. Crear Storage si no exige cambios de facturacion no aprobados.
3. Crear un usuario admin.

No pegar claves privadas en el chat. Si hace falta importar con credenciales de
servidor, descargar el JSON de service account y guardarlo localmente fuera del
repo antes de ejecutar scripts de migracion.
