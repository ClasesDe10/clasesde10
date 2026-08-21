#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  PUBLIC_LEAD_METADATA_LIMITS,
  normalizePublicLeadMetadata,
} from '../js/public-lead-metadata.js';

const longText = 'Necesidad educativa detallada '.repeat(80);
const firestoreRules = fs.readFileSync(new URL('../firebase/firestore.rules', import.meta.url), 'utf8');
const normalized = normalizePublicLeadMetadata({
  alumno: longText,
  materia: longText,
  disponibilidad: longText,
  page_url: longText,
  utm_campaign: longText,
  consent_privacy: true,
  not_allowed: 'must disappear',
});

for (const [key, limit] of Object.entries(PUBLIC_LEAD_METADATA_LIMITS)) {
  const value = normalizePublicLeadMetadata({ [key]: longText })[key];
  assert.equal(value.length, limit, `${key} must be limited to ${limit} characters`);
  assert.match(
    firestoreRules,
    new RegExp(`optionalMetadataString\\('${key}',\\s*${limit}\\)`),
    `${key} must use the same limit in Firestore rules`,
  );
}

assert.equal(normalized.materia.length, 180);
assert.equal(normalized.alumno.length, 160);
assert.equal(normalized.disponibilidad.length, 300);
assert.equal(normalized.page_url.length, 500);
assert.equal(normalized.utm_campaign.length, 160);
assert.equal(normalized.consent_privacy, true);
assert.equal('not_allowed' in normalized, false);
assert.deepEqual(normalizePublicLeadMetadata({ consent_privacy: false }), { consent_privacy: false });

console.log(JSON.stringify({
  ok: true,
  metadataLimitsChecked: Object.keys(PUBLIC_LEAD_METADATA_LIMITS).length,
  longFamilyRequestNormalized: true,
}, null, 2));
