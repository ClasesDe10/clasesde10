/**
 * ClasesDe10 - private document storage provider.
 *
 * Uses Firebase Storage through the compatibility data client. The public API
 * stays stable for dashboards during the Firebase cutover.
 */

import db from './supabase-client.js?v=20260627-domain-auth';

const DOCUMENT_BUCKET = 'documentos';
const SIGNED_URL_SECONDS = 3600;

export async function uploadDocument(path, file, options = {}) {
  return db.storage.from(DOCUMENT_BUCKET).upload(path, file, {
    upsert: false,
    ...options,
  });
}

export async function getDocumentUrl(path, expiresIn = SIGNED_URL_SECONDS) {
  if (!path) return { data: null, error: { message: 'Ruta del documento no disponible.' } };

  const { data, error } = await db.storage.from(DOCUMENT_BUCKET).createSignedUrl(path, expiresIn);
  return {
    data: data?.signedUrl ? { url: data.signedUrl, signedUrl: data.signedUrl } : null,
    error,
  };
}
