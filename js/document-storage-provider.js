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
import {
  doc as firestoreDoc,
  getDoc,
  setDoc,
} from 'https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js';
import { firebaseAuth, firebaseDb, firebaseStorage } from './firebase-client.js?v=20260627-domain-auth';

const DOCUMENT_BUCKET = 'documentos';
const SIGNED_URL_SECONDS = 3600;
const STORAGE_NOT_READY_MESSAGE = 'El servicio de documentos no está disponible ahora. Inténtalo más tarde o contacta con soporte.';
const FIRESTORE_FALLBACK_MAX_BYTES = 5 * 1024 * 1024;
const FIRESTORE_SINGLE_DOC_MAX_BASE64_CHARS = 900 * 1024;
const FIRESTORE_CHUNK_BASE64_CHARS = 760 * 1024;
const FIRESTORE_FALLBACK_MAX_CHUNKS = 16;
const FIRESTORE_FALLBACK_PREFIX = 'firestore-document-fallback';
// El proyecto no tiene un bucket de Firebase Storage provisionado. Evitamos
// los reintentos CORS del SDK y usamos directamente el almacen privado de
// Firestore, que mantiene el mismo contrato para todos los paneles.
const FIREBASE_STORAGE_AVAILABLE = false;

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
      message: 'No tienes permisos para acceder a este documento. Si deberías tener acceso, contacta con soporte.',
    };
  }
  return error || { message: 'Error de Storage no disponible.' };
}

async function sha256Hex(value) {
  const input = new TextEncoder().encode(String(value || ''));
  const digest = await crypto.subtle.digest('SHA-256', input);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('No se pudo leer el archivo.'));
    reader.readAsDataURL(file);
  });
}

function splitDataUrl(dataUrl) {
  const match = String(dataUrl || '').match(/^data:([^;,]+)?(;base64)?,([\s\S]*)$/);
  if (!match) return { contentType: '', dataBase64: '' };
  return {
    contentType: match[1] || '',
    dataBase64: match[3] || '',
  };
}

function objectUrlFromBase64(dataBase64, contentType) {
  const binary = atob(String(dataBase64 || ''));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return URL.createObjectURL(new Blob([bytes], { type: contentType || 'application/octet-stream' }));
}

async function fallbackBlobIdForPath(objectPath) {
  return `${FIRESTORE_FALLBACK_PREFIX}_${await sha256Hex(objectPath)}`;
}

function splitBase64IntoChunks(dataBase64) {
  const chunks = [];
  const source = String(dataBase64 || '');
  for (let i = 0; i < source.length; i += FIRESTORE_CHUNK_BASE64_CHARS) {
    chunks.push(source.slice(i, i + FIRESTORE_CHUNK_BASE64_CHARS));
  }
  return chunks;
}

async function uploadDocumentToFirestoreFallback(objectPath, file, options = {}) {
  const uid = currentUid();
  if (!uid) {
    return { data: null, error: { code: 'auth/missing-user', message: 'Inicia sesion para subir el documento.' } };
  }
  if (!file || Number(file.size || 0) <= 0) {
    return { data: null, error: { code: 'document/empty-file', message: 'El archivo esta vacio.' } };
  }
  if (Number(file.size || 0) > FIRESTORE_FALLBACK_MAX_BYTES) {
    return {
      data: null,
      error: {
        code: 'storage/bucket-not-ready',
        message: `${STORAGE_NOT_READY_MESSAGE} Como alternativa sin coste, sube un archivo de menos de 5 MB.`,
        infrastructureBlocked: true,
      },
    };
  }

  const dataUrl = await readFileAsDataUrl(file);
  const parsed = splitDataUrl(dataUrl);
  if (!parsed.dataBase64) {
    return { data: null, error: { code: 'document/read-failed', message: 'No se pudo preparar el documento.' } };
  }

  const blobId = await fallbackBlobIdForPath(objectPath);
  const basePayload = {
    ownerUid: uid,
    storagePath: objectPath,
    name: String(file.name || options.name || 'documento').slice(0, 240),
    contentType: options.contentType || file.type || parsed.contentType || 'application/octet-stream',
    sizeBytes: Number(file.size || 0),
    createdAt: new Date().toISOString(),
  };
  if (parsed.dataBase64.length <= FIRESTORE_SINGLE_DOC_MAX_BASE64_CHARS) {
    await setDoc(firestoreDoc(firebaseDb, 'documentBlobs', blobId), {
      ...basePayload,
      dataBase64: parsed.dataBase64,
      source: 'firestore_fallback_no_storage_bucket',
    });
  } else {
    const chunks = splitBase64IntoChunks(parsed.dataBase64);
    if (chunks.length > FIRESTORE_FALLBACK_MAX_CHUNKS) {
      return {
        data: null,
        error: {
          code: 'document/file-too-large',
          message: 'El archivo es demasiado grande para el modo sin Storage. Prueba con un PDF o imagen comprimida de menos de 5 MB.',
          infrastructureBlocked: true,
        },
      };
    }
    await Promise.all(chunks.map((chunk, index) => setDoc(
      firestoreDoc(firebaseDb, 'documentBlobChunks', `${blobId}_${String(index).padStart(4, '0')}`),
      {
        ownerUid: uid,
        storagePath: objectPath,
        blobId,
        index,
        dataBase64: chunk,
        createdAt: basePayload.createdAt,
        source: 'firestore_chunked_no_storage_bucket',
      },
    )));
    await setDoc(firestoreDoc(firebaseDb, 'documentBlobs', blobId), {
      ...basePayload,
      chunkCount: chunks.length,
      chunkBase64Size: FIRESTORE_CHUNK_BASE64_CHARS,
      totalBase64Size: parsed.dataBase64.length,
      source: 'firestore_chunked_no_storage_bucket',
    });
  }

  return {
    data: {
      path: objectPath,
      fullPath: objectPath,
      firestoreFallback: true,
      blobId,
    },
    error: null,
  };
}

async function getDocumentUrlFromFirestoreFallback(cleanPath) {
  const blobId = await fallbackBlobIdForPath(cleanPath);
  const snapshot = await getDoc(firestoreDoc(firebaseDb, 'documentBlobs', blobId));
  if (!snapshot.exists()) {
    return { data: null, error: { message: 'No se encontro una copia temporal del documento.' } };
  }
  const blob = snapshot.data() || {};
  let dataBase64 = blob.dataBase64 || '';
  if (!dataBase64 && Number(blob.chunkCount || 0) > 0) {
    const chunkCount = Math.min(Number(blob.chunkCount || 0), FIRESTORE_FALLBACK_MAX_CHUNKS);
    const chunks = [];
    for (let index = 0; index < chunkCount; index += 1) {
      const chunkSnapshot = await getDoc(firestoreDoc(
        firebaseDb,
        'documentBlobChunks',
        `${blobId}_${String(index).padStart(4, '0')}`,
      ));
      if (!chunkSnapshot.exists()) {
        return { data: null, error: { message: 'Falta una parte del documento temporal.' } };
      }
      const chunk = chunkSnapshot.data() || {};
      if (chunk.ownerUid !== blob.ownerUid || chunk.storagePath !== cleanPath) {
        return { data: null, error: { message: 'No tienes permisos para acceder a este documento.' } };
      }
      chunks.push(chunk.dataBase64 || '');
    }
    dataBase64 = chunks.join('');
  }
  if (!dataBase64) {
    return { data: null, error: { message: 'El documento temporal no contiene datos.' } };
  }
  const mime = blob.contentType || 'application/octet-stream';
  const url = objectUrlFromBase64(dataBase64, mime);
  return { data: { url, signedUrl: url, firestoreFallback: true }, error: null };
}

export async function uploadDocument(path, file, options = {}) {
  const objectPath = normalizeUploadPath(path);
  if (!FIREBASE_STORAGE_AVAILABLE) {
    try {
      return await uploadDocumentToFirestoreFallback(objectPath, file, options);
    } catch (error) {
      return { data: null, error: normalizeStorageError(error) };
    }
  }
  try {
    const fileRef = ref(firebaseStorage, objectPath);
    const upload = await uploadBytes(fileRef, file, {
      contentType: options.contentType || file?.type || undefined,
    });
    return { data: { path: objectPath, fullPath: upload.ref.fullPath }, error: null };
  } catch (error) {
    const normalized = normalizeStorageError(error);
    if (normalized?.infrastructureBlocked) {
      try {
        return await uploadDocumentToFirestoreFallback(objectPath, file, options);
      } catch (fallbackError) {
        return { data: null, error: normalizeStorageError(fallbackError) };
      }
    }
    return { data: null, error: normalized };
  }
}

export async function getDocumentUrl(path, expiresIn = SIGNED_URL_SECONDS) {
  if (!path) return { data: null, error: { message: 'Ruta del documento no disponible.' } };

  const cleanPath = String(path).replace(/^\/+/, '');
  if (!FIREBASE_STORAGE_AVAILABLE) {
    return getDocumentUrlFromFirestoreFallback(cleanPath);
  }
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
        const normalized = normalizeStorageError(error);
        if (normalized?.infrastructureBlocked || cleanPath.startsWith('users/')) {
          const fallback = await getDocumentUrlFromFirestoreFallback(cleanPath);
          if (fallback.data) return fallback;
        }
        return { data: null, error: normalized };
      }
    }
  }

  return { data: null, error: { message: 'No se pudo obtener el enlace del documento.' } };
}
