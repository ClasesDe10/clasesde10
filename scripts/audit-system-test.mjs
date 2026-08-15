#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

const auditClient = read('js/audit-client.js');
const auth = read('js/firebase-auth.js');
const dataClient = read('js/firebase-data-client.js');
const admin = read('pages/dashboard/admin.html');
const aiAssistant = read('js/admin-ai-assistant.js');
const rules = read('firebase/firestore.rules');
const indexes = read('firebase/firestore.indexes.json');
const worker = read('scripts/firebase-automation-worker.mjs');
const pkg = read('package.json');

assert(auditClient.includes('AUDIT_SCHEMA_VERSION'), 'Audit client must expose a schema version.');
assert(auditClient.includes('recordAuditLog'), 'Audit client must expose recordAuditLog.');
assert(auditClient.includes('diffAuditObjects'), 'Audit client must compute before/after diffs.');
assert(auditClient.includes('[redacted]'), 'Audit client must redact sensitive values.');

assert(auth.includes('recordAuthAudit'), 'Firebase auth must record auth audit events.');
assert(auth.includes('auth.login_success'), 'Auth login success must be audited.');
assert(auth.includes('auth.register_success'), 'Auth registration must be audited.');
assert(auth.includes('auth.logout'), 'Auth logout must be audited.');

assert(dataClient.includes('recordDataAudit'), 'Firebase data client must record write audit events.');
assert(dataClient.includes('auditDataWrite'), 'Firebase data client must centralize write audit logging.');
assert(dataClient.includes("this.writeMode === 'insert'"), 'Insert writes must remain audited.');
assert(dataClient.includes("this.writeMode === 'update'"), 'Update writes must remain audited.');
assert(dataClient.includes("this.writeMode === 'delete'"), 'Delete writes must remain audited.');

assert(admin.includes('section-auditoria'), 'Admin dashboard must expose the audit section.');
assert(admin.includes('audit-filter-module'), 'Audit section must filter by module.');
assert(admin.includes('audit-filter-from'), 'Audit section must filter by dates.');
assert(admin.includes('cargarAuditoria'), 'Admin dashboard must load audit logs.');
assert(admin.includes('recordAdminAudit'), 'Admin dashboard must record admin actions through audit client.');

assert(aiAssistant.includes('ai.admin_query_answered'), 'Admin AI queries must be audited.');
assert(aiAssistant.includes("['auditLogs', 'auditLogs'"), 'Admin AI assistant must include audit logs in its structured context.');

assert(rules.includes('validAuditLogCreate'), 'Firestore rules must validate user-created audit logs.');
assert(rules.includes('allow read: if isAdmin();'), 'Audit logs must remain admin-readable only.');
assert(rules.includes('request.resource.data.actorUid == request.auth.uid'), 'Users may only write their own audit actorUid.');

assert(indexes.includes('"collectionGroup": "auditLogs"'), 'Audit logs must have Firestore indexes.');
assert(indexes.includes('"fieldPath": "actorUid"'), 'Audit logs must be indexed by actorUid.');
assert(indexes.includes('"fieldPath": "module"'), 'Audit logs must be indexed by module.');
assert(indexes.includes('"fieldPath": "entityType"'), 'Audit logs must be indexed by entity.');

assert(worker.includes("schemaVersion: audit.schemaVersion || 'audit_log_v1'"), 'Worker materializer must write normalized audit schema.');
assert(worker.includes('processEntityAutomationBackfill'), 'Worker must materialize audit events without deployed Functions.');

assert(pkg.includes('test:audit-system'), 'package.json must expose audit system test.');
assert(pkg.includes('js/audit-client.js'), 'Syntax check must include audit client.');

console.log(JSON.stringify({ ok: true, checked: 'audit_system' }, null, 2));
