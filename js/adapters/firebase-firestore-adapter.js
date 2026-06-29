/**
 * ClasesDe10 - generic Firestore adapter factory.
 *
 * This file is intentionally unused by production dashboards until the Firebase
 * cutover reaches each module.
 */

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit as firestoreLimit,
  orderBy as firestoreOrderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js';
import { firebaseDb } from '../firebase-client.js';
import { normalizeEntityForWrite } from '../data-schema.js';
import {
  adapterError,
  adapterResult,
  cleanUndefined,
  normalizeId,
  toDocument,
} from './contracts.js';

function applyTimestamps(collectionName, payload, mode) {
  const base = cleanUndefined(normalizeEntityForWrite(collectionName, payload || {}, { isCreate: mode === 'create' }));
  if (mode === 'create') {
    return {
      ...base,
      createdAt: base.createdAt || serverTimestamp(),
      updatedAt: base.updatedAt || serverTimestamp(),
    };
  }

  return {
    ...base,
    updatedAt: base.updatedAt || serverTimestamp(),
  };
}

function buildQuery(collectionRef, options = {}) {
  const constraints = [];

  for (const filter of options.filters || []) {
    if (!filter || filter.value === undefined) continue;
    constraints.push(where(filter.field, filter.operator || '==', filter.value));
  }

  for (const sort of options.orderBy || []) {
    if (!sort || !sort.field) continue;
    constraints.push(firestoreOrderBy(sort.field, sort.direction || 'asc'));
  }

  if (Number.isInteger(options.limit) && options.limit > 0) {
    constraints.push(firestoreLimit(options.limit));
  }

  return constraints.length ? query(collectionRef, ...constraints) : collectionRef;
}

export function makeFirestoreAdapter(collectionName, { db = firebaseDb } = {}) {
  const collectionRef = collection(db, collectionName);

  return {
    collectionName,

    async getById(id) {
      try {
        const cleanId = normalizeId(id);
        if (!cleanId) return adapterResult(null, adapterError('ID no valido.'));

        const snap = await getDoc(doc(db, collectionName, cleanId));
        return adapterResult(snap.exists() ? toDocument(snap.id, snap.data()) : null, null);
      } catch (error) {
        return adapterResult(null, adapterError(error));
      }
    },

    async list(options = {}) {
      try {
        const snap = await getDocs(buildQuery(collectionRef, options));
        return adapterResult(snap.docs.map((item) => toDocument(item.id, item.data())), null);
      } catch (error) {
        return adapterResult([], adapterError(error));
      }
    },

    async create(payload, options = {}) {
      try {
        const data = applyTimestamps(collectionName, payload, 'create');
        const cleanId = normalizeId(options.id);

        if (cleanId) {
          await setDoc(doc(db, collectionName, cleanId), data, { merge: false });
          return adapterResult({ id: cleanId, ...data }, null);
        }

        const ref = await addDoc(collectionRef, data);
        return adapterResult({ id: ref.id, ...data }, null);
      } catch (error) {
        return adapterResult(null, adapterError(error));
      }
    },

    async update(id, payload) {
      try {
        const cleanId = normalizeId(id);
        if (!cleanId) return adapterResult(null, adapterError('ID no valido.'));

        const data = applyTimestamps(collectionName, payload, 'update');
        await updateDoc(doc(db, collectionName, cleanId), data);
        return adapterResult({ id: cleanId, ...data }, null);
      } catch (error) {
        return adapterResult(null, adapterError(error));
      }
    },

    async upsert(id, payload) {
      try {
        const cleanId = normalizeId(id);
        if (!cleanId) return adapterResult(null, adapterError('ID no valido.'));

        const data = applyTimestamps(collectionName, payload, 'update');
        await setDoc(doc(db, collectionName, cleanId), data, { merge: true });
        return adapterResult({ id: cleanId, ...data }, null);
      } catch (error) {
        return adapterResult(null, adapterError(error));
      }
    },

    async remove(id) {
      try {
        const cleanId = normalizeId(id);
        if (!cleanId) return adapterResult(null, adapterError('ID no valido.'));

        await deleteDoc(doc(db, collectionName, cleanId));
        return adapterResult({ id: cleanId }, null);
      } catch (error) {
        return adapterResult(null, adapterError(error));
      }
    },
  };
}
