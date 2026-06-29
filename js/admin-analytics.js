import {
  collection,
  getDocs,
  limit as firestoreLimit,
  orderBy,
  query,
} from 'https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js';
import {
  ANALYTICS_ENGINE_VERSION,
  buildAnalyticsCsvRows,
  buildAnalyticsReport,
} from './analytics-engine.js?v=20260628-analytics';

const instances = new WeakMap();
const COLLECTIONS = {
  events: 'analyticsEvents',
  leads: 'leadsPublicos',
  requests: 'solicitudes',
  teachers: 'profesores',
  families: 'familias',
  students: 'alumnos',
  assignments: 'asignaciones',
  classes: 'clases',
  payments: 'pagos',
  incidents: 'incidencias',
};

function clean(value, max = 4000) {
  return String(value ?? '').trim().slice(0, max);
}

function dateFrom(value) {
  if (!value) return null;
  if (typeof value?.toDate === 'function') return value.toDate();
  if (value?.seconds) return new Date(value.seconds * 1000);
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDate(value) {
  const date = dateFrom(value);
  if (!date) return '-';
  return date.toLocaleString('es-ES', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatNumber(value, decimals = 0) {
  return new Intl.NumberFormat('es-ES', {
    maximumFractionDigits: decimals,
  }).format(Number(value || 0));
}

function formatPercent(value) {
  return `${formatNumber(value, 1)}%`;
}

function field(id) {
  return document.getElementById(id);
}

function safeText(sanitize, value) {
  return sanitize(value === 0 ? '0' : value);
}

function optionMonth() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function toDoc(snap) {
  return { id: snap.id, ...snap.data() };
}

async function readCollection(firebaseDb, name, max = 2500) {
  try {
    const snap = await getDocs(query(collection(firebaseDb, name), orderBy('createdAt', 'desc'), firestoreLimit(max)));
    return snap.docs.map(toDoc);
  } catch (_) {
    const snap = await getDocs(query(collection(firebaseDb, name), firestoreLimit(max)));
    return snap.docs.map(toDoc);
  }
}

function statCard(sanitize, label, value, change = '', tone = 'positive') {
  return `
    <div class="stat-card">
      <div class="stat-card-label">${sanitize(label)}</div>
      <div class="stat-card-value">${safeText(sanitize, value)}</div>
      <div class="stat-card-change ${tone}">${sanitize(change)}</div>
    </div>`;
}

function renderMiniBar(sanitize, label, value, max, meta = '') {
  const pct = max > 0 ? Math.min(100, Math.round((Number(value || 0) / max) * 100)) : 0;
  return `
    <div class="analytics-mini-bar">
      <div class="analytics-mini-bar__top">
        <strong>${sanitize(label)}</strong>
        <span>${safeText(sanitize, value)}</span>
      </div>
      <div class="analytics-mini-bar__track"><span style="width:${pct}%"></span></div>
      ${meta ? `<div class="analytics-mini-bar__meta">${sanitize(meta)}</div>` : ''}
    </div>`;
}

function renderList(sanitize, items, valueLabel = 'eventos') {
  if (!items?.length) {
    return '<div class="empty-state"><div class="empty-title">Sin datos suficientes</div><div class="empty-desc">La analitica se ira completando con el uso real.</div></div>';
  }
  const max = Math.max(...items.map((item) => Number(item.count || 0)), 1);
  return `<div class="analytics-list">${items.slice(0, 10).map((item) => renderMiniBar(
    sanitize,
    item.label || item.key || '-',
    item.count || 0,
    max,
    item.adoptionPct !== undefined ? `${formatPercent(item.adoptionPct)} adopcion` : valueLabel,
  )).join('')}</div>`;
}

function renderFunnel(sanitize, title, rows = []) {
  if (!rows.length) return '';
  return `
    <div class="card">
      <div class="card-header"><span class="card-title">${sanitize(title)}</span></div>
      <div class="table-wrapper">
        <table class="responsive-card-table">
          <thead><tr><th>Paso</th><th>Sesiones</th><th>Desde inicio</th><th>Abandono</th></tr></thead>
          <tbody>
            ${rows.map((row) => `<tr>
              <td data-label="Paso"><strong>${sanitize(row.step)}</strong></td>
              <td data-label="Sesiones">${safeText(sanitize, row.count)}</td>
              <td data-label="Desde inicio">${formatPercent(row.conversionFromStartPct)}</td>
              <td data-label="Abandono">${safeText(sanitize, row.dropoffFromPrevious)} (${formatPercent(row.dropoffFromPreviousPct)})</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>`;
}

function renderInsights(sanitize, insights = []) {
  const target = field('analytics-insights');
  if (!target) return;
  target.innerHTML = insights.length
    ? insights.map((item) => `
      <div class="alert ${item.priority === 'high' ? 'alert-danger' : item.priority === 'medium' ? 'alert-warning' : 'alert-info'}" style="margin:0">
        <span class="alert-icon">${item.priority === 'high' ? '!' : 'i'}</span>
        <div class="alert-body">
          <div class="alert-title">${sanitize(item.title)}</div>
          ${sanitize(item.body)}
        </div>
      </div>`).join('')
    : '<div class="alert alert-success" style="margin:0"><span class="alert-icon">OK</span><div class="alert-body"><div class="alert-title">Sin alertas de conversion</div>El sistema necesita mas eventos para detectar oportunidades.</div></div>';
}

function renderTable(sanitize, targetId, rows, columns, empty = 'Sin datos') {
  const tbody = field(targetId);
  if (!tbody) return;
  tbody.innerHTML = rows?.length
    ? rows.map((row) => `<tr>${columns.map((column) => `<td data-label="${sanitize(column.label)}">${column.render(row)}</td>`).join('')}</tr>`).join('')
    : `<tr><td colspan="${columns.length}" style="text-align:center;padding:32px;color:var(--gray-mid)">${sanitize(empty)}</td></tr>`;
}

function buildDataset(raw, month) {
  return {
    events: raw.events,
    leads: raw.leads,
    requests: raw.requests,
    teachers: raw.teachers,
    families: raw.families,
    students: raw.students,
    assignments: raw.assignments,
    classes: raw.classes,
    payments: raw.payments,
    incidents: raw.incidents,
    month,
  };
}

export async function initAdminAnalytics({
  section,
  firebaseDb,
  sanitize = (value) => clean(value),
  exportarCSV,
  showToast,
  debounce = (fn) => fn,
} = {}) {
  if (!section || !firebaseDb) return null;
  if (instances.has(section)) {
    const api = instances.get(section);
    await api.refresh();
    return api;
  }

  let raw = {};
  let currentReport = null;
  let currentCsvRows = [];

  function activeMonth() {
    return field('analytics-month')?.value || '';
  }

  function render(report) {
    currentReport = report;
    const conversionRate = report.totals.sessions ? (report.totals.conversions / report.totals.sessions) * 100 : 0;
    const errorRate = report.totals.events ? (report.totals.errors / report.totals.events) * 100 : 0;
    field('analytics-kpis').innerHTML = [
      statCard(sanitize, 'Eventos', formatNumber(report.totals.events), `${formatNumber(report.totals.sessions)} sesiones`),
      statCard(sanitize, 'Usuarios medidos', formatNumber(report.totals.users), `${formatNumber(report.totals.pageViews)} vistas`),
      statCard(sanitize, 'Conversiones', formatNumber(report.totals.conversions), `${formatPercent(conversionRate)} por sesion`, conversionRate < 5 ? 'negative' : 'positive'),
      statCard(sanitize, 'Errores', formatNumber(report.totals.errors), `${formatPercent(errorRate)} de eventos`, errorRate > 3 ? 'negative' : 'positive'),
      statCard(sanitize, 'Solicitudes', formatNumber(report.totals.records.requests), 'Firestore solicitudes'),
      statCard(sanitize, 'Clases', formatNumber(report.totals.records.classes), 'Firestore clases'),
    ].join('');

    renderInsights(sanitize, report.insights);
    field('analytics-funnels').innerHTML = [
      renderFunnel(sanitize, 'Embudo familias', report.funnels.family_acquisition),
      renderFunnel(sanitize, 'Embudo profesores', report.funnels.teacher_acquisition),
      renderFunnel(sanitize, 'Ciclo de clase', report.funnels.class_lifecycle),
    ].join('');
    field('analytics-features').innerHTML = renderList(sanitize, report.featureUsage, 'uso');
    field('analytics-low-usage').innerHTML = renderList(sanitize, report.lowUsageFeatures, 'baja adopcion');
    field('analytics-demand-subjects').innerHTML = renderList(sanitize, report.demand.subjects, 'demanda');
    field('analytics-demand-cities').innerHTML = renderList(sanitize, report.demand.cities, 'demanda');

    renderTable(sanitize, 'tbody-analytics-pages', report.pageConversion.slice(0, 12), [
      { label: 'Pagina', render: (row) => `<strong>${sanitize(row.label)}</strong>` },
      { label: 'Visitas', render: (row) => safeText(sanitize, row.count) },
      { label: 'Conversiones', render: (row) => safeText(sanitize, row.conversions) },
      { label: 'Tasa', render: (row) => formatPercent(row.conversionPct) },
    ], 'Sin paginas medidas todavia');

    renderTable(sanitize, 'tbody-analytics-errors', report.errors.slice(0, 12), [
      { label: 'Error', render: (row) => `<strong>${sanitize(row.label)}</strong>` },
      { label: 'Eventos', render: (row) => safeText(sanitize, row.count) },
    ], 'Sin errores medidos');

    renderTable(sanitize, 'tbody-analytics-teachers', report.teacherConversion.slice(0, 12), [
      { label: 'Profesor', render: (row) => `<strong>${sanitize(row.teacherName)}</strong><br><span style="font-size:.75rem;color:var(--gray-mid)">${sanitize(row.teacherUid)}</span>` },
      { label: 'Asignaciones', render: (row) => safeText(sanitize, row.assignments) },
      { label: 'Clases', render: (row) => safeText(sanitize, row.classes) },
      { label: 'Realizadas', render: (row) => formatPercent(row.completionPct) },
      { label: 'Cancelaciones', render: (row) => formatPercent(row.cancellationPct) },
    ], 'Sin conversion por profesor');

    renderTable(sanitize, 'tbody-analytics-events', raw.events.slice(0, 50), [
      { label: 'Fecha', render: (row) => formatDate(row.createdAt || row.created_at) },
      { label: 'Evento', render: (row) => `<strong>${sanitize(row.eventName)}</strong><br><span style="font-size:.75rem;color:var(--gray-mid)">${sanitize(row.feature || row.category || '')}</span>` },
      { label: 'Rol', render: (row) => sanitize(row.actorRole || 'anonimo') },
      { label: 'Pagina', render: (row) => sanitize(row.pagePath || '/') },
      { label: 'Entidad', render: (row) => sanitize([row.entityType, row.entityId].filter(Boolean).join(' / ')) },
    ], 'Sin eventos registrados');

    currentCsvRows = buildAnalyticsCsvRows(raw.events);
    const count = field('analytics-count');
    if (count) count.textContent = `${formatNumber(currentCsvRows.length)} eventos exportables`;
  }

  async function refresh() {
    const month = activeMonth();
    field('analytics-kpis').innerHTML = Array.from({ length: 6 }, () => '<div class="stat-card"><div class="skeleton skeleton-title"></div><div class="skeleton skeleton-text"></div></div>').join('');
    const entries = await Promise.all(Object.entries(COLLECTIONS).map(async ([key, name]) => [key, await readCollection(firebaseDb, name, key === 'events' ? 4000 : 2500)]));
    raw = Object.fromEntries(entries);
    const dataset = buildDataset(raw, month);
    render(buildAnalyticsReport(dataset, { month }));
  }

  field('analytics-month').value ||= optionMonth();
  field('analytics-refresh')?.addEventListener('click', () => refresh().catch((error) => {
    showToast?.('Error de analitica', error.message || 'No se pudo cargar analitica.', 'error');
  }));
  field('analytics-month')?.addEventListener('change', () => refresh().catch((error) => {
    showToast?.('Error de analitica', error.message || 'No se pudo cargar analitica.', 'error');
  }));
  field('analytics-search')?.addEventListener('input', debounce(() => {
    const queryText = clean(field('analytics-search')?.value).toLowerCase();
    const rows = queryText
      ? raw.events.filter((event) => [event.eventName, event.category, event.feature, event.pagePath, event.actorRole, event.entityType].join(' ').toLowerCase().includes(queryText))
      : raw.events;
    renderTable(sanitize, 'tbody-analytics-events', rows.slice(0, 50), [
      { label: 'Fecha', render: (row) => formatDate(row.createdAt || row.created_at) },
      { label: 'Evento', render: (row) => `<strong>${sanitize(row.eventName)}</strong><br><span style="font-size:.75rem;color:var(--gray-mid)">${sanitize(row.feature || row.category || '')}</span>` },
      { label: 'Rol', render: (row) => sanitize(row.actorRole || 'anonimo') },
      { label: 'Pagina', render: (row) => sanitize(row.pagePath || '/') },
      { label: 'Entidad', render: (row) => sanitize([row.entityType, row.entityId].filter(Boolean).join(' / ')) },
    ], 'Sin eventos con ese filtro');
  }, 180));
  field('analytics-export')?.addEventListener('click', () => {
    exportarCSV?.(currentCsvRows, `analitica_clasesde10_${activeMonth() || 'todo'}.csv`, [
      { titulo: 'Fecha', campo: 'fecha' },
      { titulo: 'Dia', campo: 'dia' },
      { titulo: 'Mes', campo: 'mes' },
      { titulo: 'Evento', campo: 'evento' },
      { titulo: 'Categoria', campo: 'categoria' },
      { titulo: 'Feature', campo: 'feature' },
      { titulo: 'Rol', campo: 'rol' },
      { titulo: 'Pagina', campo: 'pagina' },
      { titulo: 'Sesion', campo: 'sesion' },
      { titulo: 'Usuario', campo: 'usuario' },
      { titulo: 'Entidad tipo', campo: 'entidad_tipo' },
      { titulo: 'Entidad id', campo: 'entidad_id' },
    ]);
  });

  const api = { refresh, get report() { return currentReport; } };
  instances.set(section, api);
  await refresh();
  field('analytics-version').textContent = ANALYTICS_ENGINE_VERSION;
  return api;
}

export default { initAdminAnalytics };
