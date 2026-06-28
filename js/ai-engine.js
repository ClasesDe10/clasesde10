/**
 * ClasesDe10 professional matching engine.
 *
 * Pure, deterministic and free by default. It can be assisted by a generative
 * model later, but the baseline score is always explainable and bounded.
 */

export const MATCHING_VERSION = 'professional_matching_v2';

export const MATCHING_WEIGHTS = Object.freeze({
  subject: 24,
  level: 12,
  modality: 12,
  location: 12,
  availability: 12,
  experience: 8,
  reputation: 10,
  capacity: 6,
  profileQuality: 4,
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

function yearsFromText(value) {
  const text = normalizeText(value);
  const explicit = text.match(/(\d+(?:[.,]\d+)?)\s*(?:anos|año|anios|years)/);
  if (explicit) return Number(explicit[1].replace(',', '.'));
  const any = text.match(/\b(\d{1,2})\b/);
  return any ? Number(any[1]) : 0;
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
    exactStudy: clean(teacher.estudio_exacto || teacher.exactStudy || teacher.titulacion || teacher.universidad, 300),
    studyCenter: clean(teacher.centro_estudios || teacher.studyCenter || teacher.colegio_estudios || teacher.universidad, 300),
    bachilleratoGrade: firstNumber(teacher.nota_bachillerato, teacher.bachilleratoGrade),
    universityAverageGrade: firstNumber(teacher.nota_media_universidad, teacher.universityAverageGrade),
    experienceYears: firstNumber(teacher.experiencia_anios, teacher.experienceYears, teacher.anios_experiencia)
      ?? yearsFromText([teacher.experiencia, teacher.bio, teacher.presentacion, teacher.experienceSummary].filter(Boolean).join(' ')),
    availability: clean(teacher.disponibilidad_resumen || teacher.availabilitySummary || teacher.disponibilidad, 500),
    availabilitySlots: Array.isArray(teacher.availabilitySlots || teacher.disponibilidadSlots)
      ? (teacher.availabilitySlots || teacher.disponibilidadSlots)
      : normalizeAvailabilitySlots(teacher.disponibilidad_detalle),
    bio: clean(teacher.bio || teacher.presentacion || teacher.experiencia || teacher.experienceSummary, 1500),
    hasBizum: teacher.acepta_bizum === true || teacher.hasBizum === true,
    status: lower(teacher.estado_verificacion || teacher.verificationStatus || teacher.status || teacher.estado),
    active: teacher.active !== false && teacher.activo !== false,
    maxStudents: Number(teacher.maxStudents || teacher.max_alumnos || 5),
    activeAssignments: Number(teacher.activeAssignments || teacher.active_assignments || 0),
    rating: firstNumber(teacher.valoracion_media, teacher.averageRating, teacher.rating, teacher.scoreValoracion),
    reviewsCount: Number(firstNumber(teacher.reviewsCount, teacher.valoraciones_count, teacher.totalReviews) || 0),
    responseTimeHours: responseHours,
    acceptanceRate: rate01(teacher.acceptanceRate ?? teacher.ratio_aceptacion)
      ?? (accepted !== null && offered ? clamp(accepted / offered, 0, 1) : null),
    completionRate: rate01(teacher.completionRate ?? teacher.classCompletionRate ?? teacher.ratio_clases_realizadas),
    cancellationRate: rate01(teacher.cancellationRate ?? teacher.cancelRate ?? teacher.ratio_cancelacion),
    raw: teacher,
  };
}

export function getRequestProfile(request = {}) {
  const metadata = request.metadata || {};
  const student = request.studentSnapshot || request.alumnos || {};
  const family = request.familySnapshot || request.familias?.usuarios || request.familias || {};
  return {
    id: request.id || request.requestId || '',
    subject: clean(request.materia || request.subject || metadata.materia || metadata.materias || request.asunto, 180),
    level: clean(request.nivel || request.nivel_educativo || request.curso || student.nivel || student.nivel_educativo || metadata.nivel || metadata.niveles, 120),
    modality: clean(request.modalidad || request.modality || metadata.modalidad || metadata.formato, 120),
    zone: clean(request.zona || request.zone || metadata.zona || family.zona || family.city || family.ciudad, 180),
    city: clean(request.ciudad || metadata.ciudad || family.ciudad || family.city, 120),
    postalCode: clean(request.codigo_postal || request.postalCode || metadata.codigo_postal || family.codigo_postal || family.postalCode, 20),
    schedule: clean(request.preferencia_horario || request.disponibilidad || request.schedule || metadata.disponibilidad || metadata.frecuencia || metadata.inicio, 300),
    studentName: clean(student.nombre || request.alumno_nombre || metadata.alumno, 160),
    familyName: clean([family.nombre, family.apellidos].filter(Boolean).join(' ') || request.familia_nombre, 160),
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
  if (!profile.subjects.length) issues.push({ field: 'materias', label: 'Anadir materias', weight: 14 });
  else strengths.push(`${profile.subjects.length} materia(s)`);
  if (!profile.levels.length) issues.push({ field: 'niveles', label: 'Anadir niveles educativos', weight: 12 });
  else strengths.push(`${profile.levels.length} nivel(es)`);
  if (!profile.studyLevel) issues.push({ field: 'tipo_formacion', label: 'Indicar tipo de formacion principal', weight: 5 });
  if (!profile.exactStudy) issues.push({ field: 'estudio_exacto', label: 'Completar estudio exacto o titulacion', weight: 8 });
  else strengths.push(`Formacion: ${profile.exactStudy}`);
  if (!profile.studyCenter) issues.push({ field: 'centro_estudios', label: 'Completar colegio, universidad o centro', weight: 6 });
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
  const blockingIssues = issues.filter((issue) => !['verificacion'].includes(issue.field));
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

function component(name, ratio, detail, reasons = [], risks = []) {
  const max = MATCHING_WEIGHTS[name];
  const points = round(max * clamp(ratio, 0, 1));
  return { name, points, max, detail, reasons, risks };
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
  if (!requestProfile.schedule) return component('availability', 0.55, 'Horario de la familia no indicado', ['Horario flexible o pendiente'], ['Confirmar disponibilidad real']);

  const teacherDays = daySet(teacherProfile.availability);
  const teacherPeriods = periodSet(teacherProfile.availability);
  (teacherProfile.availabilitySlots || []).forEach((slot) => {
    const day = slotDay(slot);
    if (Number.isFinite(day)) teacherDays.add(day);
    periodFromTimeRange(slot?.hora_inicio || slot?.startTime, slot?.hora_fin || slot?.endTime).forEach((period) => teacherPeriods.add(period));
  });

  if (!teacherProfile.availability && !teacherProfile.availabilitySlots.length) {
    return component('availability', 0.2, 'Profesor sin disponibilidad real', [], ['El profesor no tiene disponibilidad cargada']);
  }

  const dayRatio = !requestDays.size || !teacherDays.size ? 0.55 : overlapCount(requestDays, teacherDays) / requestDays.size;
  const periodRatio = !requestPeriods.size || !teacherPeriods.size ? 0.55 : overlapCount(requestPeriods, teacherPeriods) / requestPeriods.size;
  const ratio = (dayRatio * 0.48) + (periodRatio * 0.52);
  if (ratio >= 0.75) return component('availability', ratio, 'Disponibilidad compatible', ['Disponibilidad horaria compatible.']);
  if (ratio >= 0.4) return component('availability', ratio, 'Disponibilidad parcial', ['Disponibilidad parcialmente compatible.'], ['Confirmar horario concreto']);
  return component('availability', ratio, 'Disponibilidad baja', [], ['Disponibilidad poco compatible']);
}

function scoreExperience(requestProfile, teacherProfile) {
  const requestSubjects = subjectTags(requestProfile.subject);
  const educationText = normalizeText([teacherProfile.studyLevel, teacherProfile.exactStudy, teacherProfile.studyCenter, teacherProfile.bio].join(' '));
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
    scoreExperience(requestProfile, teacherProfile),
    scoreReputation(teacherProfile),
    scoreCapacity(teacherProfile),
    component('profileQuality', teacherQuality.score / 100, `Perfil ${teacherQuality.score}/100`, teacherQuality.score >= 85 ? ['Perfil completo y revisado.'] : [], teacherQuality.score < 85 ? [`Perfil revisable (${teacherQuality.score}/100).`] : []),
  ];

  const breakdown = Object.fromEntries(components.map((part) => [part.name, {
    points: part.points,
    max: part.max,
    detail: part.detail,
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
    reasons: unique(reasons).slice(0, 8),
    risks: unique(risks).slice(0, 8),
    profileScore: teacherQuality.score,
    profileIssues: teacherQuality.issueLabels,
    assignable,
    readiness: assignable ? 'asignable' : teacherQuality.readiness,
    hardBlocks,
    source: MATCHING_VERSION,
    matchingVersion: MATCHING_VERSION,
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
      if (b.profileScore !== a.profileScore) return b.profileScore - a.profileScore;
      return String(a.teacherName).localeCompare(String(b.teacherName));
    })
    .slice(0, limit);
}

export function buildMatchingAiPrompt(requestProfile, baseCandidates = []) {
  const profile = requestProfile.subject !== undefined ? requestProfile : getRequestProfile(requestProfile);
  const teacherBlock = baseCandidates.slice(0, 8).map((candidate, index) => {
    const breakdown = Object.entries(candidate.scoreBreakdown || {})
      .map(([key, value]) => `${key}:${value.points}/${value.max}`)
      .join(', ');
    return `P${index + 1}: id="${candidate.teacherUid}" nombre="${candidate.teacherName}" scoreBase=${candidate.score} breakdown="${breakdown}" razones="${(candidate.reasons || []).join('; ')}" riesgos="${(candidate.risks || []).join('; ')}"`;
  }).join('\n');

  return [
    'Eres el asistente de matching de ClasesDe10.',
    'No inventes datos, no propongas profesores fuera de la lista y no ignores bloqueos.',
    'Tu papel es reordenar candidatos ya prefiltrados y explicar riesgos pedagogicos u operativos.',
    'El score final esta acotado por el sistema; tu score es solo una senal auxiliar.',
    '',
    `SOLICITUD: materia="${profile.subject}" nivel="${profile.level}" modalidad="${profile.modality}" zona="${profile.zone}" cp="${profile.postalCode}" horario="${profile.schedule}" alumno="${profile.studentName}"`,
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
    return b.score - a.score;
  });
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
