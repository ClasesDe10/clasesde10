import assert from 'node:assert/strict';
import {
  EXPERIMENTATION_ENGINE_VERSION,
  buildExperimentResults,
  bucketFor,
  evaluateExperiment,
  normalizeExperimentDefinition,
} from '../js/experimentation-engine.js';

const definition = normalizeExperimentDefinition({
  id: 'family_form_v2',
  key: 'family_form_v2',
  type: 'experiment',
  name: 'Formulario familias v2',
  status: 'active',
  rolloutPercent: 100,
  targeting: {
    roles: ['familia'],
    cities: ['madrid'],
    percentage: 100,
    usersNewerThanDays: 30,
  },
  variants: [
    { id: 'control', label: 'Control', weight: 50, enabled: true },
    { id: 'short', label: 'Corto', weight: 50, enabled: true },
  ],
  metrics: {
    primaryEvent: 'form.submitted',
    conversionEvent: 'request.created',
    guardrailEvent: 'form.error',
  },
});

assert.equal(EXPERIMENTATION_ENGINE_VERSION, 'experimentation-engine-2026-06-28');
assert.equal(bucketFor('stable-user') >= 0, true);
assert.equal(definition.key, 'family_form_v2');
assert.equal(definition.variants.length, 2);

const assigned = evaluateExperiment(definition, {
  uid: 'family_1',
  role: 'familia',
  city: 'Madrid centro',
  createdAt: new Date().toISOString(),
});
assert.equal(assigned.matched, true);
assert.equal(assigned.reason === 'assigned' || assigned.reason === 'sticky_assignment', true);
assert.ok(['control', 'short'].includes(assigned.variant.id));

const excluded = evaluateExperiment(definition, {
  uid: 'teacher_1',
  role: 'profesor',
  city: 'Madrid',
  createdAt: new Date().toISOString(),
});
assert.equal(excluded.enabled, false);
assert.equal(excluded.reason, 'role');

const events = [
  { eventName: 'experiment.exposed', sessionId: 's1', metadata: { experiments: { family_form_v2: 'control' } } },
  { eventName: 'experiment.exposed', sessionId: 's2', metadata: { experiments: { family_form_v2: 'short' } } },
  { eventName: 'experiment.exposed', sessionId: 's3', metadata: { experiments: { family_form_v2: 'short' } } },
  { eventName: 'request.created', sessionId: 's2', metadata: { experiments: { family_form_v2: 'short' } } },
  { eventName: 'request.created', sessionId: 's3', metadata: { experiments: { family_form_v2: 'short' } } },
  { eventName: 'form.error', sessionId: 's1', metadata: { experiments: { family_form_v2: 'control' } } },
];
const report = buildExperimentResults([definition], events, { minSampleSize: 1 })[0];
assert.equal(report.key, 'family_form_v2');
assert.equal(report.variants.find((row) => row.variantId === 'short').conversionPct, 100);
assert.equal(report.winner.variantId, 'short');

console.log('Experimentation engine validation passed.');
