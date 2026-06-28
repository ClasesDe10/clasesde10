# Auditoria y arquitectura de pagos

Fecha: 2026-06-28

## Objetivo

Preparar ClasesDe10 para soportar Bizum, Stripe y futuras pasarelas sin reescribir dashboards ni logica de clases. El sistema debe cubrir:

- solicitudes Bizum de profesores,
- justificantes manuales de familias,
- pagos por Stripe/Bizum online,
- conciliacion bancaria futura,
- pagos pendientes y vencidos,
- pagos verificados automaticamente,
- actualizacion automatica de estados de clases cuando sea seguro.

## Estado anterior

- Familias subian justificantes manuales a `pagos`.
- Admin validaba o rechazaba pagos manualmente.
- Profesores podian solicitar Bizum para clases realizadas.
- Admin marcaba Bizum de profesor como pagado y se actualizaban las clases.
- No existia un motor central de pagos.
- No habia distincion clara entre metodo (`bizum`, `card`) y gateway (`manual`, `stripe`, `redsys`).
- Los estados de pago no contemplaban `procesando`, `requiere_accion`, `vencido`, `fallido`, `devuelto` o `disputado`.
- Los pagos familiares no actualizaban clases automaticamente salvo intervencion manual muy limitada.

## Investigacion

Stripe ya soporta Bizum como metodo de pago en Espana. Bizum exige que el comprador tenga IBAN espanol conectado a Bizum, y se puede integrar con Checkout, Elements, Payment Intents o Direct API.

Para automatizacion real, Stripe recomienda webhooks para recibir eventos asincronos cuando un banco confirma pagos, hay disputas o un pago recurrente se completa. Un `PaymentIntent` con estado `succeeded` significa que el flujo de pago se completo y los fondos estan disponibles para cumplir el pedido.

Conclusion tecnica:

- Bizum manual con captura o justificante no se debe validar automaticamente.
- Bizum mediante Stripe, Redsys/TPV o import bancario si puede validarse automaticamente si el evento esta firmado o procede de una fuente confiable.
- La app debe guardar gateway, provider status, idempotency key y referencias externas para conciliacion.

## Arquitectura creada

### Motor central

Archivo: `js/payment-engine.js`

Responsabilidades:

- Normalizar estados de pago.
- Distinguir metodo de pago y gateway.
- Construir payloads de pago de familia y pago a profesor.
- Generar fingerprints/idempotency keys.
- Detectar pagos vencidos.
- Procesar eventos de gateway.
- Marcar pagos verificados.
- Conciliar pagos con clases.
- Construir parches de clase cuando el pago se aplica.

### Tipos

- `family_payment`: pago de familia a ClasesDe10.
- `teacher_payout`: pago de ClasesDe10 a profesor.
- `refund`: devolucion futura.
- `adjustment`: ajuste contable futuro.

### Metodos

- `bizum`
- `card`
- `transferencia`
- `efectivo`
- `stripe_bizum`
- `redsys_bizum`

### Gateways

- `manual`: justificante subido o accion manual.
- `stripe`: Stripe Checkout/Payment Intent.
- `redsys`: Redsys/TPV virtual futuro.
- `bank_import`: conciliacion bancaria futura por CSV/API.

### Estados

- `pendiente`
- `solicitado`
- `procesando`
- `requiere_accion`
- `validado`
- `pagado`
- `vencido`
- `rechazado`
- `fallido`
- `devuelto`
- `disputado`
- `cancelado`

## Reglas de automatizacion

### Se puede validar automaticamente

- Stripe/Redsys/bank import con evento confirmado como `succeeded`, `paid` o equivalente.
- Pago con `classIds` explicitos y estado verificado.
- Pago familiar verificado cuyo importe coincide exactamente con una clase impagada.
- Pago familiar verificado cuyo importe coincide exactamente con la suma de clases impagadas mas antiguas.

### No se debe validar automaticamente

- Captura Bizum subida por familia.
- Transferencia sin movimiento bancario conciliado.
- Pago con importe parecido pero no exacto.
- Pago sin familia/profesor identificable.
- Pago duplicado por referencia dudosa.
- Pago con estado de disputa, devolucion o fallo.

## Cambios implementados

### Familia

El formulario de justificante ahora crea `family_payment` con:

- `gateway = manual`
- `method/metodo`
- `reconciliationStatus`
- `verificationSource`
- `dueAt`
- `idempotencyKey`

El justificante sigue quedando pendiente de validacion; no se autoaprueba.

### Profesor

La solicitud Bizum usa `buildTeacherPayoutPayload`.

Guarda:

- profesor,
- clases vinculadas,
- telefono Bizum,
- estado `solicitado`,
- conciliacion `matched`.

### Admin

Al validar un pago:

- se usa `buildPaymentValidationPayload`,
- si es pago a profesor, marca clases con `teacherPaymentStatus = pagado`,
- si es pago familiar, intenta conciliar con clases impagadas,
- si hay match seguro, marca clases con `familyPaymentStatus = validado`,
- si no hay match seguro, el pago queda validado pero pendiente de revision/conciliacion.

### Worker automatico

Archivo: `scripts/firebase-automation-worker.mjs`

Ahora:

- marca pagos vencidos,
- reconcilia pagos ya verificados,
- aplica pagos a clases,
- deja pagos no conciliables en `needs_review`,
- mantiene recordatorios de pagos pendientes.

## Firestore rules

Se anadio validacion para:

- `validFamilyPaymentCreate`
- `validTeacherPayoutCreate` ampliado

Familias pueden crear solo pagos propios pendientes. Profesores pueden crear solo solicitudes Bizum propias. Admin mantiene control de validacion, rechazo y borrado.

## Stripe/Redsys futuro

Se dejo preparado `stripeWebhook` en `functions/index.js`.

Hace:

- verifica firma con `STRIPE_WEBHOOK_SECRET`,
- procesa eventos relevantes de Checkout/PaymentIntent,
- actualiza el pago en Firestore,
- aplica conciliacion si hay `classIds`,
- registra evento en `automationEvents`.

Para activar Stripe real falta:

1. Crear endpoint HTTPS de webhook.
2. Configurar `STRIPE_SECRET_KEY`.
3. Configurar `STRIPE_WEBHOOK_SECRET`.
4. Crear Checkout Session o PaymentIntent desde backend.
5. Guardar `paymentId`, `checkoutSessionId`, `paymentIntentId`, `gateway = stripe`.
6. En webhook, procesar:
   - `checkout.session.completed`
   - `checkout.session.async_payment_succeeded`
   - `checkout.session.async_payment_failed`
   - `payment_intent.succeeded`
   - `payment_intent.payment_failed`
   - `charge.dispute.created`
7. Aplicar `buildGatewayPaymentUpdate`.
8. Ejecutar conciliacion y actualizar clases.

No se ha desplegado porque requiere credenciales de Stripe y endpoint firmado. La arquitectura local y el codigo de funcion ya estan preparados.

## Riesgos

- Bizum manual no es conciliable sin movimiento bancario o pasarela.
- Si una familia paga varias clases con importe parcial, requiere revision.
- Si dos clases tienen el mismo importe y el pago no trae referencia/clase, puede haber ambiguedad.
- El worker local no puede dry-run contra Firebase Admin SDK sin credenciales ADC o service account.
- Las funciones de webhook no deben desplegarse sin secretos y prueba con Stripe CLI.

## Recomendacion de produccion

1. Mantener manual/Bizum actual para operar hoy.
2. Activar Stripe Checkout con Bizum y tarjeta como primer gateway automatico.
3. Usar webhooks firmados como unica fuente de verdad automatica.
4. Mantener justificantes manuales como fallback.
5. Crear vista admin de `needs_review`.
6. A medio plazo, importar extractos bancarios para conciliacion de transferencias/Bizum manual.

## Fuentes consultadas

- Stripe Bizum docs: `https://docs.stripe.com/payments/bizum/accept-a-payment`
- Stripe PaymentIntent status docs: `https://docs.stripe.com/payments/payment-intents/verifying-status`
- Stripe webhooks docs: `https://docs.stripe.com/webhooks`
- Stripe payment events docs: `https://docs.stripe.com/webhooks/handling-payment-events`
