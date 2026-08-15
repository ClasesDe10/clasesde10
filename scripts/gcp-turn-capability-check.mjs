#!/usr/bin/env node

import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app';

const projectId = 'clasesde10-50add';
const app = getApps()[0] || initializeApp({ credential: applicationDefault(), projectId });
const { access_token: accessToken } = await app.options.credential.getAccessToken();

async function inspect(name, url) {
  const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  const body = await response.json().catch(() => ({}));
  return {
    name,
    status: response.status,
    ok: response.ok,
    state: body.state || '',
    billingEnabled: body.billingEnabled,
    error: body.error?.message || '',
  };
}

const checks = await Promise.all([
  inspect('billing', `https://cloudbilling.googleapis.com/v1/projects/${projectId}/billingInfo`),
  inspect('compute', `https://compute.googleapis.com/compute/v1/projects/${projectId}`),
  inspect('compute-service', `https://serviceusage.googleapis.com/v1/projects/${projectId}/services/compute.googleapis.com`),
]);
console.log(JSON.stringify({ projectId, checks }, null, 2));
