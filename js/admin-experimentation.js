import {
  collection,
  doc,
  getDocs,
  limit as firestoreLimit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
} from 'https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js';
import { recordAdminAudit } from './audit-client.js?v=20260628-audit';
import {
  EXPERIMENTATION_ENGINE_VERSION,
  buildExperimentResults,
  normalizeExperimentDefinition,
  parseExperimentJson,
  publicExperimentDefinition,
} from './experimentation-engine.js?v=20260628-experiments';

const instances = new WeakMap();
const DEFAULT_VARIANTS = [
  { id: 'control', label: 'Control', weight: 50, enabled: true, config: {} },
  { id: 'variant', label: 'Variante', weight: 50, enabled: true, config: {} },
];

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

function slug(value, max = 120) {
  return clean(value, max).toLowerCase().replace(/[^a-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '');
}

function asArray(value) {
  return clean(value).split(/[,;\n|]/).map((item) => clean(item, 180)).filter(Boolean);
}

function formatPercent(value) {
  return `${new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 }).format(Number(value || 0))}%`;
}

function formatNumber(value) {
  return new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0 }).format(Number(value || 0));
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
  return date ? date.toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' }) : '-';
}

function field(id) {
  return document.getElementById(id);
}

function badge(label, tone = 'gray') {
  return `<span class="badge badge-${tone}">${escapeHtml(label)}</span>`;
}

function injectStyles() {
  if (document.getElementById('admin-experimentation-styles')) return;
  const style = document.createElement('style');
  style.id = 'admin-experimentation-styles';
  style.textContent = `
    .experimentation-shell { display: grid; gap: 16px; min-width: 0; }
    .experiment-hero {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 16px;
      align-items: start;
      padding: 18px;
      border: 1px solid rgba(15,31,61,.10);
      border-radius: 8px;
      background: linear-gradient(135deg, rgba(15,31,61,.055), rgba(29,122,107,.08));
    }
    .experiment-hero h2 { margin: 0 0 6px; color: var(--navy); font-size: 1.28rem; }
    .experiment-hero p { margin: 0; color: var(--gray-mid); line-height: 1.5; max-width: 860px; }
    .experiment-actions { display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
    .experiment-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(240px, 100%), 1fr)); gap: 12px; }
    .experiment-form { display: grid; gap: 12px; }
    .experiment-form-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(220px, 100%), 1fr)); gap: 12px; }
    .experiment-code { font-family: ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace; font-size: .78rem; white-space: pre; }
    .experimentation-shell .config-toggle {
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
    .experimentation-shell .config-toggle input { width: 18px; height: 18px; accent-color: var(--navy); }
    .experiment-mini {
      display: grid;
      gap: 6px;
      padding: 10px;
      border: 1px solid rgba(15,31,61,.08);
      border-radius: 8px;
      background: #fff;
      min-width: 0;
    }
    .experiment-mini strong, .experiment-mini span { min-width: 0; overflow-wrap: anywhere; }
    .experiment-mini span { color: var(--gray-mid); font-size: .78rem; font-weight: 700; }
    .experiment-result-grid { display: grid; gap: 8px; min-width: 0; }
    .experiment-result-row {
      display: grid;
      grid-template-columns: minmax(90px, 1fr) 80px 80px 80px;
      gap: 8px;
      align-items: center;
      font-size: .8rem;
      min-width: 0;
    }
    .experiment-result-track {
      height: 7px;
      overflow: hidden;
      border-radius: 999px;
      background: rgba(15,31,61,.08);
      grid-column: 1 / -1;
    }
    .experiment-result-track span {
      display: block;
      height: 100%;
      border-radius: inherit;
      background: linear-gradient(90deg, var(--teal), var(--gold));
    }
    @media (max-width: 720px) {
      .experiment-hero { grid-template-columns: 1fr; }
      .experiment-actions { justify-content: stretch; }
      .experiment-actions .btn { flex: 1 1 150px; }
      .experiment-result-row { grid-template-columns: 1fr 1fr; }
    }
  `;
  document.head.appendChild(style);
}

async function readCollection(firebaseDb, name, max = 2000) {
  try {
    const snap = await getDocs(query(collection(firebaseDb, name), orderBy('updatedAt', 'desc'), firestoreLimit(max)));
    return snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
  } catch (_) {
    const snap = await getDocs(collection(firebaseDb, name));
    return snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() })).slice(0, max);
  }
}

async function readAnalytics(firebaseDb) {
  try {
    const snap = await getDocs(query(collection(firebaseDb, 'analyticsEvents'), orderBy('createdAt', 'desc'), firestoreLimit(5000)));
    return snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
  } catch (_) {
    return [];
  }
}

function definitionFromForm() {
  const type = field('exp-type').value;
  const key = slug(field('exp-key').value || field('exp-name').value);
  const targeting = {
    roles: asArray(field('exp-roles').value).map((item) => item.toLowerCase()),
    userUids: asArray(field('exp-users').value),
    cities: asArray(field('exp-cities').value),
    includeAdmins: field('exp-include-admins').checked,
    usersNewerThanDays: field('exp-newer-days').value === '' ? null : Number(field('exp-newer-days').value),
    usersOlderThanDays: field('exp-older-days').value === '' ? null : Number(field('exp-older-days').value),
    percentage: Number(field('exp-target-percentage').value || 100),
  };
  const variants = parseExperimentJson(field('exp-variants').value, DEFAULT_VARIANTS);
  const definition = normalizeExperimentDefinition({
    id: key,
    key,
    type,
    name: field('exp-name').value,
    description: field('exp-description').value,
    status: field('exp-status').value,
    enabled: field('exp-status').value === 'active',
    rolloutPercent: Number(field('exp-rollout').value || 100),
    targeting,
    variants,
    metrics: {
      primaryEvent: field('exp-primary-event').value,
      conversionEvent: field('exp-conversion-event').value,
      guardrailEvent: field('exp-guardrail-event').value,
    },
  });
  if (!definition.key) throw new Error('La clave del experimento es obligatoria.');
  if (!definition.name) throw new Error('El nombre del experimento es obligatorio.');
  if (!Array.isArray(variants) || !variants.length) throw new Error('Las variantes deben ser un array JSON con al menos una variante.');
  return definition;
}

function fillForm(definition = {}) {
  const normalized = normalizeExperimentDefinition(definition);
  field('exp-type').value = normalized.type;
  field('exp-key').value = normalized.key;
  field('exp-name').value = normalized.name;
  field('exp-description').value = normalized.description;
  field('exp-status').value = normalized.status;
  field('exp-rollout').value = normalized.rolloutPercent;
  field('exp-target-percentage').value = normalized.targeting.percentage;
  field('exp-roles').value = normalized.targeting.roles.join(', ');
  field('exp-users').value = normalized.targeting.userUids.join(', ');
  field('exp-cities').value = normalized.targeting.cities.join(', ');
  field('exp-include-admins').checked = normalized.targeting.includeAdmins !== false;
  field('exp-newer-days').value = normalized.targeting.usersNewerThanDays ?? '';
  field('exp-older-days').value = normalized.targeting.usersOlderThanDays ?? '';
  field('exp-primary-event').value = normalized.metrics.primaryEvent;
  field('exp-conversion-event').value = normalized.metrics.conversionEvent;
  field('exp-guardrail-event').value = normalized.metrics.guardrailEvent;
  field('exp-variants').value = JSON.stringify(normalized.variants, null, 2);
}

function emptyDefinition() {
  return {
    id: '',
    key: '',
    type: 'experiment',
    name: '',
    description: '',
    status: 'draft',
    rolloutPercent: 100,
    targeting: { percentage: 100, includeAdmins: true },
    variants: DEFAULT_VARIANTS,
    metrics: {
      primaryEvent: 'form.submitted',
      conversionEvent: 'request.created',
      guardrailEvent: 'form.error',
    },
  };
}

function statusTone(status) {
  if (status === 'active') return 'success';
  if (status === 'paused') return 'warning';
  if (status === 'completed') return 'teal';
  if (status === 'archived') return 'gray';
  return 'gray';
}

function renderResultSummary(result) {
  if (!result?.variants?.length) return '<span style="color:var(--gray-mid)">Sin datos</span>';
  const max = Math.max(...result.variants.map((row) => row.exposures), 1);
  return `<div class="experiment-result-grid">${result.variants.map((row) => `
    <div class="experiment-result-row">
      <strong>${escapeHtml(row.label)}</strong>
      <span>${formatNumber(row.exposures)} exp.</span>
      <span>${formatPercent(row.conversionPct)} conv.</span>
      <span>${row.liftPct ? `${formatPercent(row.liftPct)} lift` : '-'}</span>
      <div class="experiment-result-track"><span style="width:${Math.round((row.exposures / max) * 100)}%"></span></div>
    </div>`).join('')}</div>`;
}

export async function initAdminExperimentation({
  container,
  firebaseDb,
  actor = {},
  showToast = () => {},
  exportarCSV,
  debounce = (fn) => fn,
} = {}) {
  if (!container || !firebaseDb) return null;
  if (instances.has(container)) {
    const api = instances.get(container);
    await api.refresh();
    return api;
  }
  injectStyles();

  const state = {
    definitions: [],
    events: [],
    results: [],
    search: '',
    status: '',
    type: '',
  };

  function filteredDefinitions() {
    const text = state.search.toLowerCase();
    return state.definitions.filter((definition) => {
      if (state.status && definition.status !== state.status) return false;
      if (state.type && definition.type !== state.type) return false;
      const haystack = `${definition.key} ${definition.name} ${definition.description} ${definition.status} ${definition.type}`.toLowerCase();
      return !text || haystack.includes(text);
    });
  }

  function resultFor(definition) {
    return state.results.find((item) => item.key === definition.key);
  }

  function renderSummary() {
    const active = state.definitions.filter((item) => item.status === 'active');
    const experiments = state.definitions.filter((item) => item.type === 'experiment');
    const flags = state.definitions.filter((item) => item.type === 'flag');
    const exposures = state.results.reduce((sum, item) => sum + item.totalExposures, 0);
    const winnerCandidates = state.results.filter((item) => item.winner && item.winner.variantId !== 'control').length;
    return `
      <div class="experiment-grid">
        <div class="stat-card"><div class="stat-card-label">Activos</div><div class="stat-card-value">${formatNumber(active.length)}</div><div class="stat-card-change positive">flags y tests</div></div>
        <div class="stat-card"><div class="stat-card-label">Experimentos</div><div class="stat-card-value">${formatNumber(experiments.length)}</div><div class="stat-card-change positive">A/B configurados</div></div>
        <div class="stat-card"><div class="stat-card-label">Feature flags</div><div class="stat-card-value">${formatNumber(flags.length)}</div><div class="stat-card-change positive">rollouts controlados</div></div>
        <div class="stat-card"><div class="stat-card-label">Exposiciones</div><div class="stat-card-value">${formatNumber(exposures)}</div><div class="stat-card-change ${exposures ? 'positive' : 'neutral'}">analyticsEvents</div></div>
        <div class="stat-card"><div class="stat-card-label">Ganadores posibles</div><div class="stat-card-value">${formatNumber(winnerCandidates)}</div><div class="stat-card-change ${winnerCandidates ? 'positive' : 'neutral'}">con muestra suficiente</div></div>
      </div>`;
  }

  function renderDefinitionRows() {
    const items = filteredDefinitions();
    if (!items.length) {
      return '<tr><td colspan="9" style="text-align:center;padding:32px;color:var(--gray-mid)">Sin flags o experimentos con estos filtros.</td></tr>';
    }
    return items.map((definition) => {
      const result = resultFor(definition);
      const target = definition.targeting || {};
      return `<tr>
        <td data-label="Clave"><strong>${escapeHtml(definition.name)}</strong><br><span style="font-size:.75rem;color:var(--gray-mid)">${escapeHtml(definition.key)}</span></td>
        <td data-label="Tipo">${badge(definition.type === 'flag' ? 'Flag' : 'A/B', definition.type === 'flag' ? 'teal' : 'gold')}</td>
        <td data-label="Estado">${badge(definition.status, statusTone(definition.status))}</td>
        <td data-label="Rollout">${formatPercent(definition.rolloutPercent)}<br><span style="font-size:.75rem;color:var(--gray-mid)">target ${formatPercent(target.percentage ?? 100)}</span></td>
        <td data-label="Segmento"><span style="font-size:.78rem">${escapeHtml([
          target.roles?.length ? `roles: ${target.roles.join(', ')}` : '',
          target.cities?.length ? `zonas: ${target.cities.join(', ')}` : '',
          target.userUids?.length ? `${target.userUids.length} usuarios` : '',
          target.usersNewerThanDays !== null && target.usersNewerThanDays !== undefined ? `nuevos <= ${target.usersNewerThanDays}d` : '',
          target.usersOlderThanDays !== null && target.usersOlderThanDays !== undefined ? `antiguos >= ${target.usersOlderThanDays}d` : '',
        ].filter(Boolean).join(' / ') || 'Todos')}</span></td>
        <td data-label="Metricas"><span style="font-size:.78rem">${escapeHtml(definition.metrics.conversionEvent)}<br>guardrail: ${escapeHtml(definition.metrics.guardrailEvent)}</span></td>
        <td data-label="Resultados">${renderResultSummary(result)}</td>
        <td data-label="Recomendacion"><span style="font-size:.78rem">${escapeHtml(result?.recommendation || 'Sin datos suficientes.')}</span></td>
        <td data-label="Acciones">
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            <button class="btn btn-ghost btn-sm" data-exp-action="edit" data-exp-id="${escapeHtml(definition.id)}">Editar</button>
            <button class="btn btn-outline btn-sm" data-exp-action="${definition.status === 'active' ? 'pause' : 'activate'}" data-exp-id="${escapeHtml(definition.id)}">${definition.status === 'active' ? 'Pausar' : 'Activar'}</button>
          </div>
        </td>
      </tr>`;
    }).join('');
  }

  function render() {
    container.innerHTML = `
      <div class="experimentation-shell">
        <div class="experiment-hero">
          <div>
            <div class="control-eyebrow">Experimentacion continua</div>
            <h2>Feature flags, A/B testing y rollouts controlados</h2>
            <p>Activa funcionalidades por rol, usuario, zona o porcentaje y compara conversion, abandono y guardrails usando la analitica first-party de ClasesDe10.</p>
          </div>
          <div class="experiment-actions">
            <button class="btn btn-primary" data-exp-action="new">Nuevo experimento</button>
            <button class="btn btn-outline" data-exp-action="refresh">Actualizar</button>
            <button class="btn btn-ghost" data-exp-action="export">Exportar resultados</button>
          </div>
        </div>

        ${renderSummary()}

        <div class="card">
          <div class="card-header"><span class="card-title">Crear o editar</span></div>
          <div class="card-body">
            <form class="experiment-form" data-exp-form>
              <div class="experiment-form-grid">
                <div class="form-group"><label class="form-label">Tipo</label><select id="exp-type" class="form-control"><option value="experiment">Experimento A/B</option><option value="flag">Feature flag</option></select></div>
                <div class="form-group"><label class="form-label">Clave tecnica</label><input id="exp-key" class="form-control" placeholder="nuevo_formulario_familias"></div>
                <div class="form-group"><label class="form-label">Nombre</label><input id="exp-name" class="form-control" placeholder="Nuevo formulario familias"></div>
                <div class="form-group"><label class="form-label">Estado</label><select id="exp-status" class="form-control"><option value="draft">draft</option><option value="active">active</option><option value="paused">paused</option><option value="completed">completed</option><option value="archived">archived</option></select></div>
                <div class="form-group"><label class="form-label">Rollout general (%)</label><input id="exp-rollout" class="form-control" type="number" min="0" max="100" step="1"></div>
                <div class="form-group"><label class="form-label">Porcentaje del segmento (%)</label><input id="exp-target-percentage" class="form-control" type="number" min="0" max="100" step="1"></div>
              </div>
              <div class="form-group"><label class="form-label">Descripcion / hipotesis</label><textarea id="exp-description" class="form-control" rows="2" placeholder="Que queremos aprender y por que"></textarea></div>
              <div class="experiment-form-grid">
                <div class="form-group"><label class="form-label">Roles incluidos</label><input id="exp-roles" class="form-control" placeholder="admin, profesor, familia"></div>
                <div class="form-group"><label class="form-label">Usuarios concretos</label><textarea id="exp-users" class="form-control" rows="2" placeholder="uid1, uid2"></textarea></div>
                <div class="form-group"><label class="form-label">Ciudades / zonas</label><input id="exp-cities" class="form-control" placeholder="Madrid, Valencia"></div>
                <div class="form-group"><label class="form-label">Usuarios nuevos <= dias</label><input id="exp-newer-days" class="form-control" type="number" min="0" step="1" placeholder="7"></div>
                <div class="form-group"><label class="form-label">Usuarios antiguos >= dias</label><input id="exp-older-days" class="form-control" type="number" min="0" step="1" placeholder="30"></div>
                <label class="config-toggle" style="align-self:end"><input id="exp-include-admins" type="checkbox"> <span>Incluir admins</span></label>
              </div>
              <div class="experiment-form-grid">
                <div class="form-group"><label class="form-label">Evento primario</label><input id="exp-primary-event" class="form-control" placeholder="form.submitted"></div>
                <div class="form-group"><label class="form-label">Evento conversion</label><input id="exp-conversion-event" class="form-control" placeholder="request.created"></div>
                <div class="form-group"><label class="form-label">Evento guardrail</label><input id="exp-guardrail-event" class="form-control" placeholder="form.error"></div>
              </div>
              <div class="form-group"><label class="form-label">Variantes JSON</label><textarea id="exp-variants" class="form-control experiment-code" rows="8" spellcheck="false"></textarea></div>
              <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end">
                <button class="btn btn-ghost" type="button" data-exp-action="reset-form">Limpiar</button>
                <button class="btn btn-primary" type="submit">Guardar y publicar</button>
              </div>
            </form>
          </div>
        </div>

        <div class="card">
          <div class="card-header">
            <span class="card-title">Experimentos y flags</span>
            <div style="display:flex;gap:8px;flex-wrap:wrap">
              <input id="exp-search" class="form-control" style="width:220px" placeholder="Buscar">
              <select id="exp-filter-status" class="form-control" style="width:150px"><option value="">Estados</option><option value="active">Activos</option><option value="draft">Draft</option><option value="paused">Pausados</option><option value="completed">Completados</option><option value="archived">Archivados</option></select>
              <select id="exp-filter-type" class="form-control" style="width:150px"><option value="">Tipos</option><option value="experiment">A/B</option><option value="flag">Flags</option></select>
            </div>
          </div>
          <div class="table-wrapper">
            <table class="responsive-card-table">
              <thead><tr><th>Clave</th><th>Tipo</th><th>Estado</th><th>Rollout</th><th>Segmento</th><th>Metricas</th><th>Resultados</th><th>Recomendacion</th><th>Acciones</th></tr></thead>
              <tbody id="tbody-experiments">${renderDefinitionRows()}</tbody>
            </table>
          </div>
        </div>
      </div>`;
    fillForm(emptyDefinition());
  }

  async function refresh() {
    const [definitions, events] = await Promise.all([
      readCollection(firebaseDb, 'experiments', 500),
      readAnalytics(firebaseDb),
    ]);
    state.definitions = definitions.map(normalizeExperimentDefinition)
      .sort((a, b) => (a.status === 'active' ? -1 : 0) - (b.status === 'active' ? -1 : 0) || a.name.localeCompare(b.name));
    state.events = events;
    state.results = buildExperimentResults(state.definitions, state.events, { minSampleSize: 20 });
    render();
  }

  async function saveDefinition(definition) {
    const privatePayload = {
      ...definition,
      enabled: definition.status === 'active',
      engineVersion: EXPERIMENTATION_ENGINE_VERSION,
      updatedAt: serverTimestamp(),
      updated_at: new Date().toISOString(),
      updatedByUid: actor.uid || actor.id || '',
      updatedByEmail: actor.email || '',
      createdAt: definition.createdAt || serverTimestamp(),
      created_at: definition.created_at || new Date().toISOString(),
    };
    const publicPayload = {
      ...publicExperimentDefinition(definition),
      updatedAt: serverTimestamp(),
      updated_at: new Date().toISOString(),
    };
    await Promise.all([
      setDoc(doc(firebaseDb, 'experiments', definition.id), privatePayload, { merge: true }),
      setDoc(doc(firebaseDb, 'experimentsPublic', definition.id), publicPayload, { merge: true }),
    ]);
    await recordAdminAudit('experiment.updated', {
      module: 'configuration',
      entityType: 'experiments',
      entityId: definition.id,
      description: `${definition.type === 'flag' ? 'Feature flag' : 'Experimento'} ${definition.key} actualizado.`,
      actor: {
        actorUid: actor.uid || actor.id || '',
        actorEmail: actor.email || '',
        actorRole: actor.role || actor.rol || 'admin',
        actorType: 'admin',
      },
      metadata: {
        status: definition.status,
        rolloutPercent: definition.rolloutPercent,
        type: definition.type,
        engineVersion: EXPERIMENTATION_ENGINE_VERSION,
      },
    }).catch(() => {});
  }

  container.addEventListener('submit', async (event) => {
    if (!event.target.matches('[data-exp-form]')) return;
    event.preventDefault();
    try {
      const definition = definitionFromForm();
      await saveDefinition(definition);
      showToast('Experimento guardado', `${definition.key} esta publicado para runtime.`, 'success');
      await refresh();
    } catch (error) {
      showToast('No se pudo guardar', error.message || String(error), 'error');
    }
  });

  container.addEventListener('input', debounce((event) => {
    if (event.target.id === 'exp-search') {
      state.search = event.target.value;
      field('tbody-experiments').innerHTML = renderDefinitionRows();
    }
  }, 180));

  container.addEventListener('change', (event) => {
    if (event.target.id === 'exp-filter-status') {
      state.status = event.target.value;
      field('tbody-experiments').innerHTML = renderDefinitionRows();
    }
    if (event.target.id === 'exp-filter-type') {
      state.type = event.target.value;
      field('tbody-experiments').innerHTML = renderDefinitionRows();
    }
  });

  container.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-exp-action]');
    if (!button) return;
    const action = button.dataset.expAction;
    const id = button.dataset.expId;
    const existing = state.definitions.find((item) => item.id === id);
    if (action === 'new' || action === 'reset-form') {
      fillForm(emptyDefinition());
      field('exp-name')?.focus();
      return;
    }
    if (action === 'refresh') {
      await refresh();
      showToast('Experimentos actualizados', 'Datos recargados desde Firebase.', 'success');
      return;
    }
    if (action === 'export') {
      const rows = state.results.flatMap((result) => result.variants.map((variant) => ({
        experimento: result.key,
        nombre: result.name,
        estado: result.status,
        variante: variant.variantId,
        exposiciones: variant.exposures,
        conversiones: variant.conversions,
        conversion_pct: variant.conversionPct,
        lift_pct: variant.liftPct,
        recomendacion: result.recommendation,
      })));
      exportarCSV?.(rows, `experimentos_clasesde10_${new Date().toISOString().slice(0, 10)}.csv`, [
        { campo: 'experimento', titulo: 'Experimento' },
        { campo: 'nombre', titulo: 'Nombre' },
        { campo: 'estado', titulo: 'Estado' },
        { campo: 'variante', titulo: 'Variante' },
        { campo: 'exposiciones', titulo: 'Exposiciones' },
        { campo: 'conversiones', titulo: 'Conversiones' },
        { campo: 'conversion_pct', titulo: 'Conversion %' },
        { campo: 'lift_pct', titulo: 'Lift %' },
        { campo: 'recomendacion', titulo: 'Recomendacion' },
      ]);
      return;
    }
    if (!existing) return;
    if (action === 'edit') {
      fillForm(existing);
      field('exp-name')?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      return;
    }
    if (action === 'activate' || action === 'pause') {
      const next = normalizeExperimentDefinition({
        ...existing,
        status: action === 'activate' ? 'active' : 'paused',
        enabled: action === 'activate',
      });
      await saveDefinition(next);
      showToast(action === 'activate' ? 'Activado' : 'Pausado', next.key, 'success');
      await refresh();
    }
  });

  const api = { refresh };
  instances.set(container, api);
  container.innerHTML = '<div class="card"><div class="card-body"><div class="skeleton skeleton-title"></div><div class="skeleton skeleton-text"></div><div class="skeleton skeleton-text" style="width:70%"></div></div></div>';
  await refresh().catch((error) => {
    container.innerHTML = `<div class="alert alert-danger"><span class="alert-icon">!</span><div class="alert-body"><div class="alert-title">Experimentacion no disponible</div>${escapeHtml(error.message || error)}</div></div>`;
  });
  return api;
}

export default { initAdminExperimentation };
