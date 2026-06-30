/**
 * ClasesDe10 professional matching engine.
 *
 * Pure, deterministic and free by default. It can be assisted by a generative
 * model later, but the baseline score is always explainable and bounded.
 */

import {
  availabilitySlotLabel,
  minutesFromTime,
  normalizeAvailabilitySlots as normalizeStructuredAvailabilitySlots,
} from './availability-engine.js';
import { buildTeacherTrustProfile } from './trust-engine.js';

export const MATCHING_VERSION = 'professional_matching_v4';
export const AI_FEATURES_VERSION = 'impact_ai_v1';

export const MATCHING_WEIGHTS = Object.freeze({
  subject: 22,
  level: 10,
  modality: 10,
  location: 11,
  availability: 13,
  experience: 8,
  reputation: 10,
  capacity: 6,
  fitConfidence: 7,
  profileQuality: 3,
});

const DAY_ALIASES = [
  ['lunes', 'lun', 'monday'],
  ['martes', 'mar', 'tuesday'],
  ['miercoles', 'miercoles', 'mie', 'wednesday'],
  ['jueves', 'jue', 'thursday'],
  ['viernes', 'vie', 'friday'],
  ['sabado', 'sab', 'saturday'],
  ['domingo', 'dom', 'sunday'],
];

const PERIOD_ALIASES = {
  manana: ['manana', 'mañana', 'morning', 'antes de comer'],
  tarde: ['tarde', 'afternoon', 'despues de clase', 'despues del colegio'],
  noche: ['noche', 'evening'],
  mediodia: ['mediodia', 'medio dia', 'comida'],
  finde: ['finde', 'fin de semana', 'sabado', 'domingo'],
};

const SUBJECT_GROUPS = {
  matematicas: ['matematica', 'matematicas', 'mates', 'algebra', 'calculo', 'estadistica'],
  fisica: ['fisica', 'mecanica', 'termodinamica'],
  quimica: ['quimica'],
  biologia: ['biologia', 'naturales'],
  ingles: ['ingles', 'english', 'cambridge', 'toefl', 'ielts'],
  lengua: ['lengua', 'literatura', 'comentario', 'sintaxis'],
  historia: ['historia', 'geografia'],
  economia: ['economia', 'empresa', 'ade', 'finanzas'],
  programacion: ['programacion', 'informatica', 'python', 'javascript', 'java', 'coding'],
  padel: ['padel', 'paddle'],
  tenis: ['tenis', 'tennis'],
  guitarra: ['guitarra', 'guitar'],
  piano: ['piano'],
  musica: ['musica', 'musical', 'solfeo', 'canto'],
  dibujo: ['dibujo', 'pintura', 'arte'],
};

const LEVEL_GROUPS = {
  primaria: ['primaria', '1 primaria', '2 primaria', '3 primaria', '4 primaria', '5 primaria', '6 primaria'],
  eso: ['eso', 'secundaria', '1 eso', '2 eso', '3 eso', '4 eso'],
  bachillerato: ['bachiller', 'bachillerato', '1 bach', '2 bach'],
  evau: ['evau', 'ebau', 'selectividad', 'pau'],
  universidad: ['universidad', 'grado', 'ingenieria', 'carrera'],
  adultos: ['adulto', 'adultos'],
  deporte: ['deporte', 'padel', 'tenis'],
  musica: ['musica', 'guitarra', 'piano', 'solfeo'],
  todos: ['todos', 'cualquier nivel', 'all'],
};

export function clean(value, max = 1000) {
  return String(value || '').trim().slice(0, max);
}

export function lower(value) {
  return clean(value).toLowerCase();
}

export function normalizeText(value) {
  return lower(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function asArray(value) {
  if (Array.isArray(value)) return value.map((item) => clean(item)).filter(Boolean);
  return clean(value)
    .split(/[,;/+|]|\sy\s/i)
    .map((item) => clean(item))
    .filter(Boolean);
}

export function tokenize(value) {
  return normalizeText(value)
    .split(/[^a-z0-9]+/)
    .filter((item) => item.length > 2);
}

export function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function clamp(value, min = 0, max = 100) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.max(min, Math.min(max, number));
}

function round(value, decimals = 0) {
  const factor = 10 ** decimals;
  return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
}

function stableHash(value) {
  const text = normalizeText(typeof value === 'string' ? value : JSON.stringify(value || {}));
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = ((hash << 5) - hash + text.charCodeAt(index)) | 0;
  }
  return Math.abs(hash).toString(36);
}

function joinNatural(values, fallback = 'sin especificar') {
  const items = unique(values.map((item) => clean(item, 120)).filter(Boolean));
  if (!items.length) return fallback;
  if (items.length === 1) return items[0];
  return `${items.slice(0, -1).join(', ')} y ${items.at(-1)}`;
}

function textFromValues(...values) {
  return values.flatMap((value) => {
    if (Array.isArray(value)) return value;
    if (value && typeof value === 'object') return Object.values(value);
    return [value];
  }).map((value) => clean(value, 1000)).filter(Boolean).join(' ');
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

function rate01(value) {
  const number = numberOrNull(value);
  if (number === null) return null;
  return number > 1 ? clamp(number, 0, 100) / 100 : clamp(number, 0, 1);
}

function booleanOrNull(...values) {
  for (const value of values) {
    if (value === true || value === false) return value;
    const text = normalizeText(value);
    if (!text) continue;
    if (['si', 'yes', 'true', '1', 'coche', 'vehiculo', 'vehiculo_propio'].includes(text)) return true;
    if (['no', 'false', '0', 'sin_coche', 'transporte_publico'].includes(text)) return false;
  }
  return null;
}

function yearsFromText(value) {
  const text = normalizeText(value);
  const explicit = text.match(/(\d+(?:[.,]\d+)?)\s*(?:anos|año|anios|years)/);
  if (explicit) return Number(explicit[1].replace(',', '.'));
  const any = text.match(/\b(\d{1,2})\b/);
  return any ? Number(any[1]) : 0;
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

function postalDistanceEstimateKm(requestPostal, teacherPostal) {
  const req = clean(requestPostal);
  const teacher = clean(teacherPostal);
  if (!/^\d{5}$/.test(req) || !/^\d{5}$/.test(teacher)) return null;
  if (req === teacher) return 1.2;
  if (req.slice(0, 3) === teacher.slice(0, 3)) {
    return round(Math.min(7.5, 1.8 + Math.abs(Number(req.slice(3)) - Number(teacher.slice(3))) * 0.38), 1);
  }
  if (req.slice(0, 2) === teacher.slice(0, 2)) {
    return round(Math.min(22, 7 + Math.abs(Number(req.slice(2)) - Number(teacher.slice(2))) * 0.18), 1);
  }
  return round(35 + Math.abs(Number(req.slice(0, 2)) - Number(teacher.slice(0, 2))) * 18, 1);
}

function sameStreetConfidence(requestAddress, teacherAddress) {
  const reqTokens = tokenize(requestAddress).filter((token) => !['calle', 'avenida', 'avda', 'plaza', 'paseo', 'numero', 'piso'].includes(token));
  const teacherTokens = tokenize(teacherAddress).filter((token) => !['calle', 'avenida', 'avda', 'plaza', 'paseo', 'numero', 'piso'].includes(token));
  if (!reqTokens.length || !teacherTokens.length) return false;
  return overlapCount(new Set(reqTokens), new Set(teacherTokens)) >= Math.min(2, reqTokens.length);
}

export function estimateTravelForMatch(requestProfile = {}, teacherProfile = {}) {
  const requestCoords = coordinatePair(requestProfile);
  const teacherCoords = coordinatePair(teacherProfile);
  const requestPostal = clean(requestProfile.postalCode);
  const teacherPostal = clean(teacherProfile.postalCode);
  const requestZone = normalizeText([requestProfile.zone, requestProfile.city].filter(Boolean).join(' '));
  const teacherZone = normalizeText([teacherProfile.zone, teacherProfile.city].filter(Boolean).join(' '));
  const requestAddress = clean(requestProfile.address, 240);
  const teacherAddress = clean(teacherProfile.address, 240);
  const hasCar = teacherProfile.hasCar;
  let straightKm = null;
  let confidence = 'none';

  if (requestCoords && teacherCoords) {
    straightKm = distanceKmBetween(requestCoords, teacherCoords);
    confidence = 'coordinates';
  } else {
    const postalKm = postalDistanceEstimateKm(requestPostal, teacherPostal);
    if (postalKm !== null) {
      straightKm = postalKm;
      confidence = 'postal_code';
    } else if (requestAddress && teacherAddress && sameStreetConfidence(requestAddress, teacherAddress)) {
      straightKm = 1.1;
      confidence = 'street_text';
    } else if (requestZone && teacherZone && (teacherZone.includes(requestZone) || requestZone.includes(teacherZone))) {
      straightKm = 3.2;
      confidence = 'zone_text';
    } else if (requestZone && teacherZone && overlapCount(new Set(tokenize(requestZone)), new Set(tokenize(teacherZone))) > 0) {
      straightKm = 6.5;
      confidence = 'zone_partial';
    }
  }

  if (straightKm === null) {
    return {
      available: false,
      confidence,
      hasCar,
      needsCar: true,
      detail: 'Sin datos suficientes para estimar km/tiempo.',
    };
  }

  const drivingKm = round(Math.max(0.8, straightKm * 1.35), 1);
  const speedKmh = drivingKm <= 8 ? 18 : drivingKm <= 20 ? 25 : 35;
  const parkingMinutes = drivingKm <= 3 ? 4 : drivingKm <= 12 ? 6 : 8;
  const drivingMinutes = Math.max(5, Math.round((drivingKm / speedKmh) * 60 + parkingMinutes));
  const needsCar = drivingKm > 5;
  return {
    available: true,
    confidence,
    hasCar,
    needsCar,
    straightKm,
    drivingKm,
    drivingMinutes,
    detail: `${drivingKm} km aprox. en coche, ${drivingMinutes} min aprox.`,
  };
}

export function getTeacherName(teacher) {
  return clean(
    teacher.displayName
      || [teacher.usuarios?.nombre || teacher.nombre, teacher.usuarios?.apellidos || teacher.apellidos].filter(Boolean).join(' ')
      || teacher.email
      || teacher.id
      || teacher.teacherUid
  );
}

function subjectTags(value) {
  const text = normalizeText(Array.isArray(value) ? value.join(' ') : value);
  const tokens = new Set(tokenize(text));
  Object.entries(SUBJECT_GROUPS).forEach(([group, aliases]) => {
    if (aliases.some((alias) => text.includes(normalizeText(alias)))) tokens.add(group);
  });
  return tokens;
}

function levelTags(value) {
  const text = normalizeText(Array.isArray(value) ? value.join(' ') : value);
  const tokens = new Set(tokenize(text));
  Object.entries(LEVEL_GROUPS).forEach(([group, aliases]) => {
    if (aliases.some((alias) => text.includes(normalizeText(alias)))) tokens.add(group);
  });
  return tokens;
}

function modalitySet(value) {
  const text = normalizeText(value);
  const modes = new Set();
  if (!text) return modes;
  if (/(ambas|mixta|hibrid|online y presencial|presencial y online)/.test(text)) {
    modes.add('online');
    modes.add('presencial');
  }
  if (/(online|remoto|remota|videollamada|zoom|meet)/.test(text)) modes.add('online');
  if (/(presencial|domicilio|casa|zona|desplaz)/.test(text)) modes.add('presencial');
  return modes;
}

function daySet(value) {
  const text = normalizeText(value);
  const days = new Set();
  DAY_ALIASES.forEach((aliases, index) => {
    if (aliases.some((alias) => text.includes(normalizeText(alias)))) days.add(index);
  });
  if (/(lunes a viernes|entre semana|laborables)/.test(text)) [0, 1, 2, 3, 4].forEach((day) => days.add(day));
  if (/(finde|fin de semana)/.test(text)) [5, 6].forEach((day) => days.add(day));
  return days;
}

function periodSet(value) {
  const text = normalizeText(value);
  const periods = new Set();
  Object.entries(PERIOD_ALIASES).forEach(([period, aliases]) => {
    if (aliases.some((alias) => text.includes(normalizeText(alias)))) periods.add(period);
  });
  return periods;
}

function periodFromTimeRange(start, end) {
  const hour = Number(clean(start).match(/\d{1,2}/)?.[0]);
  const finish = Number(clean(end).match(/\d{1,2}/)?.[0]);
  const periods = new Set();
  if (!Number.isFinite(hour)) return periods;
  const to = Number.isFinite(finish) ? finish : hour + 1;
  if (hour < 13 || to <= 14) periods.add('manana');
  if (hour < 16 && to > 12) periods.add('mediodia');
  if (hour < 21 && to > 15) periods.add('tarde');
  if (to > 20 || hour >= 20) periods.add('noche');
  return periods;
}

function normalizeAvailabilitySlots(slots) {
  return asArray(slots).map((slot) => slot).filter(Boolean);
}

function structuredAvailabilitySlots(...values) {
  return normalizeStructuredAvailabilitySlots(values.flatMap((value) => {
    if (!value) return [];
    if (Array.isArray(value)) return value;
    if (typeof value === 'object') return [value];
    return [];
  }));
}

function slotDay(slot) {
  const raw = slot?.dia_semana ?? slot?.dayOfWeek ?? slot?.day ?? slot?.dia;
  if (typeof raw === 'number') {
    if (raw >= 1 && raw <= 7) return raw - 1;
    if (raw >= 0 && raw <= 6) return raw;
  }
  const days = daySet(raw);
  return [...days][0];
}

function overlapCount(a, b) {
  if (!a.size || !b.size) return 0;
  return [...a].filter((item) => b.has(item)).length;
}

function idSet(...values) {
  return new Set(values
    .flatMap((value) => (Array.isArray(value) ? value : [value]))
    .map((value) => clean(value, 180))
    .filter(Boolean));
}

function itemMatchesAnyId(item = {}, fields = [], ids = new Set()) {
  if (!ids.size) return false;
  return fields.some((field) => ids.has(clean(item[field], 180)));
}

function statusText(item = {}) {
  return normalizeText(item.estado || item.status || item.state || item.lifecycleState || item.relationshipStatus);
}

function isCanceledStatus(item = {}) {
  return /(cancel|rechaz|archiv|baja|inactivo|elimin)/.test(statusText(item));
}

function isActiveAssignment(item = {}) {
  const status = statusText(item);
  if (!status) return true;
  return !isCanceledStatus(item) && !/(finaliz|cerrad|terminad|completad)/.test(status);
}

function isCompletedClass(item = {}) {
  const status = statusText(item);
  return /(realiz|complet|confirmad|finaliz|pagad|paid)/.test(status);
}

function isAcceptedMatchStatus(item = {}) {
  return /(acept|asign|seleccion|confirm|accepted|assigned|selected)/.test(statusText(item));
}

function matchingDateMillis(value) {
  if (!value) return 0;
  if (typeof value?.toDate === 'function') return value.toDate().getTime();
  if (typeof value?.seconds === 'number') return value.seconds * 1000;
  if (value instanceof Date) return value.getTime();
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function sameSubjectContext(item = {}, requestSubject = '') {
  const requestTags = subjectTags(requestSubject);
  if (!requestTags.size) return false;
  const itemTags = subjectTags(textFromValues(item.materia, item.subject, item.asignatura, item.subjectMatch));
  return overlapCount(requestTags, itemTags) > 0;
}

export function getTeacherProfile(teacher = {}) {
  const subjects = asArray(teacher.materias || teacher.subjects || teacher.materia || teacher.materiasTexto);
  const levels = asArray(teacher.niveles_educativos || teacher.levels || teacher.niveles || teacher.nivel);
  const responseMinutes = firstNumber(
    teacher.averageResponseMinutes,
    teacher.responseMinutes,
    teacher.tiempo_respuesta_minutos,
  );
  const responseHours = firstNumber(
    teacher.responseTimeHours,
    teacher.averageResponseHours,
    teacher.tiempo_respuesta_horas,
    responseMinutes === null ? null : responseMinutes / 60,
  );
  const accepted = firstNumber(teacher.acceptedRequests, teacher.solicitudesAceptadas, teacher.acceptedAssignments);
  const offered = firstNumber(teacher.offeredRequests, teacher.solicitudesOfrecidas, teacher.totalRequests);
  const signals = teacher.matchingSignals || {};
  return {
    id: teacher.id || teacher.teacherUid || teacher.userUid || '',
    teacherUid: teacher.teacherUid || teacher.id || teacher.userUid || '',
    userUid: teacher.userUid || teacher.usuario_id || teacher.id || '',
    name: getTeacherName(teacher),
    email: clean(teacher.usuarios?.email || teacher.email, 254),
    phone: clean(teacher.usuarios?.telefono || teacher.telefono, 40),
    photoUrl: clean(teacher.foto_url || teacher.photoUrl, 300000),
    address: clean(teacher.direccion || teacher.address, 240),
    city: clean(teacher.ciudad || teacher.city || 'Madrid', 160),
    postalCode: clean(teacher.codigo_postal || teacher.postalCode, 20),
    zone: clean(teacher.zona || teacher.zone || teacher.barrio || teacher.city, 240),
    modality: clean(teacher.modalidad || teacher.modality || teacher.tipo_clase || teacher.formato, 120),
    subjects,
    levels,
    studyLevel: clean(teacher.nivel_estudios || teacher.studyLevel, 160),
    exactStudy: clean(teacher.estudio_exacto || teacher.exactStudy || teacher.titulacion, 300),
    schoolName: clean(teacher.colegio || teacher.schoolName || teacher.school || teacher.colegio_nombre, 240),
    studyCenter: clean(teacher.centro_estudios || teacher.studyCenter || teacher.universidad || teacher.universityName || teacher.colegio_estudios, 300),
    bachilleratoGrade: firstNumber(teacher.nota_bachillerato, teacher.bachilleratoGrade),
    universityAverageGrade: firstNumber(teacher.nota_media_universidad, teacher.universityAverageGrade),
    experienceYears: firstNumber(teacher.experiencia_anios, teacher.experienceYears, teacher.anios_experiencia)
      ?? yearsFromText([teacher.experiencia, teacher.bio, teacher.presentacion, teacher.experienceSummary].filter(Boolean).join(' ')),
    availability: clean(teacher.disponibilidad_resumen || teacher.availabilitySummary || teacher.disponibilidad, 500),
    availabilitySlots: [
      ...structuredAvailabilitySlots(
        teacher.availabilitySlots,
        teacher.disponibilidadSlots,
        teacher.disponibilidad_slots,
        teacher.disponibilidad_detalle,
      ),
      ...(!Array.isArray(teacher.availabilitySlots || teacher.disponibilidadSlots || teacher.disponibilidad_slots || teacher.disponibilidad_detalle)
        ? normalizeAvailabilitySlots(teacher.disponibilidad_detalle)
        : []),
    ],
    hasCar: booleanOrNull(teacher.hasCar, teacher.tiene_coche, teacher.carAvailable, teacher.vehiculo_propio, teacher.coche),
    bio: clean(teacher.bio || teacher.presentacion || teacher.experiencia || teacher.experienceSummary, 1500),
    hasBizum: teacher.acepta_bizum === true || teacher.hasBizum === true,
    status: lower(teacher.estado_verificacion || teacher.verificationStatus || teacher.status || teacher.estado),
    active: teacher.active !== false && teacher.activo !== false,
    maxStudents: Number(teacher.maxStudents || teacher.max_alumnos || 5),
    activeAssignments: Number(firstNumber(teacher.activeAssignments, teacher.active_assignments, signals.activeAssignments) || 0),
    rating: firstNumber(teacher.valoracion_media, teacher.averageRating, teacher.rating, teacher.scoreValoracion),
    reviewsCount: Number(firstNumber(teacher.reviewsCount, teacher.valoraciones_count, teacher.totalReviews) || 0),
    responseTimeHours: responseHours,
    acceptanceRate: rate01(teacher.acceptanceRate ?? teacher.ratio_aceptacion ?? signals.acceptanceRate)
      ?? (accepted !== null && offered ? clamp(accepted / offered, 0, 1) : null),
    completionRate: rate01(teacher.completionRate ?? teacher.classCompletionRate ?? teacher.ratio_clases_realizadas),
    cancellationRate: rate01(teacher.cancellationRate ?? teacher.cancelRate ?? teacher.ratio_cancelacion),
    acceptedRequests: Number(firstNumber(teacher.acceptedRequests, teacher.solicitudesAceptadas, signals.acceptedRequests) || 0),
    offeredRequests: Number(firstNumber(teacher.offeredRequests, teacher.solicitudesOfrecidas, signals.offeredRequests) || 0),
    completedClasses: Number(firstNumber(teacher.completedClasses, signals.completedClasses, teacher.reputationMetrics?.completedClasses, teacher.publicTrustStats?.completedClasses) || 0),
    completedClassesForSubject: Number(firstNumber(teacher.completedClassesForSubject, signals.completedClassesForSubject) || 0),
    completedClassesWithFamily: Number(firstNumber(teacher.completedClassesWithFamily, signals.completedClassesWithFamily) || 0),
    completedClassesWithStudent: Number(firstNumber(teacher.completedClassesWithStudent, signals.completedClassesWithStudent) || 0),
    recentCompletedClasses: Number(firstNumber(teacher.recentCompletedClasses, signals.recentCompletedClasses) || 0),
    priorFamilyAssignments: Number(firstNumber(teacher.priorFamilyAssignments, signals.priorFamilyAssignments) || 0),
    priorStudentAssignments: Number(firstNumber(teacher.priorStudentAssignments, signals.priorStudentAssignments) || 0),
    priorSubjectAssignments: Number(firstNumber(teacher.priorSubjectAssignments, signals.priorSubjectAssignments) || 0),
    trustScore: firstNumber(teacher.reputationScore, teacher.publicTrustScore, teacher.trustScore, teacher.trust_profile_score),
    trustLevel: clean(teacher.trustLevel || teacher.trust_level, 80),
    trustBadges: Array.isArray(teacher.trustBadges) ? teacher.trustBadges : [],
    trustWarnings: Array.isArray(teacher.trustWarnings) ? teacher.trustWarnings : [],
    publicTrustStats: teacher.publicTrustStats || {},
    reputationMetrics: teacher.reputationMetrics || {},
    adminTrustStats: teacher.adminTrustStats || {},
    raw: teacher,
  };
}

export function getRequestProfile(request = {}) {
  const metadata = request.metadata || {};
  const student = request.studentSnapshot || request.alumnos || {};
  const family = request.familySnapshot || request.familias?.usuarios || request.familias || {};
  const availabilitySlots = structuredAvailabilitySlots(
    request.availabilitySlots,
    request.disponibilidadSlots,
    request.disponibilidad_slots,
    request.studentAvailabilitySlots,
    request.alumnoAvailabilitySlots,
    metadata.availabilitySlots,
    metadata.disponibilidadSlots,
    student.availabilitySlots,
    student.disponibilidadSlots,
    student.disponibilidad_slots,
    student.franjasDisponibles,
    family.availabilitySlots,
    family.disponibilidadSlots,
  );
  return {
    id: request.id || request.requestId || '',
    familyUid: clean(request.familyUid || request.familia_id || request.familyId || metadata.familyUid || family.id || family.userUid || family.usuario_id, 180),
    studentId: clean(request.studentId || request.alumno_id || request.studentUid || metadata.studentId || student.id || student.studentId || student.alumno_id, 180),
    subject: clean(request.materia || request.subject || metadata.materia || metadata.materias || request.asunto, 180),
    level: clean(request.nivel || request.nivel_educativo || request.curso || student.nivel || student.nivel_educativo || metadata.nivel || metadata.niveles, 120),
    modality: clean(request.modalidad || request.modality || metadata.modalidad || metadata.formato, 120),
    zone: clean(request.zona || request.zone || metadata.zona || family.zona || family.city || family.ciudad, 180),
    city: clean(request.ciudad || metadata.ciudad || family.ciudad || family.city, 120),
    postalCode: clean(request.codigo_postal || request.postalCode || metadata.codigo_postal || family.codigo_postal || family.postalCode, 20),
    address: clean(request.direccion || request.address || metadata.direccion || metadata.address || student.direccion || student.address || family.direccion || family.address, 240),
    lat: firstNumber(request.lat, request.latitude, metadata.lat, metadata.latitude, student.lat, student.latitude, family.lat, family.latitude),
    lng: firstNumber(request.lng, request.lon, request.longitude, metadata.lng, metadata.lon, metadata.longitude, student.lng, student.lon, student.longitude, family.lng, family.lon, family.longitude),
    schedule: clean(request.preferencia_horario || request.disponibilidad || request.schedule || metadata.disponibilidad || metadata.frecuencia || metadata.inicio, 300),
    availabilitySlots,
    studentName: clean(student.nombre || request.alumno_nombre || metadata.alumno, 160),
    familyName: clean([family.nombre, family.apellidos].filter(Boolean).join(' ') || request.familia_nombre, 160),
  };
}

export function buildTeacherMatchingSignals(teacher = {}, request = {}, context = {}) {
  const profile = getRequestProfile(request || {});
  const teacherIds = idSet(
    teacher.id,
    teacher.teacherUid,
    teacher.profesor_id,
    teacher.profesorId,
    teacher.userUid,
    teacher.usuario_id,
    teacher.teacherUserUid,
  );
  const familyIds = idSet(
    profile.familyUid,
    request.familyUid,
    request.familia_id,
    request.familyId,
    request.familias?.id,
    request.familias?.userUid,
    request.familias?.usuario_id,
  );
  const studentIds = idSet(
    profile.studentId,
    request.studentId,
    request.alumno_id,
    request.studentUid,
    request.alumnos?.id,
  );

  const assignments = Array.isArray(context.assignments) ? context.assignments : [];
  const classes = Array.isArray(context.classes) ? context.classes : [];
  const rawRequestMatches = [
    ...(Array.isArray(context.requestMatches) ? context.requestMatches : []),
    ...(Array.isArray(context.matches) ? context.matches : []),
    ...(Array.isArray(context.solicitudMatches) ? context.solicitudMatches : []),
  ];
  const requestMatches = [...new Map(rawRequestMatches.map((item, index) => [
    clean(item?.id || item?.requestMatchId || item?.solicitudMatchId || `${item?.requestId || item?.solicitud_id || 'match'}_${item?.teacherUid || item?.profesor_id || index}`, 260),
    item,
  ])).values()];

  const teacherFieldNames = ['teacherUid', 'profesor_id', 'profesorId', 'teacherUserUid', 'userUid', 'usuario_id'];
  const familyFieldNames = ['familyUid', 'familia_id', 'familyId'];
  const studentFieldNames = ['studentId', 'alumno_id', 'studentUid', 'alumnoId'];

  const teacherAssignments = assignments.filter((item) => itemMatchesAnyId(item, teacherFieldNames, teacherIds));
  const activeAssignments = teacherAssignments.filter(isActiveAssignment).length;
  const priorFamilyAssignments = familyIds.size
    ? teacherAssignments.filter((item) => !isCanceledStatus(item) && itemMatchesAnyId(item, familyFieldNames, familyIds)).length
    : 0;
  const priorStudentAssignments = studentIds.size
    ? teacherAssignments.filter((item) => !isCanceledStatus(item) && itemMatchesAnyId(item, studentFieldNames, studentIds)).length
    : 0;
  const priorSubjectAssignments = teacherAssignments.filter((item) => !isCanceledStatus(item) && sameSubjectContext(item, profile.subject)).length;

  const teacherClasses = classes.filter((item) => itemMatchesAnyId(item, teacherFieldNames, teacherIds));
  const completedClasses = teacherClasses.filter(isCompletedClass);
  const completedClassesForSubject = completedClasses.filter((item) => sameSubjectContext(item, profile.subject)).length;
  const completedClassesWithFamily = familyIds.size
    ? completedClasses.filter((item) => itemMatchesAnyId(item, familyFieldNames, familyIds)).length
    : 0;
  const completedClassesWithStudent = studentIds.size
    ? completedClasses.filter((item) => itemMatchesAnyId(item, studentFieldNames, studentIds)).length
    : 0;
  const recentCutoff = Date.now() - 60 * 24 * 60 * 60 * 1000;
  const recentCompletedClasses = completedClasses.filter((item) => {
    const when = matchingDateMillis(item.fecha || item.date || item.startAt || item.startsAt || item.createdAt);
    return when >= recentCutoff;
  }).length;

  const teacherMatches = requestMatches.filter((item) => itemMatchesAnyId(item, teacherFieldNames, teacherIds));
  const offeredRequests = teacherMatches.length;
  const acceptedRequests = teacherMatches.filter(isAcceptedMatchStatus).length;
  const acceptanceRate = offeredRequests ? clamp(acceptedRequests / offeredRequests, 0, 1) : null;

  return {
    matchingSignals: {
      activeAssignments,
      priorFamilyAssignments,
      priorStudentAssignments,
      priorSubjectAssignments,
      completedClasses: completedClasses.length,
      completedClassesForSubject,
      completedClassesWithFamily,
      completedClassesWithStudent,
      recentCompletedClasses,
      offeredRequests,
      acceptedRequests,
      acceptanceRate,
    },
    activeAssignments,
    priorFamilyAssignments,
    priorStudentAssignments,
    priorSubjectAssignments,
    completedClasses: completedClasses.length,
    completedClassesForSubject,
    completedClassesWithFamily,
    completedClassesWithStudent,
    recentCompletedClasses,
    offeredRequests,
    acceptedRequests,
    ...(acceptanceRate !== null ? { acceptanceRate } : {}),
  };
}

export function evaluateTeacherProfile(teacher = {}) {
  const profile = getTeacherProfile(teacher);
  const issues = [];
  const strengths = [];

  if (!profile.active) issues.push({ field: 'activo', label: 'Profesor inactivo', weight: 20 });
  if (!profile.photoUrl) issues.push({ field: 'foto', label: 'Subir foto real', weight: 8 });
  else strengths.push('Foto disponible');
  if (!profile.email) issues.push({ field: 'email', label: 'Completar email', weight: 12 });
  else strengths.push('Email disponible');
  if (!profile.phone) issues.push({ field: 'telefono', label: 'Completar telefono', weight: 10 });
  else strengths.push('Telefono disponible');
  if (!profile.address) issues.push({ field: 'direccion', label: 'Completar calle/direccion', weight: 7 });
  if (!profile.city) issues.push({ field: 'ciudad', label: 'Completar ciudad', weight: 4 });
  if (!profile.postalCode) issues.push({ field: 'codigo_postal', label: 'Completar codigo postal', weight: 4 });
  if (!profile.zone) issues.push({ field: 'zona', label: 'Completar zona donde da clase', weight: 8 });
  else strengths.push('Zona definida');
  if (profile.hasCar === null) issues.push({ field: 'movilidad', label: 'Indicar si tiene coche', weight: 3 });
  else strengths.push(profile.hasCar ? 'Tiene coche para desplazarse' : 'Movilidad sin coche declarada');
  if (!profile.subjects.length) issues.push({ field: 'materias', label: 'Anadir materias', weight: 14 });
  else strengths.push(`${profile.subjects.length} materia(s)`);
  if (!profile.levels.length) issues.push({ field: 'niveles', label: 'Anadir niveles educativos', weight: 12 });
  else strengths.push(`${profile.levels.length} nivel(es)`);
  if (!profile.studyLevel) issues.push({ field: 'tipo_formacion', label: 'Indicar tipo de formacion principal', weight: 5 });
  if (!profile.exactStudy) issues.push({ field: 'estudio_exacto', label: 'Completar estudio exacto o titulacion', weight: 8 });
  else strengths.push(`Formacion: ${profile.exactStudy}`);
  if (!profile.schoolName) issues.push({ field: 'colegio', label: 'Completar colegio donde estudio', weight: 6 });
  else strengths.push(`Colegio: ${profile.schoolName}`);
  if (!profile.studyCenter) issues.push({ field: 'centro_estudios', label: 'Completar universidad o centro superior', weight: 6 });
  else strengths.push(`Centro superior: ${profile.studyCenter}`);
  if (profile.bachilleratoGrade === null || profile.bachilleratoGrade < 0 || profile.bachilleratoGrade > 10) {
    issues.push({ field: 'nota_bachillerato', label: 'Completar nota media de Bachillerato', weight: 4 });
  }
  if (profile.universityAverageGrade === null || profile.universityAverageGrade < 0 || profile.universityAverageGrade > 10) {
    issues.push({ field: 'nota_universidad', label: 'Completar nota media universitaria o formacion principal', weight: 4 });
  }
  if (!profile.hasBizum) issues.push({ field: 'bizum', label: 'Confirmar que tiene Bizum', weight: 4 });
  if (!profile.availability && !profile.availabilitySlots.length) issues.push({ field: 'disponibilidad', label: 'Indicar disponibilidad horaria', weight: 8 });
  else strengths.push('Disponibilidad indicada');
  if (!profile.bio || profile.bio.length < 40) issues.push({ field: 'presentacion', label: 'Escribir presentacion de al menos 40 caracteres', weight: 7 });
  else strengths.push('Presentacion suficiente');
  if (!['verificado', 'verified', 'activo', 'active'].includes(profile.status)) {
    issues.push({ field: 'verificacion', label: 'Pendiente de revision/verificacion admin', weight: 10 });
  } else {
    strengths.push('Verificado');
  }

  const penalty = issues.reduce((sum, issue) => sum + issue.weight, 0);
  const score = Math.max(0, Math.min(100, 100 - penalty));
  const blockingIssues = issues.filter((issue) => !['verificacion', 'movilidad'].includes(issue.field));
  const readiness = profile.active && score >= 85 && ['verificado', 'verified', 'activo', 'active'].includes(profile.status)
    ? 'asignable'
    : score >= 65
      ? 'revisable'
      : 'incompleto';

  return {
    score,
    readiness,
    complete: blockingIssues.length === 0,
    assignable: readiness === 'asignable',
    issues,
    issueLabels: issues.map((issue) => issue.label),
    strengths,
    profile,
  };
}

function component(name, ratio, detail, reasons = [], risks = [], extra = {}) {
  const max = MATCHING_WEIGHTS[name];
  const points = round(max * clamp(ratio, 0, 1));
  return { name, points, max, detail, reasons, risks, ...extra };
}

function scoreSubject(requestProfile, teacherProfile) {
  const request = subjectTags(requestProfile.subject);
  const teacher = subjectTags(teacherProfile.subjects);
  if (!request.size) return component('subject', 0.55, 'Materia poco especifica', ['Materia de la solicitud poco especifica'], ['Confirmar materia exacta']);
  const overlap = overlapCount(request, teacher);
  if (overlap > 0) {
    const ratio = Math.min(1, 0.72 + overlap / Math.max(4, request.size + 1));
    return component('subject', ratio, `Cubre ${requestProfile.subject}`, [`Cubre la materia (${requestProfile.subject}).`]);
  }
  const partial = [...request].some((token) => [...teacher].some((other) => token.includes(other) || other.includes(token)));
  if (partial) return component('subject', 0.55, 'Coincidencia parcial', [`Coincidencia parcial de materia (${requestProfile.subject}).`], ['Validar temario exacto']);
  return component('subject', 0, 'Sin coincidencia de materia', [], [`No hay coincidencia clara de materia (${requestProfile.subject}).`]);
}

function scoreLevel(requestProfile, teacherProfile) {
  const request = levelTags([requestProfile.level, requestProfile.subject].filter(Boolean).join(' '));
  const teacher = levelTags(teacherProfile.levels);
  if (!requestProfile.level) return component('level', 0.55, 'Nivel no indicado', ['Nivel no indicado; requiere confirmacion'], ['Falta nivel del alumno']);
  if (teacher.has('todos')) return component('level', 1, `Nivel cubierto: ${requestProfile.level}`, [`Nivel compatible (${requestProfile.level}).`]);
  if (overlapCount(request, teacher) > 0) return component('level', 1, `Nivel cubierto: ${requestProfile.level}`, [`Nivel compatible (${requestProfile.level}).`]);
  return component('level', 0.2, 'Nivel no confirmado', [], [`Nivel no confirmado (${requestProfile.level}).`]);
}

function scoreModality(requestProfile, teacherProfile) {
  const request = modalitySet(requestProfile.modality);
  const teacher = modalitySet(teacherProfile.modality);
  if (!request.size) return component('modality', 0.65, 'Modalidad flexible o no indicada', ['Modalidad flexible o no indicada']);
  if (!teacher.size) return component('modality', 0.45, 'Modalidad del profesor no indicada', [], ['Falta modalidad del profesor']);
  if (overlapCount(request, teacher) > 0) return component('modality', 1, `Modalidad compatible: ${requestProfile.modality}`, [`Modalidad compatible (${requestProfile.modality}).`]);
  return component('modality', 0, 'Modalidad incompatible', [], [`Modalidad incompatible o pendiente (${requestProfile.modality} vs ${teacherProfile.modality}).`]);
}

function scoreLocation(requestProfile, teacherProfile) {
  const requestModes = modalitySet(requestProfile.modality);
  const teacherModes = modalitySet(teacherProfile.modality);
  if (requestModes.has('online') && teacherModes.has('online')) {
    return component('location', 0.85, 'Online: la ubicacion pesa menos', ['Online disponible; ubicacion no limita.']);
  }

  const reqZone = normalizeText([requestProfile.zone, requestProfile.city].filter(Boolean).join(' '));
  const teacherZone = normalizeText([teacherProfile.zone, teacherProfile.city, teacherProfile.address].filter(Boolean).join(' '));
  const reqPostal = normalizeText(requestProfile.postalCode);
  const teacherPostal = normalizeText(teacherProfile.postalCode);
  const estimate = estimateTravelForMatch(requestProfile, teacherProfile);
  if (estimate.available) {
    let ratio = 0.18;
    if (estimate.drivingKm <= 2.5) ratio = 1;
    else if (estimate.drivingKm <= 5) ratio = 0.9;
    else if (estimate.drivingKm <= 8) ratio = 0.76;
    else if (estimate.drivingKm <= 12) ratio = 0.58;
    else if (estimate.drivingKm <= 18) ratio = 0.38;

    const reasons = [`Desplazamiento estimado: ${estimate.detail}.`];
    const risks = [];
    if (estimate.confidence !== 'coordinates') risks.push('Distancia estimada sin coordenadas exactas; confirmar direccion antes de asignar.');
    if (estimate.hasCar === false && estimate.drivingKm > 5) {
      ratio = Math.min(ratio, estimate.drivingKm > 10 ? 0.25 : 0.42);
      risks.push('El profesor no ha marcado coche para un desplazamiento presencial largo.');
    } else if (estimate.hasCar === null && estimate.drivingKm > 8) {
      ratio = Math.min(ratio, 0.62);
      risks.push('El profesor no ha indicado si tiene coche.');
    } else if (estimate.hasCar === true && estimate.needsCar) {
      reasons.push('Tiene coche declarado para desplazamientos.');
    }
    return component('location', ratio, estimate.detail, reasons, risks, { locationEstimate: estimate });
  }

  if (!reqZone && !reqPostal) return component('location', 0.45, 'Zona de familia no indicada', [], ['Falta zona/codigo postal de la familia']);
  if (!teacherZone && !teacherPostal) return component('location', 0.25, 'Zona del profesor no indicada', [], ['Falta zona/codigo postal del profesor']);
  if (reqPostal && teacherPostal && reqPostal === teacherPostal) return component('location', 1, 'Mismo codigo postal', ['Codigo postal compatible.']);
  if (reqPostal && teacherPostal && reqPostal.slice(0, 3) === teacherPostal.slice(0, 3)) return component('location', 0.82, 'Codigo postal cercano', ['Zona cercana por codigo postal.']);
  if (reqZone && teacherZone && (teacherZone.includes(reqZone) || reqZone.includes(teacherZone))) return component('location', 0.9, 'Zona textual compatible', [`Zona compatible (${requestProfile.zone || requestProfile.city}).`]);
  if (reqZone && teacherZone && overlapCount(new Set(tokenize(reqZone)), new Set(tokenize(teacherZone))) > 0) return component('location', 0.68, 'Zona parcialmente compatible', [`Zona parcialmente compatible (${requestProfile.zone || requestProfile.city}).`]);
  return component('location', 0.15, 'Zona no confirmada', [], [`Zona no confirmada (${requestProfile.zone || requestProfile.city}).`]);
}

function scoreAvailability(requestProfile, teacherProfile) {
  const requestDays = daySet(requestProfile.schedule);
  const requestPeriods = periodSet(requestProfile.schedule);
  const requestSlots = structuredAvailabilitySlots(requestProfile.availabilitySlots);
  const teacherSlots = structuredAvailabilitySlots(teacherProfile.availabilitySlots);
  if (!requestProfile.schedule && !requestSlots.length) return component('availability', 0.55, 'Horario de la familia no indicado', ['Horario flexible o pendiente'], ['Confirmar disponibilidad real']);

  const teacherDays = daySet(teacherProfile.availability);
  const teacherPeriods = periodSet(teacherProfile.availability);
  teacherSlots.forEach((slot) => {
    const day = slotDay(slot);
    if (Number.isFinite(day)) teacherDays.add(day);
    periodFromTimeRange(slot?.hora_inicio || slot?.startTime, slot?.hora_fin || slot?.endTime).forEach((period) => teacherPeriods.add(period));
  });

  if (!teacherProfile.availability && !teacherSlots.length) {
    return component('availability', 0.2, 'Profesor sin disponibilidad real', [], ['El profesor no tiene disponibilidad cargada']);
  }

  if (requestSlots.length && teacherSlots.length) {
    const fit = structuredAvailabilityFit(requestSlots, teacherSlots);
    const detail = `${Math.round(fit.ratio * 100)}% de las franjas del alumno encajan`;
    const examples = fit.examples.length ? ` Ej: ${fit.examples.join('; ')}.` : '';
    if (fit.ratio >= 0.85) {
      return component('availability', 1, detail, [`Franjas reales compatibles.${examples}`]);
    }
    if (fit.ratio >= 0.45) {
      return component('availability', Math.max(0.55, fit.ratio), detail, ['Hay solape parcial de franjas reales.'], ['Confirmar horario exacto antes de asignar']);
    }
    return component('availability', Math.max(0.12, fit.ratio), detail, [], ['Las franjas reales del alumno y profesor apenas se solapan']);
  }

  if (requestSlots.length && !teacherSlots.length) {
    return component('availability', 0.25, 'Alumno con franjas; profesor sin franjas estructuradas', [], ['Comparacion exacta de horario bloqueada por falta de franjas del profesor']);
  }

  const dayRatio = !requestDays.size || !teacherDays.size ? 0.55 : overlapCount(requestDays, teacherDays) / requestDays.size;
  const periodRatio = !requestPeriods.size || !teacherPeriods.size ? 0.55 : overlapCount(requestPeriods, teacherPeriods) / requestPeriods.size;
  const ratio = (dayRatio * 0.48) + (periodRatio * 0.52);
  if (ratio >= 0.75) return component('availability', ratio, 'Disponibilidad compatible', ['Disponibilidad horaria compatible.']);
  if (ratio >= 0.4) return component('availability', ratio, 'Disponibilidad parcial', ['Disponibilidad parcialmente compatible.'], ['Confirmar horario concreto']);
  return component('availability', ratio, 'Disponibilidad baja', [], ['Disponibilidad poco compatible']);
}

function slotDurationMinutes(slot = {}) {
  const start = minutesFromTime(slot.startTime || slot.hora_inicio);
  const end = minutesFromTime(slot.endTime || slot.hora_fin);
  if (start === null || end === null || end <= start) return 0;
  return end - start;
}

function overlapMinutes(a = {}, b = {}) {
  const aStart = minutesFromTime(a.startTime || a.hora_inicio);
  const aEnd = minutesFromTime(a.endTime || a.hora_fin);
  const bStart = minutesFromTime(b.startTime || b.hora_inicio);
  const bEnd = minutesFromTime(b.endTime || b.hora_fin);
  if (aStart === null || aEnd === null || bStart === null || bEnd === null) return 0;
  if (a.dayIndex !== b.dayIndex) return 0;
  return Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart));
}

function structuredAvailabilityFit(requestSlots = [], teacherSlots = []) {
  const request = normalizeStructuredAvailabilitySlots(requestSlots);
  const teacher = normalizeStructuredAvailabilitySlots(teacherSlots);
  let total = 0;
  let covered = 0;
  const examples = [];

  request.forEach((requestSlot) => {
    const duration = slotDurationMinutes(requestSlot);
    if (!duration) return;
    total += duration;
    const best = teacher
      .map((teacherSlot) => ({ teacherSlot, minutes: overlapMinutes(requestSlot, teacherSlot) }))
      .sort((a, b) => b.minutes - a.minutes)[0];
    if (best?.minutes > 0) {
      covered += Math.min(duration, best.minutes);
      if (examples.length < 2) {
        examples.push(`${availabilitySlotLabel(requestSlot)} con ${availabilitySlotLabel(best.teacherSlot)}`);
      }
    }
  });

  return {
    ratio: total ? clamp(covered / total, 0, 1) : 0,
    coveredMinutes: covered,
    totalMinutes: total,
    examples,
  };
}

function scoreExperience(requestProfile, teacherProfile) {
  const requestSubjects = subjectTags(requestProfile.subject);
  const educationText = normalizeText([teacherProfile.studyLevel, teacherProfile.exactStudy, teacherProfile.schoolName, teacherProfile.studyCenter, teacherProfile.bio].join(' '));
  const educationSubjects = subjectTags(educationText);
  const subjectSpecific = overlapCount(requestSubjects, educationSubjects) > 0;
  const years = Number(teacherProfile.experienceYears || 0);
  let ratio = 0.2;
  if (subjectSpecific) ratio += 0.35;
  ratio += Math.min(0.25, years / 20);
  if ((teacherProfile.bachilleratoGrade || 0) >= 8.5) ratio += 0.08;
  if ((teacherProfile.universityAverageGrade || 0) >= 8) ratio += 0.12;
  const reasons = [];
  if (subjectSpecific) reasons.push('Formacion relacionada con la materia.');
  if (years > 0) reasons.push(`${years} anio(s) de experiencia declarada.`);
  return component('experience', ratio, subjectSpecific ? 'Formacion afín' : 'Experiencia general', reasons, subjectSpecific ? [] : ['Validar experiencia especifica']);
}

function scoreReputation(teacherProfile) {
  const parts = [];
  const reasons = [];
  const risks = [];

  const persistedTrust = teacherProfile.trustScore !== null
    ? {
      score: clamp(teacherProfile.trustScore, 0, 100),
      level: teacherProfile.trustLevel || '',
      badges: teacherProfile.trustBadges || [],
      warnings: teacherProfile.trustWarnings || [],
      metrics: teacherProfile.reputationMetrics || {},
      publicStats: teacherProfile.publicTrustStats || {},
      adminStats: teacherProfile.adminTrustStats || {},
    }
    : null;
  const computedTrust = persistedTrust || buildTeacherTrustProfile(teacherProfile.raw || teacherProfile, {
    stats: {
      completedClasses: teacherProfile.reputationMetrics?.completedClasses ?? teacherProfile.publicTrustStats?.completedClasses,
      completedHours: teacherProfile.reputationMetrics?.completedHours ?? teacherProfile.publicTrustStats?.completedHours,
      activeStudents: teacherProfile.reputationMetrics?.activeStudents ?? teacherProfile.publicTrustStats?.activeStudents,
      completionRate: teacherProfile.completionRate ?? teacherProfile.reputationMetrics?.completionRate,
      cancellationRate: teacherProfile.cancellationRate ?? teacherProfile.reputationMetrics?.cancellationRate,
      punctualityRate: teacherProfile.reputationMetrics?.punctualityRate ?? teacherProfile.publicTrustStats?.punctualityRate,
      averageResponseHours: teacherProfile.responseTimeHours ?? teacherProfile.reputationMetrics?.averageResponseHours,
      acceptanceRate: teacherProfile.acceptanceRate ?? teacherProfile.reputationMetrics?.acceptanceRate,
      activeAssignments: teacherProfile.activeAssignments,
    },
  });
  if (computedTrust?.score !== undefined) {
    parts.push(clamp(computedTrust.score, 0, 100) / 100);
    reasons.push(`Confianza operativa ${Math.round(computedTrust.score)}/100.`);
    if ((computedTrust.warnings || []).length) risks.push(...computedTrust.warnings.slice(0, 2));
  }
  const reputationMetrics = computedTrust.metrics || {};
  const publicStats = computedTrust.publicStats || {};
  const completedHours = firstNumber(reputationMetrics.completedHours, publicStats.completedHours);
  const activeStudents = firstNumber(reputationMetrics.activeStudents, publicStats.activeStudents);
  const punctualityRate = rate01(reputationMetrics.punctualityRate ?? publicStats.punctualityRate);
  const adjustedCompletionRate = rate01(reputationMetrics.adjustedCompletionRate);
  const adjustedCancellationRate = rate01(reputationMetrics.adjustedCancellationRate);

  if (adjustedCompletionRate !== null) parts.push(adjustedCompletionRate);
  if (adjustedCancellationRate !== null) parts.push(1 - adjustedCancellationRate);
  if (punctualityRate !== null) {
    parts.push(punctualityRate);
    reasons.push(`Puntualidad ${Math.round(punctualityRate * 100)}%.`);
  }
  if (completedHours !== null && completedHours > 0) {
    parts.push(Math.min(1, completedHours / 40));
    reasons.push(`${round(completedHours, 1)}h impartidas registradas.`);
  }
  if (activeStudents !== null && activeStudents > 0) {
    parts.push(Math.min(1, activeStudents / 4));
    reasons.push(`${activeStudents} alumno(s) activo(s).`);
  }

  if (teacherProfile.rating !== null) {
    parts.push(clamp(teacherProfile.rating, 0, 5) / 5);
    reasons.push(`Valoracion media ${round(teacherProfile.rating, 1)}/5.`);
  }
  if (teacherProfile.reviewsCount) {
    parts.push(Math.min(1, teacherProfile.reviewsCount / 12));
    reasons.push(`${teacherProfile.reviewsCount} valoracion(es).`);
  }
  if (teacherProfile.responseTimeHours !== null) {
    const ratio = teacherProfile.responseTimeHours <= 2 ? 1 : teacherProfile.responseTimeHours <= 8 ? 0.75 : teacherProfile.responseTimeHours <= 24 ? 0.45 : 0.2;
    parts.push(ratio);
    reasons.push(`Tiempo de respuesta ${round(teacherProfile.responseTimeHours, 1)}h.`);
  }
  if (teacherProfile.acceptanceRate !== null) {
    parts.push(teacherProfile.acceptanceRate);
    reasons.push(`Acepta ${Math.round(teacherProfile.acceptanceRate * 100)}% de solicitudes.`);
  }
  if (teacherProfile.completionRate !== null) parts.push(teacherProfile.completionRate);
  if (teacherProfile.cancellationRate !== null) {
    parts.push(1 - teacherProfile.cancellationRate);
    if (teacherProfile.cancellationRate > 0.15) risks.push('Ratio de cancelacion alto.');
  }

  if (!parts.length) {
    return component('reputation', 0.58, 'Sin historico suficiente', ['Sin historico: se aplica valor neutro.'], ['Faltan valoraciones/respuesta/aceptacion']);
  }

  const ratio = parts.reduce((sum, value) => sum + value, 0) / parts.length;
  return component('reputation', ratio, 'Historico operativo', reasons, risks);
}

function scoreFitConfidence(requestProfile, teacherProfile) {
  const parts = [];
  const reasons = [];
  const risks = [];

  const priorStudent = Number(teacherProfile.priorStudentAssignments || teacherProfile.completedClassesWithStudent || 0);
  const priorFamily = Number(teacherProfile.priorFamilyAssignments || teacherProfile.completedClassesWithFamily || 0);
  if (priorStudent > 0) {
    parts.push(1);
    reasons.push('Continuidad: ya ha trabajado con este alumno.');
  } else if (priorFamily > 0) {
    parts.push(0.88);
    reasons.push('Continuidad: ya ha trabajado con esta familia.');
  } else {
    parts.push(0.56);
    reasons.push('Sin continuidad previa: se usa valor neutro.');
  }

  const completedForSubject = Number(teacherProfile.completedClassesForSubject || teacherProfile.priorSubjectAssignments || 0);
  if (completedForSubject > 0) {
    parts.push(Math.min(1, 0.58 + completedForSubject / 14));
    reasons.push(`${completedForSubject} clase(s) o asignacion(es) previas en ${requestProfile.subject || 'esta materia'}.`);
  } else if (Number(teacherProfile.completedClasses || 0) > 0) {
    parts.push(0.55);
    reasons.push('Tiene historico general, sin muestra especifica de esta materia.');
  } else {
    parts.push(0.56);
  }

  if (teacherProfile.acceptanceRate !== null) {
    const ratio = clamp(teacherProfile.acceptanceRate, 0, 1);
    parts.push(ratio);
    reasons.push(`Probabilidad historica de aceptacion ${Math.round(ratio * 100)}%.`);
    if (ratio < 0.45) risks.push('Baja probabilidad historica de aceptar nuevas solicitudes.');
  } else {
    parts.push(0.58);
    reasons.push('Sin historico de aceptacion: probabilidad neutra.');
  }

  if (teacherProfile.responseTimeHours !== null) {
    const responseRatio = teacherProfile.responseTimeHours <= 2
      ? 1
      : teacherProfile.responseTimeHours <= 8
        ? 0.82
        : teacherProfile.responseTimeHours <= 24
          ? 0.55
          : 0.24;
    parts.push(responseRatio);
    reasons.push(`Respuesta media ${round(teacherProfile.responseTimeHours, 1)}h.`);
    if (teacherProfile.responseTimeHours > 24) risks.push('Respuesta lenta: puede retrasar la asignacion.');
  } else {
    parts.push(0.58);
  }

  const maxStudents = Math.max(1, Number(teacherProfile.maxStudents || 5));
  const activeAssignments = Math.max(0, Number(teacherProfile.activeAssignments || 0));
  const remaining = maxStudents - activeAssignments;
  const workloadRatio = remaining <= 0 ? 0 : Math.min(1, remaining / Math.max(2, maxStudents * 0.5));
  parts.push(workloadRatio);
  if (remaining > 0) reasons.push(`Carga asumible: ${remaining} plaza(s) estimadas.`);
  else risks.push('Carga completa: riesgo alto de rechazo o saturacion.');

  const recentCompleted = Number(teacherProfile.recentCompletedClasses || 0);
  if (recentCompleted > 0) {
    parts.push(Math.min(1, 0.6 + recentCompleted / 10));
    reasons.push(`${recentCompleted} clase(s) completadas recientemente.`);
  } else {
    parts.push(0.55);
  }

  const ratio = parts.reduce((sum, value) => sum + value, 0) / parts.length;
  const detail = ratio >= 0.78
    ? 'Alta probabilidad de encaje operativo'
    : ratio >= 0.58
      ? 'Probabilidad media de encaje'
      : 'Encaje operativo debil';
  return component('fitConfidence', ratio, detail, reasons, risks);
}

function scoreCapacity(teacherProfile) {
  const max = Math.max(1, Number(teacherProfile.maxStudents || 5));
  const active = Math.max(0, Number(teacherProfile.activeAssignments || 0));
  const remaining = max - active;
  if (remaining <= 0) return component('capacity', 0, 'Sin plazas libres', [], ['Carga actual completa']);
  const ratio = Math.min(1, remaining / Math.max(2, max * 0.6));
  return component('capacity', ratio, `${remaining} plaza(s) libres`, [`${remaining} plaza(s) estimadas disponibles.`]);
}

function capScore(score, cap, enabled) {
  return enabled ? Math.min(score, cap) : score;
}

export function scoreTeacherForRequest(request, teacher) {
  const requestProfile = getRequestProfile(request);
  const teacherQuality = evaluateTeacherProfile(teacher);
  const teacherProfile = teacherQuality.profile;
  const components = [
    scoreSubject(requestProfile, teacherProfile),
    scoreLevel(requestProfile, teacherProfile),
    scoreModality(requestProfile, teacherProfile),
    scoreLocation(requestProfile, teacherProfile),
    scoreAvailability(requestProfile, teacherProfile),
    scoreFitConfidence(requestProfile, teacherProfile),
    scoreExperience(requestProfile, teacherProfile),
    scoreReputation(teacherProfile),
    scoreCapacity(teacherProfile),
    component('profileQuality', teacherQuality.score / 100, `Perfil ${teacherQuality.score}/100`, teacherQuality.score >= 85 ? ['Perfil completo y revisado.'] : [], teacherQuality.score < 85 ? [`Perfil revisable (${teacherQuality.score}/100).`] : []),
  ];

  const breakdown = Object.fromEntries(components.map((part) => [part.name, {
    points: part.points,
    max: part.max,
    detail: part.detail,
    ...(part.locationEstimate ? { locationEstimate: part.locationEstimate } : {}),
  }]));

  const reasons = unique(components.flatMap((part) => part.reasons));
  const risks = unique(components.flatMap((part) => part.risks));
  const hardBlocks = [];
  if (!teacherProfile.active) hardBlocks.push('Profesor inactivo');
  if (!teacherProfile.teacherUid) hardBlocks.push('Profesor sin identificador');
  if (components.find((part) => part.name === 'subject')?.points === 0 && requestProfile.subject) hardBlocks.push('Materia no compatible');
  if (components.find((part) => part.name === 'modality')?.points === 0) hardBlocks.push('Modalidad incompatible');

  let score = components.reduce((sum, part) => sum + part.points, 0);
  score = capScore(score, 45, hardBlocks.includes('Materia no compatible'));
  score = capScore(score, 55, hardBlocks.includes('Modalidad incompatible'));
  score = capScore(score, 58, components.find((part) => part.name === 'capacity')?.points === 0);
  score = capScore(score, 68, !['verificado', 'verified', 'activo', 'active'].includes(teacherProfile.status));
  score = capScore(score, 72, teacherQuality.score < 85);
  if (hardBlocks.includes('Profesor inactivo') || hardBlocks.includes('Profesor sin identificador')) score = 0;

  const normalized = Math.max(0, Math.min(100, Math.round(score)));
  const assignable = teacherQuality.assignable && !hardBlocks.length && normalized >= 65;
  if (!['verificado', 'verified', 'activo', 'active'].includes(teacherProfile.status)) risks.push('Profesor pendiente de verificacion');
  if (hardBlocks.length) risks.push(...hardBlocks);

  return {
    teacherUid: teacherProfile.teacherUid,
    profesor_id: teacherProfile.teacherUid,
    userUid: teacherProfile.userUid,
    teacherUserUid: teacherProfile.userUid,
    teacherName: teacherProfile.name,
    nombreProfesor: teacherProfile.name,
    teacherEmail: teacherProfile.email,
    score: normalized,
    scoreBreakdown: breakdown,
    locationEstimate: breakdown.location?.locationEstimate || null,
    reasons: unique(reasons).slice(0, 8),
    risks: unique(risks).slice(0, 8),
    profileScore: teacherQuality.score,
    profileIssues: teacherQuality.issueLabels,
    assignable,
    readiness: assignable ? 'asignable' : teacherQuality.readiness,
    hardBlocks,
    source: MATCHING_VERSION,
    matchingVersion: MATCHING_VERSION,
    trustScore: teacherProfile.trustScore ?? Math.round((buildTeacherTrustProfile(teacherProfile.raw || teacherProfile, {
      stats: {
        completedClasses: teacherProfile.reputationMetrics?.completedClasses ?? teacherProfile.publicTrustStats?.completedClasses,
        completionRate: teacherProfile.completionRate ?? teacherProfile.reputationMetrics?.completionRate,
        cancellationRate: teacherProfile.cancellationRate ?? teacherProfile.reputationMetrics?.cancellationRate,
        averageResponseHours: teacherProfile.responseTimeHours ?? teacherProfile.reputationMetrics?.averageResponseHours,
        acceptanceRate: teacherProfile.acceptanceRate ?? teacherProfile.reputationMetrics?.acceptanceRate,
        activeAssignments: teacherProfile.activeAssignments,
      },
    }).score)),
    trustLevel: teacherProfile.trustLevel || '',
  };
}

export function rankTeachersForRequest(request, teachers = [], options = {}) {
  const limit = Number(options.limit || 5);
  const minScore = Number(options.minScore ?? 1);
  return teachers
    .map((teacher) => scoreTeacherForRequest(request, teacher))
    .filter((match) => options.includeZeroScore ? true : match.score >= minScore)
    .sort((a, b) => {
      if (Number(b.assignable) !== Number(a.assignable)) return Number(b.assignable) - Number(a.assignable);
      if (b.score !== a.score) return b.score - a.score;
      const bFit = Number(b.scoreBreakdown?.fitConfidence?.points || 0);
      const aFit = Number(a.scoreBreakdown?.fitConfidence?.points || 0);
      if (bFit !== aFit) return bFit - aFit;
      if (b.profileScore !== a.profileScore) return b.profileScore - a.profileScore;
      return String(a.teacherName).localeCompare(String(b.teacherName));
    })
    .slice(0, limit);
}

const MATCHING_FACTOR_LABELS = Object.freeze({
  subject: 'materia',
  level: 'nivel',
  modality: 'modalidad',
  location: 'cercania',
  availability: 'horario',
  experience: 'experiencia',
  reputation: 'fiabilidad',
  capacity: 'carga',
  fitConfidence: 'probabilidad de aceptacion',
  profileQuality: 'perfil',
});

function matchingDecisionFactors(match = {}, limit = 4) {
  return Object.entries(match.scoreBreakdown || {})
    .filter(([, value]) => value && Number.isFinite(Number(value.points)) && Number(value.max) > 0)
    .map(([key, value]) => ({
      key,
      label: MATCHING_FACTOR_LABELS[key] || key,
      points: Number(value.points || 0),
      max: Number(value.max || 0),
      ratio: Number(value.max) ? Number(value.points || 0) / Number(value.max) : 0,
      detail: clean(value.detail, 220),
    }))
    .sort((a, b) => {
      if (b.ratio !== a.ratio) return b.ratio - a.ratio;
      return b.points - a.points;
    })
    .slice(0, limit);
}

export function buildMatchingDecisionSupport(request, candidates = []) {
  const profile = getRequestProfile(request);
  const matches = (candidates || []).filter(Boolean);
  const assignable = matches.filter((match) => match.assignable);
  const best = matches[0] || null;
  const warnings = [];
  const missing = [];

  if (!profile.subject) missing.push('materia');
  if (!profile.level) missing.push('nivel');
  if (!profile.modality) missing.push('modalidad');
  if (!profile.schedule && !profile.availabilitySlots.length) missing.push('horario/franjas');
  if (!profile.zone && !profile.postalCode && !profile.address && !modalitySet(profile.modality).has('online')) missing.push('zona o direccion');
  if (!matches.length) warnings.push('No hay candidatos calculados para esta solicitud.');
  if (matches.length && !assignable.length) warnings.push('Hay candidatos, pero ninguno es asignable sin revisar perfil/verificacion.');
  if (best?.hardBlocks?.length) warnings.push(`El primer candidato tiene bloqueo: ${best.hardBlocks.join(', ')}.`);
  if (best?.risks?.length) warnings.push(...best.risks.slice(0, 2));
  const decisionFactors = best ? matchingDecisionFactors(best, 4) : [];

  const bestScore = Number(best?.score || 0);
  const confidenceScore = Math.round(Math.min(100,
    (assignable.length ? 30 : 0)
    + Math.min(45, Math.max(0, bestScore) * 0.45)
    + (missing.length ? 0 : 15)
    + (best?.locationEstimate?.available || modalitySet(profile.modality).has('online') ? 10 : 0),
  ));
  const quality = !matches.length
    ? 'sin_match'
    : confidenceScore >= 82 && assignable.length
      ? 'listo_para_asignar'
      : confidenceScore >= 58
        ? 'revisar_antes_de_asignar'
        : 'datos_insuficientes';
  const nextAction = quality === 'listo_para_asignar'
    ? 'Asignar el primer candidato si el admin confirma criterio pedagogico.'
    : quality === 'sin_match'
      ? 'Pedir mas datos o ampliar profesores disponibles.'
      : missing.length
        ? `Completar ${joinNatural(missing)} antes de cerrar asignacion.`
        : 'Revisar riesgos y confirmar disponibilidad exacta.';

  return {
    version: MATCHING_VERSION,
    quality,
    confidenceScore,
    summary: best
      ? `${best.teacherName || 'Profesor'} encaja con ${bestScore}% y ${assignable.length} candidato(s) asignable(s).`
      : 'Sin candidato claro para la solicitud.',
    thinkingSummary: best
      ? `Decision basada sobre todo en ${joinNatural(decisionFactors.map((factor) => factor.label), 'las senales disponibles')}.`
      : 'No hay suficientes profesores compatibles para razonar una recomendacion fiable.',
    publicSummary: best
      ? `Estamos priorizando horario, cercania, experiencia y fiabilidad para proponerte el mejor profesor disponible.`
      : 'Estamos revisando alternativas para encontrar un profesor adecuado.',
    decisionFactors,
    nextAction,
    warnings: unique(warnings).slice(0, 6),
    missing,
    topTeacherUid: best?.teacherUid || '',
    topScore: bestScore,
    assignableCount: assignable.length,
    candidatesCount: matches.length,
  };
}

export function buildMatchingAiPrompt(requestProfile, baseCandidates = []) {
  const profile = requestProfile.subject !== undefined ? requestProfile : getRequestProfile(requestProfile);
  const teacherBlock = baseCandidates.slice(0, 8).map((candidate, index) => {
    const breakdown = Object.entries(candidate.scoreBreakdown || {})
      .map(([key, value]) => `${key}:${value.points}/${value.max}`)
      .join(', ');
    const travel = candidate.locationEstimate?.detail || candidate.scoreBreakdown?.location?.locationEstimate?.detail || candidate.scoreBreakdown?.location?.detail || 'sin estimacion';
    return `P${index + 1}: id="${candidate.teacherUid}" nombre="${candidate.teacherName}" scoreBase=${candidate.score} desplazamiento="${travel}" breakdown="${breakdown}" razones="${(candidate.reasons || []).join('; ')}" riesgos="${(candidate.risks || []).join('; ')}"`;
  }).join('\n');

  return [
    'Eres el asistente de matching de ClasesDe10.',
    'No inventes datos, no propongas profesores fuera de la lista y no ignores bloqueos.',
    'Tu papel es reordenar candidatos ya prefiltrados y explicar riesgos pedagogicos u operativos.',
    'El score final esta acotado por el sistema; tu score es solo una senal auxiliar.',
    '',
    `SOLICITUD: materia="${profile.subject}" nivel="${profile.level}" modalidad="${profile.modality}" zona="${profile.zone}" cp="${profile.postalCode}" direccion="${profile.address}" horario="${profile.schedule}" alumno="${profile.studentName}"`,
    'CANDIDATOS:',
    teacherBlock,
    '',
    'JSON requerido: {"matches":[{"teacherUid":"id exacto","score":90,"reason":"motivo breve para admin","risks":["riesgo breve"]}]}',
  ].join('\n');
}

export function mergeAiRanking(baseCandidates, aiResult) {
  if (!aiResult?.matches?.length) {
    return baseCandidates.map((candidate) => ({ ...candidate, aiReason: '', aiRisks: [], aiAdjustment: 0 }));
  }

  const baseByTeacher = new Map(baseCandidates.map((candidate) => [candidate.teacherUid, candidate]));
  const seen = new Set();
  const ranked = [];

  for (const match of aiResult.matches) {
    const teacherUid = clean(match.teacherUid, 120);
    const candidate = baseByTeacher.get(teacherUid);
    if (!candidate || seen.has(teacherUid)) continue;
    seen.add(teacherUid);
    const aiScore = clamp(Number(match.score || candidate.score), 0, 100);
    const blended = Math.round(candidate.score * 0.88 + aiScore * 0.12);
    const bounded = clamp(blended, Math.max(0, candidate.score - 5), Math.min(100, candidate.score + 8));
    ranked.push({
      ...candidate,
      score: candidate.hardBlocks?.length ? candidate.score : bounded,
      aiReason: clean(match.reason, 500),
      aiRisks: Array.isArray(match.risks) ? match.risks.map((risk) => clean(risk, 180)).filter(Boolean) : [],
      aiAdjustment: candidate.hardBlocks?.length ? 0 : bounded - candidate.score,
      source: `${candidate.source}+ai_rerank`,
    });
  }

  for (const candidate of baseCandidates) {
    if (!seen.has(candidate.teacherUid)) ranked.push({ ...candidate, aiReason: '', aiRisks: [], aiAdjustment: 0 });
  }

  return ranked.sort((a, b) => {
    if (Number(b.assignable) !== Number(a.assignable)) return Number(b.assignable) - Number(a.assignable);
    if (b.score !== a.score) return b.score - a.score;
    return Number(b.scoreBreakdown?.fitConfidence?.points || 0) - Number(a.scoreBreakdown?.fitConfidence?.points || 0);
  });
}

export function getAiExecutionPolicy(task, payload = {}) {
  const taskName = clean(task, 80) || 'unknown';
  const localTasks = new Set([
    'matching',
    'profile_recommendations',
    'profile_description',
    'family_request_brief',
    'incident_classification',
    'content_moderation',
    'semantic_search',
    'admin_automation',
  ]);
  const generativeOptional = new Set(['matching_rerank', 'profile_copy_polish', 'email_draft']);
  const localFirst = localTasks.has(taskName) || !generativeOptional.has(taskName);
  return {
    version: AI_FEATURES_VERSION,
    task: taskName,
    mode: localFirst ? 'local_deterministic' : 'optional_llm',
    externalCallAllowed: !localFirst,
    cacheKey: `${taskName}_${stableHash(payload)}`,
    cacheTtlHours: taskName === 'matching_rerank' ? 24 : 168,
    maxLatencyMs: localFirst ? 80 : 2500,
    costTier: localFirst ? 'free' : 'metered_optional',
    hallucinationControl: localFirst
      ? 'No generative output; deterministic rules only.'
      : 'LLM output must be bounded, cached and validated against existing records.',
  };
}

export function buildTeacherProfileRecommendations(teacher = {}) {
  const quality = evaluateTeacherProfile(teacher);
  const profile = quality.profile;
  const subjects = joinNatural(profile.subjects, 'las materias indicadas');
  const levels = joinNatural(profile.levels, 'los niveles indicados');
  const modality = profile.modality || 'modalidad por confirmar';
  const zone = profile.zone || profile.city || 'zona por confirmar';
  const study = profile.exactStudy || profile.studyLevel || 'formacion por completar';
  const experience = profile.experienceYears > 0
    ? `${profile.experienceYears} anio(s) de experiencia`
    : 'experiencia pendiente de detallar';

  const generatedDescription = [
    `${profile.name || 'Este profesor'} imparte ${subjects} para ${levels}.`,
    `Trabaja en ${modality} en ${zone}.`,
    `Cuenta con ${study} y ${experience}.`,
    profile.availability ? `Disponibilidad: ${profile.availability}.` : 'Falta concretar la disponibilidad horaria.',
  ].join(' ');

  const headline = `${profile.name || 'Profesor'} - ${subjects} (${levels})`;
  const nextActions = quality.issues.slice(0, 6).map((issue) => ({
    field: issue.field,
    label: issue.label,
    priority: issue.weight >= 10 ? 'alta' : issue.weight >= 7 ? 'media' : 'baja',
  }));

  return {
    version: AI_FEATURES_VERSION,
    type: 'teacher_profile_assistant',
    readiness: quality.readiness,
    score: quality.score,
    assignable: quality.assignable,
    headline: clean(headline, 180),
    generatedDescription: clean(generatedDescription, 900),
    nextActions,
    trustSignals: quality.strengths.slice(0, 6),
    adminChecks: [
      !['verificado', 'verified', 'activo', 'active'].includes(profile.status) ? 'Validar identidad, formacion y disponibilidad antes de asignar.' : '',
      !profile.hasBizum ? 'Confirmar Bizum antes de activar pagos.' : '',
      !profile.availability && !profile.availabilitySlots.length ? 'Pedir disponibilidad real por franjas.' : '',
    ].filter(Boolean),
    policy: getAiExecutionPolicy('profile_recommendations', { teacher }),
  };
}

export function buildFamilyRequestBrief(request = {}) {
  const profile = getRequestProfile(request);
  const missing = [
    !profile.subject ? 'materia' : '',
    !profile.level ? 'nivel' : '',
    !profile.modality ? 'modalidad' : '',
    !profile.zone && !profile.postalCode ? 'zona/codigo postal' : '',
    !profile.schedule ? 'horario' : '',
  ].filter(Boolean);
  const urgencyText = normalizeText(textFromValues(request.urgencia, request.inicio, request.observaciones, request.mensaje, profile.schedule));
  const urgency = /(urgente|hoy|manana|esta semana|cuanto antes|examen|recuperacion)/.test(urgencyText)
    ? 'alta'
    : missing.length >= 3
      ? 'media'
      : 'normal';
  return {
    version: AI_FEATURES_VERSION,
    type: 'family_request_brief',
    summary: clean(`Solicitud de ${profile.subject || 'materia sin indicar'} para ${profile.level || 'nivel sin indicar'}, ${profile.modality || 'modalidad sin indicar'}, zona ${profile.zone || profile.postalCode || 'sin zona'}, horario ${profile.schedule || 'sin horario'}.`, 600),
    normalized: profile,
    missing,
    urgency,
    recommendedQuestions: missing.map((field) => ({
      field,
      question: `Confirmar ${field} para mejorar el matching antes de asignar profesor.`,
    })),
    policy: getAiExecutionPolicy('family_request_brief', { request }),
  };
}

export function moderateContent(content = '', context = {}) {
  const raw = clean(content, 5000);
  const text = normalizeText(raw);
  const flags = [];
  const urlCount = (raw.match(/https?:\/\/|www\./gi) || []).length;
  const emailCount = (raw.match(/[^\s@]+@[^\s@]+\.[^\s@]+/g) || []).length;
  const phoneCount = (raw.match(/(?:\+34\s*)?(?:\d[\s.-]?){9,}/g) || []).length;
  const ibanCount = (raw.match(/\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/gi) || []).length;

  if (urlCount >= 2 || /(casino|crypto|prestamo rapido|viagra|seo barato|followers|apuesta)/.test(text)) flags.push('spam_probable');
  if (ibanCount) flags.push('iban_or_bank_data');
  if (emailCount || phoneCount) flags.push('contact_data');
  if (/(pago por fuera|evitar la plataforma|sin pasar por clasesde10|te pago directo)/.test(text)) flags.push('off_platform_payment');
  if (/(amenaza|acoso|insulto|agresion|violencia|contenido sexual)/.test(text)) flags.push('safety_review');
  if (/(mierda|idiota|gilipollas|estafa)/.test(text)) flags.push('abusive_language');

  const severity = flags.includes('safety_review') || flags.includes('spam_probable')
    ? 'high'
    : flags.includes('off_platform_payment') || flags.includes('iban_or_bank_data')
      ? 'medium'
      : flags.length
        ? 'low'
        : 'none';

  return {
    version: AI_FEATURES_VERSION,
    type: 'content_moderation',
    action: severity === 'high' ? 'review' : 'allow',
    severity,
    flags: unique(flags),
    confidence: flags.length ? Math.min(0.95, 0.55 + flags.length * 0.12) : 0.92,
    context: {
      channel: clean(context.channel, 80),
      role: clean(context.role, 80),
    },
    policy: getAiExecutionPolicy('content_moderation', { content, context }),
  };
}

export function classifyIncident(input = '', metadata = {}) {
  const text = normalizeText(textFromValues(input, metadata));
  const categories = [
    ['seguridad', /(acoso|amenaza|agresion|violencia|inapropiado|contenido sexual|menor)/],
    ['pago', /(pago|cobro|bizum|transferencia|dinero|factura|pendiente|vencido|deuda)/],
    ['asistencia', /(no vino|no se presento|ausencia|falto|asistencia|marcar clase|realizada)/],
    ['horario', /(cancelar|cancelada|reprogramar|cambiar hora|retraso|llego tarde|horario)/],
    ['calidad', /(no entiende|mala clase|metodologia|explicacion|nivel bajo|queja|suspenso)/],
    ['comunicacion', /(no responde|mensaje|llamada|contacto|email|correo|chat)/],
    ['documentacion', /(dni|documento|titulo|certificado|verificacion|perfil)/],
    ['tecnica', /(login|error|app|web|no carga|firebase|supabase|pantalla)/],
  ];
  const found = categories.find(([, pattern]) => pattern.test(text));
  const category = found?.[0] || 'operativa';
  const priority = category === 'seguridad'
    ? 1
    : ['pago', 'asistencia'].includes(category)
      ? 2
      : ['horario', 'calidad', 'tecnica'].includes(category)
        ? 3
        : 4;
  const slaHours = priority === 1 ? 2 : priority === 2 ? 12 : priority === 3 ? 24 : 48;
  const suggestedActions = {
    seguridad: ['Revisar manualmente antes de responder.', 'Contactar con ambas partes por canal seguro.', 'Escalar al administrador.'],
    pago: ['Verificar pago/Bizum y clases asociadas.', 'Actualizar estado de pago.', 'Notificar a familia o profesor si falta informacion.'],
    asistencia: ['Confirmar con profesor y familia si la clase se realizo.', 'Crear incidencia si hay discrepancia.', 'Actualizar estado de clase.'],
    horario: ['Proponer nueva franja.', 'Actualizar calendario.', 'Avisar a ambas partes.'],
    calidad: ['Pedir detalle concreto.', 'Revisar perfil y matching.', 'Valorar cambio de profesor si se repite.'],
    comunicacion: ['Comprobar ultimo mensaje.', 'Enviar recordatorio.', 'Escalar si no hay respuesta.'],
    documentacion: ['Solicitar documento faltante.', 'Revisar verificacion admin.', 'No asignar hasta completar si es critico.'],
    tecnica: ['Reproducir error.', 'Pedir captura si falta contexto.', 'Registrar modulo afectado.'],
    operativa: ['Revisar manualmente.', 'Completar datos faltantes.', 'Asignar responsable.'],
  }[category];

  return {
    version: AI_FEATURES_VERSION,
    type: 'incident_classification',
    category,
    priority,
    slaHours,
    suggestedActions,
    confidence: found ? 0.78 : 0.45,
    policy: getAiExecutionPolicy('incident_classification', { input, metadata }),
  };
}

function searchableText(item, fields) {
  if (typeof item === 'string') return item;
  const source = fields?.length ? fields.map((field) => item?.[field]) : Object.values(item || {});
  return textFromValues(source);
}

export function semanticSearchItems(query = '', items = [], options = {}) {
  const q = normalizeText(query);
  const queryTokens = new Set(tokenize(q));
  const querySubjects = subjectTags(q);
  const queryLevels = levelTags(q);
  const fields = options.fields || [];
  if (!q || !queryTokens.size) return [];

  return items.map((item) => {
    const text = normalizeText(searchableText(item, fields));
    const tokens = new Set(tokenize(text));
    const subjectOverlap = overlapCount(querySubjects, subjectTags(text));
    const levelOverlap = overlapCount(queryLevels, levelTags(text));
    const tokenOverlap = overlapCount(queryTokens, tokens);
    const phraseBonus = text.includes(q) ? 20 : 0;
    const score = Math.min(100, Math.round(
      phraseBonus
      + tokenOverlap * 9
      + subjectOverlap * 24
      + levelOverlap * 14
    ));
    const reasons = [
      subjectOverlap ? 'Coincide en materia/actividad.' : '',
      levelOverlap ? 'Coincide en nivel.' : '',
      tokenOverlap ? `${tokenOverlap} termino(s) relacionados.` : '',
      phraseBonus ? 'Coincidencia literal.' : '',
    ].filter(Boolean);
    return { item, score, reasons };
  })
    .filter((result) => result.score >= Number(options.minScore || 12))
    .sort((a, b) => b.score - a.score)
    .slice(0, Number(options.limit || 10));
}

export function summarizeTeacherProfile(teacher = {}) {
  const quality = evaluateTeacherProfile(teacher);
  const profile = quality.profile;
  const nextActions = quality.issues.slice(0, 4).map((issue) => issue.label);
  return {
    score: quality.score,
    readiness: quality.readiness,
    assignable: quality.assignable,
    summary: `${profile.name || 'Profesor'}: ${profile.subjects.join(', ') || 'sin materias'}; ${profile.levels.join(', ') || 'sin niveles'}; ${profile.zone || 'sin zona'}.`,
    strengths: quality.strengths.slice(0, 5),
    nextActions,
  };
}
