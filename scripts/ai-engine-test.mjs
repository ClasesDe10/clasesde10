#!/usr/bin/env node
import assert from 'node:assert/strict';
import {
  AI_FEATURES_VERSION,
  MATCHING_VERSION,
  buildFamilyRequestBrief,
  buildMatchingAiPrompt,
  buildMatchingDecisionSupport,
  buildTeacherMatchingSignals,
  buildTeacherProfileRecommendations,
  classifyIncident,
  evaluateTeacherProfile,
  getAiExecutionPolicy,
  mergeAiRanking,
  moderateContent,
  rankTeachersForRequest,
  scoreTeacherForRequest,
  semanticSearchItems,
  summarizeTeacherProfile,
} from '../js/ai-engine.js';

const request = {
  id: 'req_1',
  materia: 'Matematicas',
  nivel: '2 ESO',
  modalidad: 'online',
  zona: 'Madrid',
  preferencia_horario: 'Tardes entre semana',
};

const completeTeacher = {
  id: 'teacher_complete',
  nombre: 'Ana',
  apellidos: 'Lopez',
  email: 'ana@example.com',
  telefono: '600111222',
  foto_url: 'https://example.com/ana.jpg',
  direccion: 'Calle Mayor 1',
  ciudad: 'Madrid',
  codigo_postal: '28001',
  zona: 'Madrid centro',
  modalidad: 'online',
  materias: ['Matematicas', 'Fisica'],
  niveles_educativos: ['ESO', 'Bachillerato'],
  nivel_estudios: 'Grado universitario',
  estudio_exacto: 'Grado en Matematicas',
  colegio: 'Colegio El Prado',
  schoolName: 'Colegio El Prado',
  centro_estudios: 'Universidad Complutense de Madrid',
  nota_bachillerato: 8.7,
  nota_media_universidad: 8.1,
  disponibilidad_resumen: 'Tardes entre semana',
  hasCar: true,
  tiene_coche: true,
  rating: 4.8,
  acceptanceRate: 0.9,
  responseTimeHours: 2,
  bio: 'Profesora universitaria con experiencia real preparando alumnos de ESO y Bachillerato.',
  acepta_bizum: true,
  status: 'verificado',
  active: true,
  maxStudents: 5,
  activeAssignments: 1,
};

const incompleteTeacher = {
  id: 'teacher_incomplete',
  nombre: 'Luis',
  email: 'luis@example.com',
  materias: ['Ingles'],
  status: 'pendiente_perfil',
  active: false,
};

const completeQuality = evaluateTeacherProfile(completeTeacher);
assert.equal(completeQuality.assignable, true);
assert.equal(completeQuality.readiness, 'asignable');
assert.ok(completeQuality.score >= 85);

const incompleteQuality = evaluateTeacherProfile(incompleteTeacher);
assert.equal(incompleteQuality.assignable, false);
assert.ok(incompleteQuality.issueLabels.includes('Completar telefono'));
assert.ok(incompleteQuality.score < completeQuality.score);

const completeScore = scoreTeacherForRequest(request, completeTeacher);
assert.equal(completeScore.assignable, true);
assert.ok(completeScore.score > 80);
assert.ok(completeScore.reasons.some((reason) => reason.toLowerCase().includes('materia')));
assert.equal(completeScore.matchingVersion, MATCHING_VERSION);
assert.ok(completeScore.scoreBreakdown.subject.points > 0);
assert.ok(completeScore.scoreBreakdown.availability.points > 0);
assert.ok(completeScore.scoreBreakdown.reputation.points > 0);

const ranking = rankTeachersForRequest(request, [incompleteTeacher, completeTeacher], { limit: 2, includeZeroScore: true });
assert.equal(ranking[0].teacherUid, 'teacher_complete');
assert.equal(ranking[0].assignable, true);
assert.equal(ranking[1].assignable, false);

const summary = summarizeTeacherProfile(incompleteTeacher);
assert.ok(summary.nextActions.length > 0);
assert.equal(summary.assignable, false);

const presencialRequest = {
  materia: 'Matematicas',
  nivel: '2 ESO',
  modalidad: 'presencial',
  zona: 'Madrid centro',
  codigo_postal: '28001',
  preferencia_horario: 'martes tarde',
};
const localTeacher = {
  ...completeTeacher,
  id: 'teacher_local',
  teacherUid: 'teacher_local',
  modalidad: 'presencial',
  codigo_postal: '28001',
  disponibilidad_resumen: 'martes tarde',
  activeAssignments: 2,
};
const remoteTeacher = {
  ...completeTeacher,
  id: 'teacher_remote',
  teacherUid: 'teacher_remote',
  modalidad: 'online',
  zona: 'Valencia',
  codigo_postal: '46001',
  disponibilidad_resumen: 'lunes manana',
};
const presencialRanking = rankTeachersForRequest(presencialRequest, [remoteTeacher, localTeacher], { limit: 2, includeZeroScore: true });
assert.equal(presencialRanking[0].teacherUid, 'teacher_local');
assert.ok(presencialRanking[0].scoreBreakdown.location.points > presencialRanking[1].scoreBreakdown.location.points);
assert.ok(presencialRanking[0].scoreBreakdown.availability.points > presencialRanking[1].scoreBreakdown.availability.points);
assert.ok(presencialRanking[0].locationEstimate.drivingMinutes > 0);
assert.ok(presencialRanking[0].reasons.some((reason) => reason.includes('Desplazamiento estimado')));

const noCarTeacher = {
  ...completeTeacher,
  id: 'teacher_no_car',
  teacherUid: 'teacher_no_car',
  modalidad: 'presencial',
  codigo_postal: '28045',
  zona: 'Arganzuela',
  hasCar: false,
  tiene_coche: false,
};
const carTeacher = {
  ...noCarTeacher,
  id: 'teacher_with_car',
  teacherUid: 'teacher_with_car',
  hasCar: true,
  tiene_coche: true,
};
const travelRanking = rankTeachersForRequest(presencialRequest, [noCarTeacher, carTeacher], { limit: 2, includeZeroScore: true });
assert.equal(travelRanking[0].teacherUid, 'teacher_with_car');
assert.ok(travelRanking[0].scoreBreakdown.location.points > travelRanking[1].scoreBreakdown.location.points);
assert.ok(travelRanking[1].risks.some((risk) => risk.toLowerCase().includes('coche')));

const structuredRequest = {
  ...presencialRequest,
  availabilitySlots: [
    { dayIndex: 1, startTime: '17:00', endTime: '19:00' },
    { dayIndex: 3, startTime: '18:00', endTime: '19:00' },
  ],
};
const structuredFitTeacher = {
  ...localTeacher,
  id: 'teacher_structured_fit',
  teacherUid: 'teacher_structured_fit',
  availabilitySlots: [
    { dayIndex: 1, startTime: '16:30', endTime: '19:30' },
    { dayIndex: 3, startTime: '17:30', endTime: '19:30' },
  ],
};
const structuredBadTeacher = {
  ...localTeacher,
  id: 'teacher_structured_bad',
  teacherUid: 'teacher_structured_bad',
  availabilitySlots: [
    { dayIndex: 0, startTime: '10:00', endTime: '12:00' },
  ],
};
const structuredRanking = rankTeachersForRequest(structuredRequest, [structuredBadTeacher, structuredFitTeacher], { limit: 2, includeZeroScore: true });
assert.equal(structuredRanking[0].teacherUid, 'teacher_structured_fit');
assert.ok(structuredRanking[0].scoreBreakdown.availability.points > structuredRanking[1].scoreBreakdown.availability.points);
assert.ok(structuredRanking[0].reasons.some((reason) => reason.includes('Franjas reales compatibles')));

const reliableTeacher = {
  ...completeTeacher,
  id: 'teacher_reliable',
  teacherUid: 'teacher_reliable',
  rating: 4.9,
  reviewsCount: 20,
  responseTimeHours: 1,
  acceptanceRate: 0.95,
};
const slowTeacher = {
  ...completeTeacher,
  id: 'teacher_slow',
  teacherUid: 'teacher_slow',
  rating: 3.8,
  reviewsCount: 2,
  responseTimeHours: 48,
  acceptanceRate: 0.35,
};
const reliabilityRanking = rankTeachersForRequest(request, [slowTeacher, reliableTeacher], { limit: 2, includeZeroScore: true });
assert.equal(reliabilityRanking[0].teacherUid, 'teacher_reliable');
assert.ok(reliabilityRanking[0].scoreBreakdown.reputation.points > reliabilityRanking[1].scoreBreakdown.reputation.points);

const continuityRequest = {
  ...request,
  familyUid: 'family_1',
  studentId: 'student_1',
};
const continuityTeacher = {
  ...completeTeacher,
  id: 'teacher_continuity',
  teacherUid: 'teacher_continuity',
  responseTimeHours: 1,
  acceptanceRate: 0.95,
};
const freshTeacher = {
  ...completeTeacher,
  id: 'teacher_fresh',
  teacherUid: 'teacher_fresh',
  responseTimeHours: 8,
  acceptanceRate: 0.65,
};
const matchingContext = {
  assignments: [
    { teacherUid: 'teacher_continuity', familyUid: 'family_1', studentId: 'student_1', materia: 'Matematicas', estado: 'active' },
  ],
  classes: [
    { teacherUid: 'teacher_continuity', familyUid: 'family_1', studentId: 'student_1', materia: 'Matematicas', estado: 'realizada', fecha: new Date().toISOString() },
    { teacherUid: 'teacher_continuity', familyUid: 'family_1', studentId: 'student_1', materia: 'Matematicas', estado: 'realizada', fecha: new Date().toISOString() },
  ],
  requestMatches: [
    { teacherUid: 'teacher_continuity', requestId: 'old_1', estado: 'aceptado' },
    { teacherUid: 'teacher_continuity', requestId: 'old_2', estado: 'asignado' },
    { teacherUid: 'teacher_continuity', requestId: 'old_3', estado: 'aceptado' },
  ],
};
const continuityTeachers = [freshTeacher, continuityTeacher].map((teacher) => ({
  ...teacher,
  ...buildTeacherMatchingSignals(teacher, continuityRequest, matchingContext),
}));
const continuityRanking = rankTeachersForRequest(continuityRequest, continuityTeachers, { limit: 2, includeZeroScore: true });
assert.equal(continuityRanking[0].teacherUid, 'teacher_continuity');
assert.ok(continuityRanking[0].scoreBreakdown.fitConfidence.points > continuityRanking[1].scoreBreakdown.fitConfidence.points);
assert.ok(continuityRanking[0].reasons.some((reason) => reason.toLowerCase().includes('continuidad')));

const padelRequest = {
  materia: 'Padel',
  nivel: 'Deporte',
  modalidad: 'presencial',
  zona: 'Chamberi',
  preferencia_horario: 'sabado manana',
};
const padelTeacher = {
  ...completeTeacher,
  id: 'teacher_padel',
  teacherUid: 'teacher_padel',
  materias: ['Padel', 'Tenis'],
  niveles_educativos: ['Deporte'],
  modalidad: 'presencial',
  zona: 'Chamberi',
  disponibilidad_resumen: 'sabado manana',
  estudio_exacto: 'Monitor nacional de padel',
};
const guitarTeacher = {
  ...completeTeacher,
  id: 'teacher_guitar',
  teacherUid: 'teacher_guitar',
  materias: ['Guitarra'],
  niveles_educativos: ['Musica'],
  modalidad: 'presencial',
  zona: 'Chamberi',
};
const activityRanking = rankTeachersForRequest(padelRequest, [guitarTeacher, padelTeacher], { limit: 2, includeZeroScore: true });
assert.equal(activityRanking[0].teacherUid, 'teacher_padel');

const aiMerged = mergeAiRanking([reliableTeacher, slowTeacher].map((teacher) => scoreTeacherForRequest(request, teacher)), {
  matches: [
    { teacherUid: 'unknown_teacher', score: 100, reason: 'No debe entrar', risks: [] },
    { teacherUid: 'teacher_slow', score: 100, reason: 'Buena comunicacion aparente', risks: ['Validar respuesta real'] },
  ],
});
assert.equal(aiMerged.some((match) => match.teacherUid === 'unknown_teacher'), false);
assert.ok(aiMerged.find((match) => match.teacherUid === 'teacher_slow').aiAdjustment <= 8);

const prompt = buildMatchingAiPrompt(request, ranking);
assert.ok(prompt.includes('No inventes datos'));
assert.ok(prompt.includes('JSON requerido'));

const decisionSupport = buildMatchingDecisionSupport(structuredRequest, structuredRanking);
assert.equal(decisionSupport.version, MATCHING_VERSION);
assert.equal(decisionSupport.quality, 'listo_para_asignar');
assert.ok(decisionSupport.confidenceScore >= 80);
assert.equal(decisionSupport.topTeacherUid, 'teacher_structured_fit');

const profileAssistant = buildTeacherProfileRecommendations(completeTeacher);
assert.equal(profileAssistant.version, AI_FEATURES_VERSION);
assert.equal(profileAssistant.assignable, true);
assert.ok(profileAssistant.generatedDescription.includes('Matematicas'));
assert.ok(profileAssistant.policy.costTier === 'free');

const incompleteAssistant = buildTeacherProfileRecommendations(incompleteTeacher);
assert.ok(incompleteAssistant.nextActions.length > 0);
assert.equal(incompleteAssistant.policy.externalCallAllowed, false);

const requestBrief = buildFamilyRequestBrief({
  materia: 'Ingles',
  nivel: 'Bachillerato',
  modalidad: 'online',
  preferencia_horario: 'Urgente esta semana por examen',
});
assert.equal(requestBrief.urgency, 'alta');
assert.ok(requestBrief.missing.includes('zona/codigo postal'));

const moderation = moderateContent('Te pago directo por fuera de ClasesDe10, mi IBAN es ES9121000418450200051332', { channel: 'chat', role: 'familia' });
assert.equal(moderation.action, 'allow');
assert.ok(moderation.flags.includes('off_platform_payment'));
assert.ok(moderation.flags.includes('iban_or_bank_data'));
assert.equal(moderation.policy.costTier, 'free');

const spamModeration = moderateContent('casino crypto www.spam.test https://spam.test', { channel: 'lead' });
assert.equal(spamModeration.action, 'review');
assert.equal(spamModeration.severity, 'high');

const paymentIncident = classifyIncident('La familia no ha hecho el Bizum y el pago esta vencido.');
assert.equal(paymentIncident.category, 'pago');
assert.equal(paymentIncident.priority, 2);
assert.ok(paymentIncident.suggestedActions.length > 0);

const search = semanticSearchItems('mates eso online madrid', [completeTeacher, guitarTeacher], {
  fields: ['nombre', 'materias', 'niveles_educativos', 'modalidad', 'zona', 'bio'],
});
assert.equal(search[0].item.id, 'teacher_complete');
assert.ok(search[0].score > 0);

const policy = getAiExecutionPolicy('matching_rerank', { request, ranking });
assert.equal(policy.mode, 'optional_llm');
assert.equal(policy.externalCallAllowed, true);
assert.ok(policy.cacheKey.startsWith('matching_rerank_'));

console.log(JSON.stringify({
  ok: true,
  completeScore: completeScore.score,
  incompleteProfileScore: incompleteQuality.score,
  topTeacher: ranking[0].teacherUid,
}, null, 2));
