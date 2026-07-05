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

const [calendar, calendarSync, family, professor, css] = await Promise.all([
  read('js/calendario.js'),
  read('js/calendar-sync.js'),
  read('pages/dashboard/familia.html'),
  read('pages/dashboard/profesor.html'),
  read('css/calendar-indicators.css'),
]);

assert(calendar.includes('dayIndicatorMode'), 'Calendar component must support a visible day indicator mode.');
assert(calendar.includes('day-event-summary'), 'Calendar component must render larger day summary chips.');
assert(calendar.includes('daySummaryLabel'), 'Calendar component must allow role-specific day labels.');
assert(css.includes('.day-chip'), 'Dashboard CSS must style larger calendar day chips.');
assert(css.includes('.calendar-actions-bar'), 'Dashboard CSS must style calendar export actions.');

for (const [name, html] of [['family', family], ['professor', professor]]) {
  assert(html.includes('data-action="exportar-calendario-mes"'), `${name} calendar must expose month export action.`);
  assert(html.includes('data-action="exportar-calendario-completo"'), `${name} calendar must expose full calendar export action.`);
  assert(html.includes('calendar-indicators.css'), `${name} calendar must load visible calendar indicator CSS.`);
  assert(html.includes('buildIcsCalendar'), `${name} calendar must generate ICS exports.`);
  assert(html.includes('calendarExportItems'), `${name} calendar must export the visible month events.`);
  assert(html.includes('FULL_CALENDAR_EXPORT_FUTURE_MONTHS'), `${name} calendar must export a complete forward range for mobile calendar import.`);
  assert(html.includes('downloadCalendarItems'), `${name} calendar must share ICS download behavior for month and full exports.`);
  assert(html.includes("dayIndicatorMode: 'summary'"), `${name} calendar must use visible day chips.`);
}

assert(calendarSync.includes('DTSTART;VALUE=DATE'), 'ICS export must support all-day payment/payout events.');
assert(calendarSync.includes('X-WR-CALNAME'), 'ICS export must include a calendar name.');
assert(calendarSync.includes("calendarEventType === 'family_payment_due'"), 'ICS export must name family payment events.');
assert(calendarSync.includes("calendarEventType === 'teacher_payout_day'"), 'ICS export must name teacher payout events.');

console.log('Calendar export UI checks passed.');
