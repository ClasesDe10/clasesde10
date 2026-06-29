#!/usr/bin/env node
/**
 * Recalculates trust and reputation summaries using the Firebase CLI OAuth
 * token instead of Admin SDK credentials.
 *
 * Default mode is dry-run. Use --apply to persist trust fields.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import {
  buildFamilyTrustProfile,
  buildTeacherTrustProfile,
  buildTrustSnapshotPatch,
} from '../js/trust-engine.js';

const PROJECT_ID = 'clasesde10-50add';
const DATABASE = '(default)';
const APPLY = process.argv.includes('--apply');
const LIMIT_ARG = process.argv.find((arg) => arg.startsWith('--limit='));
const LIMIT = Number(LIMIT_ARG?.split('=')[1] || 500);

function readFirebaseCliToken() {
  const configPath = path.join(os.homedir(), '.config', 'configstore', 'firebase-tools.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const token = config?.tokens?.access_token;
  if (!token) throw new Error('Firebase CLI access token not found.');
  return token;
}

function firestoreToJs(field) {
  if (!field) return undefined;
  if ('stringValue' in field) return field.stringValue;
  if ('booleanValue' in field) return field.booleanValue;
  if ('integerValue' in field) return Number(field.integerValue);
  if ('doubleValue' in field) return field.doubleValue;
  if ('timestampValue' in field) return field.timestampValue;
  if ('nullValue' in field) return null;
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
  if (Array.isArray(value)) return { arrayValue: { values: value.map(jsToFirestore) } };
  if (value instanceof Date) return { timestampValue: value.toISOString() };
  if (typeof value === 'object') {
    return {
      mapValue: {
        fields: Object.fromEntries(Object.entries(value).map(([key, item]) => [key, jsToFirestore(item)])),
      },
    };
  }
  return { stringValue: String(value) };
}

function docToRecord(doc) {
  return {
    id: doc.name.split('/').pop(),
    docName: doc.name,
    ...Object.fromEntries(Object.entries(doc.fields || {}).map(([key, value]) => [key, firestoreToJs(value)])),
  };
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
  if (!response.ok) throw new Error(`${response.status} ${body?.error?.message || JSON.stringify(body)}`);
  return body;
}

async function listCollection(token, collectionName) {
  const docs = [];
  let pageToken = '';
  do {
    const url = new URL(`https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/${DATABASE}/documents/${collectionName}`);
    url.searchParams.set('pageSize', String(Math.min(LIMIT, 500)));
    if (pageToken) url.searchParams.set('pageToken', pageToken);
    const body = await firestore(token, url);
    docs.push(...(body.documents || []).map(docToRecord));
    pageToken = docs.length >= LIMIT ? '' : (body.nextPageToken || '');
  } while (pageToken);
  return docs.slice(0, LIMIT);
}

async function patchDocument(token, docName, patch) {
  if (!Object.keys(patch).length) return;
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
const [
  teachers,
  families,
  users,
  classes,
  payments,
  documents,
  requests,
  matches,
  assignments,
  incidents,
  students,
  paymentSchedules,
] = await Promise.all([
  listCollection(token, 'profesores'),
  listCollection(token, 'familias'),
  listCollection(token, 'users'),
  listCollection(token, 'clases'),
  listCollection(token, 'pagos'),
  listCollection(token, 'documentos'),
  listCollection(token, 'solicitudes'),
  listCollection(token, 'solicitudMatches'),
  listCollection(token, 'asignaciones'),
  listCollection(token, 'incidencias'),
  listCollection(token, 'alumnos'),
  listCollection(token, 'paymentSchedules'),
]);

const usersById = new Map(users.map((item) => [item.id, item]));
const trustContext = {
  classes,
  payments,
  documents,
  requests,
  matches,
  requestMatches: matches,
  assignments,
  incidents,
  students,
  alumnos: students,
  paymentSchedules,
};

const planned = [];

for (const teacher of teachers) {
  const userUid = teacher.userUid || teacher.usuario_id || teacher.id;
  const profile = {
    ...teacher,
    teacherUid: teacher.id,
    userUid,
    usuarios: usersById.get(userUid) || usersById.get(teacher.id) || {},
  };
  const trust = buildTeacherTrustProfile(profile, trustContext);
  planned.push({
    role: 'profesor',
    id: teacher.id,
    docName: teacher.docName,
    score: trust.score,
    level: trust.level,
    patch: {
      ...buildTrustSnapshotPatch(trust),
      trustUpdatedAtIso: new Date().toISOString(),
    },
  });
}

for (const family of families) {
  const userUid = family.userUid || family.usuario_id || family.id;
  const profile = {
    ...family,
    familyUid: family.id,
    userUid,
    usuarios: usersById.get(userUid) || usersById.get(family.id) || {},
  };
  const trust = buildFamilyTrustProfile(profile, trustContext);
  planned.push({
    role: 'familia',
    id: family.id,
    docName: family.docName,
    score: trust.score,
    level: trust.level,
    patch: {
      ...buildTrustSnapshotPatch(trust),
      trustUpdatedAtIso: new Date().toISOString(),
    },
  });
}

if (APPLY) {
  for (const item of planned) {
    await patchDocument(token, item.docName, item.patch);
  }
}

console.log(JSON.stringify({
  ok: true,
  mode: APPLY ? 'apply' : 'dry-run',
  projectId: PROJECT_ID,
  teachers: teachers.length,
  families: families.length,
  profilesProcessed: planned.length,
  averageScore: planned.length ? Math.round(planned.reduce((sum, item) => sum + item.score, 0) / planned.length) : 0,
  applied: APPLY,
  sample: planned.slice(0, 6).map((item) => ({
    role: item.role,
    id: item.id,
    score: item.score,
    level: item.level,
  })),
}, null, 2));
