import assert from 'node:assert/strict';
import {
  CLASS_RESET_GENERATION,
  classResetWriteFields,
  filterAfterClassReset,
  isAfterClassReset,
  isBusySlotAfterClassReset,
} from '../js/class-reset.js';

assert.equal(isAfterClassReset({ createdAt: '2026-06-29T19:25:00.000Z' }), false);
assert.equal(isAfterClassReset({ createdAt: '2026-06-29T19:27:00.000Z' }), true);
assert.equal(isAfterClassReset({ classResetGeneration: CLASS_RESET_GENERATION }), true);
assert.equal(isAfterClassReset({ createdAfterClassReset: true }), true);

const rows = filterAfterClassReset([
  { id: 'old', createdAt: '2026-06-29T19:00:00.000Z' },
  { id: 'new', ...classResetWriteFields() },
]);
assert.deepEqual(rows.map((row) => row.id), ['new']);

assert.equal(isBusySlotAfterClassReset({ source: 'manual_availability' }), true);
assert.equal(isBusySlotAfterClassReset({ source: 'class', createdAt: '2026-06-29T19:00:00.000Z' }), false);
assert.equal(isBusySlotAfterClassReset({ source: 'class', ...classResetWriteFields() }), true);

console.log('Class reset filtering validation passed.');
