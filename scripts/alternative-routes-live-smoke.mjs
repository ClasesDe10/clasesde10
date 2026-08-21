#!/usr/bin/env node

import assert from 'node:assert/strict';
import { buildMobilityEstimate } from '../js/geo-distance-engine.js';
import { computeBestFreeRoutesForTeachers } from './alternative-routes-provider.mjs';

const origin = { codigo_postal: '28001', ciudad: 'Madrid' };
const teacher = { id: 'live_smoke_teacher', codigo_postal: '28005', ciudad: 'Madrid', hasCar: false };
const result = await computeBestFreeRoutesForTeachers({
  origin,
  teachers: [teacher],
  apiKey: process.env.GEOAPIFY_API_KEY || '',
  maxDestinations: 1,
});
assert.equal(result.available, true);
assert.equal(result.byTeacher.size, 1);
const routeEstimate = result.byTeacher.get(teacher.id);
assert.ok(routeEstimate.routes.walking.distanceMeters > 0);
assert.ok(routeEstimate.routes.walking.durationSeconds > 0);
const mobility = buildMobilityEstimate(origin, { ...teacher, routeEstimate });
assert.equal(mobility.available, true);
assert.ok(mobility.walkingMinutes > 0);
assert.ok(mobility.transitMinutes > 0);
assert.equal(mobility.hardDistanceRisk, false);

console.log(JSON.stringify({
  ok: true,
  provider: result.provider,
  status: result.status,
  requests: result.requests,
  billableElements: result.billableElements,
  walking: routeEstimate.routes.walking,
  publicTransport: {
    exact: mobility.mobilityOptions.transit.exact,
    minutes: mobility.transitMinutes,
  },
}, null, 2));
