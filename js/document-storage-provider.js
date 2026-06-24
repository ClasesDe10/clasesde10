/**
 * ClasesDe10 - private document storage provider.
 *
 * Current implementation: Supabase Storage bucket `documentos`.
 * Future Firebase cutover: keep this public API and replace the internals with
 * Firebase Storage once the bucket exists.
 */

import db from './supabase-client.js';

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

