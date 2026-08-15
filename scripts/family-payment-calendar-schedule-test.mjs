import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function read(relativePath) {
  return readFile(path.join(root, relativePath), 'utf8');
}

const familyDashboard = await read('pages/dashboard/familia.html');

assert(
  familyDashboard.includes('function buildFamilyPaymentScheduleCalendarEvents'),
  'Family calendar must build events from saved payment schedules, not only from unpaid class groups.',
);
assert(
  familyDashboard.includes('uniqueFamilyPaymentSchedules()'),
  'Family calendar must iterate unique saved payment schedules.',
);
assert(
  familyDashboard.includes('paymentScheduleDatesForMonth(schedule, anio, mes)'),
  'Family calendar must calculate weekly/biweekly schedule dates for the visible month.',
);
assert(
  familyDashboard.includes("id: `family-payment-schedule-${schedule.id}-${dateIso}`"),
  'Family payment schedule markers must have deterministic ids per schedule day.',
);
assert(
  familyDashboard.includes('mergedPaymentGroupForScheduleDate(schedule, dateIso, groups)'),
  'Family calendar must merge real payable classes into the scheduled payment day marker.',
);
assert(
  familyDashboard.includes('samePaymentRelation(left, right)') && familyDashboard.includes('familyPaymentSameRelation(schedule, group)'),
  'Family calendar must match carryover by strong relation keys, not only by one preferred relation id.',
);
assert(
  familyDashboard.includes('overdueClasses') && familyDashboard.includes('currentPeriodClasses'),
  'Family payment day markers must distinguish current-period classes from overdue carryover.',
);
assert(
  familyDashboard.includes('scheduleOnly: amount <= 0'),
  'Schedule-only payment markers must be distinguishable from payable groups after merging.',
);
assert(
  familyDashboard.includes('previousPaymentScheduleDueAtForDate'),
  'Family payment day markers must explain the period since the previous payment day.',
);
assert(
  familyDashboard.includes('enviar-justificante-calendario'),
  'Family payment day cards must expose a direct proof upload action.',
);
assert(
  familyDashboard.includes('hydratePaymentSchedulesForCalendar(identityResolver)'),
  'Family calendar must enrich schedule-only markers with resolved student and teacher names before rendering.',
);
assert(
  familyDashboard.includes('familyPaymentGroupTitle(group)'),
  'Family payment cards must render names through the shared safe title helper.',
);
assert(
  familyDashboard.includes('alumno pendiente de nombre'),
  'Family dashboard must treat pending-name fallbacks as generic labels, not as real names.',
);
assert(
  familyDashboard.includes('calendarExportItems = [...paymentEvents, ...clasesMes]'),
  'Family payment events must be ordered before classes so the day chip shows payment day.',
);
assert(
  familyDashboard.includes('hasPayableClasses'),
  'Family payment cards must detect whether there are actual pending classes to pay.',
);
assert(
  familyDashboard.includes("group.scheduleOnly ? 'Programado'"),
  'Schedule-only payment cards must show a programmed status.',
);
assert(
  familyDashboard.includes("'Sin importe pendiente'"),
  'Schedule-only payment cards must not show zero euros as payable.',
);
assert(
  familyDashboard.includes('Dia de pago configurado. Ahora mismo no hay clases pendientes'),
  'Schedule-only payment cards must explain that there are no pending classes for that due day.',
);

console.log('Family payment calendar schedule checks passed.');
