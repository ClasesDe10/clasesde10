# Sistema de reputacion ClasesDe10 v2

El sistema de reputacion ya no es un contador manual ni una simple media de valoraciones. Es un motor automatico y explicable que usa datos operativos de la plataforma para responder a una pregunta: si una familia ve este perfil, puede decidir en menos de 30 segundos si transmite confianza.

## Principios

- La reputacion no la escribe el usuario. Se calcula desde `documentos`, `clases`, `pagos`, `solicitudes`, `solicitudMatches`, `asignaciones`, `incidencias`, `alumnos` y el perfil.
- Un perfil completo ayuda, pero no sustituye al historial real.
- Las muestras pequenas se suavizan con puntuacion bayesiana para no castigar ni inflar injustamente a usuarios nuevos.
- Las metricas sensibles o facilmente malinterpretables quedan para admin.
- Cada insignia representa un criterio objetivo y verificable.

## Niveles

- Bronce: perfil inicial o historial todavia limitado.
- Plata: perfil operativo con verificacion o actividad minima.
- Oro: buen historial, baja friccion y sin incidencias abiertas relevantes.
- Platino: confianza sobresaliente con documentos validados, volumen suficiente y comportamiento consistente.

Un profesor no puede llegar a Platino solo rellenando campos. Necesita identidad y formacion validadas, al menos 20 clases realizadas y cero incidencias abiertas.

## Metricas principales de profesores

- clases realizadas, canceladas y no realizadas;
- porcentaje de realizacion y cancelacion;
- horas impartidas;
- alumnos activos;
- puntualidad por check-ins cuando existan;
- tiempo medio de respuesta;
- tiempo medio de aceptacion/aceptacion de solicitudes;
- regularidad semanal;
- antiguedad;
- experiencia declarada;
- documentos subidos y documentos validados;
- incidencias, reclamaciones y pagos pendientes;
- valoraciones con factor de confianza por volumen.

## Metricas principales de familias

- alumnos activos;
- clases realizadas y canceladas;
- horas realizadas;
- fiabilidad de pagos;
- pagos pendientes;
- incidencias;
- identidad del tutor;
- completitud del perfil;
- actividad reciente y antiguedad.

## Visibilidad

Publico:

- `trustScore`;
- nivel Bronce/Plata/Oro/Platino;
- insignias publicas;
- `publicTrustStats`.

Solo admin:

- `trustWarnings`;
- `trustComponents`;
- `adminTrustStats`;
- `trustRiskFlags`;
- pagos pendientes;
- incidencias abiertas;
- documentos pendientes;
- confianza estadistica de la muestra.

## Persistencia

El snapshot persistido se genera con `buildTrustSnapshotPatch()`:

- `trustScore`;
- `trustLevel`;
- `trustLevelKey`;
- `trustLevelRank`;
- `trustLevelLabel`;
- `trustBadges`;
- `trustWarnings`;
- `trustComponents`;
- `trustSignals`;
- `trustRiskFlags`;
- `trustVisibility`;
- `reputationMetrics`;
- `publicTrustStats`;
- `adminTrustStats`;
- `trustVersion`.

Los formularios de profesor y familia ya no guardan `trustScore` ni `trustLevel`. La automatizacion `npm run automation:trust` y el worker de GitHub Actions recalculan y persisten la reputacion.
