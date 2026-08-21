#!/usr/bin/env node

import { GoogleAuth } from 'google-auth-library';

const DOMAIN = 'https://clasesde10.com/';
const DOMAIN_PROPERTY = 'sc-domain:clasesde10.com';
const SITEMAP = 'https://clasesde10.com/sitemap.xml';

function safeError(payload, status) {
  const message = payload?.error?.message || payload?.message || `HTTP ${status}`;
  return { status, message };
}

async function main() {
  const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/webmasters'] });
  const client = await auth.getClient();
  const requestHeaders = await client.getRequestHeaders();
  const headers = typeof requestHeaders.entries === 'function'
    ? Object.fromEntries(requestHeaders.entries())
    : { ...requestHeaders };

  const sitesResponse = await fetch('https://www.googleapis.com/webmasters/v3/sites', { headers });
  const sitesPayload = await sitesResponse.json().catch(() => ({}));
  if (!sitesResponse.ok) {
    console.error(JSON.stringify({ ok: false, phase: 'list-sites', error: safeError(sitesPayload, sitesResponse.status) }, null, 2));
    return 2;
  }

  const entries = Array.isArray(sitesPayload.siteEntry) ? sitesPayload.siteEntry : [];
  const property = entries.find((entry) => entry.siteUrl === DOMAIN_PROPERTY)
    || entries.find((entry) => entry.siteUrl === DOMAIN);
  if (!property) {
    console.error(JSON.stringify({
      ok: false,
      phase: 'find-property',
      message: 'La cuenta autenticada no tiene una propiedad de Search Console para clasesde10.com.',
      availableProperties: entries.map((entry) => entry.siteUrl),
    }, null, 2));
    return 3;
  }

  const endpoint = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(property.siteUrl)}/sitemaps/${encodeURIComponent(SITEMAP)}`;
  const submitResponse = await fetch(endpoint, { method: 'PUT', headers });
  if (!submitResponse.ok) {
    const payload = await submitResponse.json().catch(() => ({}));
    console.error(JSON.stringify({ ok: false, phase: 'submit-sitemap', property: property.siteUrl, error: safeError(payload, submitResponse.status) }, null, 2));
    return 4;
  }

  console.log(JSON.stringify({
    ok: true,
    property: property.siteUrl,
    permissionLevel: property.permissionLevel,
    submittedSitemap: SITEMAP,
  }, null, 2));
  return 0;
}

process.exitCode = await main();
