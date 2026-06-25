import { doc, getDoc, serverTimestamp, setDoc } from 'https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js';
import { firebaseDb } from '../firebase-client.js';
import { adapterError, adapterResult, COLLECTIONS, normalizeId } from './contracts.js';

async function getValueFrom(collectionName, key) {
  try {
    const cleanKey = normalizeId(key);
    if (!cleanKey) return adapterResult(null, adapterError('Clave no valida.'));

    const snap = await getDoc(doc(firebaseDb, collectionName, cleanKey));
    return adapterResult(snap.exists() ? { id: snap.id, ...snap.data() } : null, null);
  } catch (error) {
    return adapterResult(null, adapterError(error));
  }
}

async function setValueIn(collectionName, key, value, extra = {}) {
  try {
    const cleanKey = normalizeId(key);
    if (!cleanKey) return adapterResult(null, adapterError('Clave no valida.'));

    const payload = {
      ...extra,
      value,
      updatedAt: serverTimestamp(),
    };

    await setDoc(doc(firebaseDb, collectionName, cleanKey), payload, { merge: true });
    return adapterResult({ id: cleanKey, ...payload }, null);
  } catch (error) {
    return adapterResult(null, adapterError(error));
  }
}

export const configuracionAdapter = {
  getValue(key) {
    return getValueFrom(COLLECTIONS.configuracion, key);
  },

  setValue(key, value, extra = {}) {
    return setValueIn(COLLECTIONS.configuracion, key, value, extra);
  },

  getPublicValue(key) {
    return getValueFrom(COLLECTIONS.configuracionPublica, key);
  },

  setPublicValue(key, value, extra = {}) {
    return setValueIn(COLLECTIONS.configuracionPublica, key, value, extra);
  },
};

export default configuracionAdapter;
