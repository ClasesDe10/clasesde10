/**
 * ClasesDe10 - Admin AI assistant UI.
 *
 * Admin-only operational assistant backed by structured Firestore reads.
 */

import {
  addDoc,
  collection,
  collectionGroup,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js';
import { firebaseDb } from './firebase-client.js?v=20260627-domain-auth';
import { recordAdminAudit } from './audit-client.js?v=20260628-audit';
import {
  ADMIN_AI_EXAMPLES,
  ADMIN_AI_VERSION,
  answerAdminQuestion,
} from './admin-ai-engine.js?v=20260628-admin-ai';
import { filterAfterClassReset } from './class-reset.js';

const DATA_CACHE_MS = 60 * 1000;
const DATA_SPECS = [
  ['users', 'users', 900],
  ['teachers', 'profesores', 900],
  ['families', 'familias', 900],
  ['students', 'alumnos', 1200],
  ['classes', 'clases', 1600],
  ['requests', 'solicitudes', 1200],
  ['payments', 'pagos', 1600],
  ['incidents', 'incidencias', 900],
  ['documents', 'documentos', 900],
  ['assignments', 'asignaciones', 1200],
  ['requestMatches', 'solicitudMatches', 1200],
  ['matchingRuns', 'matchingRuns', 500],
  ['chats', 'chats', 900],
  ['messages', 'mensajes', 900, true],
  ['notifications', 'notificaciones', 900],
  ['publicLeads', 'leadsPublicos', 700],
  ['platformConfig', 'configuracion', 200],
  ['platformConfigHistory', 'platformConfigHistory', 300],
  ['automationEvents', 'automationEvents', 700],
  ['automationRules', 'automationRules', 500],
  ['automationRuleRuns', 'automationRuleRuns', 700],
  ['auditLogs', 'auditLogs', 1000],
  ['lifecycleEvents', 'classLifecycleEvents', 900],
  ['crmTasks', 'crmTasks', 500],
  ['crmNotes', 'crmNotes', 300],
  ['metricSnapshots', 'metricSnapshots', 250],
  ['opsAlerts', 'opsAlerts', 500],
  ['platformHealthChecks', 'platformHealthChecks', 300],
  ['internalAiInsights', 'internalAiInsights', 500],
];

let cachedData = null;

function clean(value, max = 4000) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').slice(0, max);
}

function escapeHtml(value) {
  return clean(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function badgeTone(value) {
  if (value === 'alta' || value === 'success') return 'success';
  if (value === 'danger') return 'danger';
  if (value === 'warning' || value === 'media') return 'warning';
  return 'info';
}

function orderFieldForCollection(name) {
  if (['users', 'profesores', 'familias', 'chats', 'incidencias', 'platformHealthChecks'].includes(name)) return 'updatedAt';
  if (['experiments', 'experimentsPublic'].includes(name)) return 'updatedAt';
  if (name === 'pagos') return 'dueAt';
  if (name === 'clases') return 'startAtIso';
  if (name === 'systemJobs') return 'runAt';
  return 'createdAt';
}

async function loadCollection(key, name, max, isGroup = false) {
  try {
    const ref = isGroup ? collectionGroup(firebaseDb, name) : collection(firebaseDb, name);
    let snap;
    try {
      snap = await getDocs(query(ref, orderBy(orderFieldForCollection(name), 'desc'), limit(max)));
    } catch (_) {
      snap = await getDocs(query(ref, limit(max)));
    }
    const rows = snap.docs.map((docSnap) => ({
      id: docSnap.id,
      chatId: isGroup ? clean(docSnap.ref.parent.parent?.id) : undefined,
      ...docSnap.data(),
    }));
    return {
      key,
      rows: name === 'clases' ? filterAfterClassReset(rows) : rows,
      truncated: snap.size >= max,
      error: null,
    };
  } catch (error) {
    console.warn(`Admin AI could not load ${name}`, error);
    return { key, rows: [], error: error?.message || String(error) };
  }
}

async function loadAdminAiData(force = false) {
  if (!force && cachedData && cachedData.expiresAt > Date.now()) return cachedData;

  const startedAt = performance.now();
  const results = await Promise.all(DATA_SPECS.map((spec) => loadCollection(...spec)));
  const data = {};
  const errors = [];
  const truncated = [];
  results.forEach((item) => {
    data[item.key] = item.rows;
    if (item.error) errors.push(`${item.key}: ${item.error}`);
    if (item.truncated) truncated.push(item.key);
  });

  cachedData = {
    data,
    errors,
    truncated,
    loadedAt: new Date().toISOString(),
    expiresAt: Date.now() + DATA_CACHE_MS,
    durationMs: Math.round(performance.now() - startedAt),
  };
  return cachedData;
}

async function logAdminAiQuery(actor, question, answer, durationMs) {
  try {
    await addDoc(collection(firebaseDb, 'adminAiQueries'), {
      version: ADMIN_AI_VERSION,
      question: clean(question, 500),
      intent: answer.intent,
      title: answer.title,
      summary: clean(answer.summary, 700),
      rowCount: answer.rows.length,
      confidence: answer.confidence,
      sourceCollections: answer.sourceCollections,
      durationMs,
      actorUid: actor?.uid || actor?.id || '',
      actorEmail: actor?.email || '',
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    console.warn('Admin AI query log failed', error);
  }
}

function renderExamples() {
  return ADMIN_AI_EXAMPLES.map((example) => (
    `<button type="button" class="admin-ai-chip" data-admin-ai-example="${escapeHtml(example)}">${escapeHtml(example)}</button>`
  )).join('');
}

function renderEmpty() {
  return `<div class="admin-ai-empty">
    <div class="empty-state">
      <div class="empty-title">Asistente operativo listo</div>
      <div class="empty-desc">Pregunta por pagos, profesores, familias, incidencias, ciudades, asignaturas o automatizaciones.</div>
    </div>
  </div>`;
}

function renderLoading() {
  return `<div class="admin-ai-loading">
    <div class="skeleton skeleton-title"></div>
    <div class="skeleton skeleton-text"></div>
    <div class="skeleton skeleton-text" style="width:72%"></div>
  </div>`;
}

function renderRows(answer, onNavigateAttr = 'data-admin-ai-nav') {
  if (!answer.rows.length) {
    return '<div class="empty-state"><div class="empty-title">Sin resultados accionables</div><div class="empty-desc">La consulta no encontro elementos que cumplan el criterio.</div></div>';
  }
  return answer.rows.map((item) => `<article class="admin-ai-row ${escapeHtml(item.tone || '')}">
    <div>
      <div class="admin-ai-row-title">${escapeHtml(item.label)}</div>
      <div class="admin-ai-row-detail">${escapeHtml(item.detail)}</div>
    </div>
    <div class="admin-ai-row-side">
      <strong>${escapeHtml(item.metric)}</strong>
      ${item.section ? `<button type="button" class="btn btn-ghost btn-sm" ${onNavigateAttr}="${escapeHtml(item.section)}">Abrir</button>` : ''}
    </div>
  </article>`).join('');
}

function renderAnswer(answer, meta = {}) {
  const sources = answer.sourceCollections.map((item) => `<span class="badge badge-gray">${escapeHtml(item)}</span>`).join(' ');
  const warnings = answer.warnings.length
    ? `<div class="alert alert-warning admin-ai-warning"><span class="alert-icon">!</span><div class="alert-body">${answer.warnings.map(escapeHtml).join(' ')}</div></div>`
    : '';
  const actions = answer.actions.length
    ? `<div class="admin-ai-actions">${answer.actions.map((item) => `<button type="button" class="btn btn-outline btn-sm" data-admin-ai-nav="${escapeHtml(item.section)}">${escapeHtml(item.label)}</button>`).join('')}</div>`
    : '';

  return `<section class="admin-ai-answer" data-admin-ai-answer>
    <div class="admin-ai-answer-head">
      <div>
        <div class="control-eyebrow">Respuesta estructurada</div>
        <h3>${escapeHtml(answer.title)}</h3>
      </div>
      <span class="badge badge-${badgeTone(answer.confidence)}">Confianza ${escapeHtml(answer.confidence)}</span>
    </div>
    <p class="admin-ai-summary">${escapeHtml(answer.summary)}</p>
    ${warnings}
    <div class="admin-ai-rows">${renderRows(answer)}</div>
    ${actions}
    <div class="admin-ai-sources">
      <span>Fuentes</span>
      ${sources}
    </div>
    <div class="admin-ai-meta">
      Datos: ${escapeHtml(meta.loadedAt || answer.generatedAt)} · ${escapeHtml(String(meta.durationMs || 0))} ms · ${escapeHtml(answer.version)}
    </div>
  </section>`;
}

function renderShell(container) {
  container.innerHTML = `<div class="admin-ai" data-admin-ai-root>
    <div class="control-hero admin-ai-hero">
      <div>
        <div class="control-eyebrow">IA exclusiva del administrador</div>
        <h2>Asistente de operaciones ClasesDe10</h2>
        <p>Analiza datos reales de usuarios, clases, pagos, incidencias, mensajes, matching y reputacion con respuestas verificables.</p>
      </div>
      <div class="control-live"><span></span> Modo estructurado gratuito</div>
    </div>

    <form class="admin-ai-form" data-admin-ai-form>
      <textarea class="form-control" rows="3" data-admin-ai-input placeholder="Pregunta algo operativo..."></textarea>
      <div class="admin-ai-form-actions">
        <button type="submit" class="btn btn-primary">Analizar</button>
        <button type="button" class="btn btn-outline" data-admin-ai-refresh>Actualizar datos</button>
        <span class="admin-ai-cache" data-admin-ai-cache>Sin datos cargados</span>
      </div>
    </form>

    <div class="admin-ai-chips">${renderExamples()}</div>
    <div class="admin-ai-output" data-admin-ai-output>${renderEmpty()}</div>
  </div>`;
}

function setCacheLabel(container, meta) {
  const label = container.querySelector('[data-admin-ai-cache]');
  if (!label) return;
  if (!meta) {
    label.textContent = 'Sin datos cargados';
    return;
  }
  const total = Object.values(meta.data || {}).reduce((sum, rows) => sum + (Array.isArray(rows) ? rows.length : 0), 0);
  const suffix = meta.truncated?.length ? ` - muestra limitada: ${meta.truncated.length}` : '';
  label.textContent = `${total} registros - ${meta.durationMs} ms - cache 60s${suffix}`;
}

export function initAdminAiAssistant({ container, onNavigate, actor } = {}) {
  const root = container || document.querySelector('[data-admin-ai-assistant]');
  if (!root || root.dataset.adminAiReady === 'true') return null;
  root.dataset.adminAiReady = 'true';
  renderShell(root);

  const output = root.querySelector('[data-admin-ai-output]');
  const input = root.querySelector('[data-admin-ai-input]');

  async function ask(question, { force = false } = {}) {
    const text = clean(question || input?.value, 500);
    if (!text) {
      output.innerHTML = '<div class="alert alert-warning"><span class="alert-icon">!</span><div class="alert-body">Escribe una pregunta operativa.</div></div>';
      return null;
    }

    const startedAt = performance.now();
    output.innerHTML = renderLoading();
    const meta = await loadAdminAiData(force);
    setCacheLabel(root, meta);
    const answer = answerAdminQuestion(text, meta.data);
    const durationMs = Math.round(performance.now() - startedAt);
    output.innerHTML = renderAnswer(answer, { ...meta, durationMs });
    await logAdminAiQuery(actor, text, answer, durationMs);
    await recordAdminAudit('ai.admin_query_answered', {
      module: 'automation',
      entityType: 'adminAiQueries',
      entityId: answer.intent || 'admin_ai_query',
      description: 'Consulta respondida por el asistente IA del administrador.',
      actor: {
        actorUid: actor?.uid || actor?.id || '',
        actorEmail: actor?.email || '',
        actorRole: actor?.rol || actor?.role || 'admin',
        actorType: 'admin',
      },
      metadata: {
        question: text,
        intent: answer.intent,
        confidence: answer.confidence,
        rowCount: answer.rows.length,
        sourceCollections: answer.sourceCollections,
        durationMs,
        version: ADMIN_AI_VERSION,
      },
    });
    return answer;
  }

  root.querySelector('[data-admin-ai-form]')?.addEventListener('submit', (event) => {
    event.preventDefault();
    ask(input?.value);
  });

  root.querySelector('[data-admin-ai-refresh]')?.addEventListener('click', () => {
    ask(input?.value || ADMIN_AI_EXAMPLES[4], { force: true });
  });

  root.addEventListener('click', (event) => {
    const example = event.target.closest('[data-admin-ai-example]');
    if (example) {
      input.value = example.dataset.adminAiExample || '';
      ask(input.value);
      return;
    }

    const nav = event.target.closest('[data-admin-ai-nav]');
    if (nav && typeof onNavigate === 'function') {
      onNavigate(nav.dataset.adminAiNav);
    }
  });

  window.CD10AdminAI = {
    version: ADMIN_AI_VERSION,
    ask,
    loadData: loadAdminAiData,
    answerAdminQuestion,
  };

  return { ask, loadData: loadAdminAiData };
}
