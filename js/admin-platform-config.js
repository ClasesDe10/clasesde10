import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
} from 'https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js';
import { firebaseDb } from './firebase-client.js?v=20260627-domain-auth';
import { recordAdminAudit } from './audit-client.js?v=20260628-audit';
import {
  PLATFORM_CONFIG_HISTORY_COLLECTION,
  PLATFORM_CONFIG_SECTIONS,
  PLATFORM_CONFIG_VERSION,
  allPlatformConfigFields,
  configSummary,
  diffPlatformConfig,
  getConfigValue,
  loadPlatformConfig,
  normalizePlatformConfig,
  savePlatformConfig,
  setConfigValue,
  validatePlatformConfig,
} from './platform-config.js?v=20260628-config';

const instances = new WeakMap();

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

function normalizeDate(value) {
  if (!value) return null;
  if (typeof value?.toDate === 'function') return value.toDate();
  if (value?.seconds) return new Date(value.seconds * 1000);
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDate(value) {
  const date = normalizeDate(value);
  return date ? date.toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' }) : '-';
}

function badge(label, tone = 'gray') {
  return `<span class="badge badge-${tone}">${escapeHtml(label)}</span>`;
}

function fieldInput(field, value) {
  const id = `cfg-${field.path.replace(/[^a-z0-9]+/gi, '-')}`;
  const readonly = field.readonly ? 'readonly aria-readonly="true"' : '';
  const common = `id="${id}" data-config-path="${escapeHtml(field.path)}" data-config-type="${escapeHtml(field.type)}" ${readonly}`;
  if (field.type === 'boolean') {
    return `
      <label class="config-toggle" for="${id}">
        <input ${common} type="checkbox" ${value === true ? 'checked' : ''}>
        <span>${value === true ? 'Activo' : 'Inactivo'}</span>
      </label>`;
  }
  if (field.type === 'select') {
    return `<select class="form-control" ${common}>${field.options.map((option) => (
      `<option value="${escapeHtml(option)}" ${String(value) === String(option) ? 'selected' : ''}>${escapeHtml(option)}</option>`
    )).join('')}</select>`;
  }
  if (field.type === 'textarea') {
    return `<textarea class="form-control" rows="3" maxlength="${Number(field.maxLength || 2000)}" ${common}>${escapeHtml(value ?? '')}</textarea>`;
  }
  if (field.type === 'json') {
    return `<textarea class="form-control config-code" rows="7" spellcheck="false" ${common}>${escapeHtml(JSON.stringify(value ?? {}, null, 2))}</textarea>`;
  }
  if (field.type === 'array') {
    return `<textarea class="form-control config-code" rows="4" spellcheck="false" ${common}>${escapeHtml(Array.isArray(value) ? value.join('\n') : clean(value))}</textarea>`;
  }
  const inputType = field.type === 'number' ? 'number' : field.type === 'color' ? 'color' : field.type === 'time' ? 'time' : field.type === 'url' ? 'url' : 'text';
  const attrs = [
    field.min !== undefined ? `min="${field.min}"` : '',
    field.max !== undefined && field.type === 'number' ? `max="${field.max}"` : '',
    field.step !== undefined ? `step="${field.step}"` : '',
    field.maxLength && field.type !== 'number' ? `maxlength="${field.maxLength}"` : '',
  ].filter(Boolean).join(' ');
  return `<input class="form-control" ${common} type="${inputType}" value="${escapeHtml(value ?? '')}" ${attrs}>`;
}

function renderSection(section, config, errorsByPath) {
  return `
    <section class="config-section" data-config-section="${escapeHtml(section.id)}">
      <div class="config-section-head">
        <div>
          <h3>${escapeHtml(section.title)}</h3>
          <p>${escapeHtml(section.description)}</p>
        </div>
        ${badge(`${section.fields.length} ajustes`, 'gray')}
      </div>
      <div class="config-fields-grid">
        ${section.fields.map((field) => {
          const value = getConfigValue(config, field.path);
          const error = errorsByPath.get(field.path);
          return `
            <div class="config-field ${error ? 'has-error' : ''}" data-config-field="${escapeHtml(field.path)}">
              <label class="form-label" for="cfg-${field.path.replace(/[^a-z0-9]+/gi, '-')}">${escapeHtml(field.label)}</label>
              ${fieldInput(field, value)}
              ${field.description ? `<div class="config-help">${escapeHtml(field.description)}</div>` : ''}
              ${error ? `<div class="config-error">${escapeHtml(error.message)}</div>` : ''}
            </div>`;
        }).join('')}
      </div>
    </section>`;
}

function renderHistory(history = []) {
  if (!history.length) {
    return '<div class="empty-state"><div class="empty-title">Sin versiones todavia</div><div class="empty-subtitle">El primer guardado creara historial auditable.</div></div>';
  }
  return history.map((item) => `
    <article class="config-history-item">
      <div>
        <strong>Version ${escapeHtml(item.versionNumber || '-')}</strong>
        <div>${escapeHtml((item.changedFields || []).slice(0, 8).join(', ') || 'Sin cambios detectados')}</div>
      </div>
      <div>
        <span>${escapeHtml(item.actorEmail || 'admin')}</span>
        <small>${escapeHtml(formatDate(item.createdAt || item.created_at))}</small>
      </div>
    </article>
  `).join('');
}

function injectStyles() {
  if (document.getElementById('admin-platform-config-styles')) return;
  const style = document.createElement('style');
  style.id = 'admin-platform-config-styles';
  style.textContent = `
    .config-shell { display: grid; gap: 18px; }
    .config-hero {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 18px;
      align-items: start;
      padding: 22px;
      border: 1px solid rgba(15,31,61,.10);
      border-radius: 8px;
      background: linear-gradient(135deg, rgba(15,31,61,.055), rgba(232,160,48,.08));
    }
    .config-hero h2 { margin: 0 0 6px; color: var(--navy); font-size: 1.35rem; }
    .config-hero p { margin: 0; color: var(--gray-mid); max-width: 860px; line-height: 1.55; }
    .config-actions { display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
    .config-summary-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 10px;
    }
    .config-summary-card {
      padding: 14px;
      border: 1px solid rgba(15,31,61,.09);
      border-radius: 8px;
      background: #fff;
    }
    .config-summary-card strong { display: block; color: var(--navy); font-size: 1.3rem; }
    .config-summary-card span { color: var(--gray-mid); font-size: .78rem; font-weight: 800; text-transform: uppercase; }
    .config-toolbar {
      display: grid;
      grid-template-columns: minmax(180px, 1fr) minmax(160px, 260px);
      gap: 10px;
      align-items: center;
    }
    .config-section {
      border: 1px solid rgba(15,31,61,.09);
      border-radius: 8px;
      background: #fff;
      overflow: hidden;
    }
    .config-section-head {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      padding: 16px;
      border-bottom: 1px solid rgba(15,31,61,.08);
      background: rgba(15,31,61,.025);
    }
    .config-section-head h3 { margin: 0 0 4px; color: var(--navy); font-size: 1rem; }
    .config-section-head p { margin: 0; color: var(--gray-mid); font-size: .86rem; line-height: 1.45; }
    .config-fields-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(min(280px, 100%), 1fr));
      gap: 14px;
      padding: 16px;
    }
    .config-field { min-width: 0; }
    .config-field.has-error .form-control { border-color: var(--danger); }
    .config-help, .config-error { margin-top: 6px; font-size: .76rem; line-height: 1.35; }
    .config-help { color: var(--gray-mid); }
    .config-error { color: var(--danger); font-weight: 800; }
    .config-toggle {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      min-height: 42px;
      padding: 8px 10px;
      border: 1px solid rgba(15,31,61,.12);
      border-radius: 8px;
      background: rgba(15,31,61,.025);
      font-weight: 800;
      color: var(--navy);
    }
    .config-toggle input { width: 18px; height: 18px; accent-color: var(--navy); }
    .config-code {
      font-family: ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace;
      font-size: .78rem;
      white-space: pre;
    }
    .config-history-item {
      display: flex;
      justify-content: space-between;
      gap: 14px;
      padding: 12px 0;
      border-bottom: 1px solid rgba(15,31,61,.08);
      color: var(--gray-dark);
      font-size: .85rem;
    }
    .config-history-item:last-child { border-bottom: 0; }
    .config-history-item small { display: block; margin-top: 3px; color: var(--gray-mid); text-align: right; }
    @media (max-width: 720px) {
      .config-hero, .config-toolbar { grid-template-columns: 1fr; }
      .config-actions { justify-content: stretch; }
      .config-actions .btn { flex: 1 1 160px; }
      .config-section-head { flex-direction: column; }
    }
  `;
  document.head.appendChild(style);
}

function parseValue(field, element) {
  if (field.type === 'boolean') return element.checked === true;
  if (field.type === 'number') return Number(element.value || 0);
  if (field.type === 'json') return JSON.parse(element.value || '{}');
  if (field.type === 'array') return element.value.split(/\n|,/).map((item) => clean(item, 200)).filter(Boolean);
  return clean(element.value, field.maxLength || 4000);
}

function collectFormConfig(root, currentConfig) {
  const config = normalizePlatformConfig(currentConfig);
  const fields = new Map(allPlatformConfigFields().map((item) => [item.path, item]));
  root.querySelectorAll('[data-config-path]').forEach((element) => {
    const path = element.dataset.configPath;
    const field = fields.get(path);
    if (!field || field.readonly) return;
    setConfigValue(config, path, parseValue(field, element));
  });
  return config;
}

async function loadHistory() {
  try {
    const snap = await getDocs(query(
      collection(firebaseDb, PLATFORM_CONFIG_HISTORY_COLLECTION),
      orderBy('createdAt', 'desc'),
      limit(10),
    ));
    return snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
  } catch (error) {
    console.warn('No se pudo cargar historial de configuracion', error);
    return [];
  }
}

function downloadJson(config) {
  const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `clasesde10-platform-config-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

async function auditConfigChange(actor, result) {
  await recordAdminAudit('platform_config.updated', {
    module: 'configuration',
    entityType: 'configuracion',
    entityId: 'platform',
    description: `Configuracion de plataforma actualizada a version ${result.versionNumber}.`,
    actor: {
      actorUid: actor.uid || actor.id || '',
      actorEmail: actor.email || '',
      actorRole: actor.rol || actor.role || 'admin',
      actorType: 'admin',
    },
    metadata: {
      versionNumber: result.versionNumber,
      changedFields: result.changes.map((item) => item.path),
      schemaVersion: PLATFORM_CONFIG_VERSION,
    },
  }).catch((error) => console.warn('No se pudo auditar configuracion', error));
}

export async function initAdminPlatformConfig({
  container,
  actor = {},
  showToast = () => {},
} = {}) {
  if (!container) return null;
  if (instances.has(container)) return instances.get(container);
  injectStyles();

  const state = {
    config: normalizePlatformConfig(),
    savedConfig: normalizePlatformConfig(),
    versionNumber: 0,
    history: [],
    errors: [],
    search: '',
    section: '',
  };

  async function refresh() {
    const loaded = await loadPlatformConfig();
    state.config = loaded.config;
    state.savedConfig = normalizePlatformConfig(loaded.config);
    state.versionNumber = loaded.versionNumber;
    state.history = await loadHistory();
    window.CD10PlatformConfig = state.config;
    render();
  }

  function visibleSections() {
    const search = state.search.toLowerCase();
    return PLATFORM_CONFIG_SECTIONS.map((section) => ({
      ...section,
      fields: section.fields.filter((field) => {
        const haystack = `${field.path} ${field.label} ${section.title}`.toLowerCase();
        return (!state.section || section.id === state.section) && (!search || haystack.includes(search));
      }),
    })).filter((section) => section.fields.length);
  }

  function render() {
    const validation = validatePlatformConfig(state.config);
    state.errors = validation.errors;
    const errorsByPath = new Map(state.errors.map((error) => [error.path, error]));
    const summary = configSummary(state.config);
    const changed = diffPlatformConfig(state.savedConfig, state.config);
    container.innerHTML = `
      <div class="config-shell" data-platform-config-root>
        <div class="config-hero">
          <div>
            <div class="control-eyebrow">Centro de Configuracion</div>
            <h2>Comportamiento completo de ClasesDe10</h2>
            <p>Gestiona precios, comisiones, pagos, Bizum, SLAs, matching, IA, notificaciones, perfiles, almacenamiento, SEO, feature flags y estado operativo sin modificar codigo.</p>
          </div>
          <div class="config-actions">
            <button class="btn btn-primary" type="button" data-config-action="save">Guardar cambios</button>
            <button class="btn btn-outline" type="button" data-config-action="export">Exportar JSON</button>
            <button class="btn btn-ghost" type="button" data-config-action="defaults">Restaurar defaults</button>
          </div>
        </div>

        <div class="config-summary-grid">
          <div class="config-summary-card"><strong>${escapeHtml(state.versionNumber || 0)}</strong><span>version activa</span></div>
          <div class="config-summary-card"><strong>${escapeHtml(summary.fields)}</strong><span>parametros</span></div>
          <div class="config-summary-card"><strong>${escapeHtml(summary.enabledFlags)}</strong><span>flags activos</span></div>
          <div class="config-summary-card"><strong>${escapeHtml(summary.commissionPercent)}%</strong><span>comision base</span></div>
          <div class="config-summary-card"><strong>${escapeHtml(summary.maintenanceMode ? 'ON' : 'OFF')}</strong><span>mantenimiento</span></div>
          <div class="config-summary-card"><strong>${escapeHtml(changed.length)}</strong><span>cambios sin guardar</span></div>
        </div>

        ${state.errors.length ? `<div class="alert alert-danger"><span class="alert-icon">!</span><div class="alert-body"><div class="alert-title">Hay ${state.errors.length} error(es) de validacion</div>${state.errors.slice(0, 5).map((error) => escapeHtml(error.message)).join('<br>')}</div></div>` : ''}

        <div class="config-toolbar">
          <input class="form-control" data-config-search placeholder="Buscar ajuste, modulo o campo" value="${escapeHtml(state.search)}">
          <select class="form-control" data-config-section-filter>
            <option value="">Todas las secciones</option>
            ${PLATFORM_CONFIG_SECTIONS.map((section) => `<option value="${escapeHtml(section.id)}" ${state.section === section.id ? 'selected' : ''}>${escapeHtml(section.title)}</option>`).join('')}
          </select>
        </div>

        <form data-config-form class="config-shell">
          ${visibleSections().map((section) => renderSection(section, state.config, errorsByPath)).join('')}
        </form>

        <section class="config-section">
          <div class="config-section-head">
            <div>
              <h3>Historial y control de versiones</h3>
              <p>Cada guardado crea una version con campos modificados, responsable y fecha.</p>
            </div>
            ${badge(`${state.history.length} versiones`, 'gray')}
          </div>
          <div class="card-body">${renderHistory(state.history)}</div>
        </section>
      </div>`;
  }

  async function saveFromForm() {
    let next;
    try {
      next = collectFormConfig(container, state.config);
    } catch (error) {
      showToast('JSON no valido', error.message, 'error');
      return;
    }
    const validation = validatePlatformConfig(next);
    if (!validation.valid) {
      state.config = next;
      state.errors = validation.errors;
      render();
      showToast('Configuracion no valida', 'Corrige los campos marcados antes de guardar.', 'warning');
      return;
    }
    const result = await savePlatformConfig(next, actor);
    await auditConfigChange(actor, result);
    state.config = result.config;
    state.savedConfig = normalizePlatformConfig(result.config);
    state.versionNumber = result.versionNumber;
    state.history = await loadHistory();
    window.CD10PlatformConfig = result.config;
    window.dispatchEvent(new CustomEvent('cd10:platform-config-updated', {
      detail: {
        config: result.config,
        versionNumber: result.versionNumber,
        changes: result.changes,
      },
    }));
    render();
    showToast('Configuracion guardada', `${result.changes.length} campo(s) actualizados.`, 'success');
  }

  container.addEventListener('input', (event) => {
    if (event.target.matches('[data-config-search]')) {
      state.search = event.target.value;
      render();
      return;
    }
    if (event.target.matches('[data-config-path]')) {
      try {
        state.config = collectFormConfig(container, state.config);
      } catch (_) {}
    }
  });

  container.addEventListener('change', (event) => {
    if (event.target.matches('[data-config-section-filter]')) {
      state.section = event.target.value;
      render();
      return;
    }
    if (event.target.matches('[data-config-path]')) {
      try {
        state.config = collectFormConfig(container, state.config);
        render();
      } catch (_) {}
    }
  });

  container.addEventListener('click', async (event) => {
    const action = event.target.closest('[data-config-action]')?.dataset.configAction;
    if (!action) return;
    if (action === 'save') {
      await saveFromForm();
      return;
    }
    if (action === 'export') {
      downloadJson(collectFormConfig(container, state.config));
      showToast('Exportado', 'Configuracion descargada en JSON.', 'success');
      return;
    }
    if (action === 'defaults') {
      if (!window.confirm('Restaurar valores por defecto en pantalla? No se guardaran hasta pulsar Guardar cambios.')) return;
      state.config = normalizePlatformConfig({});
      render();
      showToast('Defaults cargados', 'Revisa y guarda para aplicarlos.', 'info');
    }
  });

  const api = {
    refresh,
    getConfig: () => state.config,
  };
  instances.set(container, api);
  container.innerHTML = '<div class="card"><div class="card-body"><div class="skeleton skeleton-title"></div><div class="skeleton skeleton-text"></div><div class="skeleton skeleton-text" style="width:70%"></div></div></div>';
  await refresh().catch((error) => {
    console.error('No se pudo iniciar configuracion', error);
    container.innerHTML = `<div class="alert alert-danger"><span class="alert-icon">!</span><div class="alert-body"><div class="alert-title">Configuracion no disponible</div>${escapeHtml(error.message || error)}</div></div>`;
  });
  return api;
}
