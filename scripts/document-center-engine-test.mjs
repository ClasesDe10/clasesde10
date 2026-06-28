#!/usr/bin/env node
import assert from 'node:assert/strict';
import {
  DOCUMENT_CENTER_VERSION,
  buildDocumentAutomationEvents,
  buildDocumentCenterReport,
  buildDocumentCompliance,
  buildDocumentExpiryPatch,
  buildDocumentUploadRecord,
  buildDocumentVerificationPatch,
  documentRowsForCsv,
  normalizeDocumentRecord,
} from '../js/document-center-engine.js';

const now = new Date('2026-06-28T10:00:00.000Z');

const upload = buildDocumentUploadRecord({
  ownerUid: 'teacher_1',
  role: 'profesor',
  type: 'dni',
  file: {
    name: 'dni.pdf',
    type: 'application/pdf',
    size: 120_000,
  },
  storagePath: 'documentos/teacher_1/dni.pdf',
  profileId: 'teacher_profile_1',
  uploadedByUid: 'teacher_1',
  source: 'test',
});

assert.equal(upload.documentCenterVersion, DOCUMENT_CENTER_VERSION);
assert.equal(upload.ownerUid, 'teacher_1');
assert.equal(upload.role, 'profesor');
assert.equal(upload.documentType, 'dni');
assert.equal(upload.status, 'pendiente');
assert.equal(upload.version, 1);
assert.equal(upload.history.length, 1);
assert.equal(upload.versions.length, 1);
assert.equal(upload.permissions.adminCanRead, true);
assert.equal(upload.permissions.ownerCanReplace, true);
assert.equal(upload.autoChecks.valid, true);

const verifiedPatch = buildDocumentVerificationPatch(upload, {
  status: 'validado',
  actorUid: 'admin_1',
  actorEmail: 'admin@clasesde10.com',
  notes: 'Documento revisado',
  expiresAt: '2026-07-15T00:00:00.000Z',
});

assert.equal(verifiedPatch.status, 'validado');
assert.equal(verifiedPatch.verificationLevel, 'validado_admin');
assert.equal(verifiedPatch.history.length, 2);
assert.equal(verifiedPatch.verifiedByUid, 'admin_1');

const verifiedDoc = normalizeDocumentRecord({ id: 'doc_1', ...upload, ...verifiedPatch }, now);
assert.equal(verifiedDoc.expiresSoon, true);
assert.equal(verifiedDoc.expired, false);

const expiredStoredDoc = {
  id: 'doc_expired',
  ownerUid: 'teacher_1',
  role: 'profesor',
  tipo: 'certificado',
  nombre: 'Certificado caducado',
  estado: 'validado',
  status: 'validado',
  storage_path: 'documentos/teacher_1/certificado.pdf',
  expiresAt: '2026-06-01T00:00:00.000Z',
  history: [],
};
const expiredEffective = normalizeDocumentRecord(expiredStoredDoc, now);
assert.equal(expiredEffective.status, 'caducado');
assert.equal(expiredEffective.storedStatus, 'validado');

const expiryPatch = buildDocumentExpiryPatch(expiredStoredDoc);
assert.ok(expiryPatch, 'Expired verified documents must produce a persistence patch.');
assert.equal(expiryPatch.status, 'caducado');
assert.equal(expiryPatch.history.length, 1);

const automationEvents = buildDocumentAutomationEvents([
  verifiedDoc,
  expiredStoredDoc,
  { ...upload, id: 'doc_stale', uploadedAt: '2026-06-26T00:00:00.000Z', createdAt: '2026-06-26T00:00:00.000Z' },
], now, { reminderWindowDays: 30, staleReviewDays: 1 });
const eventTypes = automationEvents.map((item) => item.type).sort();
assert.deepEqual(eventTypes, ['document.expired', 'document.expiring_soon', 'document.stale']);

const compliance = buildDocumentCompliance({ uid: 'teacher_1', role: 'profesor' }, [
  { ...upload, ...verifiedPatch, id: 'doc_dni' },
  { ...upload, id: 'doc_title', tipo: 'titulo', documentType: 'titulo', estado: 'pendiente', status: 'pendiente' },
], now);
assert.equal(compliance.role, 'profesor');
assert.equal(compliance.missingRequired.length, 0);
assert.deepEqual(compliance.pendingRequired, ['titulo']);
assert.equal(compliance.readyForVerification, false);

const report = buildDocumentCenterReport([verifiedDoc, expiredStoredDoc], [{ uid: 'teacher_1', role: 'profesor' }], now);
assert.equal(report.total, 2);
assert.equal(report.expiringSoon.length, 1);
assert.equal(report.expired.length, 1);
assert.ok(report.risks.some((risk) => risk.type === 'expired'));

const csvRows = documentRowsForCsv([verifiedDoc]);
assert.equal(csvRows[0].tipo, 'dni');
assert.equal(csvRows[0].estado, 'validado');

console.log(JSON.stringify({
  ok: true,
  checked: 'document_center_engine',
  version: DOCUMENT_CENTER_VERSION,
  events: eventTypes,
  report: {
    total: report.total,
    expired: report.expired.length,
    expiringSoon: report.expiringSoon.length,
  },
}, null, 2));
