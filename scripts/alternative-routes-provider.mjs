import { madridPostalCentroid } from '../js/madrid-postal-centroids.js';

const GEOAPIFY_GEOCODE_URL = 'https://api.geoapify.com/v1/geocode/search';
const GEOAPIFY_ROUTING_URL = 'https://api.geoapify.com/v1/routing';
const OSRM_ENDPOINTS = Object.freeze({
  walking: 'https://routing.openstreetmap.de/routed-foot/table/v1/driving',
  driving: 'https://routing.openstreetmap.de/routed-car/table/v1/driving',
});
const APP_USER_AGENT = 'ClasesDe10-Matching/1.0 (contacto.clasesde10@gmail.com)';
const APP_REFERER = 'https://clasesde10.com/';
const MODE_ORDER = ['walking', 'transit', 'driving'];
let osrmRequestQueue = Promise.resolve();
let osrmNextRequestAt = 0;

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

function exactCoordinates(entity = {}) {
  const location = entity.location || entity.coordinates || entity.geo || {};
  const lat = firstNumber(entity.lat, entity.latitude, entity.locationLat, location.lat, location.latitude);
  const lng = firstNumber(entity.lng, entity.lon, entity.longitude, entity.locationLng, location.lng, location.lon, location.longitude);
  if (lat === null || lng === null || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng, confidence: 'coordinates' };
}

function postalCode(entity = {}) {
  return clean(entity.postalCode || entity.codigo_postal || entity.cp, 20);
}

export function buildMadridPostalRoutePoint(entity = {}) {
  const code = postalCode(entity);
  const centroid = madridPostalCentroid(code);
  if (!centroid) return null;
  return {
    postalCode: code,
    lat: centroid.lat,
    lng: centroid.lng,
    confidence: 'official_postal_centroid',
  };
}

function addressText(entity = {}) {
  const street = clean(entity.address || entity.direccion, 240);
  const code = postalCode(entity);
  const city = clean(entity.city || entity.ciudad || entity.localidad || 'Madrid', 160);
  if (!street || (!code && !city)) return '';
  return [...new Set([street, code, city, 'España'].filter(Boolean))].join(', ');
}

function safeErrorMessage(error, secret = '') {
  let message = clean(error?.message || error, 300)
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [redacted]')
    .replace(/apiKey=[^&\s]+/gi, 'apiKey=[redacted]');
  if (secret) message = message.replaceAll(secret, '[redacted]');
  return message;
}

async function responseJson(response, provider, secret = '') {
  const text = await response.text();
  if (!response.ok) {
    let detail = text;
    try {
      const body = JSON.parse(text);
      detail = body?.error?.message || body?.message || text;
    } catch {
      // Preserve the provider response for diagnostics.
    }
    const error = new Error(`${provider} ${response.status}: ${safeErrorMessage(detail, secret)}`);
    error.status = response.status;
    throw error;
  }
  return text ? JSON.parse(text) : {};
}

async function geoapifyCoordinate(entity, { apiKey, fetchImpl, cache, counters }) {
  const direct = exactCoordinates(entity);
  if (direct) return direct;
  const address = addressText(entity);
  if (!address) return buildMadridPostalRoutePoint(entity);
  const cacheKey = address.toLowerCase();
  if (cache.has(cacheKey)) return cache.get(cacheKey);
  const query = new URLSearchParams({ text: address, format: 'json', limit: '1', filter: 'countrycode:es', apiKey });
  const response = await fetchImpl(`${GEOAPIFY_GEOCODE_URL}?${query}`, {
    headers: { 'User-Agent': APP_USER_AGENT, Referer: APP_REFERER },
    signal: AbortSignal.timeout(15_000),
  });
  counters.credits += 1;
  counters.requests += 1;
  const body = await responseJson(response, 'Geoapify Geocoding', apiKey);
  const item = Array.isArray(body.results) ? body.results[0] : null;
  const lat = firstNumber(item?.lat);
  const lng = firstNumber(item?.lon);
  const result = lat !== null && lng !== null
    ? { lat, lng, confidence: 'geoapify_full_address' }
    : buildMadridPostalRoutePoint(entity);
  cache.set(cacheKey, result);
  return result;
}

async function geoapifyRoute(origin, destination, mode, { apiKey, fetchImpl, counters }) {
  const query = new URLSearchParams({
    waypoints: `${origin.lat},${origin.lng}|${destination.lat},${destination.lng}`,
    mode: mode === 'walking' ? 'walk' : mode === 'driving' ? 'drive' : 'transit',
    format: 'json',
    lang: 'es',
    apiKey,
  });
  if (mode === 'driving') query.set('traffic', 'approximated');
  const response = await fetchImpl(`${GEOAPIFY_ROUTING_URL}?${query}`, {
    headers: { 'User-Agent': APP_USER_AGENT, Referer: APP_REFERER },
    signal: AbortSignal.timeout(20_000),
  });
  counters.credits += 1;
  counters.requests += 1;
  const body = await responseJson(response, 'Geoapify Routing', apiKey);
  const result = Array.isArray(body.results) ? body.results[0] : body.features?.[0]?.properties;
  const distanceMeters = firstNumber(result?.distance);
  const durationSeconds = firstNumber(result?.time);
  if (distanceMeters === null || durationSeconds === null) return null;
  return {
    available: true,
    exact: origin.confidence !== 'official_postal_centroid' && destination.confidence !== 'official_postal_centroid',
    networkCalculated: true,
    provider: 'geoapify_routes',
    providerLabel: 'Geoapify',
    distanceMeters: Math.round(distanceMeters),
    durationSeconds: Math.round(durationSeconds),
  };
}

export async function computeGeoapifyRoutesForTeachers({
  origin: originEntity,
  teachers = [],
  apiKey = '',
  fetchImpl = globalThis.fetch,
  maxDestinations = 10,
  now = new Date(),
} = {}) {
  const normalizedKey = clean(apiKey, 500);
  if (!normalizedKey) {
    return {
      available: false,
      provider: 'geoapify_routes',
      status: 'credentials_unavailable',
      errors: ['Geoapify free API key is not configured.'],
      byTeacher: new Map(),
      credits: 0,
      requests: 0,
    };
  }
  if (typeof fetchImpl !== 'function') throw new Error('Geoapify requires a fetch implementation.');
  const counters = { credits: 0, requests: 0 };
  const cache = new Map();
  let origin;
  try {
    origin = await geoapifyCoordinate(originEntity, { apiKey: normalizedKey, fetchImpl, cache, counters });
  } catch (error) {
    return {
      available: false,
      provider: 'geoapify_routes',
      status: [401, 403].includes(Number(error?.status)) ? 'configuration_required' : 'provider_unavailable',
      errors: [safeErrorMessage(error, normalizedKey)],
      byTeacher: new Map(),
      credits: counters.credits,
      requests: counters.requests,
    };
  }
  if (!origin) {
    return {
      available: false,
      provider: 'geoapify_routes',
      status: 'origin_incomplete',
      errors: ['Family location could not be resolved.'],
      byTeacher: new Map(),
      credits: counters.credits,
      requests: counters.requests,
    };
  }

  const selected = teachers.slice(0, Math.max(1, Math.min(25, Number(maxDestinations) || 10)));
  const byTeacher = new Map();
  const errors = [];
  const computedAt = new Date(now).toISOString();
  for (const teacher of selected) {
    const id = clean(teacher.teacherUid || teacher.id || teacher.userUid, 180);
    if (!id) continue;
    let destination;
    try {
      destination = await geoapifyCoordinate(teacher, { apiKey: normalizedKey, fetchImpl, cache, counters });
    } catch (error) {
      errors.push(`${id}: ${safeErrorMessage(error, normalizedKey)}`);
      continue;
    }
    if (!destination) continue;
    const hasCar = booleanOrNull(teacher.hasCar, teacher.tiene_coche, teacher.carAvailable, teacher.vehiculo_propio);
    const result = {
      provider: 'geoapify_routes',
      providerLabel: 'Geoapify',
      exact: true,
      calculated: true,
      computedAt,
      confidence: origin.confidence === 'geoapify_full_address' && destination.confidence === 'geoapify_full_address'
        ? 'geoapify_full_address'
        : origin.confidence === 'coordinates' && destination.confidence === 'coordinates'
          ? 'coordinates'
          : 'geoapify_mixed_location',
      routes: {},
      errors: [],
    };
    for (const mode of MODE_ORDER) {
      if (mode === 'driving' && hasCar !== true) continue;
      try {
        const option = await geoapifyRoute(origin, destination, mode, { apiKey: normalizedKey, fetchImpl, counters });
        if (option) result.routes[mode] = option;
        else result.errors.push(`${mode}_route_unavailable`);
      } catch (error) {
        const message = safeErrorMessage(error, normalizedKey);
        result.errors.push(`${mode}_provider_error`);
        errors.push(`${id}/${mode}: ${message}`);
        if ([401, 403, 429].includes(Number(error?.status))) break;
      }
    }
    const options = Object.values(result.routes);
    if (options.length) {
      result.exact = options.every((option) => option.exact === true);
      byTeacher.set(id, result);
    }
  }

  return {
    available: byTeacher.size > 0,
    provider: 'geoapify_routes',
    status: byTeacher.size ? (errors.length ? 'partial' : 'ready') : 'provider_unavailable',
    errors: errors.slice(0, 5),
    byTeacher,
    credits: counters.credits,
    requests: counters.requests,
    computedAt,
  };
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function scheduleOsrmRequest(task) {
  const scheduled = osrmRequestQueue.then(async () => {
    const delay = Math.max(0, osrmNextRequestAt - Date.now());
    if (delay) await wait(delay);
    osrmNextRequestAt = Date.now() + 1_100;
    return task();
  });
  osrmRequestQueue = scheduled.catch(() => undefined);
  return scheduled;
}

async function osrmMatrix(origin, destinations, mode, fetchImpl) {
  if (!destinations.length) return [];
  const coordinates = [origin, ...destinations]
    .map((point) => `${Number(point.lng).toFixed(6)},${Number(point.lat).toFixed(6)}`)
    .join(';');
  const destinationIndexes = destinations.map((_, index) => index + 1).join(';');
  const url = `${OSRM_ENDPOINTS[mode]}/${coordinates}?sources=0&destinations=${destinationIndexes}&annotations=distance,duration`;
  return scheduleOsrmRequest(async () => {
    const response = await fetchImpl(url, {
      headers: { 'User-Agent': APP_USER_AGENT, Referer: APP_REFERER },
      signal: AbortSignal.timeout(20_000),
    });
    const body = await responseJson(response, 'OpenStreetMap OSRM');
    if (body.code !== 'Ok') throw new Error(`OpenStreetMap OSRM returned ${clean(body.code || 'unknown_status', 80)}.`);
    return destinations.map((_, index) => ({
      distanceMeters: firstNumber(body.distances?.[0]?.[index]),
      durationSeconds: firstNumber(body.durations?.[0]?.[index]),
    }));
  });
}

function samePostalOption(mode) {
  if (mode === 'walking') {
    return {
      available: true,
      exact: false,
      networkCalculated: false,
      provider: 'official_postal_estimate',
      providerLabel: 'Callejero oficial de Madrid',
      distanceMeters: 1_500,
      durationSeconds: 19 * 60,
    };
  }
  return {
    available: true,
    exact: false,
    networkCalculated: false,
    provider: 'official_postal_estimate',
    providerLabel: 'Callejero oficial de Madrid',
    distanceMeters: 1_600,
    durationSeconds: 10 * 60,
  };
}

export async function computeOpenStreetMapRoutesForTeachers({
  origin: originEntity,
  teachers = [],
  fetchImpl = globalThis.fetch,
  maxDestinations = 10,
  now = new Date(),
} = {}) {
  const origin = buildMadridPostalRoutePoint(originEntity);
  if (!origin) {
    return {
      available: false,
      provider: 'openstreetmap_osrm',
      status: 'origin_postal_unavailable',
      errors: ['Family postal code is outside the local Madrid centroid dataset.'],
      byTeacher: new Map(),
      requests: 0,
      billableElements: 0,
    };
  }
  if (typeof fetchImpl !== 'function') throw new Error('OpenStreetMap routing requires a fetch implementation.');
  const selected = teachers.map((teacher) => ({
    teacher,
    id: clean(teacher.teacherUid || teacher.id || teacher.userUid, 180),
    point: buildMadridPostalRoutePoint(teacher),
    hasCar: booleanOrNull(teacher.hasCar, teacher.tiene_coche, teacher.carAvailable, teacher.vehiculo_propio),
  })).filter((item) => item.id && item.point).slice(0, Math.max(1, Math.min(25, Number(maxDestinations) || 10)));
  if (!selected.length) {
    return {
      available: false,
      provider: 'openstreetmap_osrm',
      status: 'destinations_postal_unavailable',
      errors: ['Candidate postal codes are outside the local Madrid centroid dataset.'],
      byTeacher: new Map(),
      requests: 0,
      billableElements: 0,
    };
  }

  const computedAt = new Date(now).toISOString();
  const byTeacher = new Map(selected.map((item) => [item.id, {
    provider: 'openstreetmap_osrm',
    providerLabel: 'OpenStreetMap',
    exact: false,
    calculated: true,
    computedAt,
    confidence: 'official_postal_centroid_network',
    routes: {},
    errors: ['transit_estimated'],
    attribution: '© OpenStreetMap contributors',
    attributionUrl: 'https://www.openstreetmap.org/copyright',
    fixMapUrl: 'https://www.openstreetmap.org/fixthemap',
  }]));
  const errors = [];
  let requests = 0;
  for (const mode of ['walking', 'driving']) {
    const eligible = selected.filter((item) => mode !== 'driving' || item.hasCar === true);
    const samePostal = eligible.filter((item) => item.point.postalCode === origin.postalCode);
    samePostal.forEach((item) => { byTeacher.get(item.id).routes[mode] = samePostalOption(mode); });
    const routed = eligible.filter((item) => item.point.postalCode !== origin.postalCode);
    if (!routed.length) continue;
    try {
      const matrix = await osrmMatrix(origin, routed.map((item) => item.point), mode, fetchImpl);
      requests += 1;
      matrix.forEach((option, index) => {
        const item = routed[index];
        const distanceMeters = firstNumber(option.distanceMeters);
        const rawDurationSeconds = firstNumber(option.durationSeconds);
        if (!item || distanceMeters === null || rawDurationSeconds === null) {
          if (item) byTeacher.get(item.id).errors.push(`${mode}_route_unavailable`);
          return;
        }
        const accessOverheadSeconds = mode === 'driving' ? 6 * 60 : 0;
        byTeacher.get(item.id).routes[mode] = {
          available: true,
          exact: false,
          networkCalculated: true,
          provider: 'openstreetmap_osrm',
          providerLabel: 'OpenStreetMap',
          distanceMeters: Math.round(distanceMeters),
          durationSeconds: Math.round(rawDurationSeconds + accessOverheadSeconds),
          routeDurationSeconds: Math.round(rawDurationSeconds),
          accessOverheadSeconds,
        };
      });
    } catch (error) {
      errors.push(`${mode}: ${safeErrorMessage(error)}`);
      routed.forEach((item) => byTeacher.get(item.id).errors.push(`${mode}_provider_error`));
    }
  }

  [...byTeacher.entries()].forEach(([id, result]) => {
    if (!Object.keys(result.routes).length) byTeacher.delete(id);
  });
  return {
    available: byTeacher.size > 0,
    provider: 'openstreetmap_osrm',
    status: byTeacher.size ? (errors.length ? 'partial' : 'ready_with_estimated_transit') : 'routes_unavailable',
    errors: errors.slice(0, 5),
    byTeacher,
    requests,
    billableElements: 0,
    computedAt,
  };
}

export async function computeBestFreeRoutesForTeachers(options = {}) {
  const geoapify = await computeGeoapifyRoutesForTeachers(options);
  const geoapifyIds = new Set(geoapify.byTeacher?.keys?.() || []);
  const remainingTeachers = (options.teachers || []).filter((teacher) => {
    const id = clean(teacher.teacherUid || teacher.id || teacher.userUid, 180);
    return id && !geoapifyIds.has(id);
  });
  const openStreetMap = remainingTeachers.length
    ? await computeOpenStreetMapRoutesForTeachers({ ...options, teachers: remainingTeachers })
    : {
      available: false,
      provider: 'openstreetmap_osrm',
      status: 'not_required',
      errors: [],
      byTeacher: new Map(),
      requests: 0,
      billableElements: 0,
    };
  const byTeacher = new Map(openStreetMap.byTeacher || []);
  (geoapify.byTeacher || new Map()).forEach((value, key) => byTeacher.set(key, value));
  const providers = [...new Set([...byTeacher.values()].map((item) => item.provider).filter(Boolean))];
  return {
    available: byTeacher.size > 0,
    provider: providers.length > 1 ? 'free_route_cascade' : providers[0] || openStreetMap.provider,
    status: byTeacher.size ? (geoapify.available ? 'ready_free_cascade' : openStreetMap.status) : 'routes_unavailable',
    byTeacher,
    credits: Number(geoapify.credits || 0),
    requests: Number(geoapify.requests || 0) + Number(openStreetMap.requests || 0),
    billableElements: 0,
    computedAt: geoapify.computedAt || openStreetMap.computedAt || '',
    upstream: { provider: geoapify.provider, status: geoapify.status },
    fallbackChain: ['geoapify_routes', 'openstreetmap_osrm'],
    errors: [
      ...(geoapify.available || ['credentials_unavailable', 'configuration_required'].includes(geoapify.status) ? [] : (geoapify.errors || [])),
      ...(openStreetMap.errors || []),
    ].slice(0, 5),
  };
}
