/**
 * Mobility estimates for matching.
 *
 * The engine is deterministic and free by default. It estimates travel from
 * coordinates when present and falls back to postal code/zone signals. A real
 * route provider can later feed the same output shape without changing the
 * matching algorithm or admin UI.
 */

export const MOBILITY_MATCHING_VERSION = 'mobility_matching_v1';
export const DEFAULT_CAR_MAX_MINUTES = 20;
export const DEFAULT_TRANSIT_REVIEW_MINUTES = 35;

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
  const lat = firstNumber(
    entity.lat,
    entity.latitude,
    entity.locationLat,
    entity.geoLat,
    source.lat,
    source.latitude,
  );
  const lng = firstNumber(
    entity.lng,
    entity.lon,
    entity.long,
    entity.longitude,
    entity.locationLng,
    entity.geoLng,
    source.lng,
    source.lon,
    source.long,
    source.longitude,
  );
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
  return normalizeText(value)
    .split(/[^a-z0-9]+/)
    .filter((item) => item.length > 2);
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

function estimateDrivingOption(straightKm, options = {}) {
  const routeKm = round(Math.max(0.8, straightKm * 1.35), 1);
  const speedKmh = routeKm <= 3 ? 16 : routeKm <= 8 ? 20 : routeKm <= 15 ? 24 : routeKm <= 25 ? 30 : 38;
  const parkingMinutes = routeKm <= 3 ? 4 : routeKm <= 12 ? 6 : routeKm <= 25 ? 8 : 10;
  const minutes = Math.max(5, Math.round((routeKm / speedKmh) * 60 + parkingMinutes));
  const limitMinutes = Number(options.carMaxMinutes || DEFAULT_CAR_MAX_MINUTES);
  return {
    mode: 'driving',
    label: 'Coche',
    km: routeKm,
    minutes,
    limitMinutes,
    withinLimit: minutes <= limitMinutes,
    detail: `${routeKm} km / ${minutes} min en coche`,
  };
}

function estimateTransitOption(straightKm, options = {}) {
  const routeKm = round(Math.max(0.8, straightKm * 1.55), 1);
  const speedKmh = routeKm <= 4 ? 12 : routeKm <= 10 ? 16 : routeKm <= 25 ? 20 : 24;
  const accessMinutes = routeKm <= 2 ? 5 : routeKm <= 8 ? 8 : 11;
  const transferMinutes = routeKm <= 4 ? 4 : routeKm <= 15 ? 8 : 12;
  const minutes = Math.max(10, Math.round((routeKm / speedKmh) * 60 + accessMinutes + transferMinutes));
  const reviewMinutes = Number(options.transitReviewMinutes || DEFAULT_TRANSIT_REVIEW_MINUTES);
  return {
    mode: 'transit',
    label: 'Transporte publico',
    km: routeKm,
    minutes,
    reviewMinutes,
    withinLimit: minutes <= reviewMinutes,
    detail: `${routeKm} km / ${minutes} min en transporte publico`,
  };
}

function mobilityScoreForOption(option, hasCar) {
  if (!option) return 0.18;
  const minutes = Number(option.minutes || 0);
  if (option.mode === 'driving' && hasCar === true) {
    if (minutes <= 10) return 1;
    if (minutes <= 15) return 0.86;
    if (minutes <= 20) return 0.68;
    if (minutes <= 25) return 0.34;
    if (minutes <= 35) return 0.18;
    return 0.08;
  }
  if (option.mode === 'transit') {
    if (minutes <= 15) return 1;
    if (minutes <= 25) return 0.82;
    if (minutes <= 35) return 0.58;
    if (minutes <= 45) return 0.32;
    return 0.12;
  }
  return 0.25;
}

export function buildMobilityEstimate(origin = {}, destination = {}, options = {}) {
  const hasCar = booleanOrNull(
    destination.hasCar,
    destination.tiene_coche,
    destination.carAvailable,
    destination.vehiculo_propio,
    destination.coche,
  );
  const straight = estimateStraightKm(origin, destination);
  if (straight.km === null) {
    return {
      version: MOBILITY_MATCHING_VERSION,
      available: false,
      confidence: straight.confidence,
      hasCar,
      needsCar: true,
      recommendedMode: hasCar === false ? 'transit' : hasCar === true ? 'driving' : 'review',
      scoreRatio: 0.18,
      detail: 'Sin datos suficientes para estimar km/tiempo.',
      displayText: 'Sin datos suficientes para calcular desplazamiento.',
      displayOptions: [],
      mobilityOptions: { driving: null, transit: null },
      risks: ['Faltan direccion, codigo postal o coordenadas para calcular cercania.'],
    };
  }

  const driving = estimateDrivingOption(straight.km, options);
  const transit = estimateTransitOption(straight.km, options);
  const recommended = hasCar === true ? driving : transit;
  const needsCar = driving.km > 5;
  const visibleOptions = hasCar === true ? [driving, transit] : [transit];
  const scoreRatio = hasCar === true
    ? mobilityScoreForOption(driving, true)
    : hasCar === false
      ? mobilityScoreForOption(transit, false)
      : Math.max(mobilityScoreForOption(driving, true) * 0.82, mobilityScoreForOption(transit, false) * 0.9);

  const risks = [];
  if (straight.confidence !== 'coordinates') {
    risks.push('Estimacion por codigo postal o zona; revisar direccion si hay dudas.');
  }
  if (hasCar === true && !driving.withinLimit) {
    risks.push(`Supera el limite de ${driving.limitMinutes} min en coche.`);
  }
  if (hasCar === false && !transit.withinLimit) {
    risks.push('Transporte publico largo para clases presenciales.');
  }
  if (hasCar === null) {
    risks.push('El profesor no ha indicado si tiene coche.');
  }

  const detail = visibleOptions.map((item) => item.detail).join(' | ');
  return {
    version: MOBILITY_MATCHING_VERSION,
    available: true,
    confidence: straight.confidence,
    hasCar,
    needsCar,
    straightKm: round(straight.km, 1),
    drivingKm: driving.km,
    drivingMinutes: driving.minutes,
    transitKm: transit.km,
    transitMinutes: transit.minutes,
    effectiveKm: recommended.km,
    effectiveMinutes: recommended.minutes,
    recommendedMode: recommended.mode,
    withinRecommendedRange: recommended.withinLimit,
    hardDistanceRisk: hasCar === true && !driving.withinLimit,
    scoreRatio: clamp(scoreRatio),
    detail,
    displayText: detail,
    displayOptions: visibleOptions,
    mobilityOptions: { driving, transit },
    risks,
  };
}

export function formatMobilityEstimate(estimate = {}) {
  if (!estimate.available) return estimate.displayText || 'Sin desplazamiento calculado.';
  const options = Array.isArray(estimate.displayOptions) && estimate.displayOptions.length
    ? estimate.displayOptions
    : [estimate.mobilityOptions?.driving, estimate.mobilityOptions?.transit].filter(Boolean);
  return options.map((item) => item.detail).join(' | ');
}
