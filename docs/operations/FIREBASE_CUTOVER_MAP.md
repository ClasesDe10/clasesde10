# Mapa de corte Firebase

Actualizado: 2026-07-07

## Estado resumido

El corte operativo ya esta hecho: produccion visible usa Firebase Hosting,
Firebase Auth, Firestore, Storage y worker gratuito. Lo que queda es limpieza de
API legacy interna, no una migracion de backend pendiente.

## Capas puente que siguen existiendo

| Capa | Estado | Accion recomendada |
| --- | --- | --- |
| `js/supabase-client.js` | Exporta Firebase compatibility API | Mantener hasta refactor de paneles |
| `db.from()` en paneles | Compatibilidad Firebase | Sustituir por adaptadores por dominio |
| `supabase/` | Historico | No usar para nuevas features |

## Validaciones

```bash
npm run audit:supabase
npm run audit:free-infrastructure
npm run audit:production-readiness
```

`audit:supabase` debe mostrar 0 dependencias Supabase reales. Puede seguir
mostrando llamadas `db.from()` mientras esten enrutadas a Firebase.

## No hacer

- No volver a Supabase Auth.
- No usar Supabase Storage para nuevos documentos.
- No crear Edge Functions nuevas.
- No desplegar Cloud Functions para sustituir el worker gratuito.
