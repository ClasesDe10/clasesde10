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

function renderAction(action, primary = false) {
  if (!action?.id) return '';
  const klass = primary
    ? 'btn btn-gold family-journey-primary'
    : 'btn btn-ghost btn-sm family-journey-secondary';
  return `<button type="button" class="${klass}" data-teacher-journey-action="${escapeHtml(action.id)}" data-section="${escapeHtml(action.section || '')}">
    ${escapeHtml(action.label)}
  </button>`;
}

function renderChecklistItem(item = {}) {
  const action = item.done || !item.actionId
    ? ''
    : ` data-teacher-journey-action="${escapeHtml(item.actionId)}" role="button" tabindex="0"`;
  return `<li class="family-journey-step ${item.done ? 'is-done' : ''}"${action}>
    <span class="family-journey-step-dot">${item.done ? 'OK' : ''}</span>
    <span>${escapeHtml(item.label)}</span>
  </li>`;
}

export function renderTeacherJourneyPanel(state = {}) {
  if (!state?.stage) return '';
  const secondaryActions = Array.isArray(state.secondaryActions) ? state.secondaryActions : [];
  const checklist = Array.isArray(state.checklist) ? state.checklist : [];
  const progress = Math.max(0, Math.min(100, Number(state.progress || 0)));

  return `<section class="family-journey-card teacher-journey-card" data-teacher-journey-stage="${escapeHtml(state.stage)}">
    <div class="family-journey-main">
      <div class="family-journey-eyebrow">Tu centro de trabajo</div>
      <h2>${escapeHtml(state.title)}</h2>
      <p>${escapeHtml(state.body)}</p>
      <div class="family-journey-actions">
        ${renderAction(state.primaryAction, true)}
        ${secondaryActions.map((action) => renderAction(action)).join('')}
      </div>
      <div class="family-journey-reassurance">${escapeHtml(state.reassurance || '')}</div>
    </div>
    <aside class="family-journey-side" aria-label="Progreso operativo del profesor">
      <div class="family-journey-progress-head">
        <span>Preparacion</span>
        <strong>${escapeHtml(String(progress))}%</strong>
      </div>
      <div class="family-journey-progress" aria-hidden="true">
        <div style="width:${progress}%"></div>
      </div>
      <ol class="family-journey-steps">
        ${checklist.map((item) => renderChecklistItem(item)).join('')}
      </ol>
    </aside>
  </section>`;
}

export default {
  renderTeacherJourneyPanel,
};
