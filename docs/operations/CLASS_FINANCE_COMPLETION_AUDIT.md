# Auditoría de cierre: clases, finanzas y pagos familiares

Fecha del punto de control: 2026-08-15 22:42 CEST.

Este documento define la evidencia mínima para cerrar el objetivo. Un test local, un despliegue correcto o la ausencia de errores no sustituyen la verificación directa del estado productivo.

## Requisitos y evidencia actual

| Requisito | Estado | Evidencia autoritativa disponible | Evidencia que aún falta |
|---|---|---|---|
| Eliminar todas las clases pasadas y futuras | pendiente de producción | Reset idempotente y ensayo destructivo en emulador: interrupción recuperada y cero final | `completed.json`, estado durable `completed` y consulta independiente de `clases` con cero documentos |
| Eliminar pagos, calendarios de pago y datos económicos derivados | pendiente de producción | Cobertura explícita de `pagos`, `paymentSchedules`, lifecycle, métricas, rollups, resúmenes, health checks y snapshots | Verificación productiva de todos los contadores y objetivos derivados a cero |
| Eliminar justificantes y binarios asociados | pendiente de producción | Detección de documentos, blobs, chunks, URLs históricas, adjuntos de chat y rutas de Storage; copia binaria previa probada | Cero documentos de pago, cero rutas `pagos/`, cero rutas explícitas y copia privada inspeccionada |
| Eliminar rastros de clase/pago en chats sin borrar conversación normal | pendiente de producción | Ensayo de previews, mensajes, adjuntos, reacciones y `programaciones`; mensajes normales conservados | Verificación productiva de previews/estado de clase y objetivos de chat a cero |
| Preservar el CRM familiar más reciente | probado en código; pendiente tras reset | CRM familiar separado y publicado; emulador conserva perfiles, mensajes y adjuntos normales | Abrir una ficha familiar autenticada después del reset y comprobar secciones/datos CRM |
| Pagar toda la deuda vencida más el periodo semanal/quincenal actual | desplegado y probado | `2798169`, validación exacta `27faac9`, prueba productiva 60 € frente a parciales/manipulados | Repetir flujo autenticado después del reset con fixture temporal y limpiar el fixture |
| Exigir marcar dada/no dada antes de pagar; solo dadas son pagables | desplegado y probado | Motor, interfaz, reglas de aprobación y batería integral verdes | Comprobación autenticada de mensaje, selección y rechazo administrativo |
| Mostrar pagadas en verde tras validación admin | desplegado y probado | Estado económico común y render productivo comprobado | Comprobación autenticada tras aprobar un justificante temporal |
| Bloquear acceso completo con impago superior a 30 días | desplegado y probado | Gate de 30 días, navegación limitada a calendario/justificantes y PWA v95 | Comprobación autenticada de rutas y controles con fixture temporal |
| Restaurar el acceso cuando el admin acepte el justificante | desplegado y probado | `0a06c35`: pago, clases y perfil familiar en un único batch atómico; listener en tiempo real | Comprobación autenticada sin recarga y limpieza posterior |
| Detectar todos los bloqueos, no solo el primer lote | publicado en `main` y probado | `99ed82c`: barrido completo de generación vigente y calendarios, fecha estable, desbloqueo obsoleto y avisos limitados | Confirmar una ejecución programada del worker posterior al reset |
| Calendario admin con deuda familiar y pago exacto al profesor | desplegado y verificado | `47939bd`, PWA v91 y render productivo con 75 € debidos, 45 € por cobrar y 50 € por pagar | Ninguna adicional para el código; el estado vacío debe renderizar correctamente tras el reset |
| Avisos administrativos claros y concisos | desplegado y verificado | Agrupación por asunto, frases completas, importes y acceso al calendario | Smoke autenticado después del reset |
| Identidad completa y acceso a ficha en todo el admin | desplegado y verificado | `9d48deb`, PWA v92, cobertura estática y render productivo desktop/móvil | Comprobar que sigue operativa tras el reset sin perder CRM |

## Contrato del reset programado

- Proyecto único permitido: `clasesde10-50add`.
- Confirmación destructiva obligatoria: `DELETE_CLASS_FINANCE_DATA`.
- Script auditado fijado por SHA-256 `95E82D3D5F5FF7AE48EAA582BF6638BDB43B9E2444BC97693B2C74D1F70A24BB`.
- Copia local de Firestore y Storage antes de cualquier borrado.
- Estado durable escrito antes de borrar y recuperación idempotente tras interrupción.
- El marcador de éxito solo se crea si `mode=apply`, `verification.clean=true`, el estado durable está `completed` y todos los manifiestos de copia existen.
- Un estado ya completado se limita a verificar y rechaza borrar datos creados posteriormente.

## Secuencia obligatoria de cierre

1. Confirmar la actualización de Codex `26.810.7004.0` o posterior y revisar nuevos eventos de cierre.
2. Esperar el reset programado de las 09:05 CEST sin consumir antes la cuota de Firestore.
3. Inspeccionar todos los logs, el marcador de éxito, el estado durable y los manifiestos/binarios de la copia privada.
4. Ejecutar una verificación independiente de Firestore y Storage para cada contador y ruta del contrato.
5. Ejecutar las comprobaciones autenticadas de CRM, pago completo, asistencia, bloqueo y desbloqueo con datos temporales identificables.
6. Eliminar todos los datos temporales de las comprobaciones y volver a demostrar el estado productivo a cero.
7. Confirmar la primera ejecución correcta del worker exhaustivo posterior al reset.
8. Retirar las tareas programadas temporales y la automatización de seguimiento cuando ya no sean necesarias.
9. Actualizar Q25, Q26 y Q29 y marcar el objetivo completo solo si todas las filas pendientes tienen evidencia directa.
