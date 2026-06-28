# Sistema de confianza y reputacion

## Problema auditado

Antes de contratar o aceptar una asignacion, una familia puede dudar por:

- si el profesor existe y esta validado por ClasesDe10;
- si su formacion y documentacion son reales;
- si el perfil esta completo y permite comparar rapido;
- si responde a tiempo;
- si suele realizar las clases programadas;
- si cancela demasiado;
- si tiene experiencia suficiente para la materia/nivel;
- si tiene disponibilidad real;
- si tiene historial operativo dentro de la plataforma;
- si hay incidencias abiertas o pagos pendientes relacionados.

Tambien tiene sentido medir confianza de familias cuando afecta a operacion:

- contacto operativo;
- direccion/zona para matching presencial;
- alumnos activos;
- pagos pendientes;
- historial de clases;
- incidencias abiertas;
- actividad reciente.

## Arquitectura implementada

El sistema vive en `js/trust-engine.js` y es determinista, gratuito y explicable.

Entradas:

- `profesores` y `familias`;
- `documentos`;
- `clases`;
- `pagos`;
- `solicitudes`;
- `solicitudMatches`;
- `asignaciones`;
- `incidencias`;
- `alumnos`.

Salidas:

- `trustScore`;
- `trustLevel`;
- `trustBadges`;
- `trustWarnings`;
- `trustComponents`;
- `reputationMetrics`;
- `publicTrustStats`;
- `trustVersion`;
- `trustUpdatedAt`.

## Niveles

- `destacado`: 90-100.
- `alto`: 78-89.
- `medio`: 60-77.
- `inicial`: menos de 60.

## Badges principales

Profesores:

- verificado por ClasesDe10;
- identidad validada;
- formacion validada;
- perfil completo;
- experiencia alta;
- historial contrastado;
- alta asistencia;
- pocas cancelaciones;
- responde rapido;
- perfil destacado;
- Bizum confirmado.

Familias:

- familia validada;
- tutor validado;
- perfil completo;
- alumno registrado;
- pagos fiables;
- buena asistencia.

## Actualizacion automatica

El worker `scripts/firebase-automation-worker.mjs` recalcula y persiste reputacion en Firestore para profesores y familias mediante `processTrustReputation`.

El admin tambien calcula la reputacion al cargar datos vivos, por lo que ve informacion actual aunque el resumen persistido aun no se haya refrescado.

## Uso en producto

- Panel admin: columna de confianza en profesores y familias.
- Detalle admin de profesor/familia: panel explicable con componentes, badges, metricas publicas y alertas.
- Asignacion de profesor: las recomendaciones muestran reputacion junto al score de matching.
- Panel familia: los profesores asignados muestran score, badges y estadisticas publicas.
- Matching: `ai-engine.js` usa `trustScore`, `reputationMetrics` y senales operativas dentro del componente `reputation`.

## Principio de seguridad

No se inventan datos. Si no hay historico, se usa una puntuacion neutra y se muestra como falta de historico, no como garantia.
