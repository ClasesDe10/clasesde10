#!/usr/bin/env node

import assert from 'node:assert/strict';
import { buildMobilityEstimate } from '../js/geo-distance-engine.js';
import {
  buildMadridPostalRoutePoint,
  computeBestFreeRoutesForTeachers,
  computeGeoapifyRoutesForTeachers,
  computeOpenStreetMapRoutesForTeachers,
} from './alternative-routes-provider.mjs';

const madridPoint = buildMadridPostalRoutePoint({ codigo_postal: '28001' });
assert.equal(madridPoint.postalCode, '28001');
assert.ok(madridPoint.lat > 40 && madridPoint.lat < 41);
assert.ok(madridPoint.lng < -3 && madridPoint.lng > -4);
assert.equal(buildMadridPostalRoutePoint({ codigo_postal: '46001' }), null);

const osrmRequests = [];
const osrmFetch = async (url, init) => {
  osrmRequests.push({ url: String(url), headers: init.headers });
  const walking = String(url).includes('routed-foot');
  return new Response(JSON.stringify({
    code: 'Ok',
    distances: [walking ? [2_100, 5_400] : [2_700]],
    durations: [walking ? [1_680, 4_320] : [480]],
  }), { status: 200 });
};

const origin = { direccion: 'Calle privada de la familia 1', codigo_postal: '28001', ciudad: 'Madrid' };
const osmTeachers = [
  { id: 'teacher_car', direccion: 'Calle privada profesor 1', codigo_postal: '28002', hasCar: true },
  { id: 'teacher_no_car', direccion: 'Calle privada profesor 2', codigo_postal: '28005', hasCar: false },
  { id: 'teacher_same_postal', direccion: 'Calle privada profesor 3', codigo_postal: '28001', hasCar: true },
];
const osmResult = await computeOpenStreetMapRoutesForTeachers({
  origin,
  teachers: osmTeachers,
  fetchImpl: osrmFetch,
  now: new Date('2026-08-21T15:00:00.000Z'),
});
assert.equal(osmResult.available, true);
assert.equal(osmResult.provider, 'openstreetmap_osrm');
assert.equal(osmResult.status, 'ready_with_estimated_transit');
assert.equal(osmResult.requests, 2);
assert.equal(osrmRequests.length, 2);
assert.ok(osrmRequests.every((request) => request.headers['User-Agent'].includes('ClasesDe10')));
assert.ok(osrmRequests.every((request) => !/Calle|privada|familia|profesor/i.test(request.url)), 'OSRM must receive only generalized postal centroids.');
assert.equal(osmResult.byTeacher.get('teacher_car').routes.walking.distanceMeters, 2_100);
assert.equal(osmResult.byTeacher.get('teacher_car').routes.driving.durationSeconds, 840, 'Driving includes a six-minute parking/access allowance.');
assert.equal(osmResult.byTeacher.get('teacher_no_car').routes.driving, undefined);
assert.equal(osmResult.byTeacher.get('teacher_same_postal').routes.walking.provider, 'official_postal_estimate');
assert.equal(osmResult.byTeacher.get('teacher_car').routes.transit, undefined);

const mixedEstimate = buildMobilityEstimate(origin, {
  ...osmTeachers[0],
  routeEstimate: osmResult.byTeacher.get('teacher_car'),
});
assert.equal(mixedEstimate.available, true);
assert.equal(mixedEstimate.exact, false);
assert.equal(mixedEstimate.networkCalculated, true);
assert.equal(mixedEstimate.provider, 'openstreetmap_osrm');
assert.ok(mixedEstimate.transitMinutes > 0, 'Public transport must remain available as an explicitly estimated mode.');
assert.equal(mixedEstimate.mobilityOptions.transit.exact, false);
assert.equal(mixedEstimate.hardDistanceRisk, false, 'A mixed/estimated fallback cannot silently discard a teacher by distance.');
assert.ok(mixedEstimate.risks.some((risk) => risk.includes('centros de codigo postal')));

const geoapifyRequests = [];
const geoapifyFetch = async (url) => {
  const parsed = new URL(url);
  geoapifyRequests.push(parsed);
  assert.equal(parsed.searchParams.get('apiKey'), 'free-test-key');
  const mode = parsed.searchParams.get('mode');
  const durations = { walk: 840, transit: 660, drive: 360 };
  return new Response(JSON.stringify({ results: [{ distance: 2_400, time: durations[mode] }] }), { status: 200 });
};
const geoapifyResult = await computeGeoapifyRoutesForTeachers({
  origin: { lat: 40.4168, lng: -3.7038 },
  teachers: [
    { id: 'geo_car', lat: 40.4255, lng: -3.684, hasCar: true },
    { id: 'geo_no_car', lat: 40.4082, lng: -3.7105, hasCar: false },
  ],
  apiKey: 'free-test-key',
  fetchImpl: geoapifyFetch,
  now: new Date('2026-08-21T15:00:00.000Z'),
});
assert.equal(geoapifyResult.available, true);
assert.equal(geoapifyResult.status, 'ready');
assert.equal(geoapifyResult.requests, 5);
assert.equal(geoapifyResult.credits, 5);
assert.equal(geoapifyResult.byTeacher.get('geo_car').exact, true);
assert.equal(geoapifyResult.byTeacher.get('geo_car').routes.transit.durationSeconds, 660);
assert.equal(geoapifyResult.byTeacher.get('geo_no_car').routes.driving, undefined);
assert.deepEqual(geoapifyRequests.map((url) => url.searchParams.get('mode')), ['walk', 'transit', 'drive', 'walk', 'transit']);

const fallbackResult = await computeBestFreeRoutesForTeachers({
  origin: { codigo_postal: '28001' },
  teachers: [{ id: 'fallback_teacher', codigo_postal: '28005', hasCar: false }],
  apiKey: '',
  fetchImpl: async () => new Response(JSON.stringify({
    code: 'Ok',
    distances: [[3_100]],
    durations: [[2_100]],
  }), { status: 200 }),
});
assert.equal(fallbackResult.available, true);
assert.equal(fallbackResult.provider, 'openstreetmap_osrm');
assert.equal(fallbackResult.upstream.status, 'credentials_unavailable');
assert.equal(fallbackResult.errors.length, 0, 'A missing optional free key is not an operational error when the no-key fallback succeeds.');

console.log(JSON.stringify({
  ok: true,
  officialPostalCentroid: madridPoint,
  openStreetMapTeachers: osmResult.byTeacher.size,
  geoapifyTeachers: geoapifyResult.byTeacher.size,
  fallbackProvider: fallbackResult.provider,
  privateAddressesSentToOsm: false,
}, null, 2));
