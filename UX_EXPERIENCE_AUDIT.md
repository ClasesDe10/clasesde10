# Auditoria UX transversal

Fecha: 2026-06-28

## Objetivo

Revisar los flujos principales de familias, profesores y administracion desde una perspectiva practica: friccion, pasos innecesarios, pantallas confusas, acciones sin feedback, formularios moviles y sensacion general de producto.

## Flujos revisados

- Web publica: home, padres, profesores, contacto, login y registro.
- Acceso: login con email, login con Google, recuperacion de contrasena y registro.
- Administracion movil: navegacion por secciones, menu lateral, paneles, tablas, modales y acciones tactiles.
- Formularios compartidos: campos obligatorios, validacion, errores y estados de envio.

## Fricciones detectadas

1. Login podia llamar a Firebase aunque el formulario local no fuera valido.
2. Algunos errores aparecian solo como banner superior, sin vincularse al campo que habia que corregir.
3. Los botones de autenticacion no anunciaban estado de carga con `aria-busy`.
4. Los toasts no eran cerrables y podian acumularse.
5. Los modales no restauraban foco ni cerraban de forma consistente con Escape.
6. El menu lateral movil no exponia `aria-expanded` y podia dejar la navegacion en estado ambiguo.
7. Registro no marcaba la confirmacion de contrasena como error propio del campo.
8. La experiencia movil dependia demasiado de feedback nativo del navegador en formularios clave.

## Mejoras implementadas

- Capa global de validacion UX en `js/utils.js`.
- Errores por campo con `aria-invalid`, `aria-describedby`, foco y scroll al primer campo invalido.
- Helpers reutilizables: `focusFirstInvalidField`, `setFieldError`, `clearFieldError` e `initFormValidationFeedback`.
- Toasts accesibles, limitados en pila y con boton de cierre.
- Modales con foco inicial, cierre por overlay, cierre por Escape y restauracion de foco.
- Sidebar movil con `aria-expanded`, cierre por Escape y estado centralizado.
- Login y recuperacion validan antes de llamar a Firebase.
- Registro valida email y contrasenas con feedback de campo.
- Estilos comunes de campo invalido, mensajes de error y botones en carga.
- Auditoria automatizada `scripts/ux-flow-audit.playwright.js`.

## Resultado esperado

- Menos clics fallidos y menos llamadas innecesarias a Firebase.
- Menos incertidumbre cuando un formulario falla.
- Mejor uso en movil, especialmente teclado, foco, modales y menu lateral.
- Base reutilizable para seguir mejorando dashboards sin duplicar validaciones pantalla por pantalla.

## Siguientes focos recomendados

- Revisar copy de empty states por modulo del dashboard.
- Medir conversion de registro familia/profesor despues del cambio de formularios.
- Anadir estados skeleton en listados que dependan de red.
- Ejecutar sesiones reales de prueba con padre, profesor y admin antes del siguiente bloque grande de producto.
