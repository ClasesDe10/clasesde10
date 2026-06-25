import {
  getDownloadURL,
  ref,
  uploadBytes,
} from 'https://www.gstatic.com/firebasejs/12.14.0/firebase-storage.js';
import { firebaseStorage } from '../firebase-client.js';
import { makeFirestoreAdapter } from './firebase-firestore-adapter.js';
import { adapterError, adapterResult, COLLECTIONS, normalizeId } from './contracts.js';

const base = makeFirestoreAdapter(COLLECTIONS.documentos);

function buildOwnerPath(ownerUid, fileName) {
  const cleanOwner = normalizeId(ownerUid);
  const cleanFile = String(fileName || 'documento').replace(/[^\w.\-]+/g, '_');
  return `users/${cleanOwner}/documents/${Date.now()}-${cleanFile}`;
}

export const documentosAdapter = {
  ...base,

  listByOwner(ownerUid, options = {}) {
    return base.list({
      ...options,
      filters: [
        ...(options.filters || []),
        { field: 'ownerUid', value: ownerUid },
      ],
      orderBy: options.orderBy || [{ field: 'createdAt', direction: 'desc' }],
    });
  },

  async uploadForOwner(ownerUid, file, metadata = {}) {
    try {
      if (!ownerUid || !file) {
        return adapterResult(null, adapterError('Propietario y archivo son obligatorios.'));
      }

      const storagePath = metadata.storagePath || buildOwnerPath(ownerUid, file.name);
      const fileRef = ref(firebaseStorage, storagePath);
      const upload = await uploadBytes(fileRef, file, {
        contentType: file.type || metadata.mimeType || undefined,
        customMetadata: metadata.customMetadata || {},
      });
      const url = await getDownloadURL(upload.ref);

      return base.create({
        ...metadata,
        ownerUid,
        name: metadata.name || file.name,
        storagePath,
        downloadUrl: url,
        sizeBytes: file.size || metadata.sizeBytes || null,
        mimeType: file.type || metadata.mimeType || null,
        status: metadata.status || 'pendiente',
      });
    } catch (error) {
      return adapterResult(null, adapterError(error));
    }
  },

  async getDownloadUrl(path) {
    try {
      if (!path) return adapterResult(null, adapterError('Ruta del documento no disponible.'));
      const url = await getDownloadURL(ref(firebaseStorage, path));
      return adapterResult({ url, downloadUrl: url }, null);
    } catch (error) {
      return adapterResult(null, adapterError(error));
    }
  },
};

export default documentosAdapter;
