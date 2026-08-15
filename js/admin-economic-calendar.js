/**
 * Pure helpers for the admin economic calendar.
 * They keep debt aggregation and payout carryover testable outside the dashboard.
 */

function clean(value, max = 240) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').slice(0, max);
}

function money(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : 0;
}

function dateOnly(value) {
  const match = clean(value, 40).match(/^\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : '';
}

function defaultClassId(item = {}) {
  return clean(item.id || item.classId || item.calendarUid, 180);
}

function defaultFamilyKey(item = {}) {
  return clean(item.familyUid || item.familia_id || item.familyId || item.familyName || item.familia_nombre, 180);
}

function defaultTeacherKey(item = {}) {
  return clean(item.teacherUid || item.profesor_id || item.teacherId, 180);
}

/**
 * Returns every completed, unpaid class owed to a teacher by a payout date.
 * Classes before the current period are retained as carryover instead of lost.
 */
export function buildTeacherPayoutDebtBreakdown(classes = [], options = {}) {
  const payoutDate = dateOnly(options.payoutDate);
  const periodStart = dateOnly(options.periodStart);
  const teacherIds = new Set((options.teacherIds || []).map((value) => clean(value, 180)).filter(Boolean));
  const classDate = options.classDate || ((item) => dateOnly(item.date || item.fecha));
  const teacherKey = options.teacherKey || defaultTeacherKey;
  const classId = options.classId || defaultClassId;
  const earnsPayout = options.earnsPayout || (() => true);
  const isPaid = options.isPaid || (() => false);
  const amount = options.amount || ((item) => money(item.teacherAmount || item.importe_profesor));

  const seen = new Set();
  const eligibleClasses = (classes || [])
    .filter((item) => {
      const date = dateOnly(classDate(item));
      const id = classId(item) || `${date}-${teacherKey(item)}-${seen.size}`;
      if (!date || !payoutDate || date > payoutDate || seen.has(id)) return false;
      if (teacherIds.size && !teacherIds.has(clean(teacherKey(item), 180))) return false;
      if (!earnsPayout(item) || isPaid(item) || money(amount(item)) <= 0) return false;
      seen.add(id);
      return true;
    })
    .map((item) => {
      const date = dateOnly(classDate(item));
      return {
        ...item,
        payoutBucket: periodStart && date < periodStart ? 'carryover' : 'current',
      };
    })
    .sort((a, b) => dateOnly(classDate(a)).localeCompare(dateOnly(classDate(b))));

  const carryoverClasses = eligibleClasses.filter((item) => item.payoutBucket === 'carryover');
  const currentPeriodClasses = eligibleClasses.filter((item) => item.payoutBucket !== 'carryover');
  const sum = (items) => money(items.reduce((total, item) => total + money(amount(item)), 0));
  const carryoverAmount = sum(carryoverClasses);
  const currentPeriodAmount = sum(currentPeriodClasses);

  return {
    classes: eligibleClasses,
    carryoverClasses,
    currentPeriodClasses,
    carryoverAmount,
    currentPeriodAmount,
    amount: money(carryoverAmount + currentPeriodAmount),
  };
}

/** Groups class-level overdue facts into one live debt item per family. */
export function groupFamilyDebtEntries(entries = []) {
  const groups = new Map();
  for (const entry of entries || []) {
    const familyKey = defaultFamilyKey(entry);
    if (!familyKey) continue;
    const classId = defaultClassId(entry);
    const dueAt = clean(entry.dueAt || entry.paymentDueAt, 80);
    if (!groups.has(familyKey)) {
      groups.set(familyKey, {
        key: familyKey,
        familyUid: clean(entry.familyUid || entry.familia_id, 180),
        familyName: clean(entry.familyName || entry.familia_nombre, 180) || 'Una familia',
        amount: 0,
        classIds: [],
        classes: [],
        oldestDueAt: dueAt,
      });
    }
    const group = groups.get(familyKey);
    if (classId && group.classIds.includes(classId)) continue;
    if (classId) group.classIds.push(classId);
    group.classes.push(entry);
    group.amount = money(group.amount + money(entry.amount));
    if (dueAt && (!group.oldestDueAt || dueAt < group.oldestDueAt)) group.oldestDueAt = dueAt;
    if (group.familyName === 'Una familia' && clean(entry.familyName || entry.familia_nombre, 180)) {
      group.familyName = clean(entry.familyName || entry.familia_nombre, 180);
    }
  }
  return [...groups.values()]
    .map((group) => ({ ...group, classCount: group.classes.length }))
    .sort((a, b) => b.amount - a.amount || a.familyName.localeCompare(b.familyName));
}

function uniqueEventAmount(items = [], keyGetter, amountGetter) {
  const values = new Map();
  for (const item of items) {
    const key = clean(keyGetter(item), 500) || clean(item.id, 500);
    const amount = money(amountGetter(item));
    if (!key || amount <= 0) continue;
    values.set(key, Math.max(values.get(key) || 0, amount));
  }
  return money([...values.values()].reduce((sum, value) => sum + value, 0));
}

/** Builds up to four concise chips for one admin calendar day. */
export function buildAdminFinancialDaySummaries(items = [], options = {}) {
  const formatMoney = options.formatMoney || ((value) => `${money(value).toFixed(2)} EUR`);
  const debt = items.filter((item) => item.calendarEventType === 'admin_family_debt_alert');
  const familyDue = items.filter((item) => item.calendarEventType === 'admin_family_payment_day' && !item.overdue);
  const teacherDue = items.filter((item) => item.calendarEventType === 'admin_teacher_payout_day' && money(item.payoutAmount) > 0);
  const classes = items.filter((item) => !item.calendarEventType);
  const summaries = [];

  const debtAmount = uniqueEventAmount(
    debt,
    (item) => item.paymentGroup?.familyUid || item.paymentGroup?.familyName || item.id,
    (item) => item.paymentGroup?.amount || item.amount,
  );
  if (debtAmount > 0) summaries.push({ className: 'dot-red', label: `Deben ${formatMoney(debtAmount)}`, count: debt.length });

  const collectionAmount = uniqueEventAmount(
    familyDue,
    (item) => `${item.paymentGroup?.familyUid || item.paymentGroup?.familyName || ''}-${item.dueDate || item.date || ''}`,
    (item) => item.paymentGroup?.amount || item.amount,
  );
  if (collectionAmount > 0) summaries.push({ className: 'dot-navy', label: `Cobrar ${formatMoney(collectionAmount)}`, count: familyDue.length });

  const payoutAmount = uniqueEventAmount(
    teacherDue,
    (item) => `${item.teacherUid || item.teacherName || ''}-${item.payoutDate || item.date || ''}`,
    (item) => item.payoutAmount,
  );
  if (payoutAmount > 0) summaries.push({ className: 'dot-purple', label: `Pagar ${formatMoney(payoutAmount)}`, count: teacherDue.length });

  if (classes.length) {
    summaries.push({
      className: clean(options.classTone?.(classes[0]) || 'dot-blue', 40),
      label: `${classes.length} ${classes.length === 1 ? 'clase' : 'clases'}`,
      count: classes.length,
    });
  }
  return summaries;
}

export function uniqueTeacherDebtAmount(events = []) {
  return uniqueEventAmount(
    events,
    (event) => event.teacherUid || event.teacherName || event.id,
    (event) => event.payoutAmount,
  );
}

