/**
 * Shared profile quality engine for ClasesDe10 dashboards.
 *
 * The dashboards persist profile data in both legacy Spanish field names and
 * Firebase-friendly aliases. This module keeps validation, completion and trust
 * signals consistent for families and teachers.
 */

import {
  buildFamilyTrustProfile,
  buildTeacherTrustProfile,
} from './trust-engine.js';
import { normalizeDocumentRecord } from './document-center-engine.js';

const VERIFIED_DOCUMENT_STATUSES = new Set(['validado', 'verificado', 'aprobado', 'approved', 'verified']);
const PENDING_DOCUMENT_STATUSES = new Set(['pendiente', 'pending', 'en_revision']);

export function cleanText(value, max = 500) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').slice(0, max);
}

export function toProfileList(value, maxItems = 20) {
  const raw = Array.isArray(value)
    ? value
    : String(value ?? '').split(/[,;\n]/);
  const seen = new Set();
  const items = [];

  for (const entry of raw) {
    const item = cleanText(entry, 80);
    const key = item.toLowerCase();
    if (!item || seen.has(key)) continue;
    seen.add(key);
    items.push(item);
    if (items.length >= maxItems) break;
  }

  return items;
}

export function validatePhone(value) {
  const phone = cleanText(value, 40);
  const digits = phone.replace(/\D/g, '');
  return {
    value: phone,
    valid: digits.length >= 9 && digits.length <= 15 && /^[+\d\s().-]+$/.test(phone),
  };
}

export function validatePostalCode(value) {
  const postalCode = cleanText(value, 20);
  return {
    value: postalCode,
    valid: /^[0-9]{5}$/.test(postalCode),
  };
}

export function parseGrade(value) {
  if (value === '' || value === null || value === undefined) return null;
  const grade = Number(value);
  if (!Number.isFinite(grade)) return null;
  return Math.round(grade * 100) / 100;
}

export function isValidGrade(value) {
  const grade = parseGrade(value);
  return grade !== null && grade >= 0 && grade <= 10;
}

function hasText(value, min = 1) {
  return cleanText(value).length >= min;
}

function firstValue(profile, fields) {
  for (const field of fields) {
    if (profile?.[field] !== undefined && profile?.[field] !== null && profile?.[field] !== '') {
      return profile[field];
    }
  }
  return '';
}

function booleanKnown(value) {
  if (value === true || value === false) return true;
  const text = cleanText(value, 40).toLowerCase();
  return ['si', 'no', 'true', 'false', '1', '0'].includes(text);
}

function documentStatus(doc) {
  return normalizeDocumentRecord(doc).status;
}

function documentType(doc) {
  return normalizeDocumentRecord(doc).documentType;
}

function hasDocument(docs, types, statusSet = null) {
  const allowed = new Set(types);
  return (docs || []).some((doc) => {
    const type = documentType(doc);
    if (!allowed.has(type)) return false;
    if (!statusSet) return true;
    return statusSet.has(documentStatus(doc));
  });
}

function summarizeChecks(checks) {
  const totalWeight = checks.reduce((sum, check) => sum + check.weight, 0) || 1;
  const doneWeight = checks.reduce((sum, check) => sum + (check.complete ? check.weight : 0), 0);
  const percent = Math.max(0, Math.min(100, Math.round((doneWeight / totalWeight) * 100)));
  const requiredMissing = checks.filter((check) => check.required && !check.complete);
  const recommendedMissing = checks.filter((check) => !check.required && !check.complete);
  return {
    percent,
    complete: requiredMissing.length === 0,
    requiredMissing,
    recommendedMissing,
    issues: requiredMissing.map((check) => check.key),
    issueLabels: requiredMissing.map((check) => check.label),
    recommendations: recommendedMissing.map((check) => check.label),
  };
}

function trustLevel(score) {
  if (score >= 85) return 'alto';
  if (score >= 65) return 'medio';
  return 'inicial';
}

function trustIndicator(label, complete, detail = '') {
  return {
    label,
    complete: Boolean(complete),
    detail,
  };
}

export function evaluateTeacherProfileProfessional(profile = {}, docs = [], stats = {}) {
  const subjects = toProfileList(firstValue(profile, ['materias', 'subjects']));
  const levels = toProfileList(firstValue(profile, ['niveles_educativos', 'levels']));
  const specialties = toProfileList(firstValue(profile, ['especialidades', 'specialties']));
  const languages = toProfileList(firstValue(profile, ['idiomas', 'languages']));
  const certifications = toProfileList(firstValue(profile, ['certificaciones', 'certifications']));
  const phone = validatePhone(firstValue(profile, ['telefono', 'phone']));
  const postalCode = validatePostalCode(firstValue(profile, ['codigo_postal', 'postalCode']));
  const identityDoc = hasDocument(docs, ['dni', 'identidad', 'pasaporte']);
  const identityVerified = hasDocument(docs, ['dni', 'identidad', 'pasaporte'], VERIFIED_DOCUMENT_STATUSES);
  const academicDoc = hasDocument(docs, ['notas_curso_anterior', 'notas_universidad', 'titulo', 'certificado', 'certificado_formacion_especializada', 'certificacion', 'academic']);
  const academicVerified = hasDocument(docs, ['notas_curso_anterior', 'notas_universidad', 'titulo', 'certificado', 'certificado_formacion_especializada', 'certificacion', 'academic'], VERIFIED_DOCUMENT_STATUSES);
  const languageDoc = hasDocument(docs, ['certificado_idiomas']);
  const languageVerified = hasDocument(docs, ['certificado_idiomas'], VERIFIED_DOCUMENT_STATUSES);
  const referenceDoc = hasDocument(docs, ['referencia_academica_profesional']);
  const cvDoc = hasDocument(docs, ['curriculum', 'cv']);
  const pendingDocs = (docs || []).filter((doc) => PENDING_DOCUMENT_STATUSES.has(documentStatus(doc))).length;
  const carKnown = booleanKnown(firstValue(profile, ['tiene_coche', 'hasCar', 'carAvailable', 'vehiculo_propio']));
  const schoolName = firstValue(profile, ['colegio', 'schoolName', 'school', 'colegio_nombre']);
  const studyCenter = firstValue(profile, ['centro_estudios', 'studyCenter', 'universidad', 'universityName', 'colegio_estudios']);
  const hasAvailability = hasText(firstValue(profile, ['disponibilidad_resumen', 'availabilitySummary']), 10)
    || Array.isArray(profile.disponibilidad) && profile.disponibilidad.length > 0;

  const checks = [
    { key: 'nombre', label: 'Nombre y apellidos completos', weight: 6, required: true, complete: hasText(profile.nombre, 2) && hasText(profile.apellidos, 2) },
    { key: 'telefono', label: 'Telefono valido', weight: 7, required: true, complete: phone.valid },
    { key: 'foto', label: 'Foto de perfil clara', weight: 7, required: true, complete: hasText(firstValue(profile, ['foto_url', 'photoUrl']), 20) },
    { key: 'direccion', label: 'Direccion, ciudad y zona', weight: 8, required: true, complete: hasText(firstValue(profile, ['direccion', 'address']), 5) && hasText(firstValue(profile, ['ciudad', 'city']), 2) && postalCode.valid && hasText(firstValue(profile, ['zona', 'zone']), 2) },
    { key: 'formacion', label: 'Formacion principal, estudio exacto, colegio y universidad/centro', weight: 10, required: true, complete: hasText(firstValue(profile, ['nivel_estudios', 'studyLevel']), 2) && hasText(firstValue(profile, ['estudio_exacto', 'exactStudy', 'titulacion']), 4) && hasText(schoolName, 4) && hasText(studyCenter, 4) },
    { key: 'notas', label: 'Notas academicas dentro de 0-10', weight: 7, required: true, complete: isValidGrade(firstValue(profile, ['nota_bachillerato', 'bachilleratoGrade'])) && isValidGrade(firstValue(profile, ['nota_media_universidad', 'universityAverageGrade'])) },
    { key: 'bio', label: 'Presentacion profesional de al menos 40 caracteres', weight: 8, required: true, complete: hasText(profile.bio, 40) },
    { key: 'experiencia', label: 'Anios de experiencia validos', weight: 5, required: true, complete: Number(firstValue(profile, ['experiencia_anios', 'experienceYears'])) >= 0 },
    { key: 'materias', label: 'Materias o actividades que imparte', weight: 8, required: true, complete: subjects.length > 0 },
    { key: 'niveles', label: 'Niveles compatibles', weight: 7, required: true, complete: levels.length > 0 },
    { key: 'disponibilidad', label: 'Disponibilidad real', weight: 7, required: true, complete: hasAvailability },
    { key: 'bizum', label: 'Bizum confirmado', weight: 4, required: true, complete: profile.acepta_bizum === true || profile.hasBizum === true },
    { key: 'movilidad', label: 'Movilidad presencial declarada', weight: 3, required: false, complete: carKnown },
    { key: 'especialidades', label: 'Especialidades concretas', weight: 4, required: false, complete: specialties.length > 0 },
    { key: 'idiomas', label: 'Idiomas de atencion', weight: 3, required: false, complete: languages.length > 0 },
    { key: 'certificaciones', label: 'Certificaciones adicionales', weight: 3, required: false, complete: certifications.length > 0 || academicDoc },
    { key: 'dni', label: 'Documento de identidad subido', weight: 3, required: false, complete: identityDoc },
    { key: 'expediente_doc', label: 'Notas o expediente academico subido', weight: 2, required: false, complete: academicDoc },
    { key: 'idiomas_doc', label: 'Certificado de idiomas si declara nivel acreditado', weight: 1, required: false, complete: languages.length === 0 || languageDoc },
    { key: 'cv_doc', label: 'Curriculum o resumen ampliado subido', weight: 1, required: false, complete: cvDoc },
  ];

  const summary = summarizeChecks(checks);
  const trustProfile = buildTeacherTrustProfile({
    ...profile,
    profileCompletionPercent: summary.percent,
    profileComplete: summary.complete,
    perfil_completo: summary.complete,
    trustScore: profile.trustScore,
    trustLevel: profile.trustLevel,
  }, {
    documentsForOwner: docs,
    stats: {
      ...stats,
      completedClasses: Number(stats.completedClasses || profile.completedClasses || profile.clases_completadas || profile.reputationMetrics?.completedClasses || 0),
      completionRate: stats.completionRate ?? profile.completionRate ?? profile.reputationMetrics?.completionRate,
      cancellationRate: stats.cancellationRate ?? profile.cancellationRate ?? profile.reputationMetrics?.cancellationRate,
      averageResponseHours: stats.averageResponseHours ?? stats.responseTimeHours ?? profile.responseTimeHours ?? profile.reputationMetrics?.averageResponseHours,
      acceptanceRate: stats.acceptanceRate ?? profile.acceptanceRate ?? profile.reputationMetrics?.acceptanceRate,
      activeAssignments: stats.activeAssignments ?? profile.activeAssignments ?? profile.reputationMetrics?.activeAssignments,
      openIncidents: stats.openIncidents ?? profile.openIncidents ?? profile.reputationMetrics?.openIncidents,
    },
  });

  return {
    role: 'profesor',
    percent: summary.percent,
    complete: summary.complete,
    issues: summary.issues,
    issueLabels: summary.issueLabels,
    recommendations: summary.recommendations,
    trustScore: trustProfile.score,
    trustLevel: trustProfile.level || trustLevel(trustProfile.score),
    trustProfile,
    trustBadges: trustProfile.badges,
    publicTrustStats: trustProfile.publicStats,
    reputationMetrics: trustProfile.metrics,
    pendingDocuments: pendingDocs,
    normalized: {
      subjects,
      levels,
      specialties,
      languages,
      certifications,
      hasCar: firstValue(profile, ['tiene_coche', 'hasCar', 'carAvailable', 'vehiculo_propio']) === true,
      phone: phone.value,
      postalCode: postalCode.value,
      schoolName: cleanText(schoolName, 240),
      studyCenter: cleanText(studyCenter, 300),
      bachilleratoGrade: parseGrade(firstValue(profile, ['nota_bachillerato', 'bachilleratoGrade'])),
      universityAverageGrade: parseGrade(firstValue(profile, ['nota_media_universidad', 'universityAverageGrade'])),
    },
    indicators: [
      trustIndicator('Identidad documentada', identityDoc, identityVerified ? 'Validada por admin' : identityDoc ? 'Pendiente de validacion' : 'Sin documento'),
      trustIndicator('Expediente academico', academicDoc, academicVerified ? 'Validado por admin' : academicDoc ? 'Pendiente de validacion' : 'Sin notas/expediente'),
      trustIndicator('Idiomas certificados', languageDoc, languageVerified ? 'Validado por admin' : languageDoc ? 'Pendiente de validacion' : 'Sin certificado'),
      trustIndicator('Referencias', referenceDoc, referenceDoc ? 'Subida para revision' : 'Sin referencia'),
      trustIndicator('Foto y contacto', hasText(firstValue(profile, ['foto_url', 'photoUrl']), 20) && phone.valid),
      trustIndicator('Movilidad declarada', carKnown, carKnown ? 'Coche/transporte indicado' : 'Sin declarar'),
      trustIndicator('Perfil completo para matching', summary.complete),
      trustIndicator('Especializacion visible', specialties.length > 0 || certifications.length > 0),
      trustIndicator('Historial operativo', Number(trustProfile.metrics.completedClasses || 0) > 0, `${trustProfile.metrics.completedClasses || 0} clase(s)`),
      trustIndicator('Baja cancelacion', (trustProfile.metrics.cancellationRate ?? 0) <= 0.1, `${Math.round((trustProfile.metrics.cancellationRate ?? 0) * 100)}%`),
    ],
  };
}

export function evaluateFamilyProfileProfessional(profile = {}, students = [], docs = []) {
  const phone = validatePhone(firstValue(profile, ['telefono', 'phone']));
  const postalCode = validatePostalCode(firstValue(profile, ['codigo_postal', 'postalCode']));
  const languages = toProfileList(firstValue(profile, ['idiomas', 'languages']));
  const hasStudent = Array.isArray(students) && students.some((student) => student?.active !== false && student?.activo !== false);
  const identityDoc = hasDocument(docs, ['dni', 'identidad', 'pasaporte', 'tutor']);
  const identityVerified = hasDocument(docs, ['dni', 'identidad', 'pasaporte', 'tutor'], VERIFIED_DOCUMENT_STATUSES);
  const pendingDocs = (docs || []).filter((doc) => PENDING_DOCUMENT_STATUSES.has(documentStatus(doc))).length;

  const checks = [
    { key: 'nombre', label: 'Nombre y apellidos completos', weight: 9, required: true, complete: hasText(profile.nombre, 2) && hasText(profile.apellidos, 2) },
    { key: 'telefono', label: 'Telefono valido', weight: 10, required: true, complete: phone.valid },
    { key: 'direccion', label: 'Direccion, ciudad y codigo postal', weight: 14, required: true, complete: hasText(firstValue(profile, ['direccion', 'address']), 5) && hasText(firstValue(profile, ['ciudad', 'city']), 2) && postalCode.valid },
    { key: 'zona', label: 'Zona/barrio para matching presencial', weight: 8, required: true, complete: hasText(firstValue(profile, ['zona', 'zone']), 2) },
    { key: 'contacto', label: 'Canal preferido de contacto', weight: 7, required: true, complete: hasText(firstValue(profile, ['contacto_preferido', 'preferredContact']), 3) },
    { key: 'emergencia', label: 'Contacto alternativo o de emergencia', weight: 8, required: false, complete: hasText(firstValue(profile, ['emergencyContactName', 'contacto_emergencia_nombre']), 2) && validatePhone(firstValue(profile, ['emergencyContactPhone', 'contacto_emergencia_telefono'])).valid },
    { key: 'alumnos', label: 'Al menos un alumno activo', weight: 12, required: false, complete: hasStudent },
    { key: 'idiomas', label: 'Idiomas de comunicacion', weight: 4, required: false, complete: languages.length > 0 },
    { key: 'notas', label: 'Preferencias educativas documentadas', weight: 7, required: false, complete: hasText(firstValue(profile, ['notas_perfil', 'profileNotes']), 20) },
  ];

  const summary = summarizeChecks(checks);
  const trustProfile = buildFamilyTrustProfile({
    ...profile,
    profileCompletionPercent: summary.percent,
    profileComplete: summary.complete,
    perfil_completo: summary.complete,
  }, {
    studentsForOwner: students,
    documentsForOwner: docs,
    stats: {
      completedClasses: profile.reputationMetrics?.completedClasses,
      completionRate: profile.reputationMetrics?.completionRate,
      cancellationRate: profile.reputationMetrics?.cancellationRate,
      paidPayments: profile.reputationMetrics?.paidPayments,
      pendingPayments: profile.reputationMetrics?.pendingPayments,
      paymentReliability: profile.reputationMetrics?.paymentReliability,
      openIncidents: profile.reputationMetrics?.openIncidents,
    },
  });

  return {
    role: 'familia',
    percent: summary.percent,
    complete: summary.complete,
    issues: summary.issues,
    issueLabels: summary.issueLabels,
    recommendations: summary.recommendations,
    trustScore: trustProfile.score,
    trustLevel: trustProfile.level || trustLevel(trustProfile.score),
    trustProfile,
    trustBadges: trustProfile.badges,
    publicTrustStats: trustProfile.publicStats,
    reputationMetrics: trustProfile.metrics,
    pendingDocuments: pendingDocs,
    normalized: {
      languages,
      phone: phone.value,
      postalCode: postalCode.value,
    },
    indicators: [
      trustIndicator('Contacto operativo', phone.valid),
      trustIndicator('Direccion para matching', postalCode.valid && hasText(firstValue(profile, ['zona', 'zone']), 2)),
      trustIndicator('Alumno registrado', hasStudent),
      ...(identityDoc ? [trustIndicator('Documento opcional', identityVerified, identityVerified ? 'Validado por admin' : 'Pendiente de validacion')] : []),
      trustIndicator('Preferencias claras', hasText(firstValue(profile, ['notas_perfil', 'profileNotes']), 20)),
      trustIndicator('Pagos sin incidencias', !trustProfile.metrics.pendingPayments, trustProfile.metrics.pendingPayments ? `${trustProfile.metrics.pendingPayments} pendiente(s)` : 'Al dia'),
    ],
  };
}
