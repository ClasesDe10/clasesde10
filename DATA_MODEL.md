# ClasesDe10 Data Model

Version: `data-schema-2026-06-29`

## Decision

Firestore remains the source of truth. The platform accepts legacy field names during the Firebase migration, but every new write must be normalized through `js/data-schema.js`.

The rule is:

- Canonical fields are used by new code.
- Legacy aliases are kept only for compatibility with dashboards still using `db.from(...)`.
- Derived fields are calculated automatically.
- Operational facts are stored in domain collections, while analytics, audit and automation data stay in append-only operational collections.

## Canonical Collections

- `users`: identity, role and contact basics.
- `profesores`: teacher profile, verification, subjects, levels, availability and trust inputs.
- `familias`: family profile and contact/location data.
- `alumnos`: student records owned by families.
- `solicitudes`: demand from families before assignment.
- `asignaciones`: accepted teacher-family-student relationship.
- `chats`: communication space for an assignment, with schedule proposals under `chats/{id}/programaciones`.
- `clases`: scheduled/completed/cancelled lessons and their economic state.
- `pagos`: family payments, teacher payouts and reconciliation state.
- `documentos`: files, versions, verification and expiry.
- `incidencias`: support tickets and operational issues.
- `notificaciones`: internal and push notification feed.
- `auditLogs`, `analyticsEvents`, `automationEvents`, `systemJobs`: append-only operational history.

## Compatibility Aliases

The following aliases are intentionally mirrored while the dashboards are migrated:

- `usuario_id` -> `userUid`
- `familia_id` -> `familyUid`
- `profesor_id` -> `teacherUid`
- `alumno_id` -> `studentId`
- `profesor_asignado_id` -> `assignedTeacherUid`
- `estado` -> `status`
- `activo` / `activa` -> `active`
- `fecha` -> `date`
- `hora_inicio` -> `startTime`
- `hora_fin` -> `endTime`
- `duracion_minutos` -> `durationMinutes`
- `materia` -> `subject`
- `precio_total` -> `familyAmount` only in `clases`
- `importe_profesor` -> `teacherAmount` only in `clases`
- `monto` -> `amount` only in `pagos`

Aliases are collection-scoped. A payment must not inherit class fields such as `precio_total` or `familyAmount`.

## Automatically Derived

- `displayName` from `nombre + apellidos` or email.
- `searchKeywords` for CRM/search/matching.
- `startAtIso` and `endAtIso` for classes.
- `lifecycleStatus` for classes and requests.
- `profileCompletion` mirror from `profileCompletionPercent`.
- Notification read status from `readAt` / `leida`.
- Default statuses for new domain documents.
- Schema metadata: `schemaVersion` and `canonicalCollection`.

## Implementation Points

- `js/firebase-data-client.js`: normalizes all legacy `db.from(...).insert/update` writes.
- `js/adapters/firebase-firestore-adapter.js`: normalizes all adapter writes.
- `js/firebase-auth.js`: normalizes profiles created during signup and Google login.
- `scripts/firebase-automation-worker.mjs`: normalizes root documents created by automation.
- `scripts/data-schema-test.mjs`: protects the contract in CI/local quality checks.

## Migration Path

1. Keep aliases active while dashboards still read legacy names.
2. Move module by module to adapters and canonical fields.
3. Stop writing legacy aliases only after no runtime reads depend on them.
4. Run a one-time Firestore cleanup to remove deprecated aliases from historical records.
