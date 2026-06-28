/**
 * ClasesDe10 - private document storage provider.
 *
 * Uses Firebase Storage through the compatibility data client. The public API
 * stays stable for dashboards during the Firebase cutover.
 */

import db from './firebase-data-client.js?v=20260628-audit';
import { firebaseAuth } from './firebase-client.js?v=20260627-domain-auth';

const DOCUMENT_BUCKET = 'documentos';
const SIGNED_URL_SECONDS = 3600;

function currentUid() {
  return firebaseAuth.currentUser?.uid || '';
}

function normalizeUploadPath(path) {
  const cleanPath = String(path || '').replace(/^\/+/, '');
  if (!cleanPath) return cleanPath;
  if (cleanPath.startsWith('users/')) return cleanPath;

  const uid = currentUid();
  if (!uid) return cleanPath;

  const withoutLegacyPrefix = cleanPath.replace(/^documentos\//, '');
  return `users/${uid}/documentos/${withoutLegacyPrefix}`;
}

export async function uploadDocument(path, file, options = {}) {
  return db.storage.from('').upload(normalizeUploadPath(path), file, {
    upsert: false,
    ...options,
  });
}

export async function getDocumentUrl(path, expiresIn = SIGNED_URL_SECONDS) {
  if (!path) return { data: null, error: { message: 'Ruta del documento no disponible.' } };

  const cleanPath = String(path).replace(/^\/+/, '');
  const candidates = [
    cleanPath,
    cleanPath.startsWith('users/') ? '' : `${DOCUMENT_BUCKET}/${cleanPath}`,
  ].filter(Boolean);

  for (const candidate of candidates) {
    const { data, error } = await db.storage.from('').createSignedUrl(candidate, expiresIn);
    if (data?.signedUrl) return { data: { url: data.signedUrl, signedUrl: data.signedUrl }, error: null };
    if (candidate === candidates[candidates.length - 1]) {
      return { data: null, error };
    }
  }

  return { data: null, error: { message: 'No se pudo obtener el enlace del documento.' } };
}
