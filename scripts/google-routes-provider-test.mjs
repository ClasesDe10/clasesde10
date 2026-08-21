#!/usr/bin/env node
import assert from 'node:assert/strict';
import { buildGoogleRoutesWaypoint, computeGoogleRoutesForTeachers } from './google-routes-provider.mjs';

const coordinateWaypoint = buildGoogleRoutesWaypoint({ lat: 40.4168, lng: -3.7038 });
assert.deepEqual(coordinateWaypoint.waypoint.location.latLng, { latitude: 40.4168, longitude: -3.7038 });

const addressWaypoint = buildGoogleRoutesWaypoint({
  direccion: 'Calle de Alcala 10',
  codigo_postal: '28014',
  ciudad: 'Madrid',
});
assert.ok(addressWaypoint.waypoint.address.includes('Calle de Alcala 10'));
assert.equal(addressWaypoint.confidence, 'full_address');
assert.equal(buildGoogleRoutesWaypoint({ ciudad: 'Madrid' }), null);

const requests = [];
const fetchImpl = async (url, init) => {
  const body = JSON.parse(init.body);
  requests.push({ url, headers: init.headers, body });
  const speeds = { WALK: 700, TRANSIT: 420, DRIVE: 240 };
  const elements = body.destinations.map((_, destinationIndex) => ({
    originIndex: 0,
    destinationIndex,
    status: {},
    condition: 'ROUTE_EXISTS',
    distanceMeters: 1000 + destinationIndex * 500,
    duration: `${speeds[body.travelMode] + destinationIndex * 60}s`,
  }));
  return new Response(JSON.stringify(elements), { status: 200 });
};
const credential = {
  async getAccessToken() {
    return { access_token: 'test-access-token', expires_in: 3600 };
  },
};

const result = await computeGoogleRoutesForTeachers({
  origin: { direccion: 'Calle Mayor 1', codigo_postal: '28013', ciudad: 'Madrid' },
  teachers: [
    { id: 'teacher_car', direccion: 'Calle Serrano 1', codigo_postal: '28001', ciudad: 'Madrid', hasCar: true },
    { id: 'teacher_no_car', direccion: 'Paseo Delicias 1', codigo_postal: '28045', ciudad: 'Madrid', hasCar: false },
  ],
  credential,
  projectId: 'clasesde10-50add',
  fetchImpl,
  now: new Date('2026-08-21T12:00:00.000Z'),
});

assert.equal(result.available, true);
assert.equal(result.status, 'ready');
assert.equal(result.billableElements, 5);
assert.equal(requests.length, 3);
assert.deepEqual(requests.map((request) => request.body.travelMode), ['WALK', 'TRANSIT', 'DRIVE']);
assert.equal(requests[2].body.destinations.length, 1, 'Driving must only be requested for teachers with a declared car.');
assert.equal(requests[0].headers.Authorization, 'Bearer test-access-token');
assert.equal(requests[0].headers['X-Goog-User-Project'], 'clasesde10-50add');
assert.ok(requests[0].headers['X-Goog-FieldMask'].includes('distanceMeters'));
assert.equal(result.byTeacher.get('teacher_car').routes.walking.durationSeconds, 700);
assert.equal(result.byTeacher.get('teacher_car').routes.driving.durationSeconds, 240);
assert.equal(result.byTeacher.get('teacher_no_car').routes.driving, undefined);
assert.equal(result.byTeacher.get('teacher_no_car').routes.transit.durationSeconds, 480);

let failedCalls = 0;
const unavailable = await computeGoogleRoutesForTeachers({
  origin: { direccion: 'Calle Mayor 1', codigo_postal: '28013', ciudad: 'Madrid' },
  teachers: [{ id: 'teacher_1', direccion: 'Calle Serrano 1', codigo_postal: '28001', ciudad: 'Madrid' }],
  credential,
  projectId: 'clasesde10-50add',
  fetchImpl: async () => {
    failedCalls += 1;
    return new Response(JSON.stringify({ error: { message: 'Billing must be enabled for Routes API' } }), { status: 403 });
  },
});
assert.equal(unavailable.available, false);
assert.equal(unavailable.status, 'configuration_required');
assert.equal(failedCalls, 1, 'Configuration failures must stop before issuing more mode requests.');

console.log(JSON.stringify({
  ok: true,
  modes: requests.map((request) => request.body.travelMode),
  billableElements: result.billableElements,
  exactTeachers: result.byTeacher.size,
}, null, 2));
