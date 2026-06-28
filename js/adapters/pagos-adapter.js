import { makeFirestoreAdapter } from './firebase-firestore-adapter.js';
import { COLLECTIONS } from './contracts.js';

const base = makeFirestoreAdapter(COLLECTIONS.pagos);

export const pagosAdapter = {
  ...base,

  listByFamily(familyUid, options = {}) {
    return base.list({
      ...options,
      filters: [
        ...(options.filters || []),
        { field: 'familyUid', value: familyUid },
      ],
      orderBy: options.orderBy || [{ field: 'createdAt', direction: 'desc' }],
    });
  },

  listByTeacher(teacherUid, options = {}) {
    return base.list({
      ...options,
      filters: [
        ...(options.filters || []),
        { field: 'teacherUid', value: teacherUid },
      ],
      orderBy: options.orderBy || [{ field: 'createdAt', direction: 'desc' }],
    });
  },

  listByStatus(status, options = {}) {
    return base.list({
      ...options,
      filters: [
        ...(options.filters || []),
        { field: 'status', value: status },
      ],
      orderBy: options.orderBy || [{ field: 'createdAt', direction: 'desc' }],
    });
  },

  requestTeacherPayout(teacherUid, payload = {}) {
    const amount = Number(payload.monto ?? payload.amount ?? 0);
    const classIds = Array.isArray(payload.classIds) ? payload.classIds : [];

    return base.create({
      ...payload,
      tipo: 'pago_profesor',
      paymentType: 'teacher_payout',
      teacherUid,
      profesor_id: teacherUid,
      requestedByUid: payload.requestedByUid || teacherUid,
      monto: amount,
      amount,
      metodo: 'bizum',
      estado: 'solicitado',
      status: 'solicitado',
      classIds,
      classCount: classIds.length,
    });
  },

  validatePayment(paymentId, validatedByUid, extra = {}) {
    return base.update(paymentId, {
      ...extra,
      status: 'validado',
      validatedByUid,
      validatedAt: new Date().toISOString(),
    });
  },
};

export default pagosAdapter;
