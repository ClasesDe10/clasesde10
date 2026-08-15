import fs from 'node:fs';
import {
  isoDateLocal,
  nextTeacherPayoutDate,
  normalizeTeacherPayoutPreference,
  payoutDatesForMonth,
  previousPayoutDateFor,
} from '../js/teacher-payout-schedule.js';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function dates(preference, year, monthIndex) {
  return payoutDatesForMonth(preference, year, monthIndex).map(isoDateLocal);
}

const every15Days = normalizeTeacherPayoutPreference({
  payoutFrequency: 'quincenal',
  payoutAnchorDate: '2026-08-01',
});
assert(every15Days.configured, 'A valid 15-day payout schedule must be configured.');
assert(
  JSON.stringify(dates(every15Days, 2026, 7)) === JSON.stringify(['2026-08-01', '2026-08-16', '2026-08-31']),
  'A 15-day payout schedule must repeat three times in August 2026 from an August 1 anchor.',
);
assert(
  JSON.stringify(dates(every15Days, 2026, 8)) === JSON.stringify(['2026-09-15', '2026-09-30']),
  'A 15-day payout schedule must continue across month boundaries without resetting.',
);
assert(
  isoDateLocal(nextTeacherPayoutDate(every15Days, new Date(2026, 7, 17))) === '2026-08-31',
  'The next payout date must advance to the following configured 15-day occurrence.',
);

const monthly = normalizeTeacherPayoutPreference({
  payoutFrequency: 'mensual',
  payoutAnchorDate: '2026-01-31',
});
assert(
  JSON.stringify(dates(monthly, 2026, 1)) === JSON.stringify(['2026-02-28']),
  'A monthly payout anchored on the 31st must use the last valid day in a shorter month.',
);
assert(
  JSON.stringify(dates(monthly, 2026, 2)) === JSON.stringify(['2026-03-31']),
  'A monthly payout must return to its original day after a shorter month.',
);
assert(
  isoDateLocal(previousPayoutDateFor(monthly, new Date(2026, 2, 31))) === '2026-02-28',
  'The payout period before March 31 must begin after the adjusted February payout date.',
);

const legacyPreference = normalizeTeacherPayoutPreference({
  frecuencia_cobro_profesor: 'mensual',
  dia_cobro_profesor: 15,
}, new Date(2026, 7, 9));
assert(
  legacyPreference.anchorDate === '2026-08-15' && legacyPreference.frequency === 'mensual',
  'Legacy day-of-month fields must remain compatible with the teacher calendar.',
);

const shortMonthLegacyPreference = normalizeTeacherPayoutPreference({
  frecuencia_cobro_profesor: 'mensual',
  dia_cobro_profesor: 31,
}, new Date(2026, 1, 10));
assert(
  shortMonthLegacyPreference.anchorDate === '2026-02-28'
    && shortMonthLegacyPreference.dayOfMonth === 31
    && shortMonthLegacyPreference.configured,
  'A legacy day 31 must stay valid when it is first normalized during a shorter month.',
);
assert(
  JSON.stringify(dates(shortMonthLegacyPreference, 2026, 2)) === JSON.stringify(['2026-03-31']),
  'A legacy day 31 normalized in February must return to day 31 in March.',
);

assert(
  !normalizeTeacherPayoutPreference({ payoutFrequency: 'mensual' }).configured,
  'A frequency without an anchor date must not generate payout dates.',
);

const professorDashboard = fs.readFileSync('pages/dashboard/profesor.html', 'utf8');
const calendarCss = fs.readFileSync('css/calendar-indicators.css', 'utf8');
for (const label of ['Clase o propuesta', 'Cobro pendiente', 'Fecha de cobro', 'Cobrado', 'Cancelada o revisar']) {
  assert(professorDashboard.includes(`label: '${label}'`), `The teacher calendar legend must explain “${label}”.`);
}
for (const oldLabel of ['Liquidación pendiente', "badge: 'Liquidada'", 'pendientes de liquidar']) {
  assert(!professorDashboard.includes(oldLabel), `The teacher dashboard must not expose the old payout wording “${oldLabel}”.`);
}
assert(
  calendarCss.includes('.dot-indigo { background: #66508d !important; }')
    && calendarCss.includes('.dot-purple { background: #6d28d9 !important; }'),
  'A pending state and a payout date must not share the same color token.',
);
assert(
  professorDashboard.includes('${renderTeacherEconomicStatus(c, economic)}'),
  'The selected-day panel must explain the financial state instead of relying only on color.',
);

console.log('Teacher payout schedule test passed.');
