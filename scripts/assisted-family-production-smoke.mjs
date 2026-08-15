#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const projectId = 'clasesde10-50add';
const source = fs.readFileSync(new URL('../js/firebase-client.js', import.meta.url), 'utf8');
const apiKey = source.match(/apiKey:\s*'([^']+)'/)?.[1] || '';
const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const leadId = `qa-assisted-family-${suffix}`;
const email = `qa-assisted-family-${suffix}@example.invalid`;
const documentName = `projects/${projectId}/databases/(default)/documents/leadsPublicos/${leadId}`;
const endpoint = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:commit?key=${encodeURIComponent(apiKey)}`;

const app = getApps()[0] || initializeApp({ credential: applicationDefault(), projectId });
const db = getFirestore(app);

const stringValue = (value) => ({ stringValue: value });

async function cleanup() {
  const refs = [
    db.doc(`leadsPublicos/${leadId}`),
    db.doc(`solicitudes/lead_${leadId}`),
    db.doc(`alumnos/lead_${leadId}`),
  ];
  await Promise.all(refs.map((ref) => ref.delete().catch(() => null)));
}

try {
  assert(apiKey, 'No se pudo localizar la clave pública de Firebase.');
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      writes: [{
        update: {
          name: documentName,
          fields: {
            tipo: stringValue('familia'),
            nombre: stringValue('Familia QA asistida'),
            email: stringValue(email),
            telefono: stringValue('+34600000000'),
            perfil: { nullValue: null },
            asunto: stringValue('Profesor de Matemáticas para 3º ESO'),
            mensaje: stringValue('Prueba técnica temporal del formulario familiar asistido.'),
            metadata: {
              mapValue: {
                fields: {
                  alumno: stringValue('Alumno QA'),
                  materia: stringValue('Matemáticas de 3º ESO'),
                  account_mode: stringValue('assisted_parent_activation'),
                  canal: stringValue('production_smoke'),
                  consent_privacy: { booleanValue: true },
                },
              },
            },
            estado: stringValue('nuevo'),
            accountStatus: stringValue('pending_activation'),
          },
        },
        updateTransforms: [
          { fieldPath: 'activationRequestedAt', setToServerValue: 'REQUEST_TIME' },
          { fieldPath: 'createdAt', setToServerValue: 'REQUEST_TIME' },
          { fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' },
        ],
        currentDocument: { exists: false },
      }],
    }),
  });
  const result = await response.json().catch(() => ({}));
  assert.equal(response.ok, true, `Firestore rechazó el formulario: ${JSON.stringify(result)}`);
  assert.equal(Array.isArray(result.writeResults), true, 'Firestore no confirmó la escritura.');
  assert.equal(result.writeResults.length, 1, 'Firestore devolvió un resultado de escritura inesperado.');
  console.log(JSON.stringify({ ok: true, leadCreated: true, cleaned: true }, null, 2));
} finally {
  await cleanup();
}
