import assert from 'node:assert/strict';
import {
  CLASS_RESET_CUTOFF_ISO,
  CLASS_RESET_GENERATION,
  classResetWriteFields,
  filterAfterClassReset,
  isAfterClassReset,
  isBusySlotAfterClassReset,
} from '../js/class-reset.js';

assert.equal(CLASS_RESET_GENERATION, 'class-reset-20260816');
assert.equal(CLASS_RESET_CUTOFF_ISO, '2026-08-16T07:05:00.000Z');

assert.equal(isAfterClassReset({ createdAt: '2026-08-16T07:04:00.000Z' }), false);
assert.equal(isAfterClassReset({ createdAt: '2026-08-16T07:06:00.000Z' }), true);
assert.equal(isAfterClassReset({ classResetGeneration: CLASS_RESET_GENERATION }), true);
assert.equal(isAfterClassReset({ createdAfterClassReset: true }), true);

const rows = filterAfterClassReset([
  { id: 'old', createdAt: '2026-08-16T07:04:00.000Z' },
  { id: 'new', ...classResetWriteFields() },
]);
assert.deepEqual(rows.map((row) => row.id), ['new']);

assert.equal(isBusySlotAfterClassReset({ source: 'manual_availability' }), true);
assert.equal(isBusySlotAfterClassReset({ source: 'class', createdAt: '2026-08-16T07:04:00.000Z' }), false);
assert.equal(isBusySlotAfterClassReset({ source: 'class', ...classResetWriteFields() }), true);

console.log('Class reset filtering validation passed.');
