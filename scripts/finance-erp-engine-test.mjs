import assert from 'node:assert/strict';
import {
  FINANCE_ERP_VERSION,
  buildClassFinancialPatch,
  buildClassPricingQuote,
  buildFinanceErpReport,
  estimateTeacherHourlyRate,
  resolveTeacherRateForClass,
} from '../js/finance-erp-engine.js';

const config = {
  business: {
    defaultFamilyHourlyRate: 24,
    defaultTeacherHourlyRate: 18,
  },
  payments: {
    defaultPaymentDueDays: 7,
  },
  finance: {
    lowMarginAlertPct: 15,
    targetMarginPct: 25,
  },
};

const teachers = [
  {
    id: 'teacher-a',
    userUid: 'teacher-a',
    nombre: 'Ana',
    apellidos: 'Lopez',
    ciudad: 'Madrid',
    rateRules: [
      { id: 'math-eso-online', subject: 'Matematicas', level: 'ESO', modality: 'online', hourlyRate: 20 },
      { id: 'piano-fixed', subject: 'Piano', amount: 28 },
    ],
  },
  {
    id: 'teacher-b',
    userUid: 'teacher-b',
    nombre: 'Bruno',
    apellidos: 'Garcia',
    ciudad: 'Valencia',
  },
];

const families = [
  { id: 'family-a', userUid: 'family-a', nombre: 'Familia', apellidos: 'Ruiz', ciudad: 'Madrid' },
  { id: 'family-b', userUid: 'family-b', nombre: 'Familia', apellidos: 'Soler', ciudad: 'Valencia' },
];

const students = [
  { id: 'student-a', nombre: 'Leo', curso: '2 ESO' },
  { id: 'student-b', nombre: 'Nora', curso: 'Piano' },
];

const rate = resolveTeacherRateForClass({
  subject: 'Matematicas',
  level: '2 ESO',
  modality: 'online',
  durationMinutes: 90,
}, teachers[0], [], config);

assert.equal(rate.source, 'teacher_rate_rule');
assert.equal(rate.ruleId, 'math-eso-online');
assert.equal(rate.amount, 30);

const financialPatch = buildClassFinancialPatch({
  subject: 'Piano',
  durationMinutes: 60,
  precio_total: 40,
}, teachers[0], { config });

assert.equal(financialPatch.teacherAmount, 28);
assert.equal(financialPatch.platformFee, 12);
assert.equal(financialPatch.marginPct, 30);

const proratedFinancialPatch = buildClassFinancialPatch({
  subject: 'Matematicas',
  durationMinutes: 90,
  familyHourlyRate: 30,
  teacherHourlyRate: 20,
}, teachers[0], { config });

assert.equal(proratedFinancialPatch.familyAmount, 45);
assert.equal(proratedFinancialPatch.teacherAmount, 30);
assert.equal(proratedFinancialPatch.platformFee, 15);
assert.equal(proratedFinancialPatch.precio_hora_familia, 30);
assert.equal(proratedFinancialPatch.importe_hora_profesor, 20);

const valuedHourly = estimateTeacherHourlyRate({
  id: 'teacher-premium',
  experiencia_anios: 5,
  trustScore: 88,
  nota_bachillerato: 9.1,
  nota_media_universidad: 8.2,
  estado_verificacion: 'verificado',
  profileCompletionPercent: 96,
}, { subject: 'Matematicas Bachillerato' }, config);
assert.ok(valuedHourly > config.business.defaultTeacherHourlyRate, 'Teacher profile valuation must adjust default hourly rate.');

const quote = buildClassPricingQuote({
  subject: 'Matematicas',
  durationMinutes: 60,
}, { id: 'teacher-quote', rateRules: [{ subject: 'Matematicas', hourlyRate: 20 }] }, {
  config: {
    ...config,
    business: {
      ...config.business,
      defaultCommissionPercent: 25,
    },
  },
});
assert.equal(quote.teacherAmount, 20);
assert.ok(quote.familyAmount > quote.teacherAmount, 'Family price must include platform margin over teacher cost.');
assert.ok(quote.platformFee > 0, 'Pricing quote must calculate platform fee.');

const hourlyQuote = buildClassPricingQuote({
  subject: 'Fisica',
  durationMinutes: 45,
  precio_hora_familia: 40,
  importe_hora_profesor: 24,
}, teachers[0], { config });
assert.equal(hourlyQuote.familyAmount, 30);
assert.equal(hourlyQuote.teacherAmount, 18);
assert.equal(hourlyQuote.familyHourlyRate, 40);
assert.equal(hourlyQuote.teacherHourlyRate, 24);

const legacyShortFinancialPatch = buildClassFinancialPatch({
  subject: 'Matematicas',
  fecha: '2026-07-10',
  hora_inicio: '17:30',
  hora_fin: '18:03',
  precio_total: 32,
  importe_profesor: 24,
}, teachers[0], { config });
assert.equal(legacyShortFinancialPatch.familyAmount, 17.6);
assert.equal(legacyShortFinancialPatch.teacherAmount, 13.2);
assert.equal(legacyShortFinancialPatch.platformFee, 4.4);

const hourlyReport = buildFinanceErpReport({
  classes: [{
    id: 'hourly-stale',
    teacherUid: 'teacher-a',
    familyUid: 'family-a',
    fecha: '2026-06-18',
    materia: 'Fisica',
    durationMinutes: 90,
    estado: 'realizada',
    precio_total: 999,
    importe_profesor: 999,
    familyHourlyRate: 40,
    teacherHourlyRate: 25,
    familyPaymentStatus: 'pendiente',
    teacherPaymentStatus: 'pendiente',
  }],
  teachers,
  families,
  students,
}, {
  month: '2026-06',
  config,
  nowIso: '2026-06-28T12:00:00.000Z',
});
assert.equal(hourlyReport.metrics.revenue.earned, 60);
assert.equal(hourlyReport.metrics.costs.teacherAccrued, 37.5);

const report = buildFinanceErpReport({
  classes: [
    {
      id: 'class-1',
      teacherUid: 'teacher-a',
      familyUid: 'family-a',
      studentId: 'student-a',
      fecha: '2026-06-03',
      materia: 'Matematicas',
      nivel: '2 ESO',
      modalidad: 'online',
      durationMinutes: 90,
      estado: 'realizada',
      precio_total: 45,
      familyPaymentStatus: 'validado',
      teacherPaymentStatus: 'pendiente',
    },
    {
      id: 'class-2',
      teacherUid: 'teacher-a',
      familyUid: 'family-a',
      studentId: 'student-b',
      fecha: '2026-06-10',
      materia: 'Piano',
      modalidad: 'presencial',
      estado: 'realizada',
      precio_total: 35,
      importe_profesor: 34,
      familyPaymentStatus: 'pendiente',
      teacherPaymentStatus: 'pendiente',
    },
    {
      id: 'class-3',
      teacherUid: 'teacher-b',
      familyUid: 'family-b',
      fecha: '2026-06-11',
      materia: 'Padel',
      modalidad: 'presencial',
      estado: 'realizada',
      precio_total: 20,
      importe_profesor: 25,
      familyPaymentStatus: 'pendiente',
      teacherPaymentStatus: 'pendiente',
    },
    {
      id: 'class-prev',
      teacherUid: 'teacher-a',
      familyUid: 'family-a',
      fecha: '2026-05-20',
      materia: 'Matematicas',
      modalidad: 'online',
      estado: 'realizada',
      precio_total: 50,
      importe_profesor: 35,
      familyPaymentStatus: 'validado',
      teacherPaymentStatus: 'pagado',
    },
  ],
  payments: [
    {
      id: 'pay-1',
      tipo: 'pago_familia',
      amount: 45,
      status: 'validado',
      createdAt: '2026-06-04T12:00:00.000Z',
      classIds: ['class-1'],
    },
    {
      id: 'pay-2',
      tipo: 'pago_profesor',
      amount: 20,
      status: 'solicitado',
      dueAt: '2026-06-05T12:00:00.000Z',
      createdAt: '2026-06-04T12:00:00.000Z',
      classIds: ['class-1'],
    },
    {
      id: 'pay-3',
      tipo: 'pago_familia',
      amount: 99,
      status: 'validado',
      createdAt: '2026-06-14T12:00:00.000Z',
      reconciliationStatus: 'pending_match',
    },
  ],
  teachers,
  families,
  students,
}, {
  month: '2026-06',
  config,
  nowIso: '2026-06-28T12:00:00.000Z',
});

assert.equal(report.version, FINANCE_ERP_VERSION);
assert.equal(report.metrics.revenue.earned, 100);
assert.equal(report.metrics.costs.teacherAccrued, 89);
assert.equal(report.metrics.profit.gross, 11);
assert.equal(report.metrics.revenue.pending, 55);
assert.equal(report.metrics.costs.teacherPending, 89);
assert.equal(report.metrics.payments.unreconciled, 1);
assert.equal(report.metrics.breakdowns.byTeacher[0].label, 'Ana Lopez');
assert.equal(report.metrics.breakdowns.byCity.some((item) => item.label === 'Madrid'), true);
assert.equal(report.metrics.breakdowns.bySubject.some((item) => item.label === 'Padel'), true);
assert.equal(report.anomalies.some((item) => item.type === 'negative_margin' && item.classId === 'class-3'), true);
assert.equal(report.anomalies.some((item) => item.type === 'low_margin' && item.classId === 'class-2'), true);
assert.equal(report.anomalies.some((item) => item.type === 'unreconciled_payment' && item.paymentId === 'pay-3'), true);
assert.equal(report.csvRows.some((item) => item.tarifa_origen === 'teacher_rate_rule'), true);

console.log('Finance ERP engine validation passed.');
