import {
  DOCUMENT_CENTER_VERSION,
  DOCUMENT_STATUSES,
  DOCUMENT_TYPE_DEFINITIONS,
  buildDocumentCenterReport,
  buildDocumentVerificationPatch,
  documentRowsForCsv,
  documentTypeDefinition,
  normalizeDocumentRecord,
} from './document-center-engine.js?v=20260629-teacher-docs';
import {
  collection,
  doc as firestoreDoc,
  getDocs,
  limit as firestoreLimit,
  orderBy,
  query,
  updateDoc,
} from 'https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js';
import { firebaseDb } from './firebase-client.js?v=20260627-domain-auth';

const instances = new WeakMap();
const DOCUMENT_ADMIN_READ_LIMIT = 1500;

function clean(value, max = 4000) {
  return String(value ?? '').trim().slice(0, max);
}

function lower(value) {
  return clean(value).toLowerCase();
}

function dateFrom(value) {
  if (!value) return null;
  if (typeof value?.toDate === 'function') return value.toDate();
  if (typeof value?.seconds === 'number') return new Date(value.seconds * 1000);
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDate(value) {
  const date = dateFrom(value);
  return date ? date.toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' }) : '-';
}

function formatShortDate(value) {
  const date = dateFrom(value);
  return date ? date.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '-';
}

function safeText(sanitize, value) {
  return sanitize(value === 0 ? '0' : value);
}

function typeOptions() {
  return Object.entries(DOCUMENT_TYPE_DEFINITIONS)
    .map(([key, definition]) => `<option value="${key}">${definition.label}</option>`)
    .join('');
}

function statusOptions() {
  return DOCUMENT_STATUSES.map((status) => `<option value="${status}">${status.replaceAll('_', ' ')}</option>`).join('');
}

function normalizeUserName(user = {}) {
  return clean([
    user.nombre,
    user.apellidos,
  ].filter(Boolean).join(' ') || user.displayName || user.email || user.id || 'Usuario');
}

function buildOwnerIndex(users = [], teachers = [], families = []) {
  const index = new Map();
  users.forEach((user) => {
    const uid = clean(user.uid || user.id || user.userUid, 180);
    if (!uid) return;
    index.set(uid, {
      id: uid,
      uid,
      role: user.role || user.rol || '',
      email: user.email || '',
      name: normalizeUserName(user),
      source: 'users',
    });
  });
  teachers.forEach((teacher) => {
    const uid = clean(teacher.userUid || teacher.ownerUid || teacher.usuario_id || teacher.uid || teacher.id, 180);
    if (!uid) return;
    index.set(uid, {
      ...(index.get(uid) || {}),
      id: uid,
      uid,
      role: 'profesor',
      email: teacher.email || index.get(uid)?.email || '',
      name: normalizeUserName(teacher),
      profileId: teacher.id,
      source: 'profesores',
    });
  });
  families.forEach((family) => {
    const uid = clean(family.userUid || family.ownerUid || family.usuario_id || family.uid || family.id, 180);
    if (!uid) return;
    index.set(uid, {
      ...(index.get(uid) || {}),
      id: uid,
      uid,
      role: 'familia',
      email: family.email || index.get(uid)?.email || '',
      name: normalizeUserName(family),
      profileId: family.id,
      source: 'familias',
    });
  });
  return index;
}

function injectStyles() {
  if (document.getElementById('admin-documents-styles')) return;
  const style = document.createElement('style');
  style.id = 'admin-documents-styles';
  style.textContent = `
    .doc-center { display: grid; gap: 16px; min-width: 0; }
    .doc-center__hero {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 16px;
      align-items: start;
      padding: 18px;
      border: 1px solid rgba(15,31,61,.1);
      border-radius: 8px;
      background: linear-gradient(135deg, rgba(15,31,61,.055), rgba(29,122,107,.08));
    }
    .doc-center__hero h2 { margin: 0 0 6px; color: var(--navy); font-size: 1.28rem; }
    .doc-center__hero p { margin: 0; color: var(--gray-mid); line-height: 1.5; max-width: 860px; }
    .doc-center__actions { display: flex; flex-wrap: wrap; gap: 8px; justify-content: flex-end; }
    .doc-center__filters { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(180px, 100%), 1fr)); gap: 10px; }
    .doc-center__grid { display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(300px, .8fr); gap: 16px; align-items: start; }
    .doc-center__detail { position: sticky; top: 86px; }
    .doc-timeline { display: grid; gap: 8px; max-height: 260px; overflow: auto; }
    .doc-timeline__item { border-left: 3px solid var(--gold); padding: 8px 10px; background: rgba(15,31,61,.025); border-radius: 0 8px 8px 0; }
    .doc-risk-list { display: grid; gap: 8px; }
    .doc-risk { display: flex; justify-content: space-between; gap: 10px; padding: 10px; border: 1px solid rgba(15,31,61,.08); border-radius: 8px; background: #fff; }
    .doc-metadata { display: grid; gap: 8px; }
    .doc-metadata div { display: flex; justify-content: space-between; gap: 10px; border-bottom: 1px solid rgba(15,31,61,.07); padding-bottom: 7px; }
    .doc-metadata span { color: var(--gray-mid); font-size: .82rem; }
    .doc-metadata strong { color: var(--navy); text-align: right; overflow-wrap: anywhere; }
    @media (max-width: 900px) {
      .doc-center__hero, .doc-center__grid { grid-template-columns: 1fr; }
      .doc-center__actions { justify-content: stretch; }
      .doc-center__actions .btn { flex: 1 1 150px; }
      .doc-center__detail { position: static; }
    }
  `;
  document.head.appendChild(style);
}

function toRow(snapshotDoc) {
  const data = snapshotDoc.data() || {};
  const createdAt = data.createdAt?.toDate?.()?.toISOString?.()
    || data.createdAt
    || data.created_at
    || '';
  const updatedAt = data.updatedAt?.toDate?.()?.toISOString?.()
    || data.updatedAt
    || data.updated_at
    || createdAt;
  return {
    id: snapshotDoc.id,
    ...data,
    createdAt,
    created_at: data.created_at || createdAt,
    updatedAt,
    updated_at: data.updated_at || updatedAt,
  };
}

async function safeList(table, fallback = []) {
  try {
    const snap = await getDocs(query(collection(firebaseDb, table), orderBy('createdAt', 'desc'), firestoreLimit(DOCUMENT_ADMIN_READ_LIMIT)));
    return snap.docs.map(toRow);
  } catch (_) {
    try {
      const snap = await getDocs(query(collection(firebaseDb, table), orderBy('created_at', 'desc'), firestoreLimit(DOCUMENT_ADMIN_READ_LIMIT)));
      return snap.docs.map(toRow);
    } catch {
      try {
        const snap = await getDocs(query(collection(firebaseDb, table), firestoreLimit(DOCUMENT_ADMIN_READ_LIMIT)));
        return snap.docs.map(toRow);
      } catch {
        return fallback;
      }
    }
  }
}

export async function initAdminDocuments({
  container,
  usuario,
  showToast,
  sanitize,
  exportarCSV,
  recordAdminAudit,
  getDocumentUrl,
} = {}) {
  if (!container) return null;
  if (instances.has(container)) {
    const api = instances.get(container);
    await api.refresh();
    return api;
  }

  injectStyles();
  if (container.nextElementSibling?.classList?.contains('card')) {
    container.nextElementSibling.style.display = 'none';
  }

  let documents = [];
  let owners = new Map();
  let report = buildDocumentCenterReport([]);
  let selectedId = '';

  container.innerHTML = `
    <div class="doc-center">
      <div class="doc-center__hero">
        <div>
          <h2>Centro documental</h2>
          <p>Gestiona identidad, certificados, titulos, antecedentes, contratos, autorizaciones, facturas, recibos, justificantes y documentos internos con versionado, caducidad, auditoria y permisos.</p>
        </div>
        <div class="doc-center__actions">
          <button class="btn btn-outline btn-sm" id="doc-export">Exportar CSV</button>
          <button class="btn btn-primary btn-sm" id="doc-refresh">Actualizar</button>
        </div>
      </div>
      <div class="stats-grid" id="doc-kpis"></div>
      <div class="card">
        <div class="card-header">
          <span class="card-title">Filtros documentales</span>
          <span class="badge badge-gray" id="doc-count">0 documentos</span>
        </div>
        <div class="card-body">
          <div class="doc-center__filters">
            <input class="form-control" id="doc-search" type="search" placeholder="Buscar usuario, documento, observacion">
            <select class="form-control" id="doc-filter-status"><option value="">Todos los estados</option>${statusOptions()}</select>
            <select class="form-control" id="doc-filter-type"><option value="">Todos los tipos</option>${typeOptions()}</select>
            <select class="form-control" id="doc-filter-role">
              <option value="">Todos los roles</option>
              <option value="profesor">Profesores</option>
              <option value="familia">Familias</option>
              <option value="admin">Internos</option>
            </select>
            <select class="form-control" id="doc-filter-risk">
              <option value="">Todos los riesgos</option>
              <option value="pendiente">Pendientes</option>
              <option value="caducado">Caducados</option>
              <option value="caduca_pronto">Caducan pronto</option>
              <option value="rechazado">Rechazados</option>
            </select>
          </div>
        </div>
      </div>
      <div class="doc-center__grid">
        <div class="card">
          <div class="card-header"><span class="card-title">Expediente documental</span></div>
          <div class="table-wrapper">
            <table class="responsive-card-table">
              <thead><tr><th>Usuario</th><th>Documento</th><th>Estado</th><th>Caducidad</th><th>Version</th><th>Acciones</th></tr></thead>
              <tbody id="doc-table"><tr><td colspan="6" style="text-align:center;padding:32px;color:var(--gray-mid)">Cargando...</td></tr></tbody>
            </table>
          </div>
        </div>
        <aside class="card doc-center__detail">
          <div class="card-header"><span class="card-title">Ficha documental</span></div>
          <div class="card-body" id="doc-detail">
            <div class="empty-state"><div class="empty-title">Selecciona un documento</div><div class="empty-desc">Aqui veras versionado, historial, verificaciones, permisos y observaciones.</div></div>
          </div>
        </aside>
      </div>
      <div class="card">
        <div class="card-header"><span class="card-title">Riesgos y recordatorios</span></div>
        <div class="card-body" id="doc-risks"></div>
      </div>
    </div>`;

  const field = (id) => container.querySelector(`#${id}`);

  function ownerOf(doc) {
    return owners.get(doc.ownerUid) || {
      uid: doc.ownerUid,
      name: doc.ownerUid || 'Sin propietario',
      role: doc.role,
      email: '',
    };
  }

  function badge(status) {
    const map = {
      validado: 'success',
      pendiente: 'warning',
      en_revision: 'warning',
      rechazado: 'danger',
      caducado: 'danger',
      requiere_actualizacion: 'warning',
      sustituido: 'gray',
      archivado: 'gray',
    };
    const tone = map[status] || 'gray';
    return `<span class="badge badge-${tone}">${sanitize(String(status || '').replaceAll('_', ' '))}</span>`;
  }

  function riskBadge(doc) {
    if (doc.expired || doc.status === 'caducado') return '<span class="badge badge-danger">Caducado</span>';
    if (doc.expiresSoon) return `<span class="badge badge-warning">Caduca en ${safeText(sanitize, doc.daysToExpiry)}d</span>`;
    if (['pendiente', 'en_revision'].includes(doc.status)) return '<span class="badge badge-warning">Revision</span>';
    if (doc.status === 'rechazado') return '<span class="badge badge-danger">Rechazado</span>';
    return '<span class="badge badge-success">OK</span>';
  }

  function filters() {
    return {
      search: lower(field('doc-search')?.value),
      status: clean(field('doc-filter-status')?.value),
      type: clean(field('doc-filter-type')?.value),
      role: clean(field('doc-filter-role')?.value),
      risk: clean(field('doc-filter-risk')?.value),
    };
  }

  function docText(doc) {
    const owner = ownerOf(doc);
    return [
      doc.id, doc.name, doc.typeLabel, doc.documentType, doc.status, doc.ownerUid,
      owner.name, owner.email, owner.role, doc.adminNotes, doc.observations,
    ].join(' ').toLowerCase();
  }

  function matches(doc, active) {
    if (active.search && !docText(doc).includes(active.search)) return false;
    if (active.status && doc.status !== active.status) return false;
    if (active.type && doc.documentType !== active.type) return false;
    if (active.role && doc.role !== active.role && ownerOf(doc).role !== active.role) return false;
    if (active.risk === 'pendiente' && !['pendiente', 'en_revision', 'requiere_actualizacion'].includes(doc.status)) return false;
    if (active.risk === 'caducado' && !(doc.expired || doc.status === 'caducado')) return false;
    if (active.risk === 'caduca_pronto' && !doc.expiresSoon) return false;
    if (active.risk === 'rechazado' && doc.status !== 'rechazado') return false;
    return true;
  }

  function renderKpis() {
    field('doc-kpis').innerHTML = [
      ['Total', report.total, `${Object.keys(report.byType).length} tipos`, 'positive'],
      ['Pendientes', report.pending.length, 'revision admin', report.pending.length ? 'negative' : 'positive'],
      ['Caducan pronto', report.expiringSoon.length, '30 dias', report.expiringSoon.length ? 'negative' : 'positive'],
      ['Caducados', report.expired.length, 'bloquean confianza', report.expired.length ? 'negative' : 'positive'],
      ['Rechazados', report.rejected.length, 'requieren accion', report.rejected.length ? 'negative' : 'positive'],
      ['Cumplimiento medio', `${Math.round((report.compliance.reduce((sum, item) => sum + item.completeness, 0) / Math.max(report.compliance.length, 1)) || 0)}%`, 'por expediente', 'positive'],
    ].map(([label, value, meta, tone]) => `
      <div class="stat-card">
        <div class="stat-card-label">${sanitize(label)}</div>
        <div class="stat-card-value">${safeText(sanitize, value)}</div>
        <div class="stat-card-change ${tone}">${sanitize(meta)}</div>
      </div>`).join('');
  }

  function renderRisks() {
    const target = field('doc-risks');
    if (!report.risks.length) {
      target.innerHTML = '<div class="empty-state"><div class="empty-title">Sin riesgos documentales</div><div class="empty-desc">No hay caducidades, documentos obligatorios ausentes ni rechazos activos.</div></div>';
      return;
    }
    target.innerHTML = `<div class="doc-risk-list">${report.risks.slice(0, 12).map((risk) => `
      <div class="doc-risk">
        <div><strong>${sanitize(risk.label)}</strong><br><span style="color:var(--gray-mid);font-size:.82rem">${sanitize(risk.type)} - ${sanitize(risk.ownerUid || risk.documentId || '')}</span></div>
        <span class="badge badge-${risk.severity === 'high' ? 'danger' : 'warning'}">${sanitize(risk.severity)}</span>
      </div>`).join('')}</div>`;
  }

  function renderTable() {
    const active = filters();
    const filtered = documents.filter((doc) => matches(doc, active));
    field('doc-count').textContent = `${filtered.length} de ${documents.length} documentos`;
    const tbody = field('doc-table');
    if (!filtered.length) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:32px;color:var(--gray-mid)">Sin documentos con estos filtros.</td></tr>';
      return;
    }
    tbody.innerHTML = filtered.map((doc) => {
      const owner = ownerOf(doc);
      return `<tr class="${doc.id === selectedId ? 'table-row-selected' : ''}">
        <td data-label="Usuario"><strong>${sanitize(owner.name)}</strong><br><span style="color:var(--gray-mid);font-size:.76rem">${sanitize(owner.role || doc.role)} · ${sanitize(owner.email || doc.ownerUid)}</span></td>
        <td data-label="Documento"><strong>${sanitize(doc.typeLabel)}</strong><br><span style="color:var(--gray-mid);font-size:.76rem">${sanitize(doc.name)}</span></td>
        <td data-label="Estado">${badge(doc.status)}<br>${riskBadge(doc)}</td>
        <td data-label="Caducidad">${sanitize(formatShortDate(doc.expiresAt))}<br><span style="font-size:.76rem;color:var(--gray-mid)">${doc.expiresAt ? `${safeText(sanitize, doc.daysToExpiry)} dias` : 'Sin caducidad'}</span></td>
        <td data-label="Version">v${safeText(sanitize, doc.version)}<br><span style="font-size:.76rem;color:var(--gray-mid)">${sanitize(formatShortDate(doc.uploadedAt))}</span></td>
        <td data-label="Acciones">
          <button class="btn btn-ghost btn-sm" data-doc-action="select" data-doc-id="${sanitize(doc.id)}">Ficha</button>
          <button class="btn btn-outline btn-sm" data-doc-action="open" data-doc-id="${sanitize(doc.id)}">Abrir</button>
        </td>
      </tr>`;
    }).join('');
  }

  function renderDetail() {
    const target = field('doc-detail');
    const doc = documents.find((item) => item.id === selectedId);
    if (!doc) {
      target.innerHTML = '<div class="empty-state"><div class="empty-title">Selecciona un documento</div><div class="empty-desc">Aqui veras versionado, historial, verificaciones, permisos y observaciones.</div></div>';
      return;
    }
    const owner = ownerOf(doc);
    const definition = documentTypeDefinition(doc.documentType);
    target.innerHTML = `
      <div style="display:grid;gap:14px">
        <div>
          <h3 style="margin:0;color:var(--navy)">${sanitize(doc.typeLabel)}</h3>
          <p style="margin:4px 0 0;color:var(--gray-mid);overflow-wrap:anywhere">${sanitize(doc.name)}</p>
        </div>
        <div class="doc-metadata">
          <div><span>Usuario</span><strong>${sanitize(owner.name)}</strong></div>
          <div><span>Rol</span><strong>${sanitize(owner.role || doc.role)}</strong></div>
          <div><span>Estado</span><strong>${badge(doc.status)}</strong></div>
          <div><span>Categoria</span><strong>${sanitize(definition.category)}</strong></div>
          <div><span>Version</span><strong>v${safeText(sanitize, doc.version)}</strong></div>
          <div><span>Subida</span><strong>${sanitize(formatDate(doc.uploadedAt))}</strong></div>
          <div><span>Caducidad</span><strong>${sanitize(formatDate(doc.expiresAt))}</strong></div>
          <div><span>Permisos</span><strong>${sanitize(doc.permissions.visibility)} · owner ${doc.permissions.ownerCanRead ? 'si' : 'no'}</strong></div>
          <div><span>Checks automaticos</span><strong>${doc.autoChecks.valid ? 'validos' : 'revisar metadatos'}</strong></div>
        </div>
        <div class="form-group">
          <label class="form-label">Observaciones admin</label>
          <textarea class="form-control" id="doc-admin-notes" rows="3" placeholder="Notas, motivo de rechazo, condiciones de validez...">${sanitize(doc.adminNotes || doc.observations || '')}</textarea>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Fecha de caducidad</label>
            <input class="form-control" id="doc-expires-at" type="date" value="${sanitize(doc.expiresAt ? doc.expiresAt.slice(0, 10) : '')}">
          </div>
          <div class="form-group">
            <label class="form-label">Estado manual</label>
            <select class="form-control" id="doc-status-select">${statusOptions()}</select>
          </div>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn btn-outline btn-sm" data-doc-action="open" data-doc-id="${sanitize(doc.id)}">Abrir archivo</button>
          <button class="btn btn-success btn-sm" data-doc-action="verify" data-doc-id="${sanitize(doc.id)}">Validar</button>
          <button class="btn btn-danger btn-sm" data-doc-action="reject" data-doc-id="${sanitize(doc.id)}">Rechazar</button>
          <button class="btn btn-primary btn-sm" data-doc-action="save" data-doc-id="${sanitize(doc.id)}">Guardar estado</button>
        </div>
        <div>
          <h4 style="margin:0 0 8px;color:var(--navy)">Historial</h4>
          <div class="doc-timeline">
            ${doc.history.length ? doc.history.slice().reverse().map((item) => `<div class="doc-timeline__item"><strong>${sanitize(item.action)}</strong><br><span style="color:var(--gray-mid);font-size:.8rem">${sanitize(formatDate(item.at))} · ${sanitize(item.actorUid || 'sistema')}</span><br><span>${sanitize(item.note || '')}</span></div>`).join('') : '<div style="color:var(--gray-mid)">Sin historial registrado.</div>'}
          </div>
        </div>
      </div>`;
    const select = field('doc-status-select');
    if (select) select.value = doc.status;
  }

  function renderAll() {
    report = buildDocumentCenterReport(documents, [...owners.values()]);
    renderKpis();
    renderRisks();
    renderTable();
    renderDetail();
  }

  async function refresh() {
    const [rawDocs, users, teachers, families] = await Promise.all([
      safeList('documentos'),
      safeList('users'),
      safeList('profesores'),
      safeList('familias'),
    ]);
    owners = buildOwnerIndex(users, teachers, families);
    documents = rawDocs.map((doc) => normalizeDocumentRecord(doc))
      .sort((a, b) => {
        const riskA = (a.expired ? 0 : a.expiresSoon ? 1 : ['pendiente', 'en_revision'].includes(a.status) ? 2 : 3);
        const riskB = (b.expired ? 0 : b.expiresSoon ? 1 : ['pendiente', 'en_revision'].includes(b.status) ? 2 : 3);
        return riskA - riskB || (dateFrom(b.updatedAt)?.getTime() || 0) - (dateFrom(a.updatedAt)?.getTime() || 0);
      });
    if (selectedId && !documents.some((doc) => doc.id === selectedId)) selectedId = '';
    renderAll();
  }

  async function openDocument(doc) {
    if (!doc?.storagePath) {
      showToast?.('Sin archivo', 'El documento no tiene ruta de almacenamiento.', 'warning');
      return;
    }
    const { data, error } = await getDocumentUrl(doc.storagePath);
    if (error || !data?.url) {
      showToast?.('Error', error?.message || 'No se pudo abrir el documento.', 'error');
      return;
    }
    window.open(data.url, '_blank', 'noopener,noreferrer');
  }

  async function updateDocument(doc, status) {
    const notes = clean(field('doc-admin-notes')?.value, 1200);
    const expiresAt = clean(field('doc-expires-at')?.value);
    const patch = buildDocumentVerificationPatch(doc, {
      status,
      notes,
      expiresAt,
      actorUid: usuario.uid || usuario.id || '',
      actorEmail: usuario.email || '',
    });
    try {
      await updateDoc(firestoreDoc(firebaseDb, 'documentos', doc.id), patch);
    } catch (error) {
      showToast?.('Error', error.message, 'error');
      return;
    }
    await recordAdminAudit?.('document.updated', {
      targetId: doc.id,
      ownerUid: doc.ownerUid,
      status,
      documentType: doc.documentType,
    });
    showToast?.('Documento actualizado', `Estado: ${status.replaceAll('_', ' ')}`, 'success');
    await refresh();
    selectedId = doc.id;
    renderAll();
  }

  container.addEventListener('input', (event) => {
    if (event.target.closest('#doc-search')) renderTable();
  });
  container.addEventListener('change', (event) => {
    if (event.target.closest('#doc-filter-status,#doc-filter-type,#doc-filter-role,#doc-filter-risk')) renderTable();
  });
  container.addEventListener('click', async (event) => {
    const refreshBtn = event.target.closest('#doc-refresh');
    if (refreshBtn) {
      await refresh();
      showToast?.('Actualizado', 'Centro documental recargado.', 'success');
      return;
    }
    const exportBtn = event.target.closest('#doc-export');
    if (exportBtn) {
      exportarCSV?.(documentRowsForCsv(documents), 'documentos_clasesde10.csv', [
        { campo: 'id', titulo: 'ID' },
        { campo: 'ownerUid', titulo: 'Usuario' },
        { campo: 'role', titulo: 'Rol' },
        { campo: 'tipo', titulo: 'Tipo' },
        { campo: 'nombre', titulo: 'Nombre' },
        { campo: 'estado', titulo: 'Estado' },
        { campo: 'version', titulo: 'Version' },
        { campo: 'uploadedAt', titulo: 'Subida' },
        { campo: 'expiresAt', titulo: 'Caducidad' },
        { campo: 'daysToExpiry', titulo: 'Dias caducidad' },
        { campo: 'verificationLevel', titulo: 'Nivel verificacion' },
      ]);
      return;
    }
    const actionBtn = event.target.closest('[data-doc-action]');
    if (!actionBtn) return;
    const doc = documents.find((item) => item.id === actionBtn.dataset.docId);
    if (!doc) return;
    const action = actionBtn.dataset.docAction;
    if (action === 'select') {
      selectedId = doc.id;
      renderAll();
    } else if (action === 'open') {
      await openDocument(doc);
    } else if (action === 'verify') {
      await updateDocument(doc, 'validado');
    } else if (action === 'reject') {
      await updateDocument(doc, 'rechazado');
    } else if (action === 'save') {
      await updateDocument(doc, clean(field('doc-status-select')?.value || doc.status));
    }
  });

  const api = { refresh };
  instances.set(container, api);
  await refresh();
  return api;
}

export default { initAdminDocuments };
