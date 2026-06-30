import { answerAdminQuestion, buildAdminAiContext, ADMIN_AI_VERSION } from '../js/admin-ai-engine.js';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const now = '2026-06-28T12:00:00.000Z';
const sample = {
  teachers: [
    { id: 't_inactive', nombre: 'Ana', apellidos: 'Sin Alumnos', status: 'verificado', active: true, trustScore: 72, materias: ['Matematicas'], updatedAt: '2026-05-01T10:00:00Z' },
    { id: 't_slow', nombre: 'Bruno', apellidos: 'Lento', status: 'verificado', active: true, trustScore: 62, materias: ['Fisica'], updatedAt: '2026-06-20T10:00:00Z' },
    { id: 't_top', nombre: 'Clara', apellidos: 'Top', status: 'verificado', active: true, trustScore: 95, materias: ['Ingles', 'Matematicas'], averageRating: 4.9, updatedAt: '2026-06-27T10:00:00Z' },
  ],
  families: [
    { id: 'f_pending', nombre: 'Familia', apellidos: 'Pendiente', status: 'activo', trustScore: 48, ciudad: 'Madrid', updatedAt: '2026-06-20T10:00:00Z' },
    { id: 'f_ok', nombre: 'Familia', apellidos: 'Ok', status: 'activo', trustScore: 86, ciudad: 'Valencia', updatedAt: '2026-06-27T10:00:00Z' },
  ],
  students: [
    { id: 's1', familyUid: 'f_pending', active: true },
    { id: 's2', familyUid: 'f_ok', active: true },
  ],
  assignments: [
    { id: 'a1', teacherUid: 't_top', familyUid: 'f_ok', studentId: 's2', active: true, createdAt: '2026-06-22T10:00:00Z' },
    { id: 'a2', teacherUid: 't_slow', familyUid: 'f_pending', studentId: 's1', active: true, createdAt: '2026-06-18T10:00:00Z' },
  ],
  classes: [
    { id: 'c1', teacherUid: 't_top', familyUid: 'f_ok', studentId: 's2', status: 'realizada', fecha: '2026-06-24', amount: 40, paymentStatus: 'pagado' },
    { id: 'c2', teacherUid: 't_top', familyUid: 'f_ok', studentId: 's2', status: 'realizada', fecha: '2026-06-26', amount: 40, paymentStatus: 'pagado' },
    { id: 'c3', teacherUid: 't_slow', familyUid: 'f_pending', studentId: 's1', status: 'programada', fecha: '2026-06-25', amount: 35, paymentStatus: 'pendiente' },
  ],
  payments: [
    { id: 'p1', familyUid: 'f_pending', status: 'vencido', amount: 70, dueAt: '2026-06-20T10:00:00Z' },
  ],
  requests: [
    { id: 'r1', familyUid: 'f_pending', status: 'nueva', materia: 'Quimica', ciudad: 'Madrid', createdAt: '2026-06-27T10:00:00Z' },
    { id: 'r2', familyUid: 'f_ok', status: 'nueva', materia: 'Quimica', ciudad: 'Madrid', createdAt: '2026-06-26T10:00:00Z' },
    { id: 'r3', familyUid: 'f_ok', status: 'asignada', materia: 'Ingles', ciudad: 'Valencia', assignedTeacherUid: 't_top', createdAt: '2026-06-21T10:00:00Z' },
  ],
  incidents: [
    { id: 'i1', status: 'abierta', tipo: 'Pago', priority: 'alta', createdAt: '2026-06-25T10:00:00Z' },
    { id: 'i2', status: 'abierta', tipo: 'Pago', priority: 'normal', createdAt: '2026-06-26T10:00:00Z' },
    { id: 'i3', status: 'cerrada', tipo: 'Horario', priority: 'normal', createdAt: '2026-06-10T10:00:00Z' },
  ],
  chats: [
    { id: 'chat1', teacherUid: 't_slow', familyUid: 'f_pending' },
  ],
  messages: [
    { id: 'm1', chatId: 'chat1', senderUid: 'f_pending', createdAt: '2026-06-20T08:00:00Z' },
    { id: 'm2', chatId: 'chat1', senderUid: 't_slow', createdAt: '2026-06-21T16:00:00Z' },
  ],
  publicLeads: [
    { id: 'l1', tipo: 'familia', ciudad: 'Madrid', createdAt: '2026-06-27T10:00:00Z' },
  ],
  internalAiInsights: [
    {
      id: 'ia_1',
      title: 'Chat largo que conviene resumir',
      summary: 'Hay una conversacion con demasiados mensajes antes de programar.',
      recommendedAction: 'Resumir chat y fijar siguiente accion.',
      status: 'active',
      priorityScore: 84,
      section: 'chat',
    },
  ],
};

const context = buildAdminAiContext(sample, { now });
assert(context.version === ADMIN_AI_VERSION, 'Context must expose admin AI version.');
assert(context.teacherStats.length === 3, 'Teacher stats must include all teachers.');
assert(context.familyStats.length === 2, 'Family stats must include all families.');

const inactive = answerAdminQuestion('Que profesores llevan mas de un mes sin recibir alumnos?', sample, { now });
assert(inactive.intent === 'inactive_teachers', 'Inactive teacher intent failed.');
assert(inactive.rows.some((item) => item.id === 't_inactive'), 'Inactive teacher must be detected.');

const payments = answerAdminQuestion('Que familias tienen pagos pendientes?', sample, { now });
assert(payments.intent === 'pending_family_payments', 'Pending payment intent failed.');
assert(payments.rows[0].id === 'f_pending', 'Pending family must be first.');

const response = answerAdminQuestion('Que profesores tienen peor tasa de respuesta?', sample, { now });
assert(response.intent === 'teacher_response_risk', 'Teacher response intent failed.');
assert(response.rows[0].id === 't_slow', 'Slow teacher must be first.');

const incidents = answerAdminQuestion('Que incidencias se repiten mas?', sample, { now });
assert(incidents.intent === 'incident_patterns', 'Incident pattern intent failed.');
assert(/Pago/i.test(incidents.rows[0].label), 'Payment incidents must be top pattern.');

const week = answerAdminQuestion('Hazme un resumen de esta semana', sample, { now });
assert(week.intent === 'weekly_summary', 'Weekly summary intent failed.');
assert(week.rows.length >= 5, 'Weekly summary must include operating rows.');

const churn = answerAdminQuestion('Que usuarios podrian abandonar?', sample, { now });
assert(churn.intent === 'churn_risk', 'Churn intent failed.');
assert(churn.rows.some((item) => item.id === 'f_pending'), 'Pending family must be churn risk.');

const highlights = answerAdminQuestion('Que profesores deberia destacar?', sample, { now });
assert(highlights.intent === 'teacher_highlights', 'Teacher highlight intent failed.');
assert(highlights.rows[0].id === 't_top', 'Top teacher must be highlighted first.');

const cities = answerAdminQuestion('Que ciudades estan creciendo mas?', sample, { now });
assert(cities.intent === 'city_growth', 'City growth intent failed.');
assert(cities.rows.length > 0, 'City growth must produce rows.');

const subjects = answerAdminQuestion('Que asignaturas necesitan mas profesores?', sample, { now });
assert(subjects.intent === 'subject_supply_gap', 'Subject gap intent failed.');
assert(subjects.rows[0].label === 'quimica', 'Chemistry must be the largest supply gap.');

const automations = answerAdminQuestion('Que procesos pueden automatizarse?', sample, { now });
assert(automations.intent === 'automation_opportunities', 'Automation intent failed.');
assert(automations.rows.length >= 3, 'Automation answer must include actionable opportunities.');
assert(automations.sourceCollections.includes('internalAiInsights'), 'Automation answer must use internal AI insights as a source.');
assert(automations.rows.some((item) => item.label === 'Chat largo que conviene resumir'), 'Automation answer must surface internal AI priorities first.');

console.log(JSON.stringify({
  ok: true,
  version: ADMIN_AI_VERSION,
  checked: [
    inactive.intent,
    payments.intent,
    response.intent,
    incidents.intent,
    week.intent,
    churn.intent,
    highlights.intent,
    cities.intent,
    subjects.intent,
    automations.intent,
  ],
}, null, 2));
