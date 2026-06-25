import {
  collection,
  doc,
  getCountFromServer,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js';
import { firebaseDb } from '../firebase-client.js';
import { adapterError, adapterResult } from './contracts.js';

const COLLECTION = 'leadsPublicos';

function firestoreDate(value) {
  if (!value) return null;
  if (typeof value.toDate === 'function') return value.toDate().toISOString();
  if (typeof value === 'string') return value;
  if (value.seconds) return new Date(value.seconds * 1000).toISOString();
  return String(value);
}

function mapLead(id, data) {
  return {
    id,
    ...data,
    created_at: firestoreDate(data.createdAt),
    updated_at: firestoreDate(data.updatedAt),
  };
}

export const leadsAdapter = {
  async listPublic({ tipo = '', estado = '', max = 100 } = {}) {
    try {
      const constraints = [];
      if (tipo) constraints.push(where('tipo', '==', tipo));
      if (estado) constraints.push(where('estado', '==', estado));
      constraints.push(orderBy('createdAt', 'desc'), limit(max));

      const snap = await getDocs(query(collection(firebaseDb, COLLECTION), ...constraints));
      return adapterResult(snap.docs.map(item => mapLead(item.id, item.data())), null);
    } catch (error) {
      return adapterResult([], adapterError(error));
    }
  },

  async countNew() {
    try {
      const snap = await getCountFromServer(query(
        collection(firebaseDb, COLLECTION),
        where('estado', '==', 'nuevo'),
      ));
      return adapterResult(snap.data().count || 0, null);
    } catch (error) {
      return adapterResult(0, adapterError(error));
    }
  },

  async setStatus(id, estado) {
    try {
      await updateDoc(doc(firebaseDb, COLLECTION, id), {
        estado,
        updatedAt: serverTimestamp(),
      });
      return adapterResult({ id, estado }, null);
    } catch (error) {
      return adapterResult(null, adapterError(error));
    }
  },
};

export default leadsAdapter;
