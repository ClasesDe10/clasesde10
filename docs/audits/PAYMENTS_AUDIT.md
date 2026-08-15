# Auditoria y arquitectura de pagos

Fecha: 2026-06-28

## Objetivo

Preparar ClasesDe10 para pagos por Bizum centralizado, justificantes y futuras
pasarelas opcionales sin reescribir dashboards ni logica de clases. El sistema debe cubrir:

- solicitudes Bizum de profesores,
- justificantes manuales de familias,
- pagos futuros por pasarela si algun dia se decide,
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

Conclusion tecnica:

- Bizum manual con captura o justificante no se debe validar automaticamente.
- La familia paga a ClasesDe10 y el admin valida el justificante antes de marcar clases como pagadas.
- La app debe guardar metodo, estado de conciliacion, idempotency key, clases cubiertas y referencias externas si existen.

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

## Pasarelas futuras

Stripe/Redsys quedan como vocabulario de modelo para una decision futura, no
como parte activa de produccion. No hay webhook productivo ni Cloud Function
preparada que deba desplegarse ahora. Con coste 0, el flujo vigente es Bizum
centralizado al admin, justificante, validacion manual asistida y liquidacion al
profesor.

## Riesgos

- Bizum manual no es conciliable sin movimiento bancario o pasarela.
- Si una familia paga varias clases con importe parcial, requiere revision.
- Si dos clases tienen el mismo importe y el pago no trae referencia/clase, puede haber ambiguedad.
- El worker real necesita secreto de Firebase Admin en GitHub Actions.
- Las pasarelas automaticas futuras tendrian coste/complejidad y requieren una
  decision nueva.

## Recomendacion de produccion

1. Mantener manual/Bizum actual para operar hoy.
2. Mantener una unica forma clara de pago para familias: Bizum a ClasesDe10.
3. Vincular cada justificante al dia de pago y a las clases cubiertas.
4. Crear vista admin de `needs_review`.
5. A medio plazo, importar extractos bancarios para conciliacion si compensa.

## Fuentes consultadas

- Decision interna vigente: Bizum centralizado y justificante revisado por admin.
