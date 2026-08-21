/**
 * Explainable mobility scoring for teacher matching.
 *
 * Route data is produced server-side by a provider cascade and injected through
 * `destination.routeEstimate`. Every mode keeps its own provider and precision
 * so a network calculation and a heuristic estimate can never be confused.
 */

export const MOBILITY_MATCHING_VERSION = 'mobility_matching_v3_provider_cascade';
export const DEFAULT_WALK_MAX_MINUTES = 30;
export const DEFAULT_CAR_MAX_MINUTES = 20;
export const DEFAULT_TRANSIT_REVIEW_MINUTES = 35;

const MODE_META = Object.freeze({
  walking: { label: 'A pie' },
  transit: { label: 'Transporte publico' },
  driving: { label: 'Coche' },
});

function clean(value, max = 1000) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').slice(0, max);
}

function normalizeText(value) {
  return clean(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function numberOrNull(value) {
  const raw = clean(value).replace(',', '.');
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

function round(value, decimals = 0) {
  const factor = 10 ** decimals;
  return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
}

function clamp(value, min = 0, max = 1) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.max(min, Math.min(max, number));
}

function booleanOrNull(...values) {
  for (const value of values) {
    if (value === true || value === false) return value;
    const text = normalizeText(value);
    if (!text) continue;
    if (['si', 'yes', 'true', '1', 'coche', 'vehiculo', 'vehiculo propio'].includes(text)) return true;
    if (['no', 'false', '0', 'sin coche', 'transporte publico'].includes(text)) return false;
  }
  return null;
}

function coordinatePair(entity = {}) {
  const source = entity.location || entity.coordinates || entity.geo || {};
  const lat = firstNumber(entity.lat, entity.latitude, entity.locationLat, entity.geoLat, source.lat, source.latitude);
  const lng = firstNumber(entity.lng, entity.lon, entity.long, entity.longitude, entity.locationLng, entity.geoLng, source.lng, source.lon, source.long, source.longitude);
  if (lat === null || lng === null) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}

function firstText(entity = {}, fields = []) {
  for (const field of fields) {
    const value = clean(entity[field], 240);
    if (value) return value;
  }
  return '';
}

function tokenize(value) {
  return normalizeText(value).split(/[^a-z0-9]+/).filter((item) => item.length > 2);
}

function overlapCount(a, b) {
  if (!a.size || !b.size) return 0;
  return [...a].filter((item) => b.has(item)).length;
}

function distanceKmBetween(a, b) {
  const radiusKm = 6371;
  const toRad = (value) => (value * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return round(2 * radiusKm * Math.asin(Math.sqrt(h)), 1);
}

function postalDistanceEstimateKm(originPostal, destinationPostal) {
  const origin = clean(originPostal);
  const destination = clean(destinationPostal);
  if (!/^\d{5}$/.test(origin) || !/^\d{5}$/.test(destination)) return null;
  if (origin === destination) return 1.2;
  if (origin.slice(0, 3) === destination.slice(0, 3)) {
    return round(Math.min(7.5, 1.8 + Math.abs(Number(origin.slice(3)) - Number(destination.slice(3))) * 0.38), 1);
  }
  if (origin.slice(0, 2) === destination.slice(0, 2)) {
    return round(Math.min(22, 7 + Math.abs(Number(origin.slice(2)) - Number(destination.slice(2))) * 0.18), 1);
  }
  return round(35 + Math.abs(Number(origin.slice(0, 2)) - Number(destination.slice(0, 2))) * 18, 1);
}

function sameStreetConfidence(originAddress, destinationAddress) {
  const ignored = new Set(['calle', 'avenida', 'avda', 'plaza', 'paseo', 'numero', 'piso']);
  const originTokens = tokenize(originAddress).filter((token) => !ignored.has(token));
  const destinationTokens = tokenize(destinationAddress).filter((token) => !ignored.has(token));
  if (!originTokens.length || !destinationTokens.length) return false;
  return overlapCount(new Set(originTokens), new Set(destinationTokens)) >= Math.min(2, originTokens.length);
}

function estimateStraightKm(origin = {}, destination = {}) {
  const originCoords = coordinatePair(origin);
  const destinationCoords = coordinatePair(destination);
  if (originCoords && destinationCoords) {
    return { km: distanceKmBetween(originCoords, destinationCoords), confidence: 'coordinates' };
  }

  const originPostal = firstText(origin, ['postalCode', 'codigo_postal', 'cp']);
  const destinationPostal = firstText(destination, ['postalCode', 'codigo_postal', 'cp']);
  const postalKm = postalDistanceEstimateKm(originPostal, destinationPostal);
  if (postalKm !== null) return { km: postalKm, confidence: 'postal_code' };

  const originAddress = firstText(origin, ['address', 'direccion', 'calle']);
  const destinationAddress = firstText(destination, ['address', 'direccion', 'calle']);
  if (originAddress && destinationAddress && sameStreetConfidence(originAddress, destinationAddress)) {
    return { km: 1.1, confidence: 'street_text' };
  }

  const originZone = normalizeText([
    firstText(origin, ['zone', 'zona', 'barrio']),
    firstText(origin, ['city', 'ciudad', 'localidad']),
  ].filter(Boolean).join(' '));
  const destinationZone = normalizeText([
    firstText(destination, ['zone', 'zona', 'barrio']),
    firstText(destination, ['city', 'ciudad', 'localidad']),
    destinationAddress,
  ].filter(Boolean).join(' '));
  if (originZone && destinationZone && (destinationZone.includes(originZone) || originZone.includes(destinationZone))) {
    return { km: 3.2, confidence: 'zone_text' };
  }
  if (originZone && destinationZone && overlapCount(new Set(tokenize(originZone)), new Set(tokenize(destinationZone))) > 0) {
    return { km: 6.5, confidence: 'zone_partial' };
  }
  return { km: null, confidence: 'none' };
}

function modeLimit(mode, options = {}) {
  if (mode === 'walking') return Number(options.walkMaxMinutes || DEFAULT_WALK_MAX_MINUTES);
  if (mode === 'driving') return Number(options.carMaxMinutes || DEFAULT_CAR_MAX_MINUTES);
  return Number(options.transitReviewMinutes || DEFAULT_TRANSIT_REVIEW_MINUTES);
}

function optionDetail(option) {
  const suffix = option.mode === 'walking'
    ? 'a pie'
    : option.mode === 'driving'
      ? 'en coche'
      : 'en transporte publico';
  const precision = option.exact
    ? ` (ruta calculada${option.providerLabel ? ` por ${option.providerLabel}` : ''})`
    : option.networkCalculated
      ? ` (red viaria aproximada${option.providerLabel ? ` · ${option.providerLabel}` : ''})`
      : ' (estimado)';
  return `${option.km} km / ${option.minutes} min ${suffix}${precision}`;
}

function makeOption(mode, km, minutes, options = {}, metadata = {}) {
  const limitMinutes = modeLimit(mode, options);
  const option = {
    mode,
    label: MODE_META[mode].label,
    km: round(km, 1),
    minutes: Math.max(1, Math.round(minutes)),
    limitMinutes,
    withinLimit: Number(minutes) <= limitMinutes,
    exact: metadata.exact === true,
    networkCalculated: metadata.networkCalculated === true,
    provider: clean(metadata.provider || 'geographic_estimate', 80),
    providerLabel: clean(metadata.providerLabel || (metadata.provider === 'google_routes' ? 'Google Maps' : metadata.provider === 'geoapify_routes' ? 'Geoapify' : metadata.provider === 'openstreetmap_osrm' ? 'OpenStreetMap' : 'Estimacion geografica'), 120),
  };
  option.detail = optionDetail(option);
  return option;
}

function estimateWalkingOption(straightKm, options = {}) {
  const routeKm = round(Math.max(0.2, straightKm * 1.22), 1);
  return makeOption('walking', routeKm, Math.max(3, (routeKm / 4.7) * 60), options);
}

function estimateDrivingOption(straightKm, options = {}) {
  const routeKm = round(Math.max(0.8, straightKm * 1.35), 1);
  const speedKmh = routeKm <= 3 ? 16 : routeKm <= 8 ? 20 : routeKm <= 15 ? 24 : routeKm <= 25 ? 30 : 38;
  const parkingMinutes = routeKm <= 3 ? 4 : routeKm <= 12 ? 6 : routeKm <= 25 ? 8 : 10;
  return makeOption('driving', routeKm, Math.max(5, (routeKm / speedKmh) * 60 + parkingMinutes), options);
}

function estimateTransitOption(straightKm, options = {}) {
  const routeKm = round(Math.max(0.8, straightKm * 1.55), 1);
  const speedKmh = routeKm <= 4 ? 12 : routeKm <= 10 ? 16 : routeKm <= 25 ? 20 : 24;
  const accessMinutes = routeKm <= 2 ? 5 : routeKm <= 8 ? 8 : 11;
  const transferMinutes = routeKm <= 4 ? 4 : routeKm <= 15 ? 8 : 12;
  return makeOption('transit', routeKm, Math.max(10, (routeKm / speedKmh) * 60 + accessMinutes + transferMinutes), options);
}

function durationSeconds(value) {
  const direct = firstNumber(value?.durationSeconds, value?.seconds);
  if (direct !== null) return direct;
  const duration = clean(value?.duration, 40);
  const match = duration.match(/^(\d+(?:\.\d+)?)s$/);
  return match ? Number(match[1]) : null;
}

function normalizeRouteOption(mode, raw, options = {}, routePayload = {}) {
  if (!raw || raw.available === false) return null;
  const seconds = durationSeconds(raw);
  const minutes = firstNumber(raw.minutes, seconds === null ? null : seconds / 60);
  const meters = firstNumber(raw.distanceMeters, raw.meters);
  const km = firstNumber(raw.km, meters === null ? null : meters / 1000);
  if (minutes === null || km === null) return null;
  return makeOption(mode, km, minutes, options, {
    exact: raw.exact ?? routePayload.exact,
    networkCalculated: raw.networkCalculated === true || raw.exact === true || routePayload.exact === true,
    provider: raw.provider || routePayload.provider,
    providerLabel: raw.providerLabel || routePayload.providerLabel,
  });
}

function mobilityScoreForOption(option) {
  if (!option) return 0.18;
  const minutes = Number(option.minutes || 0);
  if (option.mode === 'walking') {
    if (minutes <= 10) return 1;
    if (minutes <= 20) return 0.9;
    if (minutes <= 30) return 0.72;
    if (minutes <= 40) return 0.42;
    return 0.1;
  }
  if (option.mode === 'driving') {
    if (minutes <= 10) return 1;
    if (minutes <= 15) return 0.9;
    if (minutes <= 20) return 0.75;
    if (minutes <= 25) return 0.42;
    if (minutes <= 35) return 0.18;
    return 0.06;
  }
  if (minutes <= 15) return 1;
  if (minutes <= 25) return 0.88;
  if (minutes <= 35) return 0.7;
  if (minutes <= 45) return 0.4;
  if (minutes <= 60) return 0.18;
  return 0.07;
}

function chooseRecommended(options = []) {
  if (!options.length) return null;
  const within = options.filter((option) => option.withinLimit);
  const pool = within.length ? within : options;
  const fastest = [...pool].sort((a, b) => a.minutes - b.minutes)[0];
  const walking = pool.find((option) => option.mode === 'walking');
  if (walking && walking.minutes <= 25 && walking.minutes <= fastest.minutes + 5) return walking;
  const transit = pool.find((option) => option.mode === 'transit');
  if (transit && transit.minutes <= fastest.minutes + 4) return transit;
  return fastest;
}

function routePayloadFrom(destination = {}, options = {}) {
  return options.routeEstimate
    || destination.routeEstimate
    || destination.googleRoutesEstimate
    || destination.mobilityRouteEstimate
    || null;
}

function buildResult({ hasCar, straight, routePayload = null, walking, transit, driving }) {
  const visibleOptions = [walking, transit, hasCar === true ? driving : null].filter(Boolean);
  const recommended = chooseRecommended(visibleOptions);
  if (!recommended) return null;
  const withinRecommendedRange = visibleOptions.some((option) => option.withinLimit);
  const exact = visibleOptions.length > 0 && visibleOptions.every((option) => option.exact === true);
  const networkCalculated = visibleOptions.some((option) => option.networkCalculated === true || option.exact === true);
  const routeErrors = Array.isArray(routePayload?.errors) ? routePayload.errors.slice(0, 3) : [];
  const incompleteProviderCheck = !exact || routeErrors.some((error) => String(error).includes('provider_error'));
  const provider = clean(routePayload?.provider || (exact ? recommended.provider : networkCalculated ? recommended.provider : 'geographic_estimate'), 80);
  const providerBaseLabel = clean(routePayload?.providerLabel || recommended.providerLabel, 120);
  const providerLabel = exact || !networkCalculated ? providerBaseLabel : `${providerBaseLabel} + estimacion`;
  const risks = [];
  if (provider === 'google_routes' && walking) {
    risks.push('La ruta a pie de Google puede no reflejar siempre aceras o pasos peatonales; revisarla antes de confirmar.');
  }
  if (provider === 'openstreetmap_osrm') {
    risks.push('Rutas a pie y en coche calculadas entre centros de codigo postal con OpenStreetMap; el transporte publico es una estimacion prudente.');
  } else if (!exact && networkCalculated) {
    risks.push(`Algun modo no pudo calcularse con ${providerBaseLabel || 'el proveedor'} y se mantiene como estimacion; revisar antes de descartar.`);
  } else if (!exact && straight.confidence !== 'coordinates') {
    risks.push('Estimacion por codigo postal o zona; requiere revision manual antes de descartar al profesor.');
  } else if (!exact) {
    risks.push('Tiempo estimado desde coordenadas; requiere revision manual antes de descartar al profesor.');
  }
  if (!withinRecommendedRange && !incompleteProviderCheck) {
    risks.push('Ninguna opcion presencial queda dentro de los limites operativos recomendados.');
  }
  if (routeErrors.some((error) => String(error).includes('provider_error'))) {
    risks.push(`${providerBaseLabel || 'El proveedor de rutas'} no pudo comprobar todos los modos; requiere revision manual antes de descartar al profesor.`);
  }
  if (hasCar === null) risks.push('El profesor no ha indicado si tiene coche; el coche no se ha considerado.');

  const detail = visibleOptions.map((item) => item.detail).join(' | ');
  return {
    version: MOBILITY_MATCHING_VERSION,
    available: true,
    exact,
    networkCalculated,
    provider,
    providerLabel,
    confidence: clean(routePayload?.confidence || straight.confidence, 80),
    computedAt: clean(routePayload?.computedAt, 80),
    hasCar,
    needsCar: ![walking, transit].filter(Boolean).some((option) => option.withinLimit),
    straightKm: straight.km === null ? null : round(straight.km, 1),
    walkingKm: walking?.km ?? null,
    walkingMinutes: walking?.minutes ?? null,
    drivingKm: driving?.km ?? null,
    drivingMinutes: driving?.minutes ?? null,
    transitKm: transit?.km ?? null,
    transitMinutes: transit?.minutes ?? null,
    effectiveKm: recommended.km,
    effectiveMinutes: recommended.minutes,
    recommendedMode: recommended.mode,
    withinRecommendedRange,
    hardDistanceRisk: exact && !withinRecommendedRange && !incompleteProviderCheck,
    scoreRatio: clamp(mobilityScoreForOption(recommended)),
    detail,
    displayText: detail,
    displayOptions: visibleOptions,
    mobilityOptions: { walking, transit, driving: hasCar === true ? driving : null },
    routeErrors,
    walkingRouteWarning: provider === 'google_routes' && walking
      ? 'Las rutas a pie de Google pueden no incluir siempre aceras o pasos peatonales claros.'
      : '',
    attribution: clean(routePayload?.attribution, 160),
    attributionUrl: clean(routePayload?.attributionUrl, 500),
    fixMapUrl: clean(routePayload?.fixMapUrl, 500),
    risks,
  };
}

export function buildMobilityEstimate(origin = {}, destination = {}, options = {}) {
  const hasCar = booleanOrNull(destination.hasCar, destination.tiene_coche, destination.carAvailable, destination.vehiculo_propio, destination.coche);
  const straight = estimateStraightKm(origin, destination);
  const routePayload = routePayloadFrom(destination, options);
  const routeOptions = routePayload?.routes || routePayload?.mobilityOptions || routePayload || {};
  const hasCalculatedPayload = routePayload?.calculated === true
    || routePayload?.exact === true
    || ['google_routes', 'geoapify_routes', 'openstreetmap_osrm'].includes(routePayload?.provider);
  const routeResult = hasCalculatedPayload
    ? buildResult({
      hasCar,
      straight,
      routePayload,
      walking: normalizeRouteOption('walking', routeOptions.walking, options, routePayload)
        || (straight.km === null ? null : estimateWalkingOption(straight.km, options)),
      transit: normalizeRouteOption('transit', routeOptions.transit, options, routePayload)
        || (straight.km === null ? null : estimateTransitOption(straight.km, options)),
      driving: hasCar === true
        ? normalizeRouteOption('driving', routeOptions.driving, options, routePayload)
          || (straight.km === null ? null : estimateDrivingOption(straight.km, options))
        : null,
    })
    : null;
  if (routeResult) return routeResult;

  if (straight.km === null) {
    return {
      version: MOBILITY_MATCHING_VERSION,
      available: false,
      exact: false,
      provider: 'unavailable',
      confidence: straight.confidence,
      hasCar,
      needsCar: true,
      recommendedMode: 'review',
      hardDistanceRisk: false,
      scoreRatio: 0.18,
      detail: 'Sin datos suficientes para calcular rutas.',
      displayText: 'Sin datos suficientes para calcular desplazamiento.',
      displayOptions: [],
      mobilityOptions: { walking: null, driving: null, transit: null },
      risks: ['Faltan direccion, codigo postal o coordenadas para calcular cercania.'],
    };
  }

  return buildResult({
    hasCar,
    straight,
    walking: estimateWalkingOption(straight.km, options),
    transit: estimateTransitOption(straight.km, options),
    driving: hasCar === true ? estimateDrivingOption(straight.km, options) : null,
  });
}

export function formatMobilityEstimate(estimate = {}) {
  if (!estimate.available) return estimate.displayText || 'Sin desplazamiento calculado.';
  const options = Array.isArray(estimate.displayOptions) && estimate.displayOptions.length
    ? estimate.displayOptions
    : [estimate.mobilityOptions?.walking, estimate.mobilityOptions?.transit, estimate.mobilityOptions?.driving].filter(Boolean);
  return options.map((item) => item.detail).join(' | ');
}
