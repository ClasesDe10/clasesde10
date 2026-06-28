'use strict';

const AUTOMATION_ORCHESTRATION_VERSION = 'platform-automation-2026-06-28';

function clean(value, max = 500) {
  return String(value ?? '').trim().slice(0, max);
}

function lower(value) {
  return clean(value).toLowerCase();
}

function slug(...parts) {
  return parts
    .flat()
    .map((part) => clean(part, 180).toLowerCase().replace(/[^a-z0-9_-]+/g, '_'))
    .filter(Boolean)
    .join('__')
    .slice(0, 900);
}

function uniqueById(items) {
  const seen = new Set();
  return items.filter((item) => {
    const id = item.id || slug(item.type, item.entityType, item.entityId, item.title);
    if (!id || seen.has(id)) return false;
    seen.add(id);
    item.id = id;
    return true;
  });
}

function createPlan(event) {
  return {
    version: AUTOMATION_ORCHESTRATION_VERSION,
    event: {
      type: clean(event.type, 120),
      entityType: clean(event.entityType, 80),
      entityId: clean(event.entityId || event.data?.id, 180),
      source: clean(event.source || 'platform', 120),
    },
    automationEvents: [],
    notifications: [],
    systemJobs: [],
    auditLogs: [],
    crmTasks: [],
    opsAlerts: [],
    patches: [],
  };
}

function finalizePlan(plan) {
  plan.automationEvents = uniqueById(plan.automationEvents);
  plan.notifications = uniqueById(plan.notifications);
  plan.systemJobs = uniqueById(plan.systemJobs);
  plan.auditLogs = uniqueById(plan.auditLogs);
  plan.crmTasks = uniqueById(plan.crmTasks);
  plan.opsAlerts = uniqueById(plan.opsAlerts);
  plan.patches = uniqueById(plan.patches);
  return plan;
}

function dataId(event) {
  return clean(event.entityId || event.data?.id || event.data?.uid || event.data?.requestId || event.data?.classId || event.data?.paymentId, 180);
}

function eventBase(event) {
  return slug('evt', event.type, event.entityType, dataId(event));
}

function notificationType(type) {
  return clean(type, 80).replace(/\./g, '_');
}

function addAutomationEvent(plan, event, summary, severity = 'info', payload = {}) {
  const entityId = dataId(event);
  plan.automationEvents.push({
    id: eventBase(event),
    type: clean(event.type, 120),
    entityType: clean(event.entityType, 80),
    entityId,
    source: clean(event.source || 'platform', 120),
    summary: clean(summary, 500),
    severity,
    payload,
    version: AUTOMATION_ORCHESTRATION_VERSION,
  });
}

function addNotification(plan, event, target, title, body, payload = {}, options = {}) {
  const type = notificationType(options.type || payload.type || event.type);
  plan.notifications.push({
    id: slug('ntf', type, dataId(event), target.userUid || target.role || target.targetRole, options.key || ''),
    userUid: clean(target.userUid, 180) || null,
    targetRole: clean(target.targetRole || target.role, 60) || null,
    role: clean(target.role, 60) || null,
    title: clean(title, 140),
    body: clean(body, 1200),
    type,
    priority: clean(options.priority || 'normal', 40),
    channels: options.channels || ['internal', 'browser', 'push'],
    actionUrl: clean(options.actionUrl || payload.url || '/pages/login.html', 500) || '/pages/login.html',
    payload: {
      ...payload,
      type,
      entityType: clean(event.entityType, 80),
      entityId: dataId(event),
    },
  });
}

function addSystemJob(plan, event, type, payload = {}, options = {}) {
  plan.systemJobs.push({
    id: slug('job', type, dataId(event), options.key || ''),
    type: clean(type, 120),
    payload,
    priority: clean(options.priority || 'normal', 40),
    runAfterMinutes: Number(options.runAfterMinutes || 0),
    idempotencyKey: clean(options.idempotencyKey || slug(type, dataId(event), options.key || ''), 300),
    maxAttempts: Math.max(1, Number(options.maxAttempts || 5)),
  });
}

function addAudit(plan, event, action, metadata = {}, actorUid = 'system') {
  const module = (() => {
    const entity = clean(event.entityType, 80);
    const combined = `${entity}.${action}`.toLowerCase();
    if (/auth|login|register|password/.test(combined)) return 'auth';
    if (/profesor|familia|alumno|profile|perfil/.test(combined)) return 'profiles';
    if (/clase|class/.test(combined)) return 'classes';
    if (/pago|payment/.test(combined)) return 'payments';
    if (/solicitud|matching|assignment|asignacion/.test(combined)) return 'matching';
    if (/document/.test(combined)) return 'documents';
    if (/incident|incidencia/.test(combined)) return 'incidents';
    return 'automation';
  })();
  plan.auditLogs.push({
    id: slug('audit', action, event.entityType, dataId(event)),
    schemaVersion: 'audit_log_v1',
    actorUid: clean(actorUid || 'system', 180),
    actorEmail: '',
    actorRole: actorUid === 'system' ? 'system' : '',
    actorType: actorUid === 'system' ? 'automation' : 'user',
    responsibleUid: clean(actorUid || 'system', 180),
    responsibleEmail: '',
    action: clean(action, 120),
    module,
    entityType: clean(event.entityType, 80),
    entityId: dataId(event),
    origin: 'automation',
    source: clean(event.source || 'platform_automation', 120),
    severity: 'info',
    description: clean(action.replaceAll('.', ' '), 300),
    metadata: {
      ...metadata,
      sourceEventType: clean(event.type, 120),
      automationVersion: AUTOMATION_ORCHESTRATION_VERSION,
    },
  });
}

function addCrmTask(plan, event, title, description, options = {}) {
  plan.crmTasks.push({
    id: slug('task', options.type || event.type, event.entityType, dataId(event), options.key || ''),
    title: clean(title, 180),
    description: clean(description, 1200),
    status: 'open',
    priority: clean(options.priority || 'normal', 40),
    ownerRole: clean(options.ownerRole || 'admin', 60),
    entityType: clean(event.entityType, 80),
    entityId: dataId(event),
    tags: Array.isArray(options.tags) ? options.tags.map((tag) => clean(tag, 60)).filter(Boolean) : [],
    dueAfterMinutes: Number(options.dueAfterMinutes || 24 * 60),
    sourceEventType: clean(event.type, 120),
  });
}

function addOpsAlert(plan, event, type, level, message, options = {}) {
  plan.opsAlerts.push({
    id: slug('alert', type, dataId(event), options.key || ''),
    type: clean(type, 120),
    level: clean(level || 'medium', 40),
    status: 'open',
    message: clean(message, 500),
    entityType: clean(event.entityType, 80),
    entityId: dataId(event),
    sourceEventType: clean(event.type, 120),
  });
}

function addPatch(plan, event, collection, id, data, options = {}) {
  const docId = clean(id || dataId(event), 180);
  if (!collection || !docId || !data || typeof data !== 'object') return;
  plan.patches.push({
    id: slug('patch', collection, docId, options.key || event.type),
    collection: clean(collection, 80),
    docId,
    data: {
      ...data,
      automationVersion: AUTOMATION_ORCHESTRATION_VERSION,
    },
  });
}

function firstPresent(data, fields) {
  for (const field of fields) {
    const value = clean(data?.[field], 180);
    if (value) return value;
  }
  return '';
}

function personLabel(data, fallback) {
  return firstPresent(data, ['nombre', 'name', 'displayName', 'email']) || fallback;
}

function subjectLabel(data) {
  return firstPresent(data, ['materia', 'subject', 'asignatura', 'category']) || 'la solicitud';
}

function classLabel(data) {
  const subject = firstPresent(data, ['materia', 'subject', 'asignatura']) || 'clase';
  const date = firstPresent(data, ['fecha', 'date']);
  const time = firstPresent(data, ['hora_inicio', 'startTime', 'hora']);
  return [subject, date, time].filter(Boolean).join(' - ') || subject;
}

function paymentAmountLabel(data) {
  const amount = Number(data?.monto ?? data?.amount ?? data?.importe ?? data?.total ?? 0);
  if (!Number.isFinite(amount) || amount <= 0) return 'importe pendiente';
  return `${Math.round(amount * 100) / 100} EUR`;
}

function userUid(data, fields) {
  return firstPresent(data, fields);
}

function isVerifiedPaymentStatus(data) {
  const status = lower(data?.status || data?.estado || data?.paymentStatus || data?.familyPaymentStatus);
  return ['validado', 'pagado', 'paid', 'succeeded'].includes(status);
}

function isTeacherPayout(data) {
  return ['teacher_payout', 'pago_profesor'].includes(clean(data?.paymentType || data?.tipo, 80));
}

function classHasPaidStatus(data) {
  const status = lower(data?.paymentStatus || data?.familyPaymentStatus || data?.estado_pago || data?.estado_pago_familia);
  return ['validado', 'pagado', 'paid', 'succeeded'].includes(status);
}

function buildAutomationPlan(event) {
  const normalizedEvent = {
    ...event,
    type: clean(event.type, 120),
    entityType: clean(event.entityType, 80),
    entityId: dataId(event),
    data: event.data || {},
  };
  const data = normalizedEvent.data;
  const plan = createPlan(normalizedEvent);
  const id = dataId(normalizedEvent);

  switch (normalizedEvent.type) {
    case 'request.created': {
      addAutomationEvent(plan, normalizedEvent, 'Nueva solicitud capturada y enviada a matching.', 'info', {
        subject: subjectLabel(data),
      });
      addNotification(plan, normalizedEvent, { targetRole: 'admin', role: 'admin' }, 'Nueva solicitud recibida', `${personLabel(data, 'Una familia')} solicita ${subjectLabel(data)}.`, {
        requestId: id,
        url: '/pages/login.html',
      }, { type: 'request_created', priority: 'high' });
      addSystemJob(plan, normalizedEvent, 'matching.request', {
        requestId: id,
        reason: 'request_created',
      }, { priority: 'high', key: 'matching' });
      addSystemJob(plan, normalizedEvent, 'metrics.snapshot', {
        source: 'request.created',
      }, { priority: 'low', key: 'metrics', runAfterMinutes: 5 });
      addAudit(plan, normalizedEvent, 'request.created', {
        subject: subjectLabel(data),
        familyUid: userUid(data, ['familyUid', 'familia_id', 'familyUserUid']),
      });
      if (!firstPresent(data, ['materia', 'subject']) || !firstPresent(data, ['zona', 'city', 'ciudad'])) {
        addCrmTask(plan, normalizedEvent, 'Completar datos de solicitud', 'La solicitud ha llegado con materia o zona incompleta. Revisarla antes de asignar profesor.', {
          priority: 'high',
          tags: ['solicitud', 'datos_incompletos'],
          dueAfterMinutes: 60,
        });
      }
      break;
    }

    case 'request.stale': {
      addAutomationEvent(plan, normalizedEvent, 'Solicitud sin avance detectada por barrido automatico.', 'warning');
      addNotification(plan, normalizedEvent, { targetRole: 'admin', role: 'admin' }, 'Solicitud atascada', `La solicitud ${subjectLabel(data)} sigue sin profesor asignado.`, {
        requestId: id,
        url: '/pages/login.html',
      }, { type: 'request_stale', priority: 'high' });
      addSystemJob(plan, normalizedEvent, 'matching.request', {
        requestId: id,
        reason: 'stale_request',
      }, { priority: 'high', key: 'matching_retry' });
      addCrmTask(plan, normalizedEvent, 'Resolver solicitud sin asignar', 'Revisar candidatos, disponibilidad y datos de contacto para desbloquear la solicitud.', {
        priority: 'high',
        tags: ['matching', 'solicitud'],
        dueAfterMinutes: 120,
      });
      addAudit(plan, normalizedEvent, 'request.stale_detected', { status: data.status || data.estado || '' });
      break;
    }

    case 'assignment.created': {
      const teacherUid = userUid(data, ['teacherUserUid', 'teacherUid', 'profesor_id']);
      const familyUid = userUid(data, ['familyUserUid', 'familyUid', 'familia_id']);
      addAutomationEvent(plan, normalizedEvent, 'Asignacion creada y comunicada a las partes.', 'info', {
        teacherUid,
        familyUid,
      });
      addNotification(plan, normalizedEvent, { userUid: teacherUid, role: 'profesor' }, 'Nueva asignacion', `Tienes una nueva solicitud asignada de ${subjectLabel(data)}.`, {
        requestId: data.requestId || data.solicitud_id || '',
        assignmentId: id,
        url: '/pages/login.html',
      }, { type: 'assignment_created', priority: 'high', key: 'teacher' });
      addNotification(plan, normalizedEvent, { userUid: familyUid, role: 'familia' }, 'Profesor asignado', `Ya hay profesor asignado para ${subjectLabel(data)}.`, {
        requestId: data.requestId || data.solicitud_id || '',
        assignmentId: id,
        url: '/pages/login.html',
      }, { type: 'assignment_created', priority: 'high', key: 'family' });
      addNotification(plan, normalizedEvent, { targetRole: 'admin', role: 'admin' }, 'Asignacion creada', `Se ha asignado profesor para ${subjectLabel(data)}.`, {
        requestId: data.requestId || data.solicitud_id || '',
        assignmentId: id,
        url: '/pages/login.html',
      }, { type: 'assignment_created', priority: 'normal', key: 'admin' });
      addSystemJob(plan, normalizedEvent, 'metrics.snapshot', {
        source: 'assignment.created',
      }, { priority: 'low', key: 'metrics', runAfterMinutes: 5 });
      addAudit(plan, normalizedEvent, 'assignment.created', { teacherUid, familyUid });
      break;
    }

    case 'class.scheduled':
    case 'class.rescheduled': {
      const teacherUid = userUid(data, ['teacherUserUid', 'teacherUid', 'profesor_id']);
      const familyUid = userUid(data, ['familyUserUid', 'familyUid', 'familia_id']);
      const label = classLabel(data);
      const rescheduled = normalizedEvent.type === 'class.rescheduled';
      addAutomationEvent(plan, normalizedEvent, rescheduled ? 'Cambio de horario comunicado.' : 'Clase programada y comunicada.', 'info');
      addNotification(plan, normalizedEvent, { userUid: teacherUid, role: 'profesor' }, rescheduled ? 'Clase reprogramada' : 'Clase programada', `${rescheduled ? 'Nuevo horario para' : 'Tienes programada'} la ${label}.`, {
        classId: id,
        url: '/pages/login.html',
      }, { type: rescheduled ? 'class_schedule_change' : 'class_reminder', priority: rescheduled ? 'high' : 'normal', key: 'teacher' });
      addNotification(plan, normalizedEvent, { userUid: familyUid, role: 'familia' }, rescheduled ? 'Clase reprogramada' : 'Clase programada', `${rescheduled ? 'Nuevo horario para' : 'La clase queda programada:'} ${label}.`, {
        classId: id,
        url: '/pages/login.html',
      }, { type: rescheduled ? 'class_schedule_change' : 'class_reminder', priority: rescheduled ? 'high' : 'normal', key: 'family' });
      addAudit(plan, normalizedEvent, rescheduled ? 'class.rescheduled' : 'class.scheduled', {
        teacherUid,
        familyUid,
        label,
      });
      if (!teacherUid || !familyUid) {
        addCrmTask(plan, normalizedEvent, 'Clase sin participantes completos', 'La clase no tiene profesor o familia resoluble para notificaciones automaticas.', {
          priority: 'high',
          tags: ['clase', 'datos_incompletos'],
          dueAfterMinutes: 60,
        });
      }
      break;
    }

    case 'class.completed': {
      const teacherUid = userUid(data, ['teacherUserUid', 'teacherUid', 'profesor_id']);
      const familyUid = userUid(data, ['familyUserUid', 'familyUid', 'familia_id']);
      const label = classLabel(data);
      addAutomationEvent(plan, normalizedEvent, 'Clase finalizada; se disparan confirmacion, pagos y reputacion.', 'info');
      addNotification(plan, normalizedEvent, { userUid: familyUid, role: 'familia' }, 'Confirma la clase', `Confirma si la ${label} se realizo correctamente.`, {
        classId: id,
        url: '/pages/login.html',
      }, { type: 'class_confirmation_needed', priority: 'high', key: 'family' });
      addNotification(plan, normalizedEvent, { userUid: teacherUid, role: 'profesor' }, 'Clase finalizada', `Revisa y confirma la ${label} para mantener pagos y reputacion al dia.`, {
        classId: id,
        url: '/pages/login.html',
      }, { type: 'class_confirmation_needed', priority: 'high', key: 'teacher' });
      if (!classHasPaidStatus(data)) {
        addCrmTask(plan, normalizedEvent, 'Seguimiento de pago de clase', `La ${label} esta finalizada y no consta como pagada.`, {
          priority: 'high',
          tags: ['pagos', 'clase'],
          dueAfterMinutes: 24 * 60,
        });
      }
      addSystemJob(plan, normalizedEvent, 'metrics.snapshot', {
        source: 'class.completed',
      }, { priority: 'low', key: 'metrics', runAfterMinutes: 5 });
      addAudit(plan, normalizedEvent, 'class.completed', { teacherUid, familyUid, paid: classHasPaidStatus(data) });
      break;
    }

    case 'class.confirmation_overdue': {
      const teacherUid = userUid(data, ['teacherUserUid', 'teacherUid', 'profesor_id']);
      const familyUid = userUid(data, ['familyUserUid', 'familyUid', 'familia_id']);
      const label = classLabel(data);
      addAutomationEvent(plan, normalizedEvent, 'Clase terminada sin confirmacion de asistencia.', 'warning');
      addNotification(plan, normalizedEvent, { userUid: teacherUid, role: 'profesor' }, 'Clase pendiente de marcar', `La ${label} termino y sigue sin cierre completo.`, {
        classId: id,
        url: '/pages/login.html',
      }, { type: 'class_unmarked_after_1h', priority: 'high', key: 'teacher' });
      addNotification(plan, normalizedEvent, { userUid: familyUid, role: 'familia' }, 'Confirma si la clase se dio', `La ${label} termino y necesitamos confirmar si se realizo.`, {
        classId: id,
        url: '/pages/login.html',
      }, { type: 'class_unmarked_after_1h', priority: 'high', key: 'family' });
      addNotification(plan, normalizedEvent, { targetRole: 'admin', role: 'admin' }, 'Clase sin cerrar', `La ${label} sigue pendiente de confirmacion.`, {
        classId: id,
        url: '/pages/login.html',
      }, { type: 'class_unmarked_after_1h', priority: 'high', key: 'admin' });
      addPatch(plan, normalizedEvent, 'clases', id, {
        needsAttendanceConfirmation: true,
        lifecycleStatus: data.lifecycleStatus || 'pendiente_confirmacion',
        lastUnmarkedReminderSource: 'platform_automation',
      });
      addCrmTask(plan, normalizedEvent, 'Cerrar clase pendiente', `Confirmar asistencia y resolver pago de la ${label}.`, {
        priority: 'high',
        tags: ['clase', 'confirmacion'],
        dueAfterMinutes: 180,
      });
      addAudit(plan, normalizedEvent, 'class.confirmation_overdue', { teacherUid, familyUid });
      break;
    }

    case 'class.cancelled': {
      const teacherUid = userUid(data, ['teacherUserUid', 'teacherUid', 'profesor_id']);
      const familyUid = userUid(data, ['familyUserUid', 'familyUid', 'familia_id']);
      addAutomationEvent(plan, normalizedEvent, 'Clase cancelada; se comunica y queda trazada.', 'warning');
      addNotification(plan, normalizedEvent, { userUid: teacherUid, role: 'profesor' }, 'Clase cancelada', `Se ha cancelado la ${classLabel(data)}.`, {
        classId: id,
        url: '/pages/login.html',
      }, { type: 'class_schedule_change', priority: 'high', key: 'teacher' });
      addNotification(plan, normalizedEvent, { userUid: familyUid, role: 'familia' }, 'Clase cancelada', `Se ha cancelado la ${classLabel(data)}.`, {
        classId: id,
        url: '/pages/login.html',
      }, { type: 'class_schedule_change', priority: 'high', key: 'family' });
      addCrmTask(plan, normalizedEvent, 'Revisar cancelacion de clase', 'Comprobar si hay que reprogramar, devolver pago o registrar incidencia.', {
        priority: 'normal',
        tags: ['clase', 'cancelacion'],
        dueAfterMinutes: 24 * 60,
      });
      addAudit(plan, normalizedEvent, 'class.cancelled', { teacherUid, familyUid });
      break;
    }

    case 'payment.created': {
      const familyUid = userUid(data, ['familyUserUid', 'familyUid', 'familia_id']);
      const teacherUid = userUid(data, ['teacherUserUid', 'teacherUid', 'profesor_id']);
      const amount = paymentAmountLabel(data);
      const payout = isTeacherPayout(data);
      addAutomationEvent(plan, normalizedEvent, 'Pago o solicitud de Bizum registrada.', 'info', { amount });
      addNotification(plan, normalizedEvent, { targetRole: 'admin', role: 'admin' }, payout ? 'Bizum de profesor pendiente' : 'Pago pendiente', `${payout ? 'Profesor solicita Bizum' : 'Pago familiar registrado'} por ${amount}.`, {
        paymentId: id,
        url: '/pages/login.html',
      }, { type: payout ? 'teacher_payout_pending' : 'family_payment_pending', priority: 'high', key: 'admin' });
      if (!payout) {
        addNotification(plan, normalizedEvent, { userUid: familyUid, role: 'familia' }, 'Pago registrado', `Hemos registrado un pago pendiente de validar por ${amount}.`, {
          paymentId: id,
          url: '/pages/login.html',
        }, { type: 'family_payment_pending', priority: 'normal', key: 'family' });
      } else {
        addNotification(plan, normalizedEvent, { userUid: teacherUid, role: 'profesor' }, 'Solicitud de Bizum registrada', `Tu solicitud de Bizum por ${amount} queda pendiente de revision.`, {
          paymentId: id,
          url: '/pages/login.html',
        }, { type: 'teacher_payout_pending', priority: 'normal', key: 'teacher' });
      }
      addAudit(plan, normalizedEvent, 'payment.created', { amount, payout });
      if (!Array.isArray(data.classIds) || !data.classIds.length) {
        addCrmTask(plan, normalizedEvent, 'Conciliar pago con clase', 'El pago no tiene clases asociadas explicitamente. Revisar conciliacion automatica o manual.', {
          priority: 'high',
          tags: ['pagos', 'conciliacion'],
          dueAfterMinutes: 24 * 60,
        });
      }
      break;
    }

    case 'payment.overdue': {
      const familyUid = userUid(data, ['familyUserUid', 'familyUid', 'familia_id']);
      const amount = paymentAmountLabel(data);
      addAutomationEvent(plan, normalizedEvent, 'Pago vencido detectado automaticamente.', 'warning', { amount });
      addNotification(plan, normalizedEvent, { userUid: familyUid, role: 'familia' }, 'Pago pendiente vencido', `Hay un pago pendiente de ${amount}.`, {
        paymentId: id,
        url: '/pages/login.html',
      }, { type: 'payment_overdue', priority: 'critical', key: 'family' });
      addNotification(plan, normalizedEvent, { targetRole: 'admin', role: 'admin' }, 'Pago vencido', `Revisar pago vencido por ${amount}.`, {
        paymentId: id,
        url: '/pages/login.html',
      }, { type: 'payment_overdue', priority: 'critical', key: 'admin' });
      addPatch(plan, normalizedEvent, 'pagos', id, {
        status: 'vencido',
        estado: 'vencido',
        overdueDetectedBy: 'platform_automation',
      });
      addCrmTask(plan, normalizedEvent, 'Resolver pago vencido', `Contactar o revisar el pago pendiente por ${amount}.`, {
        priority: 'critical',
        tags: ['pagos', 'vencido'],
        dueAfterMinutes: 120,
      });
      addOpsAlert(plan, normalizedEvent, 'payment_overdue', 'high', `Pago vencido por ${amount}.`);
      addAudit(plan, normalizedEvent, 'payment.overdue', { amount });
      break;
    }

    case 'payment.verified': {
      const familyUid = userUid(data, ['familyUserUid', 'familyUid', 'familia_id']);
      const teacherUid = userUid(data, ['teacherUserUid', 'teacherUid', 'profesor_id']);
      const amount = paymentAmountLabel(data);
      addAutomationEvent(plan, normalizedEvent, 'Pago validado; se actualizan metricas y partes implicadas.', 'info', { amount });
      addNotification(plan, normalizedEvent, { userUid: familyUid, role: 'familia' }, 'Pago confirmado', `El pago de ${amount} queda confirmado.`, {
        paymentId: id,
        url: '/pages/login.html',
      }, { type: 'payment_verified', priority: 'normal', key: 'family' });
      if (teacherUid) {
        addNotification(plan, normalizedEvent, { userUid: teacherUid, role: 'profesor' }, 'Pago de clase confirmado', `Se ha confirmado un pago asociado por ${amount}.`, {
          paymentId: id,
          url: '/pages/login.html',
        }, { type: 'payment_verified', priority: 'normal', key: 'teacher' });
      }
      addSystemJob(plan, normalizedEvent, 'metrics.snapshot', {
        source: 'payment.verified',
      }, { priority: 'low', key: 'metrics', runAfterMinutes: 5 });
      addAudit(plan, normalizedEvent, 'payment.verified', { amount, verified: isVerifiedPaymentStatus(data) });
      break;
    }

    case 'document.created':
    case 'document.stale': {
      const stale = normalizedEvent.type === 'document.stale';
      addAutomationEvent(plan, normalizedEvent, stale ? 'Documento pendiente demasiado tiempo.' : 'Documento pendiente de revision.', stale ? 'warning' : 'info');
      addNotification(plan, normalizedEvent, { targetRole: 'admin', role: 'admin' }, stale ? 'Documento atascado' : 'Documento pendiente de revision', `${data.nombre || data.tipo || 'Documento'} necesita revision.`, {
        documentId: id,
        ownerUid: data.ownerUid || data.userUid || data.usuario_id || '',
        url: '/pages/login.html',
      }, { type: 'document_review_pending', priority: stale ? 'high' : 'normal', key: 'admin' });
      addCrmTask(plan, normalizedEvent, stale ? 'Resolver documento pendiente' : 'Revisar documento', 'Validar, rechazar o pedir correccion del documento subido.', {
        priority: stale ? 'high' : 'normal',
        tags: ['documentos', 'verificacion'],
        dueAfterMinutes: stale ? 120 : 24 * 60,
      });
      if (stale) addOpsAlert(plan, normalizedEvent, 'document_review_stale', 'medium', 'Documento pendiente de revision por demasiado tiempo.');
      addAudit(plan, normalizedEvent, stale ? 'document.stale_detected' : 'document.created', {
        ownerUid: data.ownerUid || data.userUid || data.usuario_id || '',
        documentType: data.tipo || data.type || '',
      });
      break;
    }

    case 'incident.created':
    case 'incident.stale': {
      const stale = normalizedEvent.type === 'incident.stale';
      const priority = lower(data.priority || data.prioridad || '');
      const critical = ['critical', 'critica', 'alta', '1', '2'].includes(priority);
      addAutomationEvent(plan, normalizedEvent, stale ? 'Incidencia abierta sin resolver.' : 'Incidencia registrada.', critical || stale ? 'warning' : 'info');
      addNotification(plan, normalizedEvent, { targetRole: 'admin', role: 'admin' }, stale ? 'Incidencia atascada' : 'Nueva incidencia', clean(data.titulo || data.title || data.descripcion || data.description || 'Incidencia pendiente de revision.', 240), {
        incidentId: id,
        classId: data.classId || data.clase_id || '',
        url: '/pages/login.html',
      }, { type: 'class_incident', priority: critical || stale ? 'critical' : 'high', key: 'admin' });
      addCrmTask(plan, normalizedEvent, stale ? 'Resolver incidencia atascada' : 'Gestionar incidencia', 'Clasificar, contactar a las partes y cerrar con resultado trazado.', {
        priority: critical || stale ? 'critical' : 'high',
        tags: ['incidencias'],
        dueAfterMinutes: critical ? 60 : 24 * 60,
      });
      if (critical || stale) addOpsAlert(plan, normalizedEvent, 'incident_attention_required', stale ? 'high' : 'medium', 'Incidencia requiere atencion administrativa.');
      addAudit(plan, normalizedEvent, stale ? 'incident.stale_detected' : 'incident.created', { priority });
      break;
    }

    case 'profile.updated': {
      const userType = clean(data.userType || normalizedEvent.entityType, 40);
      const userLabel = personLabel(data, userType === 'profesores' ? 'Profesor' : 'Familia');
      const status = lower(data.verificationStatus || data.estado_verificacion || data.status || data.estado);
      addAutomationEvent(plan, normalizedEvent, 'Perfil actualizado; se solicita revision y recalculo reputacional.', 'info', { userType });
      addNotification(plan, normalizedEvent, { targetRole: 'admin', role: 'admin' }, 'Perfil actualizado', `${userLabel} modifico datos relevantes del perfil.`, {
        profileId: id,
        userType,
        url: '/pages/login.html',
      }, { type: status === 'pendiente' ? 'verification_pending' : 'profile_updated', priority: status === 'pendiente' ? 'high' : 'normal', key: 'admin' });
      addAutomationEvent(plan, { ...normalizedEvent, type: 'trust.recalculation_requested' }, 'Recalculo de reputacion solicitado por cambio de perfil.', 'info', { profileId: id, userType });
      if (status === 'pendiente') {
        addCrmTask(plan, normalizedEvent, 'Verificar perfil actualizado', 'Revisar cambios, documentos y nivel de confianza antes de destacarlo.', {
          priority: 'high',
          tags: ['perfil', 'verificacion'],
          dueAfterMinutes: 24 * 60,
        });
      }
      addAudit(plan, normalizedEvent, 'profile.updated', {
        userType,
        verificationStatus: status,
      });
      break;
    }

    case 'teacher.inactive': {
      addAutomationEvent(plan, normalizedEvent, 'Profesor activo sin actividad reciente.', 'warning');
      addNotification(plan, normalizedEvent, { targetRole: 'admin', role: 'admin' }, 'Profesor sin actividad reciente', `${personLabel(data, 'Un profesor')} lleva tiempo sin actividad o alumnos nuevos.`, {
        teacherId: id,
        url: '/pages/login.html',
      }, { type: 'profile_updated', priority: 'normal', key: 'admin' });
      addCrmTask(plan, normalizedEvent, 'Reactivar profesor', 'Comprobar disponibilidad, actualizar perfil o pausar visibilidad si no responde.', {
        priority: 'normal',
        tags: ['profesores', 'reactivacion'],
        dueAfterMinutes: 7 * 24 * 60,
      });
      addAudit(plan, normalizedEvent, 'teacher.inactive_detected', {
        lastActivityAt: data.lastActivityAt || data.updatedAt || '',
      });
      break;
    }

    default: {
      addAutomationEvent(plan, normalizedEvent, `Evento ${normalizedEvent.type} registrado sin reglas especificas.`, 'info');
      addAudit(plan, normalizedEvent, 'automation.event_recorded', {
        sourceEventType: normalizedEvent.type,
      });
    }
  }

  return finalizePlan(plan);
}

module.exports = {
  AUTOMATION_ORCHESTRATION_VERSION,
  buildAutomationPlan,
};
