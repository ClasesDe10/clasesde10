# Worker gratuito de automatizacion

## Decision

La automatizacion de matching queda fuera de Firebase Cloud Functions para evitar depender del plan Blaze.

La ejecucion gratuita se hace con GitHub Actions:

- Cada 10 minutos.
- Tambien manual desde GitHub Actions.
- Sin Gemini por defecto.
- Matching determinista y explicable.

## Que automatiza

1. Lee `leadsPublicos` con `estado = nuevo`.
2. Si el lead es `familia`, crea `solicitudes/lead_{leadId}`.
3. Si el lead es `profesor`, calcula precio sugerido y diagnostico.
4. Calcula top 5 profesores para solicitudes nuevas.
5. Guarda candidatos en `solicitudMatches`.
6. Guarda ejecuciones en `matchingRuns`.
7. Crea `notificaciones` para admin.
8. Si una solicitud ya fue asignada por admin, crea `asignaciones`.

## Por que no IA como motor principal

El matching base no necesita IA para la mayoria de casos. Necesita reglas fiables:

- materia
- nivel
- modalidad
- zona
- disponibilidad
- carga actual
- verificacion del profesor

La IA puede anadirse despues para casos ambiguos, pero no debe bloquear el flujo ni generar coste.

## Activacion

El workflow esta en:

`.github/workflows/firebase-automation.yml`

Necesita uno de estos secretos de GitHub Actions:

- `FIREBASE_SERVICE_ACCOUNT_JSON`
- `FIREBASE_SERVICE_ACCOUNT_BASE64`

No se guardan credenciales en el repositorio.

## Comandos locales

Autoprueba sin Firebase:

```bash
npm run automation:matching -- --self-test
```

Ejecucion real:

```bash
npm run automation:matching
```

Ejecucion sin escribir:

```bash
npm run automation:matching -- --dry-run
```
