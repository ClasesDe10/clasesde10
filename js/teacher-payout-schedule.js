const DAY_MS = 24 * 60 * 60 * 1000;

export function normalizePayoutFrequency(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (['mensual', 'monthly', 'mes', 'monthly_payout'].includes(raw)) return 'mensual';
  if (['quincenal', 'biweekly', 'fortnightly', 'cada_15_dias', '15dias', '15_dias'].includes(raw)) return 'quincenal';
  return '';
}

export function parseIsoLocalDate(value) {
  const raw = String(value || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const [year, month, day] = raw.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return Number.isNaN(date.getTime()) ? null : date;
}

export function isoDateLocal(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function addLocalDays(date, days) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

export function daysInMonth(year, monthIndex) {
  return new Date(year, monthIndex + 1, 0).getDate();
}

export function normalizeTeacherPayoutPreference(source = {}, today = new Date()) {
  const frequency = normalizePayoutFrequency(
    source.payoutFrequency
    ?? source.frecuencia_cobro_profesor
    ?? source.payoutCadence
    ?? source.cobro_frecuencia
    ?? source.paymentFrequency
  );
  const rawAnchor = String(
    source.payoutAnchorDate
    ?? source.fecha_inicio_cobro_profesor
    ?? source.teacherPayoutAnchorDate
    ?? source.cobro_fecha_inicio
    ?? ''
  ).slice(0, 10);
  const fallbackDay = Number(
    source.payoutDayOfMonth
    ?? source.dia_cobro_profesor
    ?? source.paymentDayOfMonth
    ?? source.cobro_dia
    ?? 0
  );
  const fallbackAnchor = rawAnchor || (
    Number.isInteger(fallbackDay) && fallbackDay >= 1 && fallbackDay <= 31
      ? isoDateLocal(new Date(
          today.getFullYear(),
          today.getMonth(),
          Math.min(fallbackDay, daysInMonth(today.getFullYear(), today.getMonth())),
        ))
      : ''
  );
  const anchor = parseIsoLocalDate(fallbackAnchor);
  return {
    frequency: frequency || (anchor ? 'quincenal' : ''),
    anchorDate: anchor ? isoDateLocal(anchor) : '',
    dayOfMonth: anchor
      ? (!rawAnchor && Number.isInteger(fallbackDay) && fallbackDay >= 1 && fallbackDay <= 31 ? fallbackDay : anchor.getDate())
      : null,
    configured: Boolean((frequency || anchor) && anchor),
  };
}

export function teacherPayoutFrequencyLabel(frequency) {
  return frequency === 'mensual' ? 'Cobro mensual' : 'Cobro cada 15 días';
}

export function payoutDatesForMonth(preference, year, monthIndex) {
  if (!preference?.configured) return [];
  const anchor = parseIsoLocalDate(preference.anchorDate);
  if (!anchor) return [];
  const monthStart = new Date(year, monthIndex, 1);
  const monthEnd = new Date(year, monthIndex, daysInMonth(year, monthIndex));

  if (preference.frequency === 'mensual') {
    const day = Math.min(preference.dayOfMonth || anchor.getDate(), daysInMonth(year, monthIndex));
    const target = new Date(year, monthIndex, day);
    return target >= anchor && target <= monthEnd ? [target] : [];
  }

  let cursor = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate());
  if (cursor < monthStart) {
    const diffDays = Math.floor((monthStart.getTime() - cursor.getTime()) / DAY_MS);
    cursor = addLocalDays(cursor, Math.floor(diffDays / 15) * 15);
    while (cursor < monthStart) cursor = addLocalDays(cursor, 15);
  }
  const dates = [];
  while (cursor <= monthEnd) {
    if (cursor >= anchor) dates.push(cursor);
    cursor = addLocalDays(cursor, 15);
  }
  return dates;
}

export function previousPayoutDateFor(preference, payoutDate) {
  if (preference.frequency === 'mensual') {
    const prevMonth = new Date(payoutDate.getFullYear(), payoutDate.getMonth() - 1, 1);
    const day = Math.min(preference.dayOfMonth || payoutDate.getDate(), daysInMonth(prevMonth.getFullYear(), prevMonth.getMonth()));
    return new Date(prevMonth.getFullYear(), prevMonth.getMonth(), day);
  }
  return addLocalDays(payoutDate, -15);
}

export function nextTeacherPayoutDate(preference, fromDate = new Date()) {
  if (!preference?.configured) return null;
  const start = new Date(fromDate.getFullYear(), fromDate.getMonth(), fromDate.getDate());
  for (let offset = 0; offset < 18; offset += 1) {
    const cursor = new Date(start.getFullYear(), start.getMonth() + offset, 1);
    const next = payoutDatesForMonth(preference, cursor.getFullYear(), cursor.getMonth())
      .find((date) => date >= start);
    if (next) return next;
  }
  return null;
}
