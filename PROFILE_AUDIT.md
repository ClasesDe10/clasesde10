# Auditoria y mejora de perfiles

Fecha: 2026-06-28

## Estado auditado

### Profesor

El perfil de profesor ya tenia una base solida: datos personales, foto, direccion, estudios, notas, materias, niveles, disponibilidad, Bizum y documentos. El problema principal era de consistencia: varios campos se guardaban solo con nombres legacy (`estudio_exacto`, `nota_bachillerato`, `acepta_bizum`) y no siempre con alias Firebase usados por admin, matching o automatizaciones (`exactStudy`, `bachilleratoGrade`, `hasBizum`).

Tambien faltaban senales profesionales: porcentaje de perfil completado, confianza, especialidades, idiomas y certificaciones. Esos datos son importantes para revisar profesores, priorizar asignaciones y transmitir confianza antes de aprobarlos.

### Familia

El perfil de familia era demasiado minimo: nombre, telefono y direccion. Faltaban campos que afectan al matching y a la operativa diaria: zona/barrio, canal preferido, contacto alternativo, idiomas, preferencias educativas, verificacion del tutor y estado de completitud.

Habia dos columnas sin informacion accionable en el panel admin de familias. Se sustituyeron por perfil completado y confianza.

### Documentos

Las subidas de documentos no persistian siempre `ownerUid`, aunque las reglas de Firestore exigen ese campo para crear documentos de forma segura. Ademas, la capa de Storage podia duplicar prefijos de ruta. Se corrigio para nuevas subidas bajo `users/{uid}/documentos/...` y se mantuvieron rutas legacy en reglas.

## Mejoras implementadas

### Motor comun de perfil

Nuevo modulo: `js/profile-engine.js`.

Responsabilidades:

- Normalizar listas sin duplicados.
- Validar telefono y codigo postal.
- Validar notas academicas 0-10.
- Calcular porcentaje de perfil completado.
- Separar bloqueos requeridos de recomendaciones.
- Calcular `trustScore` y `trustLevel`.
- Generar indicadores de confianza para UI.

### Profesor

Campos nuevos:

- Especialidades concretas.
- Idiomas de atencion.
- Certificaciones relevantes.
- Porcentaje de perfil completado.
- Indicadores de confianza.
- Trust score.

Persistencia normalizada:

- `foto_url` y `photoUrl`.
- `direccion` y `address`.
- `ciudad` y `city`.
- `codigo_postal` y `postalCode`.
- `zona` y `zone`.
- `nivel_estudios` y `studyLevel`.
- `estudio_exacto` y `exactStudy`.
- `centro_estudios` y `studyCenter`.
- `nota_bachillerato` y `bachilleratoGrade`.
- `nota_media_universidad` y `universityAverageGrade`.
- `materias` y `subjects`.
- `niveles_educativos` y `levels`.
- `especialidades` y `specialties`.
- `idiomas` y `languages`.
- `certificaciones` y `certifications`.
- `acepta_bizum` y `hasBizum`.
- `perfil_completo`, `profileComplete`, `profileCompletionPercent`, `profileIssues`, `trustScore`, `trustLevel`.

### Familia

Campos nuevos:

- Zona/barrio principal.
- Canal preferido.
- Contacto alternativo.
- Telefono alternativo.
- Idiomas de comunicacion.
- Preferencias educativas y observaciones.
- Verificacion documental del tutor.
- Porcentaje de perfil completado.
- Indicadores de confianza.
- Trust score.

Persistencia normalizada:

- `direccion` y `address`.
- `ciudad` y `city`.
- `codigo_postal` y `postalCode`.
- `zona` y `zone`.
- `contacto_preferido` y `preferredContact`.
- `contacto_emergencia_nombre` y `emergencyContactName`.
- `contacto_emergencia_telefono` y `emergencyContactPhone`.
- `idiomas` y `languages`.
- `notas_perfil` y `profileNotes`.
- `perfil_completo`, `profileComplete`, `profileCompletionPercent`, `profileIssues`, `trustScore`, `trustLevel`.

### Reglas y Storage

- Firestore permite los nuevos campos editables por el propietario sin permitir cambios de rol.
- Los documentos requieren `ownerUid`.
- Storage acepta nuevas rutas bajo `users/{uid}/...`.
- Storage mantiene rutas legacy `documentos/{uid}/...` y `documentos/documentos/{uid}/...`.

## Criterios de perfil completo

### Profesor

Requerido:

- Nombre y apellidos.
- Telefono valido.
- Foto.
- Direccion, ciudad, CP y zona.
- Formacion, estudio exacto y centro.
- Notas validas.
- Bio de al menos 40 caracteres.
- Materias/actividades.
- Niveles.
- Disponibilidad.
- Bizum.

Recomendado:

- Especialidades.
- Idiomas.
- Certificaciones.
- DNI.
- Titulo/certificado.
- Curriculum.

### Familia

Requerido:

- Nombre y apellidos.
- Telefono valido.
- Direccion, ciudad y CP.
- Zona.
- Canal preferido.

Recomendado:

- Contacto alternativo.
- Alumno activo.
- Idiomas.
- Preferencias educativas.
- Documento del tutor.

## Riesgos reducidos

- Menos duplicidad semantica entre Supabase legacy y Firebase.
- Menos errores de matching por campos ausentes.
- Menos documentos bloqueados por reglas.
- Mejor visibilidad para admin antes de aprobar o asignar.
- Mejor experiencia de profesor/familia al saber exactamente que falta.

## Pendiente recomendado

- Crear una vista admin especifica de detalle familiar si se necesita mas operativa que la tabla.
- Anadir verificacion automatica de documentos cuando exista un proveedor externo o proceso manual definido.
- Migrar documentos legacy a rutas `users/{uid}/documentos/...` si se quiere eliminar compatibilidad antigua.
