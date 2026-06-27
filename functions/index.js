const admin = require('firebase-admin');
const { onDocumentCreated, onDocumentUpdated } = require('firebase-functions/v2/firestore');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { logger } = require('firebase-functions');

admin.initializeApp();
const db = admin.firestore();

const REGION = 'europe-west1';
const ADMIN_EMAIL = 'contacto.clasesde10@gmail.com';

function clean(value, max = 500) {
  return String(value || '').trim().slice(0, max);
}

function lower(value) {
  return clean(value).toLowerCase();
}

function asArray(value) {
  if (Array.isArray(value)) return value.map((item) => clean(item)).filter(Boolean);
  return clean(value)
    .split(/[,;/+|]|\sy\s/i)
    .map((item) => clean(item))
    .filter(Boolean);
}

function uniq(values) {
  return [...new Set(values.filter(Boolean))];
}

function tokenize(value) {
  return lower(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .split(/[^a-z0-9]+/)
    .filter((item) => item.length > 2);
}

function now() {
  return admin.firestore.FieldValue.serverTimestamp();
}

function makeId(prefix) {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}`;
}

function normalizeStatus(data) {
  return lower(data.status || data.estado || data.estado_verificacion || data.verificationStatus);
}

function getUserName(user) {
  return [user?.nombre, user?.apellidos].filter(Boolean).join(' ').trim() || user?.email || '';
}

async function getAdminUsers() {
  const snap = await db.collection('users').where('role', '==', 'admin').get();
  return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

async function notifyAdmins(title, body, payload = {}) {
  const admins = await getAdminUsers();
  if (!admins.length) {
    await db.collection('automationEvents').add({
      type: 'admin_notification_missing_recipient',
      title,
      body,
      payload,
      adminEmail: ADMIN_EMAIL,
      createdAt: now(),
    });
    return;
  }

  await Promise.all(admins.map((user) => db.collection('notificaciones').add({
    userUid: user.id,
    titulo: title,
    title,
    cuerpo: body,
    body,
    type: payload.type || 'automation',
    payload,
    readAt: null,
    createdAt: now(),
    updatedAt: now(),
  })));
}

function calculateTeacherPrice(data) {
  let base = 15;
  const education = lower([data.titulacion, data.nivel_estudios, data.universidad, data.bio].join(' '));
  if (education.includes('doctor') || education.includes('master') || education.includes('máster')) base += 8;
  else if (education.includes('grado') || education.includes('licenci') || education.includes('ingenier') || education.includes('universidad')) base += 5;
  else if (education.includes('fp') || education.includes('modulo') || education.includes('módulo')) base += 2;

  const experienceText = lower([data.experiencia, data.anios, data.bio].join(' '));
  const years = Number(experienceText.match(/\d+/)?.[0] || 0);
  if (years >= 5) base += 6;
  else if (years >= 3) base += 4;
  else if (years >= 1) base += 2;

  const subjects = lower([data.materias, data.materia].flat().join(' '));
  if (/(matematic|mates|fisica|física|quimica|química)/.test(subjects)) base += 3;
  return Math.round(base * 2) / 2;
}

function teacherDiagnostic(data, price) {
  const subjects = asArray(data.materias || data.materia).join(', ') || 'Sin materias';
  const levels = asArray(data.niveles_educativos || data.niveles || data.nivel).join(', ') || 'Sin niveles';
  const zone = clean(data.zona || data.ciudad || data.metadata?.zona) || 'Sin zona';
  const modality = clean(data.modalidad || data.metadata?.modalidad) || 'Sin modalidad';
  const warnings = [];
  if (!subjects || subjects === 'Sin materias') warnings.push('Faltan materias.');
  if (!levels || levels === 'Sin niveles') warnings.push('Faltan niveles.');
  if (!clean(data.experiencia || data.bio || data.metadata?.anios)) warnings.push('Falta experiencia declarada.');
  return {
    summary: `Materias: ${subjects}. Niveles: ${levels}. Modalidad: ${modality}. Zona: ${zone}. Precio sugerido: ${price} EUR/h.`,
    warnings,
  };
}

function studentDiagnostic(data) {
  const subject = clean(data.materia || data.materias || data.metadata?.materia || data.metadata?.materias) || 'Sin materia';
  const level = clean(data.nivel || data.curso || data.metadata?.nivel) || 'Sin nivel';
  const modality = clean(data.modalidad || data.metadata?.modalidad) || 'Sin modalidad';
  const zone = clean(data.zona || data.metadata?.zona) || 'Sin zona';
  return {
    summary: `Alumno: ${clean(data.alumno || data.metadata?.alumno || data.studentName) || 'Sin nombre'}. Nivel: ${level}. Materia: ${subject}. Modalidad: ${modality}. Zona: ${zone}.`,
    missing: [
      subject === 'Sin materia' ? 'materia' : '',
      level === 'Sin nivel' ? 'nivel' : '',
      zone === 'Sin zona' ? 'zona' : '',
    ].filter(Boolean),
  };
}

function leadToPublicRequest(leadId, lead) {
  const metadata = lead.metadata || {};
  const subject = clean(metadata.materia || metadata.materias || lead.asunto || lead.mensaje, 180);
  const studentName = clean(metadata.alumno || lead.alumno || '', 160);
  return {
    source: 'publicLead',
    publicLeadId: leadId,
    estado: 'nueva',
    status: 'nueva',
    materia: subject,
    nivel: clean(metadata.nivel || metadata.niveles, 120),
    modalidad: clean(metadata.modalidad, 120),
    zona: clean(metadata.zona, 180),
    preferencia_horario: clean(metadata.disponibilidad || metadata.frecuencia || metadata.inicio, 300),
    observaciones: clean(lead.mensaje, 2000),
    familySnapshot: {
      nombre: clean(lead.nombre, 160),
      email: clean(lead.email, 254).toLowerCase(),
      telefono: clean(lead.telefono, 40),
    },
    studentSnapshot: {
      nombre: studentName,
      nivel: clean(metadata.nivel || metadata.niveles, 120),
    },
    matchStatus: 'pending',
    createdAt: now(),
    updatedAt: now(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

async function countActiveAssignmentsByTeacher() {
  const snap = await db.collection('asignaciones').where('active', '==', true).get();
  const counts = new Map();
  snap.docs.forEach((doc) => {
    const data = doc.data();
    const teacherUid = data.teacherUid || data.profesor_id;
    if (teacherUid) counts.set(teacherUid, (counts.get(teacherUid) || 0) + 1);
  });
  return counts;
}

async function loadTeachers() {
  const [teachersSnap, usersSnap, assignmentCounts] = await Promise.all([
    db.collection('profesores').get(),
    db.collection('users').get(),
    countActiveAssignmentsByTeacher(),
  ]);
  const users = new Map(usersSnap.docs.map((doc) => [doc.id, { id: doc.id, ...doc.data() }]));

  return teachersSnap.docs
    .map((doc) => {
      const data = doc.data();
      const userUid = data.userUid || data.usuario_id || doc.id;
      const user = users.get(userUid) || {};
      const status = normalizeStatus(data);
      return {
        id: doc.id,
        teacherUid: doc.id,
        userUid,
        nombre: getUserName(user) || getUserName(data) || doc.id,
        email: user.email || data.email || '',
        status,
        active: data.active !== false && data.activo !== false,
        materias: asArray(data.materias || data.materia),
        niveles: asArray(data.niveles_educativos || data.niveles || data.nivel),
        modalidad: clean(data.modalidad || data.tipo_clase || data.formato),
        zona: clean(data.zona || data.ciudad || data.barrio),
        bio: clean(data.bio || data.experiencia, 1000),
        tarifa: Number(data.tarifa_hora || data.precio || data.price || 0),
        maxStudents: Number(data.maxStudents || data.max_alumnos || 5),
        activeAssignments: assignmentCounts.get(doc.id) || assignmentCounts.get(userUid) || 0,
        raw: data,
      };
    })
    .filter((teacher) => teacher.active && ['verificado', 'activo', 'pendiente_revision', 'pendiente', ''].includes(teacher.status));
}

function getRequestProfile(request) {
  const metadata = request.metadata || {};
  const student = request.studentSnapshot || {};
  return {
    subject: clean(request.materia || request.subject || metadata.materia || metadata.materias),
    level: clean(request.nivel || request.nivel_educativo || request.curso || student.nivel || metadata.nivel),
    modality: clean(request.modalidad || metadata.modalidad),
    zone: clean(request.zona || metadata.zona),
    schedule: clean(request.preferencia_horario || request.disponibilidad || metadata.disponibilidad),
    studentName: clean(student.nombre || request.alumno_nombre || metadata.alumno),
  };
}

function scoreTeacher(profile, teacher) {
  let score = 0;
  const reasons = [];
  const risks = [];
  const subjectTokens = tokenize(profile.subject);
  const teacherSubjectText = lower(teacher.materias.join(' '));
  const subjectMatches = subjectTokens.filter((token) => teacherSubjectText.includes(token));
  if (subjectTokens.length && subjectMatches.length) {
    score += Math.min(45, 25 + subjectMatches.length * 10);
    reasons.push(`Cubre la materia (${profile.subject}).`);
  } else if (subjectTokens.length) {
    risks.push(`No hay coincidencia clara de materia (${profile.subject}).`);
    score -= 20;
  } else {
    score += 10;
    risks.push('La solicitud no indica materia clara.');
  }

  const level = lower(profile.level);
  const levels = lower(teacher.niveles.join(' '));
  if (level && (levels.includes(level) || levels.includes('todos') || levels.includes('eso') && level.includes('eso'))) {
    score += 25;
    reasons.push(`Nivel compatible (${profile.level}).`);
  } else if (level) {
    risks.push(`Nivel no confirmado (${profile.level}).`);
  }

  const modality = lower(profile.modality);
  const teacherModality = lower(teacher.modalidad);
  if (!modality || !teacherModality || teacherModality.includes('ambas') || modality.includes('ambas') || teacherModality.includes(modality)) {
    score += 10;
    if (profile.modality) reasons.push(`Modalidad compatible (${profile.modality}).`);
  } else {
    risks.push(`Modalidad pendiente de validar (${profile.modality} vs ${teacher.modalidad}).`);
  }

  const zone = lower(profile.zone);
  const teacherZone = lower(teacher.zona);
  if (zone && teacherZone && (teacherZone.includes(zone) || zone.includes(teacherZone) || teacherModality.includes('online'))) {
    score += 10;
    reasons.push(`Zona/modalidad compatible (${profile.zone}).`);
  } else if (zone) {
    risks.push(`Zona no confirmada (${profile.zone}).`);
  }

  const remaining = Math.max(0, teacher.maxStudents - teacher.activeAssignments);
  if (remaining > 0) {
    score += Math.min(10, remaining * 2);
    reasons.push(`${remaining} plaza(s) estimadas disponibles.`);
  } else {
    score -= 30;
    risks.push('Carga actual completa.');
  }

  if (teacher.status === 'verificado' || teacher.status === 'activo') score += 8;
  else risks.push('Profesor pendiente de revision/verificacion.');

  return {
    score: Math.max(0, Math.min(100, Math.round(score))),
    reasons,
    risks,
  };
}

async function callGeminiIfConfigured(profile, candidates) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || !candidates.length) return null;

  const teacherBlock = candidates.slice(0, 8).map((candidate, index) => (
    `P${index + 1}: id="${candidate.teacherUid}" nombre="${candidate.nombre}" scoreBase=${candidate.score} materias="${candidate.materias.join(', ')}" niveles="${candidate.niveles.join(', ')}" modalidad="${candidate.modalidad}" zona="${candidate.zona}" riesgos="${candidate.risks.join('; ')}"`
  )).join('\n');

  const prompt = `Eres el motor de matching de ClasesDe10. Ordena los mejores profesores para esta solicitud. Responde solo JSON valido.\nSOLICITUD: materia="${profile.subject}" nivel="${profile.level}" modalidad="${profile.modality}" zona="${profile.zone}" horario="${profile.schedule}"\nCANDIDATOS:\n${teacherBlock}\nJSON requerido: {"matches":[{"teacherUid":"...","score":90,"reason":"frase breve","risks":["..."]}]}`;
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.15, maxOutputTokens: 700 },
    }),
  });
  const raw = await response.json();
  if (!response.ok || raw.error) throw new Error(raw.error?.message || `Gemini ${response.status}`);
  const text = raw.candidates?.[0]?.content?.parts?.[0]?.text
    ?.replace(/^```json\s*/i, '')
    ?.replace(/^```\s*/i, '')
    ?.replace(/```\s*$/i, '')
    ?.trim();
  return text ? JSON.parse(text) : null;
}

async function generateMatchesForRequest(requestId, request, reason = 'trigger') {
  const profile = getRequestProfile(request);
  const teachers = await loadTeachers();
  const baseCandidates = teachers
    .map((teacher) => {
      const scored = scoreTeacher(profile, teacher);
      return { ...teacher, ...scored };
    })
    .filter((candidate) => candidate.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);

  let aiResult = null;
  let aiError = null;
  try {
    aiResult = await callGeminiIfConfigured(profile, baseCandidates);
  } catch (error) {
    aiError = error.message;
    logger.warn('Gemini matching failed, using deterministic ranking', { requestId, error: error.message });
  }

  const aiByTeacher = new Map((aiResult?.matches || []).map((match) => [match.teacherUid, match]));
  const candidates = baseCandidates
    .map((candidate) => {
      const ai = aiByTeacher.get(candidate.teacherUid);
      return {
        ...candidate,
        score: Math.max(candidate.score, Number(ai?.score || 0)),
        aiReason: clean(ai?.reason, 500),
        aiRisks: Array.isArray(ai?.risks) ? ai.risks.map((item) => clean(item, 180)).filter(Boolean) : [],
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  const runRef = await db.collection('matchingRuns').add({
    requestId,
    reason,
    status: candidates.length ? 'completed' : 'no_match',
    profile,
    candidatesCount: candidates.length,
    aiUsed: Boolean(aiResult),
    aiError,
    createdAt: now(),
  });

  const batch = db.batch();
  candidates.forEach((candidate, index) => {
    const ref = db.collection('solicitudMatches').doc(`${requestId}_${candidate.teacherUid}`);
    batch.set(ref, {
      requestId,
      solicitud_id: requestId,
      runId: runRef.id,
      teacherUid: candidate.teacherUid,
      profesor_id: candidate.teacherUid,
      teacherUserUid: candidate.userUid,
      teacherName: candidate.nombre,
      nombreProfesor: candidate.nombre,
      teacherEmail: candidate.email,
      score: candidate.score,
      rank: index + 1,
      reasons: candidate.aiReason ? [candidate.aiReason, ...candidate.reasons] : candidate.reasons,
      risks: uniq([...(candidate.aiRisks || []), ...candidate.risks]),
      subjectMatch: profile.subject,
      levelMatch: profile.level,
      status: 'propuesto',
      estado: 'propuesto',
      createdAt: now(),
      updatedAt: now(),
    }, { merge: true });
  });

  batch.update(db.collection('solicitudes').doc(requestId), {
    matchStatus: candidates.length ? 'ready' : 'no_match',
    bestTeacherUid: candidates[0]?.teacherUid || null,
    bestScore: candidates[0]?.score || 0,
    matchRunId: runRef.id,
    matchComputedAt: now(),
    updatedAt: now(),
    updated_at: new Date().toISOString(),
  });
  await batch.commit();

  await db.collection('automationEvents').add({
    type: 'matching_generated',
    requestId,
    runId: runRef.id,
    candidatesCount: candidates.length,
    bestTeacherUid: candidates[0]?.teacherUid || null,
    bestScore: candidates[0]?.score || 0,
    aiUsed: Boolean(aiResult),
    aiError,
    createdAt: now(),
  });

  if (!candidates.length) {
    await notifyAdmins('Solicitud sin match automatico', `No hay candidatos claros para ${profile.subject || 'la solicitud'} (${profile.level || 'nivel sin indicar'}).`, {
      type: 'matching_no_match',
      requestId,
    });
  }

  return { runId: runRef.id, candidates };
}

exports.processPublicLead = onDocumentCreated({
  region: REGION,
  document: 'leadsPublicos/{leadId}',
}, async (event) => {
  const leadId = event.params.leadId;
  const lead = event.data.data();
  const type = clean(lead.tipo, 30);

  await db.collection('automationEvents').add({
    type: 'lead_received',
    leadId,
    leadType: type,
    createdAt: now(),
  });

  if (type === 'profesor') {
    const price = calculateTeacherPrice({ ...lead, ...(lead.metadata || {}) });
    const diagnostic = teacherDiagnostic({ ...lead, ...(lead.metadata || {}) }, price);
    await event.data.ref.update({
      suggestedHourlyRate: price,
      diagnostico: diagnostic,
      automationStatus: 'review_teacher_lead',
      updatedAt: now(),
    });
    await notifyAdmins('Nuevo profesor interesado', `${lead.nombre || lead.email || 'Profesor'} envio una solicitud publica. Precio sugerido: ${price} EUR/h.`, {
      type: 'teacher_lead',
      leadId,
    });
    return;
  }

  if (type === 'familia') {
    const requestRef = db.collection('solicitudes').doc(`lead_${leadId}`);
    const requestPayload = leadToPublicRequest(leadId, lead);
    await requestRef.set(requestPayload, { merge: true });
    await event.data.ref.update({
      automationStatus: 'request_created',
      solicitudId: requestRef.id,
      diagnostico: studentDiagnostic({ ...lead, ...(lead.metadata || {}) }),
      updatedAt: now(),
    });
    await notifyAdmins('Nueva familia solicita profesor', `${lead.nombre || lead.email || 'Familia'} solicito ${requestPayload.materia || 'materia sin indicar'}.`, {
      type: 'family_lead_request',
      leadId,
      requestId: requestRef.id,
    });
    return;
  }

  await notifyAdmins('Nuevo contacto publico', `${lead.nombre || lead.email || 'Contacto'} envio un mensaje.`, {
    type: 'contact_lead',
    leadId,
  });
});

exports.generateRequestMatching = onDocumentCreated({
  region: REGION,
  document: 'solicitudes/{requestId}',
}, async (event) => {
  const requestId = event.params.requestId;
  const request = event.data.data();
  if ((request.matchStatus || '') === 'ready') return;
  await generateMatchesForRequest(requestId, request, 'request_created');
});

exports.createAssignmentOnRequestAssigned = onDocumentUpdated({
  region: REGION,
  document: 'solicitudes/{requestId}',
}, async (event) => {
  const before = event.data.before.data();
  const after = event.data.after.data();
  const requestId = event.params.requestId;
  const beforeTeacher = before.assignedTeacherUid || before.profesor_asignado_id;
  const teacherUid = after.assignedTeacherUid || after.profesor_asignado_id;
  const status = after.status || after.estado;

  if (!teacherUid || beforeTeacher === teacherUid || !['asignada', 'asignado'].includes(status)) return;

  const studentId = after.studentId || after.alumno_id;
  const familyUid = after.familyUid || after.familia_id || null;
  const assignmentId = `${requestId}_${teacherUid}`;
  await db.collection('asignaciones').doc(assignmentId).set({
    requestId,
    solicitud_id: requestId,
    teacherUid,
    profesor_id: teacherUid,
    studentId: studentId || null,
    alumno_id: studentId || null,
    familyUid,
    familia_id: familyUid,
    materia: after.materia || after.subject || '',
    active: true,
    activa: true,
    source: 'request_assignment',
    createdAt: now(),
    updatedAt: now(),
  }, { merge: true });

  await db.collection('solicitudMatches').doc(`${requestId}_${teacherUid}`).set({
    status: 'asignado',
    estado: 'asignado',
    selectedAt: now(),
    updatedAt: now(),
  }, { merge: true });

  await db.collection('automationEvents').add({
    type: 'assignment_created',
    requestId,
    assignmentId,
    teacherUid,
    studentId: studentId || null,
    createdAt: now(),
  });
});

exports.scanPendingMatching = onSchedule({
  region: REGION,
  schedule: 'every 60 minutes',
  timeZone: 'Europe/Madrid',
}, async () => {
  const snap = await db.collection('solicitudes')
    .where('status', '==', 'nueva')
    .limit(25)
    .get();

  let processed = 0;
  for (const doc of snap.docs) {
    const data = doc.data();
    if (data.matchStatus === 'ready') continue;
    await generateMatchesForRequest(doc.id, data, 'scheduled_scan');
    processed += 1;
  }
  logger.info('scanPendingMatching completed', { processed });
});

exports.generateMonthlySummary = onSchedule({
  region: REGION,
  schedule: '0 8 1 * *',
  timeZone: 'Europe/Madrid',
}, async () => {
  const nowDate = new Date();
  const previousMonthDate = new Date(nowDate.getFullYear(), nowDate.getMonth() - 1, 1);
  const month = `${previousMonthDate.getFullYear()}-${String(previousMonthDate.getMonth() + 1).padStart(2, '0')}`;
  const classesSnap = await db.collection('clases').get();
  const summary = {
    month,
    classes: 0,
    teacherTotals: {},
    familyTotals: {},
    createdAt: now(),
  };

  classesSnap.docs.forEach((doc) => {
    const data = doc.data();
    const date = clean(data.fecha || data.date);
    if (!date.startsWith(month)) return;
    if (!['realizada', 'completada'].includes(data.estado || data.status)) return;
    summary.classes += 1;
    const teacherUid = data.teacherUid || data.profesor_id || 'sin_profesor';
    const familyUid = data.familyUid || data.familia_id || 'sin_familia';
    summary.teacherTotals[teacherUid] = (summary.teacherTotals[teacherUid] || 0) + Number(data.importe_profesor || data.teacherAmount || 0);
    summary.familyTotals[familyUid] = (summary.familyTotals[familyUid] || 0) + Number(data.precio_total || data.amount || 0);
  });

  await db.collection('resumenMensual').doc(month).set(summary, { merge: true });
  await notifyAdmins('Resumen mensual generado', `Resumen ${month}: ${summary.classes} clase(s) procesadas.`, {
    type: 'monthly_summary',
    month,
  });
});
