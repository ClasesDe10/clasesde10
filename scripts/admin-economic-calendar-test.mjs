import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  buildAdminFinancialDaySummaries,
  buildTeacherPayoutDebtBreakdown,
  groupFamilyDebtEntries,
  uniqueTeacherDebtAmount,
} from '../js/admin-economic-calendar.js';

const payout = buildTeacherPayoutDebtBreakdown([
  { id: 'old', teacherUid: 't1', date: '2026-07-10', amount: 20, done: true },
  { id: 'current', teacherUid: 't1', date: '2026-08-05', amount: 30, done: true },
  { id: 'paid', teacherUid: 't1', date: '2026-08-06', amount: 50, done: true, paid: true },
  { id: 'future', teacherUid: 't1', date: '2026-08-20', amount: 40, done: true },
  { id: 'other', teacherUid: 't2', date: '2026-08-05', amount: 90, done: true },
], {
  teacherIds: ['t1'],
  payoutDate: '2026-08-15',
  periodStart: '2026-08-01',
  earnsPayout: (item) => item.done,
  isPaid: (item) => item.paid,
  amount: (item) => item.amount,
});
assert.equal(payout.carryoverAmount, 20, 'Old unpaid classes must carry into the next professor payout.');
assert.equal(payout.currentPeriodAmount, 30, 'Current unpaid classes must remain in the current payout period.');
assert.equal(payout.amount, 50, 'Professor payout must equal every unpaid class due by that date.');
assert.deepEqual(payout.classes.map((item) => item.id), ['old', 'current']);

const familyDebt = groupFamilyDebtEntries([
  { id: 'c1', familyUid: 'f1', familyName: 'Familia Uno', studentId: 's1', studentName: 'Hija Uno', teacherUid: 't1', teacherName: 'Profesor Uno', amount: 35, dueAt: '2026-07-01T20:00:00Z' },
  { id: 'c2', familyUid: 'f1', familyName: 'Familia Uno', studentId: 's2', studentName: 'Hijo Dos', teacherUid: 't1', teacherName: 'Profesor Uno', amount: 40, dueAt: '2026-07-15T20:00:00Z' },
  { id: 'c2', familyUid: 'f1', familyName: 'Familia Uno', studentId: 's2', studentName: 'Hijo Dos', teacherUid: 't1', teacherName: 'Profesor Uno', amount: 40, dueAt: '2026-07-15T20:00:00Z' },
]);
assert.equal(familyDebt.length, 1, 'One family must produce one debt alert.');
assert.equal(familyDebt[0].amount, 75, 'Family debt alert must contain the exact unique class total.');
assert.equal(familyDebt[0].classCount, 2);
assert.equal(familyDebt[0].oldestDueAt, '2026-07-01T20:00:00Z');
assert.deepEqual(familyDebt[0].students.map((item) => item.name), ['Hija Uno', 'Hijo Dos'], 'Debt must retain every related child.');
assert.deepEqual(familyDebt[0].teachers.map((item) => item.name), ['Profesor Uno'], 'Debt must retain each related teacher once.');

const summaries = buildAdminFinancialDaySummaries([
  { id: 'debt', calendarEventType: 'admin_family_debt_alert', amount: 75, paymentGroup: { familyUid: 'f1', amount: 75 } },
  { id: 'collect', calendarEventType: 'admin_family_payment_day', amount: 45, dueDate: '2026-08-15', paymentGroup: { familyUid: 'f2', amount: 45 } },
  { id: 'payout', calendarEventType: 'admin_teacher_payout_day', payoutAmount: 50, payoutDate: '2026-08-15', teacherUid: 't1' },
], { formatMoney: (value) => `${value} €` });
assert.deepEqual(summaries.map((item) => item.label), ['Deben 75 €', 'Cobrar 45 €', 'Pagar 50 €']);
assert.equal(uniqueTeacherDebtAmount([
  { teacherUid: 't1', payoutAmount: 50 },
  { teacherUid: 't1', payoutAmount: 65 },
  { teacherUid: 't2', payoutAmount: 20 },
]), 85, 'Monthly teacher debt must not double-count the same teacher across payout dates.');

const [adminDashboard, calendarModule] = await Promise.all([
  readFile(new URL('../pages/dashboard/admin.html', import.meta.url), 'utf8'),
  readFile(new URL('../js/calendario.js', import.meta.url), 'utf8'),
]);
assert.match(adminDashboard, /buildAdminFamilyDebtCalendarEvents/, 'Admin calendar must add grouped family debt to today.');
assert.match(adminDashboard, /debes pagar exactamente/, 'Professor payout card must state the exact amount as a complete sentence.');
assert.match(adminDashboard, /debe exactamente/, 'Family debt card must state the exact amount as a complete sentence.');
assert.match(adminDashboard, /CLASS_RESET_CUTOFF_ISO/, 'Admin economic queries must honor the active reset generation.');
assert.match(calendarModule, /daySummaryItems/, 'Calendar must support multiple exact financial summaries per day.');

console.log('Admin economic calendar validation passed.');
