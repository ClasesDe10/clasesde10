export const CLASS_RESET_CUTOFF_ISO = '2026-06-29T19:26:00.000Z';
export const CLASS_RESET_GENERATION = 'class-reset-20260629';

const CLASS_RESET_CUTOFF_MS = Date.parse(CLASS_RESET_CUTOFF_ISO);

function toMillis(value) {
  if (!value) return NaN;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return Date.parse(value);
  if (typeof value.toDate === 'function') return value.toDate().getTime();
  if (Number.isFinite(Number(value.seconds))) return Number(value.seconds) * 1000;
  return NaN;
}

function firstDateMillis(row = {}) {
  const candidates = [
    row.createdAt,
    row.created_at,
    row.fecha_creacion,
    row.createdAtIso,
    row.created_at_iso,
    row.updatedAt,
    row.updated_at,
  ];
  for (const candidate of candidates) {
    const millis = toMillis(candidate);
    if (Number.isFinite(millis)) return millis;
  }
  return NaN;
}

export function classResetWriteFields() {
  return {
    classResetGeneration: CLASS_RESET_GENERATION,
    createdAfterClassReset: true,
    classResetCutoffIso: CLASS_RESET_CUTOFF_ISO,
  };
}

export function isAfterClassReset(row = {}) {
  if (row.classResetGeneration === CLASS_RESET_GENERATION || row.createdAfterClassReset === true) return true;
  const createdAt = firstDateMillis(row);
  return Number.isFinite(createdAt) && createdAt >= CLASS_RESET_CUTOFF_MS;
}

export function filterAfterClassReset(rows = []) {
  return rows.filter((row) => isAfterClassReset(row));
}

export function isBusySlotAfterClassReset(row = {}) {
  if (row.classResetGeneration === CLASS_RESET_GENERATION || row.createdAfterClassReset === true) return true;
  const source = String(row.source || '').toLowerCase();
  if (!source.includes('class')) return true;
  return isAfterClassReset(row);
}
