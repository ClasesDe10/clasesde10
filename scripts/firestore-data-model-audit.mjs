#!/usr/bin/env node

import admin from 'firebase-admin';
import {
  CANONICAL_FIELDS,
  DATA_SCHEMA_VERSION,
  analyzeEntityData,
  normalizeEntityForWrite,
} from '../js/data-schema.js';

const DEFAULT_PROJECT_ID = 'clasesde10-50add';
const args = new Set(process.argv.slice(2));
const apply = args.has('--apply');
const limitArg = process.argv.find((arg) => arg.startsWith('--limit='));
const limit = Math.max(1, Number(limitArg?.split('=')[1] || process.env.DATA_MODEL_AUDIT_LIMIT || 500));

const CORE_COLLECTIONS = Object.freeze([
  'users',
  'profesores',
  'familias',
  'alumnos',
  'solicitudes',
  'asignaciones',
  'chats',
  'clases',
  'pagos',
  'documentos',
  'incidencias',
  'notificaciones',
  'disponibilidad',
  'leadsPublicos',
]);

const SKIP_PATCH_FIELDS = new Set([
  'createdAt',
  'updatedAt',
  'created_at',
  'updated_at',
]);

function initFirebaseAdmin() {
  if (admin.apps.length) return;
  const projectId = process.env.FIREBASE_PROJECT_ID || process.env.GCLOUD_PROJECT || DEFAULT_PROJECT_ID;
  const rawJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  const rawBase64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
  if (rawJson || rawBase64) {
    const decoded = rawJson || Buffer.from(rawBase64, 'base64').toString('utf8');
    admin.initializeApp({ credential: admin.credential.cert(JSON.parse(decoded)), projectId });
    return;
  }
  admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId });
}

function stable(value) {
  if (value === undefined) return '__undefined__';
  if (value === null) return null;
  if (value && typeof value.toDate === 'function') return value.toDate().toISOString();
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, stable(item)]));
  }
  return value;
}

function sameValue(a, b) {
  return JSON.stringify(stable(a)) === JSON.stringify(stable(b));
}

function buildPatch(collectionName, id, data) {
  const normalized = normalizeEntityForWrite(collectionName, { id, ...data }, { isCreate: false });
  const patch = {};
  for (const [field, value] of Object.entries(normalized)) {
    if (field === 'id' || SKIP_PATCH_FIELDS.has(field)) continue;
    if (!sameValue(data[field], value)) patch[field] = value;
  }
  return patch;
}

async function auditCollection(db, collectionName) {
  const snap = await db.collection(collectionName).limit(limit).get();
  const summary = {
    collection: collectionName,
    scanned: snap.docs.length,
    needsPatch: 0,
    patched: 0,
    missingCanonicalCounts: {},
    inconsistentAliases: 0,
    samplePatches: [],
  };

  let batch = db.batch();
  let batchWrites = 0;

  for (const docSnap of snap.docs) {
    const data = docSnap.data() || {};
    const analysis = analyzeEntityData(collectionName, data);
    const patch = buildPatch(collectionName, docSnap.id, data);
    const patchKeys = Object.keys(patch);
    if (patchKeys.length) {
      summary.needsPatch += 1;
      if (summary.samplePatches.length < 5) {
        summary.samplePatches.push({ id: docSnap.id, fields: patchKeys.slice(0, 30) });
      }
    }
    analysis.missingCanonical.forEach((field) => {
      summary.missingCanonicalCounts[field] = (summary.missingCanonicalCounts[field] || 0) + 1;
    });
    summary.inconsistentAliases += analysis.duplicateAliases.filter((item) => item.consistent === false).length;

    if (apply && patchKeys.length) {
      batch.set(docSnap.ref, {
        ...patch,
        dataModelNormalizedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
      batchWrites += 1;
      summary.patched += 1;
      if (batchWrites >= 400) {
        await batch.commit();
        batch = db.batch();
        batchWrites = 0;
      }
    }
  }

  if (apply && batchWrites > 0) await batch.commit();
  return summary;
}

async function main() {
  initFirebaseAdmin();
  const db = admin.firestore();
  const collections = CORE_COLLECTIONS.filter((collectionName) => (
    CANONICAL_FIELDS[collectionName] || ['disponibilidad', 'leadsPublicos'].includes(collectionName)
  ));
  const results = [];
  for (const collectionName of collections) {
    results.push(await auditCollection(db, collectionName));
  }

  const totals = results.reduce((acc, item) => ({
    scanned: acc.scanned + item.scanned,
    needsPatch: acc.needsPatch + item.needsPatch,
    patched: acc.patched + item.patched,
    inconsistentAliases: acc.inconsistentAliases + item.inconsistentAliases,
  }), { scanned: 0, needsPatch: 0, patched: 0, inconsistentAliases: 0 });

  console.log(JSON.stringify({
    ok: true,
    mode: apply ? 'apply' : 'dry-run',
    schemaVersion: DATA_SCHEMA_VERSION,
    limitPerCollection: limit,
    totals,
    collections: results,
  }, null, 2));
}

main().catch((error) => {
  console.error(error?.stack || error?.message || error);
  process.exit(1);
});
