# SCALABILITY_REPORT - ClasesDe10

Actualizado: 2026-06-16

## Supuestos

- Web publica estatica.
- Supabase como backend.
- Leads y clases gestionados por dashboard.
- Sin video propio, sin chat realtime masivo.

## Escenarios alumnos

| Escenario | Web/Netlify | Supabase | Operacion | Riesgo principal |
|---:|---|---|---|---|
| 100 alumnos | Sobra | Sobra | Manual viable | Ninguno critico |
| 1.000 alumnos | Sobra | Viable | Admin se tensiona | Matching y soporte |
| 10.000 alumnos | Sobra | Requiere indices/monitoring | Manual imposible | Automatizacion, pagos, incidencias |
| 100.000 alumnos | CDN viable | Arquitectura dedicada | Empresa compleja | Producto, soporte, data, compliance |

## Escenarios profesores

| Escenario | Viabilidad | Necesidad |
|---:|---|---|
| 50 profesores | Curacion manual | Panel actual suficiente |
| 500 profesores | Curacion + scoring | Filtros, disponibilidad, verificacion |
| 5.000 profesores | Marketplace/operacion avanzada | Busqueda, ranking, reputacion, fraude |

## Limites tecnicos

- Dashboard admin monolitico no escala en mantenimiento.
- RLS debe testearse antes de multiplicar roles.
- Leads anonimos necesitan rate limit.
- Matching manual no escala mas alla de cientos de alumnos activos.

## Limites economicos

- El coste cloud inicial es bajo.
- El coste humano crece antes que el coste tecnico.
- La rentabilidad depende de recurrencia y margen por clase.

## Decision

Escalar primero a 1.000 alumnos con arquitectura actual endurecida. A partir de ahi, evaluar V2 modular y automatizacion de matching/pagos.

