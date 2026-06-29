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

function escapeAttributeName(value) {
  return clean(value, 80).replace(/[^a-zA-Z0-9:_-]/g, '');
}

function renderAttrs(attrs = {}) {
  return Object.entries(attrs)
    .map(([key, value]) => [escapeAttributeName(key), value])
    .filter(([key, value]) => key && value !== undefined && value !== null && value !== false)
    .map(([key, value]) => `${key}="${escapeHtml(value === true ? '' : value)}"`)
    .join(' ');
}

function actionClass(variant = 'primary') {
  const map = {
    primary: 'btn btn-primary btn-sm',
    gold: 'btn btn-gold btn-sm',
    ghost: 'btn btn-ghost btn-sm',
    outline: 'btn btn-outline btn-sm',
  };
  return map[variant] || map.primary;
}

function renderAction(action = {}) {
  if (!action.label) return '';
  const attrs = renderAttrs(action.attrs || {});
  return `<button type="button" class="${actionClass(action.variant)}" ${attrs}>${escapeHtml(action.label)}</button>`;
}

export function emptyAction(label, attrs = {}, variant = 'primary') {
  return { label, attrs, variant };
}

export function renderEmptyState({
  icon = '',
  title = 'Sin datos todavia',
  description = '',
  actions = [],
  compact = false,
  className = '',
} = {}) {
  const actionHtml = actions.length
    ? `<div class="empty-actions">${actions.map(renderAction).join('')}</div>`
    : '';
  return `<div class="empty-state dashboard-empty-state ${compact ? 'is-compact' : ''} ${escapeHtml(className)}">
    ${icon ? `<div class="empty-icon" aria-hidden="true">${escapeHtml(icon)}</div>` : ''}
    <div class="empty-title">${escapeHtml(title)}</div>
    ${description ? `<div class="empty-desc">${escapeHtml(description)}</div>` : ''}
    ${actionHtml}
  </div>`;
}

export function renderTableEmptyState(colspan, options = {}) {
  const safeColspan = Math.max(1, Number.parseInt(colspan, 10) || 1);
  return `<tr class="empty-state-row"><td colspan="${safeColspan}">${renderEmptyState({ ...options, compact: true, className: 'table-empty-state' })}</td></tr>`;
}

export default {
  emptyAction,
  renderEmptyState,
  renderTableEmptyState,
};
