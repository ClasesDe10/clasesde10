# Product benchmark e implementacion UX - ClasesDe10

Fecha: 2026-06-28

## Referencias estudiadas

- Preply: busqueda de tutor, perfiles con valoraciones, flexibilidad y progreso entre clases. https://preply.com/
- Calendly: formularios de routing, workflows, recordatorios y reduccion de no-shows. https://calendly.com/features
- Stripe Dashboard: busqueda transversal, logs, estados claros y auditoria operativa. https://docs.stripe.com/dashboard/search
- Linear: command menu contextual con `Cmd/Ctrl K` para navegar y ejecutar acciones. https://linear.app/docs/conceptual-model
- Airbnb: badges de confianza basados en ratings, reviews y fiabilidad. https://www.airbnb.com/help/article/3496
- Notion: comentarios, menciones, plantillas y contexto persistente sobre bases de datos. https://www.notion.com/help/comments-mentions-and-reminders
- Slack: huddles, workflows y automatizacion sin codigo para reducir cambios de contexto. https://slack.com/features/workflow-automation
- Duolingo: progreso visible, feedback inmediato y habitos medibles. https://blog.duolingo.com/how-duolingo-streak-builds-habit/

## Comparativa priorizada

| Patron top | Problema que resuelve | Estado anterior en ClasesDe10 | Implementado ahora | Prioridad |
| --- | --- | --- | --- | --- |
| Command palette contextual | Evita buscar opciones en menus largos | Navegacion por sidebar, sin acciones globales | Paleta `Ctrl K` / `/` en dashboards con secciones y acciones | P0 |
| Busqueda transversal | Encuentra recursos rapido como Stripe | Admin tenia buscador visible pero sin asistencia global | Busqueda contextual en la seccion actual con contador de resultados | P0 |
| Autosave de formularios | Evita perder datos en formularios largos | Formularios largos sin borrador local universal | Borrador local seguro, excluye passwords y archivos | P0 |
| Progreso de formulario | Reduce abandono y ansiedad | Algunos perfiles tenian calidad, pero no todos los formularios | Barra de progreso automatica en formularios con campos obligatorios | P0 |
| Estado de conexion | Reduce incertidumbre en PWA movil | Service worker existia, pero feedback al usuario era limitado | Banner online/offline y aviso de nueva version PWA | P0 |
| Empty states accionables | Convierte estados vacios en siguiente paso | Habia estados vacios, a veces sin accion | Acciones contextuales automaticas en empty states | P1 |
| Tooltips accesibles | Aclara iconos sin texto | Dependia de `title` nativo | Tooltips y `aria-label` en controles con title/aria-label | P1 |
| Deep links por seccion | Comparte y recupera contexto | Sidebar sin URL contextual | Hash de seccion en dashboards y apertura desde hash | P1 |
| Microfeedback | Hace que el producto parezca vivo y estable | Feedback parcial por toasts | Transiciones suaves en progreso, estado y paleta | P1 |
| Auditoria de producto | Evita regresiones invisibles | No habia test especifico para estos detalles | `test:product-ux` y `audit:product-ux` | P1 |

## Mejoras implementadas

### Capa global `js/pwa.js`

- Inyeccion de estilos de producto para banners, progreso, command palette, tooltips y empty states.
- Estado de conexion:
  - avisa cuando se pierde conexion;
  - avisa cuando vuelve;
  - avisa cuando hay nueva version PWA lista.
- Formularios inteligentes:
  - autosave local por pagina y formulario;
  - recuperacion de borrador;
  - exclusion de passwords, archivos y pantallas auth;
  - barra de progreso si el formulario tiene campos obligatorios.
- Dashboards:
  - command palette `Ctrl K` y `/`;
  - boton "Buscar / Ctrl K" en topbar;
  - navegacion por hash de seccion;
  - busqueda contextual en tablas/listas de la seccion actual;
  - empty states con acciones utiles;
  - tooltips accesibles.

### PWA

- `service-worker.js` subido a `clasesde10-pwa-v11` para invalidar cache anterior.

### Testing

- `scripts/product-ux-test.mjs`: valida que la capa UX, autosave, progreso, command palette, tooltips, empty states y cache PWA estan presentes.
- `scripts/product-ux-smoke.playwright.js`: valida en navegador real la capa UX sobre admin.
- `npm run test:product-ux` integrado en `check:quality`.
- `npm run audit:product-ux` disponible para smoke test real con login admin.

## Siguiente fase recomendada

1. Convertir busqueda contextual en busqueda real por entidades: familias, profesores, alumnos, pagos y solicitudes.
2. Crear historial de cambios persistente en Firestore para clases, pagos, perfiles y solicitudes.
3. Implementar plantillas operativas tipo Notion para incidencias, mensajes y solicitudes repetidas.
4. Crear scoring visible tipo Airbnb para profesores: verificacion, puntualidad, respuesta, asistencia y valoraciones.
5. Crear workflows configurables tipo Calendly/Slack desde admin para recordatorios, pagos vencidos y clases sin confirmar.
6. Crear objetivos/habitos ligeros tipo Duolingo para profesores: perfil completo, respuesta rapida, clases registradas a tiempo.
