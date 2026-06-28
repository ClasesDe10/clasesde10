/**
 * ClasesDe10 deterministic AI engine.
 *
 * This module provides production-safe scoring without paid model calls. It is
 * intentionally pure: no DOM, no Firebase imports, no network. Generative AI can
 * later refine these outputs, but this engine remains the explainable baseline.
 */

export function clean(value, max = 1000) {
  return String(value || '').trim().slice(0, max);
}

export function lower(value) {
  return clean(value).toLowerCase();
}

export function normalizeText(value) {
  return lower(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
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

function numberOrNull(value) {
  const raw = clean(value).replace(',', '.');
  if (!raw) return null;
  const number = Number(raw);
  return Number.isFinite(number) ? number : null;
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

export function getTeacherProfile(teacher = {}) {
  const subjects = asArray(teacher.materias || teacher.subjects || teacher.materia || teacher.materiasTexto);
  const levels = asArray(teacher.niveles_educativos || teacher.levels || teacher.niveles || teacher.nivel);
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
    bachilleratoGrade: numberOrNull(teacher.nota_bachillerato ?? teacher.bachilleratoGrade),
    universityAverageGrade: numberOrNull(teacher.nota_media_universidad ?? teacher.universityAverageGrade),
    availability: clean(teacher.disponibilidad_resumen || teacher.availabilitySummary || teacher.disponibilidad, 500),
    bio: clean(teacher.bio || teacher.presentacion || teacher.experiencia || teacher.experienceSummary, 1500),
    hasBizum: teacher.acepta_bizum === true || teacher.hasBizum === true,
    status: lower(teacher.estado_verificacion || teacher.verificationStatus || teacher.status || teacher.estado),
    active: teacher.active === true || teacher.activo === true,
    maxStudents: Number(teacher.maxStudents || teacher.max_alumnos || 5),
    activeAssignments: Number(teacher.activeAssignments || teacher.active_assignments || 0),
    raw: teacher,
  };
}

export function getRequestProfile(request = {}) {
  const metadata = request.metadata || {};
  const student = request.studentSnapshot || request.alumnos || {};
  const family = request.familySnapshot || request.familias?.usuarios || {};
  return {
    id: request.id || request.requestId || '',
    subject: clean(request.materia || request.subject || metadata.materia || metadata.materias, 180),
    level: clean(request.nivel || request.nivel_educativo || request.curso || student.nivel || student.nivel_educativo || metadata.nivel, 120),
    modality: clean(request.modalidad || metadata.modalidad, 120),
    zone: clean(request.zona || metadata.zona || family.zona, 180),
    schedule: clean(request.preferencia_horario || request.disponibilidad || metadata.disponibilidad, 300),
    studentName: clean(student.nombre || request.alumno_nombre || metadata.alumno, 160),
    familyName: clean([family.nombre, family.apellidos].filter(Boolean).join(' ') || request.familia_nombre, 160),
  };
}

export function evaluateTeacherProfile(teacher = {}) {
  const profile = getTeacherProfile(teacher);
  const issues = [];
  const strengths = [];

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

  if (!profile.availability) issues.push({ field: 'disponibilidad', label: 'Indicar disponibilidad horaria', weight: 8 });
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
  const readiness = score >= 85 && ['verificado', 'verified', 'activo', 'active'].includes(profile.status)
    ? 'asignable'
    : score >= 65
      ? 'revisable'
      : 'incompleto';

  return {
    score,
    readiness,
    complete: issues.filter((issue) => issue.field !== 'verificacion').length === 0,
    assignable: readiness === 'asignable',
    issues,
    issueLabels: issues.map((issue) => issue.label),
    strengths,
    profile,
  };
}

function includesAny(text, tokens) {
  if (!tokens.length) return false;
  return tokens.some((token) => text.includes(token));
}

function scoreSubject(profile, teacherProfile) {
  const requestTokens = tokenize(profile.subject);
  const teacherText = normalizeText(teacherProfile.subjects.join(' '));
  const matches = requestTokens.filter((token) => teacherText.includes(token));
  if (!requestTokens.length) return { points: 8, reasons: ['Materia de la solicitud poco especifica'], risks: ['Confirmar materia exacta'] };
  if (matches.length) return { points: Math.min(42, 24 + matches.length * 9), reasons: [`Coincidencia de materia: ${profile.subject}`], risks: [] };
  return { points: -18, reasons: [], risks: [`No se ve coincidencia clara con ${profile.subject}`] };
}

function scoreLevel(profile, teacherProfile) {
  const level = normalizeText(profile.level);
  const levels = normalizeText(teacherProfile.levels.join(' '));
  if (!level) return { points: 6, reasons: ['Nivel no indicado; se requiere confirmacion'], risks: ['Falta nivel del alumno'] };
  if (levels.includes(level) || levels.includes('todos') || (levels.includes('eso') && level.includes('eso')) || (levels.includes('bachiller') && level.includes('bachiller'))) {
    return { points: 22, reasons: [`Nivel compatible: ${profile.level}`], risks: [] };
  }
  return { points: 0, reasons: [], risks: [`Nivel no confirmado: ${profile.level}`] };
}

function scoreModality(profile, teacherProfile) {
  const request = normalizeText(profile.modality);
  const teacher = normalizeText(teacherProfile.modality);
  if (!request || !teacher || teacher.includes('ambas') || request.includes('ambas') || teacher.includes(request)) {
    return { points: 10, reasons: profile.modality ? [`Modalidad compatible: ${profile.modality}`] : ['Modalidad flexible o no indicada'], risks: [] };
  }
  return { points: -6, reasons: [], risks: [`Modalidad pendiente de validar: ${profile.modality} vs ${teacherProfile.modality}`] };
}

function scoreZone(profile, teacherProfile) {
  const zone = normalizeText(profile.zone);
  const teacherZone = normalizeText(teacherProfile.zone);
  const teacherModality = normalizeText(teacherProfile.modality);
  if (!zone) return { points: 4, reasons: ['Zona no indicada; online/presencial pendiente'], risks: ['Falta zona de la familia'] };
  if (teacherModality.includes('online') || teacherZone.includes(zone) || zone.includes(teacherZone) || includesAny(teacherZone, tokenize(zone))) {
    return { points: 10, reasons: [`Zona/modalidad compatible: ${profile.zone}`], risks: [] };
  }
  return { points: 0, reasons: [], risks: [`Zona no confirmada: ${profile.zone}`] };
}

function scoreCapacity(teacherProfile) {
  const remaining = Math.max(0, teacherProfile.maxStudents - teacherProfile.activeAssignments);
  if (remaining > 0) return { points: Math.min(8, remaining * 2), reasons: [`${remaining} plaza(s) estimadas disponibles`], risks: [] };
  return { points: -20, reasons: [], risks: ['Carga actual completa'] };
}

export function scoreTeacherForRequest(request, teacher) {
  const requestProfile = getRequestProfile(request);
  const teacherQuality = evaluateTeacherProfile(teacher);
  const teacherProfile = teacherQuality.profile;
  const parts = [
    scoreSubject(requestProfile, teacherProfile),
    scoreLevel(requestProfile, teacherProfile),
    scoreModality(requestProfile, teacherProfile),
    scoreZone(requestProfile, teacherProfile),
    scoreCapacity(teacherProfile),
  ];
  let score = parts.reduce((sum, part) => sum + part.points, 0);
  const reasons = parts.flatMap((part) => part.reasons);
  const risks = parts.flatMap((part) => part.risks);

  if (['verificado', 'verified', 'activo', 'active'].includes(teacherProfile.status)) score += 8;
  else risks.push('Profesor pendiente de verificacion');

  if (teacherQuality.score < 65) {
    score -= 18;
    risks.push(`Perfil incompleto (${teacherQuality.score}/100)`);
  } else if (teacherQuality.score < 85) {
    score -= 8;
    risks.push(`Perfil revisable (${teacherQuality.score}/100)`);
  } else {
    score += 6;
    reasons.push(`Perfil de calidad (${teacherQuality.score}/100)`);
  }

  const normalized = Math.max(0, Math.min(100, Math.round(score)));
  return {
    teacherUid: teacherProfile.teacherUid,
    profesor_id: teacherProfile.teacherUid,
    teacherName: teacherProfile.name,
    teacherEmail: teacherProfile.email,
    score: normalized,
    reasons: unique(reasons),
    risks: unique(risks),
    profileScore: teacherQuality.score,
    profileIssues: teacherQuality.issueLabels,
    assignable: teacherQuality.assignable,
    readiness: teacherQuality.readiness,
    source: 'deterministic_ai',
  };
}

export function rankTeachersForRequest(request, teachers = [], options = {}) {
  const limit = Number(options.limit || 5);
  return teachers
    .map((teacher) => scoreTeacherForRequest(request, teacher))
    .filter((match) => options.includeZeroScore ? true : match.score > 0)
    .sort((a, b) => {
      if (Number(b.assignable) !== Number(a.assignable)) return Number(b.assignable) - Number(a.assignable);
      return b.score - a.score;
    })
    .slice(0, limit);
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
