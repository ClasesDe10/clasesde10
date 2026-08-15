# ClasesDe10 Matching Algorithm

Version: `professional_matching_v2`

## Objetivo

El matching no debe limitarse a filtrar profesores por materia. Debe ordenar los candidatos por probabilidad real de que la familia reciba una clase adecuada, puntual y sostenible.

El sistema usa un scoring determinista, gratuito y explicable. Si existe `GEMINI_API_KEY`, Gemini puede actuar como reranker auxiliar, pero no puede inventar candidatos ni saltarse bloqueos.

## Flujo

1. Se normaliza la solicitud: materia, nivel, modalidad, zona, codigo postal, horario y alumno.
2. Se normaliza cada profesor: materias, niveles, modalidad, zona, disponibilidad, perfil, experiencia, valoraciones, respuesta, aceptacion y carga.
3. Se calcula un score 0-100 con desglose por categoria.
4. Se aplican topes de seguridad si hay incompatibilidades duras.
5. Se devuelven candidatos ordenados con razones, riesgos y `scoreBreakdown`.
6. Opcionalmente, Gemini reordena candidatos prefiltrados. Su ajuste queda acotado a -5/+8 puntos y nunca introduce profesores nuevos.

## Pesos

| Categoria | Peso |
|---|---:|
| Materia / actividad | 24 |
| Nivel / curso | 12 |
| Modalidad | 12 |
| Ubicacion | 12 |
| Disponibilidad real | 12 |
| Experiencia / formacion | 8 |
| Reputacion operativa | 10 |
| Capacidad / carga | 6 |
| Calidad del perfil | 4 |

## Variables principales

- Materia: soporta asignaturas academicas y actividades como padel, tenis, guitarra, piano o musica.
- Nivel: primaria, ESO, bachillerato, EVAU, universidad, deporte, musica, adultos.
- Modalidad: online, presencial o ambas.
- Ubicacion: zona, ciudad, codigo postal y compatibilidad online.
- Disponibilidad: texto libre y franjas estructuradas de `disponibilidad`.
- Experiencia: anios, estudios exactos, centro, nota de bachillerato y nota media superior.
- Reputacion: valoracion media, numero de valoraciones, tiempo de respuesta, ratio de aceptacion, ratio de realizacion y cancelacion.
- Capacidad: `maxStudents` frente a `activeAssignments`.
- Perfil: foto, contacto, direccion, estudios, materias, niveles, Bizum, disponibilidad y verificacion.

## Bloqueos y topes

- Profesor inactivo: score 0.
- Sin identificador de profesor: score 0.
- Materia incompatible: maximo 45.
- Modalidad incompatible: maximo 55.
- Sin capacidad libre: maximo 58.
- Pendiente de verificacion: maximo 68.
- Perfil incompleto: maximo 72.

Un candidato solo es `assignable` si esta activo, verificado, tiene perfil completo, no tiene bloqueos duros y supera 65 puntos.

## Integracion IA

La IA generativa no sustituye al scoring. Solo puede ayudar cuando hay candidatos ya calculados.

Modo por defecto:

- `deterministic_no_api_key`
- Gratis
- Sin llamadas externas
- Totalmente reproducible

Modo con Gemini:

- Requiere `GEMINI_API_KEY`
- Modelo por defecto: `gemini-2.0-flash`
- Prompt cerrado a candidatos existentes
- Respuesta JSON
- Ajuste acotado para evitar alucinaciones
- Se guardan `aiUsed`, `aiMode`, `aiAdjustment`, `aiReason` y `aiRisks`

## Datos escritos

En `solicitudMatches/{requestId}_{teacherUid}`:

- `score`
- `scoreBreakdown`
- `reasons`
- `risks`
- `profileScore`
- `assignable`
- `matchingVersion`
- `source`
- `aiAdjustment`
- `aiUsed`
- `aiMode`

En `matchingRuns`:

- perfil normalizado de la solicitud
- numero de candidatos
- version del algoritmo
- modo IA
- error IA, si lo hubo

## Donde se usa

- `js/ai-engine.js`: motor unico de scoring.
- `pages/dashboard/admin.html`: recomendaciones visibles al asignar una solicitud.
- `scripts/firebase-automation-worker.mjs`: generacion automatica de matches para solicitudes nuevas.
- `scripts/ai-engine-test.mjs`: pruebas de ranking, actividades, disponibilidad, reputacion e IA acotada.

## Medicion recomendada

Para mejorar el algoritmo con datos reales conviene registrar:

- tiempo desde solicitud hasta primera propuesta
- tiempo hasta asignacion
- profesor elegido frente al ranking sugerido
- aceptacion del profesor
- clase realizada o cancelada
- valoracion posterior de familia
- valoracion posterior de profesor
- cambios manuales del admin

Con esos datos se podran ajustar pesos sin cambiar la arquitectura.
