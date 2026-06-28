# AI Implementation Report

Fecha: 2026-06-28

## Implementado

- Motor IA determinista y gratuito en `js/ai-engine.js`.
- Scoring de calidad de perfiles de profesores.
- Ranking de profesores para una solicitud concreta.
- Explicaciones de matching: motivos, riesgos y problemas de perfil.
- Diagnostico IA visible en el listado de profesores del admin.
- Diagnostico IA visible en el detalle de cada profesor.
- Recomendaciones IA en el modal de asignacion de solicitudes.
- Bloqueo de asignacion desde recomendacion cuando el profesor no es asignable.
- Prueba unitaria real del motor en `scripts/ai-engine-test.mjs`.
- Smokes de admin ampliados para validar que la IA aparece en navegador real.

## Arquitectura

El motor vive separado del DOM y de Firebase. Es una capa pura, sin red y sin costes:

- Entrada: objetos de profesor y solicitud ya cargados.
- Salida: scores, razones, riesgos, estado de preparacion y acciones siguientes.
- Integracion actual: `pages/dashboard/admin.html`.
- Proxima integracion natural: Functions o worker programado cuando Firebase Functions pueda desplegarse.

## Estado verificado

- `npm.cmd run test:ai-engine`: OK.
- `npm.cmd run check:syntax`: OK.
- `npm.cmd run check:quality`: OK.
- `npm.cmd run check:functions`: OK.
- Local Chrome `http://127.0.0.1:4175`: login admin OK.
- Local Chrome: profesores OK, 26 profesores, diagnostico IA visible.
- Local Chrome: solicitudes OK, 1 solicitud, 5 recomendaciones IA.
- Local Chrome: responsive admin OK, 36 comprobaciones, 0 fallos.
- Produccion `https://clasesde10.com`: login admin OK.
- Produccion `https://clasesde10.com`: profesores OK, diagnostico IA visible.
- Produccion `https://clasesde10.com`: solicitudes OK, 5 recomendaciones IA.
- Produccion `https://clasesde10.com`: responsive admin OK, 36 comprobaciones, 0 fallos.
- Produccion `https://clasesde10-50add.web.app`: mismas pruebas OK.

## Resultado actual

La IA no es decorativa: ya decide el ranking de candidatos, explica por que recomienda cada profesor y evita usar perfiles incompletos desde las recomendaciones.

En el estado real de datos hay 26 profesores y 1 solicitud. El sistema calcula 5 candidatos, pero todos aparecen bloqueados porque ningun profesor activo/verificado cumple todavia el perfil minimo obligatorio.

## Bloqueos externos restantes

- IA generativa, embeddings, RAG, OCR avanzado y asistentes con LLM requieren una clave/modelo o una decision de proveedor.
- Persistir matching automatico en Cloud Functions requiere desplegar Functions; el despliegue estaba bloqueado por facturacion/Blaze.
- Procesamiento de documentos e imagenes depende de Firebase Storage; el bucket seguia bloqueado por permisos externos.

## Siguiente fase recomendada

1. Completar/verificar perfiles de profesores hasta tener al menos un profesor asignable.
2. Migrar el calculo de ranking a Cloud Functions cuando Blaze este disponible.
3. Guardar cada resultado en `solicitudMatches`.
4. Activar un proveedor LLM solo para tareas donde aporte valor medible: resumen de solicitudes, mejora de perfiles, moderacion de mensajes y emails.
