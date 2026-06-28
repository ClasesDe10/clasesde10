#!/usr/bin/env node
/**
 * Normalizes Firestore teacher documents without approving or activating them.
 *
 * Default mode is dry-run. Use `--apply` to write safe aliases and completeness
 * metadata used by the admin dashboard and matching automation.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

const PROJECT_ID = 'clasesde10-50add';
const APPLY = process.argv.includes('--apply');

function readFirebaseCliToken() {
  const configPath = path.join(os.homedir(), '.config', 'configstore', 'firebase-tools.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const token = config?.tokens?.access_token;
  if (!token) throw new Error('Firebase CLI access token not found.');
  return token;
}

function clean(value, max = 1000) {
  return String(value || '').trim().slice(0, max);
}

function asArray(value) {
  if (Array.isArray(value)) return value.map((item) => clean(item)).filter(Boolean);
  return clean(value)
    .split(/[,;/+|]|\sy\s/i)
    .map((item) => clean(item))
    .filter(Boolean);
}

function firestoreToJs(field) {
  if (!field) return undefined;
  if ('stringValue' in field) return field.stringValue;
  if ('booleanValue' in field) return field.booleanValue;
  if ('integerValue' in field) return Number(field.integerValue);
  if ('doubleValue' in field) return field.doubleValue;
  if ('timestampValue' in field) return field.timestampValue;
  if ('arrayValue' in field) return (field.arrayValue.values || []).map(firestoreToJs);
  if ('mapValue' in field) {
    return Object.fromEntries(Object.entries(field.mapValue.fields || {}).map(([key, value]) => [key, firestoreToJs(value)]));
  }
  return null;
}

function jsToFirestore(value) {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') {
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  }
  if (Array.isArray(value)) {
    return { arrayValue: { values: value.map(jsToFirestore) } };
  }
  if (value instanceof Date) return { timestampValue: value.toISOString() };
  if (typeof value === 'object') {
    return { mapValue: { fields: Object.fromEntries(Object.entries(value).map(([key, item]) => [key, jsToFirestore(item)])) } };
  }
  return { stringValue: String(value) };
}

function sameValue(a, b) {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

function splitName(fullName) {
  const parts = clean(fullName, 160).split(/\s+/).filter(Boolean);
  return {
    nombre: parts.shift() || '',
    apellidos: parts.join(' '),
  };
}

function profileIssues(data) {
  const subjects = asArray(data.materias || data.subjects || data.materia || data.materiasTexto);
  const levels = asArray(data.niveles_educativos || data.levels || data.niveles || data.nivel);
  const issues = [];
  if (!(data.foto_url || data.photoUrl)) issues.push('foto');
  if (!clean(data.email)) issues.push('email');
  if (!clean(data.telefono)) issues.push('telefono');
  if (!(data.direccion || data.address)) issues.push('calle');
  if (!(data.ciudad || data.city)) issues.push('ciudad');
  if (!(data.codigo_postal || data.postalCode)) issues.push('codigo postal');
  if (!(data.zona || data.zone)) issues.push('zona');
  if (!subjects.length) issues.push('materias');
  if (!levels.length) issues.push('niveles');
  if (!Number(data.tarifa_hora || data.hourlyRate || data.tarifaHora || 0)) issues.push('tarifa');
  if (!(data.disponibilidad_resumen || data.availabilitySummary)) issues.push('disponibilidad');
  if (!data.bio || clean(data.bio).length < 40) issues.push('presentacion');
  return issues;
}

function buildPatch(data) {
  const patch = {};
  const subjects = asArray(data.materias || data.subjects || data.materia || data.materiasTexto);
  const levels = asArray(data.niveles_educativos || data.levels || data.niveles || data.nivel);
  const hourlyRate = Number(data.tarifa_hora || data.hourlyRate || data.tarifaHora || data.tarifa || 0);
  const names = splitName(data.nombre);
  const issues = profileIssues({ ...data, subjects, levels, hourlyRate });
  const complete = issues.length === 0;
  const status = clean(data.status || data.estado_verificacion || data.verificationStatus) || 'pendiente_perfil';
  const legacyImported = Boolean(data.legacyId || data.source === 'google_sheets_profesores');
  const hasFullNameInNombre = legacyImported && names.nombre && names.apellidos && clean(data.nombre).includes(names.apellidos);

  if (legacyImported && data.nombre && !data.displayName) patch.displayName = clean(data.nombre, 160);
  if ((!data.nombre || hasFullNameInNombre) && names.nombre) patch.nombre = names.nombre;
  if ((!data.apellidos || hasFullNameInNombre) && names.apellidos) patch.apellidos = names.apellidos;
  if (subjects.length) {
    patch.subjects = subjects;
    patch.materias = subjects;
  }
  if (levels.length) {
    patch.levels = levels;
    patch.niveles_educativos = levels;
  }
  if (hourlyRate > 0) {
    patch.hourlyRate = hourlyRate;
    patch.tarifa_hora = hourlyRate;
  }
  if (data.zona && !data.zone) patch.zone = clean(data.zona, 180);
  if (data.modalidad && !data.modality) patch.modality = clean(data.modalidad, 120);
  if (data.experienciaTexto && !data.experienceSummary) patch.experienceSummary = clean(data.experienciaTexto, 1000);
  if (!data.status) patch.status = status;
  if (!data.estado_verificacion) patch.estado_verificacion = status;
  if (!data.verificationStatus) patch.verificationStatus = status;
  patch.profileIssues = issues;
  patch.profileComplete = complete;
  patch.perfil_completo = complete;

  const filtered = Object.fromEntries(Object.entries(patch).filter(([key, value]) => !sameValue(data[key], value)));
  if (Object.keys(filtered).length) filtered.updatedAt = new Date();
  return filtered;
}

async function firestore(token, url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`${response.status} ${body?.error?.message || JSON.stringify(body)}`);
  }
  return body;
}

async function listTeachers(token) {
  const docs = [];
  let pageToken = '';
  do {
    const url = new URL(`https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/profesores`);
    url.searchParams.set('pageSize', '200');
    if (pageToken) url.searchParams.set('pageToken', pageToken);
    const body = await firestore(token, url);
    docs.push(...(body.documents || []));
    pageToken = body.nextPageToken || '';
  } while (pageToken);
  return docs;
}

async function patchTeacher(token, docName, patch) {
  const url = new URL(`https://firestore.googleapis.com/v1/${docName}`);
  Object.keys(patch).forEach((field) => url.searchParams.append('updateMask.fieldPaths', field));
  await firestore(token, url, {
    method: 'PATCH',
    body: JSON.stringify({
      fields: Object.fromEntries(Object.entries(patch).map(([key, value]) => [key, jsToFirestore(value)])),
    }),
  });
}

const token = readFirebaseCliToken();
const docs = await listTeachers(token);
const planned = [];

for (const doc of docs) {
  const data = Object.fromEntries(Object.entries(doc.fields || {}).map(([key, value]) => [key, firestoreToJs(value)]));
  const patch = buildPatch(data);
  if (Object.keys(patch).length) {
    planned.push({
      id: doc.name.split('/').pop(),
      docName: doc.name,
      fields: Object.keys(patch).sort(),
      profileComplete: patch.profileComplete,
      profileIssues: patch.profileIssues,
      patch,
    });
  }
}

if (APPLY) {
  for (const item of planned) {
    await patchTeacher(token, item.docName, item.patch);
  }
}

console.log(JSON.stringify({
  ok: true,
  mode: APPLY ? 'apply' : 'dry-run',
  totalTeachers: docs.length,
  teachersToUpdate: planned.length,
  fieldsTouched: [...new Set(planned.flatMap((item) => item.fields))].sort(),
  completeAfterNormalization: planned.filter((item) => item.profileComplete === true).length,
  incompleteAfterNormalization: planned.filter((item) => item.profileComplete === false).length,
  sample: planned.slice(0, 5).map((item) => ({
    id: item.id,
    fields: item.fields,
    profileComplete: item.profileComplete,
    profileIssues: item.profileIssues,
  })),
}, null, 2));
