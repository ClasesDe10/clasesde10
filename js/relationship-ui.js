import {
  relationshipStageLabel,
  relationshipStageTone,
  summarizeRelationships,
} from './relationship-engine.js';

function clean(value, max = 1000) {
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

function toneClass(tone) {
  const normalized = clean(tone, 40).toLowerCase();
  if (normalized === 'danger' || normalized === 'red' || normalized === 'critical') return 'danger';
  if (normalized === 'warning' || normalized === 'gold') return 'warning';
  if (normalized === 'success' || normalized === 'green') return 'success';
  if (normalized === 'navy' || normalized === 'info' || normalized === 'teal') return 'info';
  return 'gray';
}

function roleActions(relationship, role) {
  return relationship?.nextActions?.[role]
    || relationship?.nextActions?.admin
    || [];
}

function primaryAction(relationship, role) {
  return roleActions(relationship, role)[0] || null;
}

function formatDate(value) {
  if (!value) return 'Sin actividad';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Sin actividad';
  return date.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' });
}

function renderModulePills(relationship) {
  const modules = [
    ['Chat', relationship.modules?.chat],
    ['Calendario', relationship.modules?.calendar],
    ['Pagos', relationship.modules?.payments],
    ['Docs', relationship.modules?.documents],
    ['Incidencias', relationship.modules?.incidents],
    ['IA', relationship.modules?.ai],
  ];
  return modules.map(([label, active]) => (
    `<span class="relationship-pill ${active ? 'is-on' : ''}">${escapeHtml(label)}</span>`
  )).join('');
}

function renderRelationshipRow(relationship, role, options = {}) {
  const action = primaryAction(relationship, role);
  const stageTone = toneClass(relationshipStageTone(relationship.stage));
  const healthTone = relationship.healthScore >= 80 ? 'success' : relationship.healthScore >= 60 ? 'warning' : 'danger';
  const navAttr = action?.section && options.navAttribute
    ? ` ${options.navAttribute}="${escapeHtml(action.section)}"`
    : '';
  const actionButton = action
    ? `<button class="btn btn-ghost btn-sm" type="button"${navAttr}>${escapeHtml(action.label)}</button>`
    : '';

  return `<article class="relationship-row urgency-${escapeHtml(relationship.urgency || 'low')}">
    <div class="relationship-row-main">
      <div class="relationship-title-line">
        <strong>${escapeHtml(relationship.title || relationship.subject || 'Expediente')}</strong>
        <span class="badge badge-${stageTone}">${escapeHtml(relationshipStageLabel(relationship.stage))}</span>
      </div>
      <div class="relationship-subtitle">${escapeHtml(relationship.subtitle || relationship.subject || '')}</div>
      <div class="relationship-modules">${renderModulePills(relationship)}</div>
    </div>
    <div class="relationship-row-side">
      <div class="relationship-health ${healthTone}">
        <strong>${escapeHtml(String(relationship.healthScore ?? 0))}</strong>
        <span>salud</span>
      </div>
      <div class="relationship-action">
        ${action ? `<span>${escapeHtml(action.detail || '')}</span>` : ''}
        ${actionButton}
      </div>
      <div class="relationship-last">Ultima actividad ${escapeHtml(formatDate(relationship.lastActivityAt))}</div>
    </div>
  </article>`;
}

export function renderRelationshipDigest(relationships = [], role = 'admin', options = {}) {
  const rows = Array.isArray(relationships) ? relationships : [];
  const summary = summarizeRelationships(rows);
  const title = options.title || 'Expedientes operativos';
  const subtitle = options.subtitle || 'Solicitud, matching, chat, calendario, pagos e incidencias conectados.';
  const emptyTitle = options.emptyTitle || 'Sin expedientes activos';
  const emptyDesc = options.emptyDesc || 'Cuando haya solicitudes o asignaciones, aqui aparecera el siguiente paso.';
  const max = Number(options.max || (role === 'admin' ? 6 : 4));
  const navAttribute = options.navAttribute || '';
  const visibleRows = rows.slice(0, max);

  return `<section class="relationship-digest">
    <div class="relationship-digest-head">
      <div>
        <div class="relationship-eyebrow">Producto integrado</div>
        <h3>${escapeHtml(title)}</h3>
        <p>${escapeHtml(subtitle)}</p>
      </div>
      <div class="relationship-summary">
        <div><strong>${escapeHtml(String(summary.total))}</strong><span>expedientes</span></div>
        <div><strong>${escapeHtml(String(summary.blocked.length))}</strong><span>bloqueos</span></div>
        <div><strong>${escapeHtml(String(summary.pendingSchedule.length))}</strong><span>horarios</span></div>
        <div><strong>${escapeHtml(String(summary.paymentRisk.length))}</strong><span>pagos</span></div>
      </div>
    </div>
    ${visibleRows.length ? `<div class="relationship-list">
      ${visibleRows.map((item) => renderRelationshipRow(item, role, { navAttribute })).join('')}
    </div>` : `<div class="empty-state relationship-empty">
      <div class="empty-title">${escapeHtml(emptyTitle)}</div>
      <div class="empty-desc">${escapeHtml(emptyDesc)}</div>
    </div>`}
  </section>`;
}

export default {
  renderRelationshipDigest,
};
