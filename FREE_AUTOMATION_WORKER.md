# Worker gratuito de automatizacion

## Decision

La automatizacion de matching queda fuera de Firebase Cloud Functions para evitar depender del plan Blaze.

La ejecucion gratuita se hace con GitHub Actions:

- Cada 10 minutos.
- Tambien manual desde GitHub Actions.
- Matching determinista y explicable como base.
- Gemini opcional si existe `GEMINI_API_KEY`.
- Fallback automatico a reglas si Gemini falla o no hay clave.

## Que automatiza

1. Lee `leadsPublicos` con `estado = nuevo`.
2. Si el lead es `familia`, crea `solicitudes/lead_{leadId}`.
3. Si el lead es `profesor`, calcula precio sugerido y diagnostico.
4. Calcula top 5 profesores para solicitudes nuevas.
5. Si hay `GEMINI_API_KEY`, pide a Gemini reordenar/explicar candidatos.
6. Guarda candidatos en `solicitudMatches`.
7. Guarda ejecuciones en `matchingRuns`.
8. Crea `notificaciones` para admin.
9. Si una solicitud ya fue asignada por admin, crea `asignaciones`.

## Como se usa la IA

La IA no sustituye las reglas. Primero se calcula una lista segura de candidatos con datos reales:

- materia
- nivel
- modalidad
- zona
- disponibilidad
- carga actual
- verificacion del profesor

Despues, si `GEMINI_API_KEY` esta configurada, Gemini recibe solo esos candidatos y devuelve JSON con:

- `teacherUid`
- `score`
- `reason`
- `risks`

No puede inventar profesores fuera de la lista porque el worker ignora cualquier `teacherUid` que no venga del ranking base.

## Activacion

El workflow esta en:

`.github/workflows/firebase-automation.yml`

Necesita uno de estos secretos de GitHub Actions:

- `FIREBASE_SERVICE_ACCOUNT_JSON`
- `FIREBASE_SERVICE_ACCOUNT_BASE64`

Para activar IA:

- `GEMINI_API_KEY`

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
