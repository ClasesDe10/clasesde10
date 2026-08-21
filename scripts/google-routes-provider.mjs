const ROUTE_MATRIX_URL = 'https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix';
const FIELD_MASK = 'originIndex,destinationIndex,status,condition,distanceMeters,duration';
const MODE_ORDER = ['WALK', 'TRANSIT', 'DRIVE'];

function clean(value, max = 500) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').slice(0, max);
}

function numberOrNull(value) {
  const raw = String(value ?? '').trim().replace(',', '.');
  if (!raw) return null;
  const number = Number(raw);
  return Number.isFinite(number) ? number : null;
}

function firstNumber(...values) {
  for (const value of values) {
    const number = numberOrNull(value);
    if (number !== null) return number;
  }
  return null;
}

function booleanOrNull(...values) {
  for (const value of values) {
    if (value === true || value === false) return value;
    const normalized = clean(value, 80).toLowerCase();
    if (['si', 'sí', 'yes', 'true', '1'].includes(normalized)) return true;
    if (['no', 'false', '0'].includes(normalized)) return false;
  }
  return null;
}

function coordinates(entity = {}) {
  const location = entity.location || entity.coordinates || entity.geo || {};
  const latitude = firstNumber(entity.lat, entity.latitude, entity.locationLat, location.lat, location.latitude);
  const longitude = firstNumber(entity.lng, entity.lon, entity.longitude, entity.locationLng, location.lng, location.lon, location.longitude);
  if (latitude === null || longitude === null) return null;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  return { latitude, longitude };
}

function addressParts(entity = {}) {
  return [
    entity.address || entity.direccion,
    entity.postalCode || entity.codigo_postal || entity.cp,
    entity.city || entity.ciudad || entity.localidad,
    entity.country || entity.pais || 'España',
  ].map((value) => clean(value, 240)).filter(Boolean);
}

export function buildGoogleRoutesWaypoint(entity = {}) {
  const latLng = coordinates(entity);
  if (latLng) return { waypoint: { location: { latLng } }, confidence: 'coordinates' };
  const parts = addressParts(entity);
  const street = clean(entity.address || entity.direccion, 240);
  const postalCode = clean(entity.postalCode || entity.codigo_postal || entity.cp, 20);
  const city = clean(entity.city || entity.ciudad || entity.localidad, 160);
  if (!street || (!postalCode && !city)) return null;
  return {
    waypoint: { address: [...new Set(parts)].join(', ') },
    confidence: street && postalCode ? 'full_address' : 'partial_address',
  };
}

function durationSeconds(duration) {
  const match = clean(duration, 40).match(/^(\d+(?:\.\d+)?)s$/);
  return match ? Number(match[1]) : null;
}

function modeKey(mode) {
  return ({ WALK: 'walking', TRANSIT: 'transit', DRIVE: 'driving' })[mode];
}

function safeErrorMessage(error) {
  return clean(error?.message || error, 300)
    .replace(/AIza[A-Za-z0-9_-]+/g, '[redacted]')
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [redacted]');
}

function configurationError(error) {
  const text = safeErrorMessage(error).toLowerCase();
  return /(billing|api.*(?:disabled|not.*enabled)|permission|unauthenticated|credential|api key|forbidden|access denied|service_disabled)/.test(text)
    || [401, 403].includes(Number(error?.status));
}

async function authorizationHeaders({ credential, apiKey, projectId }) {
  if (clean(apiKey, 500)) return { 'X-Goog-Api-Key': clean(apiKey, 500) };
  if (!credential || typeof credential.getAccessToken !== 'function') {
    throw new Error('Google Routes OAuth credential unavailable.');
  }
  const tokenResult = await credential.getAccessToken();
  const accessToken = clean(tokenResult?.access_token, 4000);
  if (!accessToken) throw new Error('Google Routes OAuth token unavailable.');
  return {
    Authorization: `Bearer ${accessToken}`,
    ...(clean(projectId, 120) ? { 'X-Goog-User-Project': clean(projectId, 120) } : {}),
  };
}

async function parseResponse(response) {
  const text = await response.text();
  if (!response.ok) {
    let message = text;
    try {
      const body = JSON.parse(text);
      message = body?.error?.message || body?.message || text;
    } catch {
      // Keep the plain response body.
    }
    const error = new Error(`Google Routes ${response.status}: ${clean(message, 500)}`);
    error.status = response.status;
    throw error;
  }
  if (!text.trim()) return [];
  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return text.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
  }
}

async function requestModeMatrix({ origin, destinations, mode, headers, fetchImpl, departureTime }) {
  if (!destinations.length) return [];
  const body = {
    origins: [{ waypoint: origin.waypoint }],
    destinations: destinations.map((destination) => ({ waypoint: destination.waypoint })),
    travelMode: mode,
    languageCode: 'es-ES',
    units: 'METRIC',
  };
  if (mode === 'DRIVE') {
    body.routingPreference = 'TRAFFIC_AWARE';
    body.departureTime = departureTime;
  } else if (mode === 'TRANSIT') {
    body.departureTime = departureTime;
  }
  const response = await fetchImpl(ROUTE_MATRIX_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-FieldMask': FIELD_MASK,
      ...headers,
    },
    body: JSON.stringify(body),
  });
  return parseResponse(response);
}

function routeOptionFromElement(element = {}) {
  const statusCode = Number(element.status?.code || 0);
  const seconds = durationSeconds(element.duration);
  const distanceMeters = numberOrNull(element.distanceMeters);
  if (statusCode !== 0 || element.condition === 'ROUTE_NOT_FOUND' || seconds === null || distanceMeters === null) return null;
  return {
    available: true,
    distanceMeters: Math.round(distanceMeters),
    durationSeconds: Math.round(seconds),
  };
}

/**
 * Computes one-to-many Google Maps routes for matching candidates.
 *
 * The result intentionally excludes addresses and coordinates; only the route
 * metrics needed to explain the matching decision are safe to persist.
 */
export async function computeGoogleRoutesForTeachers({
  origin: originEntity,
  teachers = [],
  credential = null,
  apiKey = '',
  projectId = '',
  fetchImpl = globalThis.fetch,
  maxDestinations = 8,
  now = new Date(),
} = {}) {
  const origin = buildGoogleRoutesWaypoint(originEntity);
  if (!origin) {
    return {
      available: false,
      provider: 'google_routes',
      status: 'origin_incomplete',
      errors: ['La familia no tiene direccion completa o coordenadas para Google Maps.'],
      byTeacher: new Map(),
      billableElements: 0,
    };
  }

  const destinations = teachers.map((teacher) => {
    const id = clean(teacher.teacherUid || teacher.id || teacher.userUid, 180);
    const built = buildGoogleRoutesWaypoint(teacher);
    if (!id || !built) return null;
    return {
      id,
      waypoint: built.waypoint,
      confidence: built.confidence,
      hasCar: booleanOrNull(teacher.hasCar, teacher.tiene_coche, teacher.carAvailable, teacher.vehiculo_propio),
    };
  }).filter(Boolean).slice(0, Math.max(1, Math.min(25, Number(maxDestinations) || 8)));
  if (!destinations.length) {
    return {
      available: false,
      provider: 'google_routes',
      status: 'destinations_incomplete',
      errors: ['Los profesores preseleccionados no tienen direccion completa o coordenadas.'],
      byTeacher: new Map(),
      billableElements: 0,
    };
  }

  if (typeof fetchImpl !== 'function') throw new Error('Google Routes requires a fetch implementation.');
  let headers;
  try {
    headers = await authorizationHeaders({ credential, apiKey, projectId });
  } catch (error) {
    return {
      available: false,
      provider: 'google_routes',
      status: 'credentials_unavailable',
      errors: [safeErrorMessage(error)],
      byTeacher: new Map(),
      billableElements: 0,
    };
  }

  const computedAt = new Date(now).toISOString();
  const departureTime = new Date(new Date(now).getTime() + 2 * 60 * 1000).toISOString();
  const byTeacher = new Map(destinations.map((destination) => [destination.id, {
    provider: 'google_routes',
    providerLabel: 'Google Maps',
    exact: true,
    computedAt,
    confidence: origin.confidence === 'full_address' && destination.confidence === 'full_address'
      ? 'google_routes_full_address'
      : 'google_routes',
    routes: {},
    errors: [],
  }]));
  const errors = [];
  let billableElements = 0;

  for (const mode of MODE_ORDER) {
    const modeDestinations = mode === 'DRIVE'
      ? destinations.filter((destination) => destination.hasCar === true)
      : destinations;
    if (!modeDestinations.length) continue;
    try {
      const elements = await requestModeMatrix({ origin, destinations: modeDestinations, mode, headers, fetchImpl, departureTime });
      billableElements += modeDestinations.length;
      elements.forEach((element) => {
        const destination = modeDestinations[Number(element.destinationIndex || 0)];
        if (!destination) return;
        const option = routeOptionFromElement(element);
        const result = byTeacher.get(destination.id);
        if (option) result.routes[modeKey(mode)] = option;
        else result.errors.push(`${modeKey(mode)}_route_unavailable`);
      });
    } catch (error) {
      const message = safeErrorMessage(error);
      errors.push(`${modeKey(mode)}: ${message}`);
      modeDestinations.forEach((destination) => byTeacher.get(destination.id)?.errors.push(`${modeKey(mode)}_provider_error`));
      if (configurationError(error)) {
        return {
          available: false,
          provider: 'google_routes',
          status: 'configuration_required',
          errors,
          byTeacher: new Map(),
          billableElements,
        };
      }
    }
  }

  [...byTeacher.entries()].forEach(([id, result]) => {
    if (!Object.keys(result.routes).length) byTeacher.delete(id);
  });
  return {
    available: byTeacher.size > 0,
    provider: 'google_routes',
    status: byTeacher.size ? (errors.length ? 'partial' : 'ready') : 'routes_unavailable',
    errors,
    byTeacher,
    billableElements,
    computedAt,
  };
}
