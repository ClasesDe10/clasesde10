import {
  addDoc,
  collection,
  getDocs,
  limit as firestoreLimit,
  orderBy,
  query,
  serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js';
import {
  ADMIN_OPS_ENGINE_VERSION,
  buildAdminOpsModel,
  searchOpsIndex,
  summarizeOpsForClipboard,
} from './admin-ops-engine.js?v=20260629-ops';
import { filterAfterClassReset } from './class-reset.js';

export const ADMIN_OPS_WORKBENCH_VERSION = 'admin-ops-workbench-2026-07-01';

const instances = new WeakMap();
const COLLECTIONS = Object.freeze({
  profesores: { orderField: 'updatedAt', max: 1200 },
  familias: { orderField: 'updatedAt', max: 1200 },
  alumnos: { orderField: 'updatedAt', max: 1200 },
  solicitudes: { orderField: 'createdAt', max: 1200 },
  solicitudMatches: { orderField: 'createdAt', max: 1800 },
  asignaciones: { orderField: 'updatedAt', max: 1200 },
  clases: { orderField: 'createdAt', max: 1800, includeUnordered: true },
  pagos: { orderField: 'createdAt', max: 1800, includeUnordered: true },
  documentos: { orderField: 'updatedAt', max: 1000 },
  incidencias: { orderField: 'updatedAt', max: 1000 },
  preventiveRisks: { orderField: 'lastSeenAt', max: 1000, includeUnordered: true },
  platformSupervisionFindings: { orderField: 'lastSeenAt', max: 1000, includeUnordered: true },
  relationshipFollowups: { orderField: 'lastSeenAt', max: 1000, includeUnordered: true },
  proactiveAssistSignals: { orderField: 'lastSeenAt', max: 1000, includeUnordered: true },
  internalAiInsights: { orderField: 'lastSeenAt', max: 1000, includeUnordered: true },
  crmTasks: { orderField: 'dueAt', max: 800, includeUnordered: true },
  leadsPublicos: { orderField: 'createdAt', max: 600 },
  chats: { orderField: 'updatedAt', max: 800 },
});

function clean(value, max = 4000) {
  return String(value ?? '').trim().slice(0, max);
}

function escapeHtml(value) {
  return clean(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function toDoc(docSnap) {
  return { id: docSnap.id, ...docSnap.data() };
}

function filterCollectionRows(name, rows = []) {
  return name === 'clases' ? filterAfterClassReset(rows) : rows;
}

function formatNumber(value, decimals = 0) {
  return new Intl.NumberFormat('es-ES', { maximumFractionDigits: decimals }).format(Number(value || 0));
}

function formatEuros(value) {
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

function formatMinutes(value) {
  const minutes = Number(value || 0);
  if (minutes < 60) return `${Math.round(minutes)} min`;
  return `${Math.round((minutes / 60) * 10) / 10} h`;
}

function formatShortDate(value) {
  if (!value) return '-';
  const date = value?.toDate ? value.toDate() : new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function toneBadge(tone = 'gray') {
  const normalized = clean(tone).toLowerCase();
  if (['danger', 'critical', 'high'].includes(normalized)) return 'danger';
  if (['warning', 'medium'].includes(normalized)) return 'warning';
  if (['success', 'ok'].includes(normalized)) return 'success';
  if (['info'].includes(normalized)) return 'info';
  return 'gray';
}

function hiddenKey(actor = {}) {
  return `cd10_admin_ops_hidden:${clean(actor.uid || actor.id || actor.email || 'admin', 120)}`;
}

function readHidden(actor) {
  try {
    return new Set(JSON.parse(window.localStorage.getItem(hiddenKey(actor)) || '[]'));
  } catch (_) {
    return new Set();
  }
}

function writeHidden(actor, hidden) {
  try {
    window.localStorage.setItem(hiddenKey(actor), JSON.stringify([...hidden].slice(-400)));
  } catch (_) {}
}

async function readCollection(firebaseDb, name, config) {
  const mergeDocs = (primary = [], secondary = []) => {
    const seen = new Set(primary.map((item) => item.id));
    return [...primary, ...secondary.filter((item) => !seen.has(item.id))];
  };
  try {
    const constraints = config.orderField
      ? [orderBy(config.orderField, 'desc'), firestoreLimit(config.max)]
      : [firestoreLimit(config.max)];
    const snap = await getDocs(query(collection(firebaseDb, name), ...constraints));
    const ordered = snap.docs.map(toDoc);
    if (!config.includeUnordered) return filterCollectionRows(name, ordered);
    const fallbackSnap = await getDocs(query(collection(firebaseDb, name), firestoreLimit(Math.min(config.max, 400))));
    return filterCollectionRows(name, mergeDocs(ordered, fallbackSnap.docs.map(toDoc)));
  } catch (_) {
    const snap = await getDocs(query(collection(firebaseDb, name), firestoreLimit(config.max)));
    return filterCollectionRows(name, snap.docs.map(toDoc));
  }
}

export async function loadOpsDataset(firebaseDb) {
  const entries = await Promise.all(Object.entries(COLLECTIONS).map(async ([name, config]) => {
    try {
      return [name, await readCollection(firebaseDb, name, config)];
    } catch (error) {
      console.warn(`No se pudo cargar ${name} para bandeja operativa`, error);
      return [name, []];
    }
  }));
  return Object.fromEntries(entries);
}

function statCard(label, value, detail, tone = 'info') {
  return `
    <div class="stat-card ops-kpi ops-kpi-${escapeHtml(toneBadge(tone))}">
      <div class="stat-card-label">${escapeHtml(label)}</div>
      <div class="stat-card-value">${escapeHtml(value)}</div>
      <div class="stat-card-change neutral">${escapeHtml(detail)}</div>
    </div>`;
}

function renderAutomationGroups(state) {
  const groups = state.model?.automationGroups || [];
  if (!groups.length) {
    return '<div class="empty-state"><div class="empty-title">Sin automatizaciones pendientes</div><div class="empty-desc">La bandeja no detecta procesos repetitivos relevantes ahora mismo.</div></div>';
  }
  return groups.map((group) => `
    <button class="ops-automation" data-ops-nav="${escapeHtml(group.section)}" type="button">
      <span>${escapeHtml(group.label)}</span>
      <strong>${formatNumber(group.count)}</strong>
      <small>${escapeHtml(group.type)}</small>
    </button>
  `).join('');
}

function routineCard({
  label,
  value,
  detail,
  section,
  focus = '',
  query = '',
  tone = 'info',
}) {
  return `
    <article class="ops-routine-card ops-routine-${escapeHtml(toneBadge(tone))}">
      <div>
        <span>${escapeHtml(label)}</span>
        <strong>${escapeHtml(value)}</strong>
        <p>${escapeHtml(detail)}</p>
      </div>
      <div class="ops-routine-actions">
        <button class="btn btn-outline btn-sm" type="button" data-ops-focus="${escapeHtml(focus)}" data-ops-query="${escapeHtml(query)}">Ver cola</button>
        <button class="btn btn-primary btn-sm" type="button" data-ops-nav="${escapeHtml(section)}">Abrir</button>
      </div>
    </article>`;
}

function renderDailyRoutine(state) {
  const s = state.model?.summary || {};
  const topItem = state.model?.topItems?.[0] || null;
  const crmCount = (state.model?.items || []).filter((item) => ['teacher', 'family', 'task'].includes(item.type)).length;
  const relationCount = (s.relationshipFollowups || 0) + (s.proactiveAssistSignals || 0);
  const qualityCount = (s.preventiveRisks || 0) + (s.selfSupervisionFindings || 0) + (s.internalAiInsights || 0);

  const cards = [
    routineCard({
      label: 'Primero resolver',
      value: topItem ? String(topItem.priority) : 'OK',
      detail: topItem ? topItem.title : 'No hay una urgencia operativa destacada.',
      section: topItem?.section || 'dashboard',
      focus: topItem?.type || '',
      tone: topItem?.tone || 'success',
    }),
    routineCard({
      label: 'Matching',
      value: formatNumber(s.waitingMatching || 0),
      detail: 'Solicitudes que bloquean conversion si no reciben profesor.',
      section: 'solicitudes',
      focus: 'matching',
      tone: s.waitingMatching ? 'danger' : 'success',
    }),
    routineCard({
      label: 'Caja y pagos',
      value: formatEuros(s.revenueAtRisk || 0),
      detail: 'Dinero pendiente, vencido o por validar.',
      section: 'pagos',
      focus: 'payment',
      tone: s.revenueAtRisk ? 'warning' : 'success',
    }),
    routineCard({
      label: 'Incidencias y riesgos',
      value: formatNumber((s.openIncidents || 0) + (s.preventiveRisks || 0) + (s.selfSupervisionFindings || 0)),
      detail: 'Problemas reales, riesgos preventivos y hallazgos de autosupervision.',
      section: 'incidencias',
      focus: (s.openIncidents || 0) ? 'incident' : (s.preventiveRisks || 0) ? 'risk' : 'supervision',
      tone: (s.openIncidents || 0) || (s.preventiveRisks || 0) ? 'warning' : 'success',
    }),
    routineCard({
      label: 'CRM usuarios',
      value: formatNumber(crmCount),
      detail: 'Profesores, familias o tareas CRM que merecen seguimiento.',
      section: 'profesores',
      focus: '',
      query: 'seguimiento',
      tone: crmCount ? 'info' : 'success',
    }),
    routineCard({
      label: 'Relaciones activas',
      value: formatNumber(relationCount),
      detail: 'Acompanamiento post-match y senales proactivas para evitar bloqueos.',
      section: 'chats',
      focus: (s.relationshipFollowups || 0) ? 'followup' : 'proactive',
      tone: relationCount ? 'warning' : 'success',
    }),
    routineCard({
      label: 'Calidad del sistema',
      value: formatNumber(qualityCount),
      detail: 'Autosupervision, IA interna y controles que mantienen la plataforma limpia.',
      section: 'auditoria',
      focus: (s.selfSupervisionFindings || 0) ? 'supervision' : (s.internalAiInsights || 0) ? 'ai_assist' : 'risk',
      tone: qualityCount ? 'warning' : 'success',
    }),
  ];

  return `
    <section class="card ops-routine">
      <div class="card-header">
        <span class="card-title">Rutina diaria del administrador</span>
        <span class="badge badge-gray">${formatNumber(s.estimatedMinutesSaved || 0)} min potenciales</span>
      </div>
      <div class="card-body">
        <p class="ops-routine-intro">Orden recomendado para revisar ClasesDe10 sin perderse entre secciones: prioridad, matching, caja, incidencias, CRM, relaciones y calidad.</p>
        <div class="ops-routine-grid">${cards.join('')}</div>
      </div>
    </section>`;
}

function getFilters(container) {
  return {
    search: clean(container.querySelector('[data-ops-search]')?.value || '').toLowerCase(),
    type: clean(container.querySelector('[data-ops-type]')?.value || ''),
    priority: clean(container.querySelector('[data-ops-priority]')?.value || ''),
  };
}

function itemMatches(item, filters) {
  if (filters.type && item.type !== filters.type) return false;
  if (filters.priority === 'urgent' && item.priority < 85) return false;
  if (filters.priority === 'medium' && (item.priority < 60 || item.priority >= 85)) return false;
  if (filters.priority === 'low' && item.priority >= 60) return false;
  if (!filters.search) return true;
  return [
    item.title,
    item.detail,
    item.entityName,
    item.entityType,
    item.section,
    item.automation,
  ].join(' ').toLowerCase().includes(filters.search);
}

function renderOpsEmptyState(filters, model) {
  const hasFilter = Boolean(filters.search || filters.type || filters.priority);
  const title = hasFilter ? 'Sin acciones con estos filtros' : 'Sin acciones operativas abiertas';
  const desc = hasFilter
    ? 'La cola no tiene resultados para esa busqueda. Limpia filtros o abre directamente el modulo que quieras revisar.'
    : 'Ahora mismo no hay bloqueos prioritarios. Puedes usar la rutina diaria para revisar caja, matching, CRM y calidad antes de cerrar la sesion.';
  const quick = [
    { label: 'Ver todo', focus: 'all', section: 'operaciones' },
    { label: 'Solicitudes', focus: 'matching', section: 'solicitudes' },
    { label: 'Pagos', focus: 'payment', section: 'pagos' },
    { label: 'Incidencias', focus: 'incident', section: 'incidencias' },
    { label: 'Documentos', focus: 'document', section: 'documentos' },
    { label: 'CRM', query: 'seguimiento', section: 'profesores' },
  ];
  const top = (model?.topItems || []).slice(0, 3);
  return `
    <div class="empty-state ops-empty-state">
      <div class="empty-title">${escapeHtml(title)}</div>
      <div class="empty-desc">${escapeHtml(desc)}</div>
      <div class="ops-empty-actions">
        ${quick.map((item) => `<button class="btn btn-outline btn-sm" type="button" data-ops-focus="${escapeHtml(item.focus || '')}" data-ops-query="${escapeHtml(item.query || '')}">${escapeHtml(item.label)}</button>`).join('')}
      </div>
      ${top.length ? `<div class="ops-empty-suggestions">
        <span>Tambien puedes abrir:</span>
        ${top.map((item) => `<button class="btn btn-ghost btn-sm" type="button" data-ops-nav="${escapeHtml(item.section)}">${escapeHtml(item.title)}</button>`).join('')}
      </div>` : ''}
    </div>`;
}

function renderOpsItem(item) {
  return `
    <article class="ops-item ops-item-${escapeHtml(toneBadge(item.tone))}" data-ops-item="${escapeHtml(item.id)}">
      <div class="ops-priority">
        <strong>${escapeHtml(item.priority)}</strong>
        <span>${escapeHtml(item.type)}</span>
      </div>
      <div class="ops-item-main">
        <div class="ops-item-title">
          <strong>${escapeHtml(item.title)}</strong>
          <span class="badge badge-${escapeHtml(toneBadge(item.tone))}">${escapeHtml(item.section)}</span>
        </div>
        <p>${escapeHtml(item.detail)}</p>
        <div class="ops-item-meta">
          ${item.entityName ? `<span>${escapeHtml(item.entityName)}</span>` : ''}
          ${item.createdAt ? `<span>${formatShortDate(item.createdAt)}</span>` : ''}
          ${item.value ? `<span>${formatEuros(item.value)}</span>` : ''}
          ${item.automation ? `<span>${escapeHtml(item.automation)}</span>` : ''}
        </div>
      </div>
      <div class="ops-item-actions">
        <button class="btn btn-primary btn-sm" type="button" data-ops-nav="${escapeHtml(item.section)}">${escapeHtml(item.actionLabel || 'Abrir')}</button>
        ${item.entityType && item.entityId ? `<button class="btn btn-outline btn-sm" type="button" data-ops-task="${escapeHtml(item.id)}">Crear tarea</button>` : ''}
        <button class="btn btn-ghost btn-sm" type="button" data-ops-review="${escapeHtml(item.id)}">Revisado</button>
      </div>
    </article>`;
}

function renderItems(state) {
  const list = state.container.querySelector('[data-ops-list]');
  const count = state.container.querySelector('[data-ops-count]');
  if (!list || !state.model) return;
  const filters = getFilters(state.container);
  const items = state.model.items.filter((item) => itemMatches(item, filters));
  if (count) count.textContent = `${formatNumber(items.length)} acciones`;
  list.innerHTML = items.length
    ? items.slice(0, 80).map(renderOpsItem).join('')
    : renderOpsEmptyState(filters, state.model);
}

function renderShell(state) {
  const s = state.model?.summary || {};
  state.container.innerHTML = `
    <div class="ops-workbench">
      <section class="control-hero ops-hero">
        <div>
          <div class="control-eyebrow">Bandeja operativa</div>
          <h2>Lo que haria ahora mismo si gestionara ClasesDe10 a diario</h2>
          <p>Prioriza solicitudes, pagos, incidencias, documentos, clases y seguimientos CRM desde una unica cola.</p>
          <div class="ops-version">${escapeHtml(ADMIN_OPS_ENGINE_VERSION)} - ${escapeHtml(ADMIN_OPS_WORKBENCH_VERSION)}</div>
        </div>
        <div class="control-live">
          <span class="badge badge-${s.urgent ? 'warning' : 'success'}">${formatNumber(s.urgent || 0)} urgentes</span>
          <button class="btn btn-outline btn-sm" type="button" data-ops-copy>Copiar resumen</button>
          <button class="btn btn-primary btn-sm" type="button" data-ops-refresh>Actualizar</button>
        </div>
      </section>

      <div class="stats-grid ops-kpi-grid">
        ${statCard('Acciones abiertas', formatNumber(s.total || 0), 'cola priorizada', s.total ? 'warning' : 'success')}
        ${statCard('Solicitudes sin profesor', formatNumber(s.waitingMatching || 0), 'bloquean conversion', s.waitingMatching ? 'danger' : 'success')}
        ${statCard('Dinero en riesgo', formatEuros(s.revenueAtRisk || 0), 'pagos pendientes', s.revenueAtRisk ? 'warning' : 'success')}
        ${statCard('Tiempo ahorrable', formatMinutes(s.estimatedMinutesSaved || 0), 'si se procesa en bloque', 'info')}
      </div>

      ${renderDailyRoutine(state)}

      <section class="card">
        <div class="card-header">
          <span class="card-title">Atajos de automatizacion</span>
          <span class="badge badge-gray">${formatNumber((state.model?.automationGroups || []).length)} grupos</span>
        </div>
        <div class="card-body ops-automation-grid">
          ${renderAutomationGroups(state)}
        </div>
      </section>

      <section class="card">
        <div class="card-header">
          <span class="card-title">Siguientes mejores acciones</span>
          <span class="badge badge-gray" data-ops-count>${formatNumber(s.total || 0)} acciones</span>
        </div>
        <div class="card-body ops-toolbar">
          <input class="form-control" data-ops-search placeholder="Buscar en la cola operativa">
          <select class="form-control" data-ops-type aria-label="Filtrar por tipo">
            <option value="">Todos los tipos</option>
            <option value="matching">Matching</option>
            <option value="payment">Pagos</option>
            <option value="class">Clases</option>
            <option value="incident">Incidencias</option>
            <option value="document">Documentos</option>
            <option value="teacher">Profesores</option>
            <option value="family">Familias</option>
            <option value="lead">Leads</option>
            <option value="task">Tareas</option>
            <option value="chat">Chats</option>
            <option value="risk">Riesgos</option>
            <option value="supervision">Autosupervision</option>
            <option value="followup">Seguimientos</option>
            <option value="proactive">Ayuda proactiva</option>
            <option value="ai_assist">IA interna</option>
          </select>
          <select class="form-control" data-ops-priority aria-label="Filtrar por prioridad">
            <option value="">Todas las prioridades</option>
            <option value="urgent">Urgentes</option>
            <option value="medium">Media prioridad</option>
            <option value="low">Baja prioridad</option>
          </select>
        </div>
        <div class="card-body ops-list" data-ops-list></div>
      </section>
    </div>`;
  renderItems(state);
}

function renderLoading(container) {
  container.innerHTML = `
    <div class="ops-workbench">
      <section class="control-hero ops-hero">
        <div>
          <div class="control-eyebrow">Bandeja operativa</div>
          <h2>Calculando prioridades...</h2>
          <p>Estoy cruzando solicitudes, pagos, clases, incidencias, documentos y CRM.</p>
        </div>
      </section>
      <div class="stats-grid">
        <div class="stat-card"><div class="skeleton skeleton-title"></div><div class="skeleton skeleton-text"></div></div>
        <div class="stat-card"><div class="skeleton skeleton-title"></div><div class="skeleton skeleton-text"></div></div>
        <div class="stat-card"><div class="skeleton skeleton-title"></div><div class="skeleton skeleton-text"></div></div>
        <div class="stat-card"><div class="skeleton skeleton-title"></div><div class="skeleton skeleton-text"></div></div>
      </div>
    </div>`;
}

function renderError(container, error) {
  container.innerHTML = `
    <div class="alert alert-danger">
      <span class="alert-icon">!</span>
      <div class="alert-body">
        <div class="alert-title">No se pudo cargar la bandeja operativa</div>
        ${escapeHtml(error?.message || error || 'Error desconocido')}
      </div>
    </div>`;
}

async function createCrmTask(state, item) {
  const title = `Ops: ${item.title}`;
  await addDoc(collection(state.firebaseDb, 'crmTasks'), {
    entityType: item.entityType,
    entityId: item.entityId,
    entityName: item.entityName || item.entityId,
    title,
    body: item.detail,
    status: 'open',
    source: 'admin_ops_workbench',
    priority: item.priority,
    relatedSection: item.section,
    createdByUid: state.actor.uid || state.actor.id || '',
    createdByEmail: state.actor.email || '',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  await state.recordAdminAudit?.('ops_task_created', {
    module: 'admin',
    entityType: item.entityType,
    entityId: item.entityId,
    description: title,
    actor: {
      actorUid: state.actor.uid || state.actor.id || '',
      actorEmail: state.actor.email || '',
      actorRole: state.actor.rol || state.actor.role || 'admin',
      actorType: 'admin',
    },
    metadata: { opsItem: item },
  });
  state.showToast?.('Tarea creada', item.entityName || item.title, 'success');
}

async function markReviewed(state, item) {
  state.hidden.add(item.id);
  writeHidden(state.actor, state.hidden);
  await state.recordAdminAudit?.('ops_item_reviewed', {
    module: 'admin',
    entityType: item.entityType || item.type,
    entityId: item.entityId || item.id,
    description: item.title,
    actor: {
      actorUid: state.actor.uid || state.actor.id || '',
      actorEmail: state.actor.email || '',
      actorRole: state.actor.rol || state.actor.role || 'admin',
      actorType: 'admin',
    },
    metadata: { opsItem: item },
  });
  state.model = buildAdminOpsModel(state.dataset, { hiddenIds: state.hidden });
  renderShell(state);
}

function findItem(state, id) {
  return (state.model?.items || []).find((item) => item.id === id);
}

async function refresh(state, { quiet = false } = {}) {
  if (!state.firebaseDb || state.loading) return state.model;
  state.loading = true;
  if (!quiet) renderLoading(state.container);
  try {
    state.dataset = await loadOpsDataset(state.firebaseDb);
    state.model = buildAdminOpsModel(state.dataset, { hiddenIds: state.hidden });
    renderShell(state);
    state.globalIndex = state.model.searchIndex || [];
    return state.model;
  } catch (error) {
    renderError(state.container, error);
    return null;
  } finally {
    state.loading = false;
  }
}

function ensureGlobalPanel() {
  let panel = document.getElementById('admin-global-search-panel');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'admin-global-search-panel';
    panel.className = 'admin-global-search-panel';
    panel.hidden = true;
    document.body.appendChild(panel);
  }
  return panel;
}

function positionGlobalPanel(input, panel) {
  const rect = input.getBoundingClientRect();
  panel.style.left = `${Math.max(12, rect.left)}px`;
  panel.style.top = `${rect.bottom + 8}px`;
  panel.style.width = `${Math.max(320, rect.width)}px`;
}

function renderGlobalSearch(state, input) {
  const panel = ensureGlobalPanel();
  const queryText = clean(input.value, 160);
  if (queryText.length < 2) {
    panel.hidden = true;
    return;
  }
  positionGlobalPanel(input, panel);
  const results = searchOpsIndex(state.globalIndex || state.model?.searchIndex || [], queryText, 8);
  panel.hidden = false;
  panel.innerHTML = results.length ? `
    <div class="admin-global-search-head">Busqueda operativa</div>
    ${results.map((result) => `
      <button type="button" class="admin-global-result" data-ops-nav="${escapeHtml(result.section)}">
        <strong>${escapeHtml(result.title)}</strong>
        <span>${escapeHtml(result.type)} - ${escapeHtml(result.subtitle)}</span>
      </button>
    `).join('')}
  ` : '<div class="admin-global-search-empty">Sin resultados operativos</div>';
}

function bindGlobalSearch(state) {
  const input = document.getElementById('busqueda-global');
  if (!input || input.dataset.opsBound === 'true') return;
  input.dataset.opsBound = 'true';
  input.placeholder = 'Buscar profesor, familia, solicitud o accion...';
  input.addEventListener('input', async () => {
    if (!state.model && !state.loading) await refresh(state, { quiet: true });
    renderGlobalSearch(state, input);
  });
  input.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    const panel = document.getElementById('admin-global-search-panel');
    if (panel) panel.hidden = true;
    input.value = '';
  });
  document.addEventListener('click', (event) => {
    const panel = document.getElementById('admin-global-search-panel');
    if (!panel || panel.hidden) return;
    const nav = event.target.closest('[data-ops-nav]');
    if (nav && panel.contains(nav)) {
      state.navigate?.(nav.dataset.opsNav);
      panel.hidden = true;
      input.value = '';
      return;
    }
    if (!panel.contains(event.target) && event.target !== input) panel.hidden = true;
  });
}

export async function initAdminOpsWorkbench({
  container,
  firebaseDb,
  actor = {},
  navigate = () => {},
  showToast = () => {},
  recordAdminAudit = null,
  autoLoad = true,
} = {}) {
  if (!container || !firebaseDb) return null;
  let state = instances.get(container);
  if (!state) {
    state = {
      container,
      firebaseDb,
      actor,
      navigate,
      showToast,
      recordAdminAudit,
      hidden: readHidden(actor),
      dataset: null,
      model: null,
      globalIndex: [],
      loading: false,
    };
    instances.set(container, state);
    container.addEventListener('click', async (event) => {
      const refreshBtn = event.target.closest('[data-ops-refresh]');
      if (refreshBtn) {
        await refresh(state);
        return;
      }
      const copyBtn = event.target.closest('[data-ops-copy]');
      if (copyBtn && state.model) {
        await navigator.clipboard?.writeText(summarizeOpsForClipboard(state.model));
        state.showToast?.('Resumen copiado', 'Bandeja operativa lista para compartir.', 'success');
        return;
      }
      const nav = event.target.closest('[data-ops-nav]');
      if (nav) {
        state.navigate?.(nav.dataset.opsNav);
        return;
      }
      const focus = event.target.closest('[data-ops-focus]');
      if (focus) {
        const value = clean(focus.dataset.opsFocus || '', 80);
        const queryText = clean(focus.dataset.opsQuery || '', 120);
        const search = state.container.querySelector('[data-ops-search]');
        const type = state.container.querySelector('[data-ops-type]');
        const priority = state.container.querySelector('[data-ops-priority]');
        if (search) search.value = queryText;
        if (priority) priority.value = '';
        if (type) type.value = value === 'all' ? '' : value;
        renderItems(state);
        state.container.querySelector('[data-ops-list]')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
      const task = event.target.closest('[data-ops-task]');
      if (task) {
        const item = findItem(state, task.dataset.opsTask);
        if (item) await createCrmTask(state, item);
        return;
      }
      const review = event.target.closest('[data-ops-review]');
      if (review) {
        const item = findItem(state, review.dataset.opsReview);
        if (item) await markReviewed(state, item);
      }
    });
    container.addEventListener('input', (event) => {
      if (event.target.closest('[data-ops-search], [data-ops-type], [data-ops-priority]')) renderItems(state);
    });
    bindGlobalSearch(state);
  } else {
    state.actor = actor;
    state.navigate = navigate;
    state.showToast = showToast;
    state.recordAdminAudit = recordAdminAudit;
  }

  if (autoLoad && !state.model) await refresh(state);
  else if (state.model) renderShell(state);
  else renderLoading(container);

  return {
    refresh: () => refresh(state),
    get model() { return state.model; },
  };
}

export default {
  ADMIN_OPS_WORKBENCH_VERSION,
  initAdminOpsWorkbench,
  loadOpsDataset,
};
