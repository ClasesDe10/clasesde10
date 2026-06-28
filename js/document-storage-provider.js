/**
 * ClasesDe10 - private document storage provider.
 *
 * Uses Firebase Storage directly. The public API stays stable for dashboards
 * and normalizes infrastructure errors into product-facing messages.
 */

import {
  getDownloadURL,
  ref,
  uploadBytes,
} from 'https://www.gstatic.com/firebasejs/12.14.0/firebase-storage.js';
import { firebaseAuth, firebaseStorage } from './firebase-client.js?v=20260627-domain-auth';

const DOCUMENT_BUCKET = 'documentos';
const SIGNED_URL_SECONDS = 3600;
const STORAGE_NOT_READY_MESSAGE = 'Firebase Storage aun no esta inicializado para este proyecto. El documento no se ha subido; el administrador debe crear el bucket de Storage.';

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

function normalizeStorageError(error) {
  const raw = String(error?.message || error?.code || error || '');
  const code = String(error?.code || '').toLowerCase();
  if (
    code.includes('storage/bucket-not-found')
    || code.includes('storage/object-not-found')
    || /bucket.+(not found|does not exist|no existe)/i.test(raw)
    || /storage bucket/i.test(raw)
  ) {
    return {
      ...error,
      code: error?.code || 'storage/bucket-not-ready',
      message: STORAGE_NOT_READY_MESSAGE,
      infrastructureBlocked: true,
    };
  }
  if (/permission|unauthorized|403/i.test(raw)) {
    return {
      ...error,
      code: error?.code || 'storage/permission-denied',
      message: 'No tienes permisos para acceder a este documento. Si deberias tener acceso, avisa al administrador.',
    };
  }
  return error || { message: 'Error de Storage no disponible.' };
}

export async function uploadDocument(path, file, options = {}) {
  const objectPath = normalizeUploadPath(path);
  try {
    const fileRef = ref(firebaseStorage, objectPath);
    const upload = await uploadBytes(fileRef, file, {
      contentType: options.contentType || file?.type || undefined,
    });
    return { data: { path: objectPath, fullPath: upload.ref.fullPath }, error: null };
  } catch (error) {
    return { data: null, error: normalizeStorageError(error) };
  }
}

export async function getDocumentUrl(path, expiresIn = SIGNED_URL_SECONDS) {
  if (!path) return { data: null, error: { message: 'Ruta del documento no disponible.' } };

  const cleanPath = String(path).replace(/^\/+/, '');
  const candidates = [
    cleanPath,
    cleanPath.startsWith('users/') ? '' : `${DOCUMENT_BUCKET}/${cleanPath}`,
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      const url = await getDownloadURL(ref(firebaseStorage, candidate));
      return { data: { url, signedUrl: url }, error: null };
    } catch (error) {
      if (candidate === candidates[candidates.length - 1]) {
        return { data: null, error: normalizeStorageError(error) };
      }
    }
  }

  return { data: null, error: { message: 'No se pudo obtener el enlace del documento.' } };
}
