import {
  INCIDENT_CATEGORIES,
  buildIncidentCreatePayload,
  buildIncidentResolutionGuide,
  buildIncidentStats,
  buildIncidentUpdatePatch,
  incidentPriorityMeta,
  normalizeIncident,
} from './incident-engine.js?v=20260707-guided-incidents';

const instances = new WeakMap();

function clean(value, max = 2000) {
  return String(value ?? '').trim().slice(0, max);
}

function field(id) {
  return document.getElementById(id);
}

function optionLabel(value) {
  return clean(value).replaceAll('_', ' ');
}

function safeText(sanitize, value) {
  return sanitize(value === 0 ? '0' : value);
}

export async function initAdminIncidents({
  section,
  db,
  usuario,
  platformConfig = {},
  showToast,
  openModal,
  closeModal,
  exportarCSV,
  sanitize,
  debounce,
  crmDate,
  crmDateShort,
  crmBadge,
  recordAdminAudit,
  renderPerson = null,
} = {}) {
  if (!section || !db) return null;
  if (instances.has(section)) {
    const api = instances.get(section);
    await api.refresh();
    return api;
  }

  let incidents = [];
  let activeGuide = null;

  function ensureFilters() {
    const categorySelect = field('filtro-inc-categoria');
    if (categorySelect && categorySelect.options.length <= 1) {
      INCIDENT_CATEGORIES.forEach((item) => categorySelect.insertAdjacentHTML('beforeend', `<option value="${sanitize(item)}">${sanitize(optionLabel(item))}</option>`));
    }
    const modalCategory = field('inc-categoria');
    if (modalCategory && modalCategory.options.length === 0) {
      INCIDENT_CATEGORIES.forEach((item) => modalCategory.insertAdjacentHTML('beforeend', `<option value="${sanitize(item)}">${sanitize(optionLabel(item))}</option>`));
    }
  }

  function filters() {
    return {
      search: clean(field('filtro-inc-busqueda')?.value).toLowerCase(),
      estado: clean(field('filtro-inc-estado')?.value),
      prioridad: clean(field('filtro-inc-prioridad')?.value),
      categoria: clean(field('filtro-inc-categoria')?.value),
      responsable: clean(field('filtro-inc-responsable')?.value),
    };
  }

  function searchText(item = {}) {
    return [
      item.ticketId, item.titulo, item.descripcion, item.categoria, item.prioridad,
      item.estado, item.assignedAdminEmail, item.reportado_por, item.userUid,
      item.teacherUid, item.familyUid, item.classId, item.paymentId, item.documentId,
      item.rootCause, item.resolution,
    ].join(' ').toLowerCase();
  }

  function matches(item, activeFilters) {
    if (activeFilters.search && !searchText(item).includes(activeFilters.search)) return false;
    if (activeFilters.estado && item.estado !== activeFilters.estado) return false;
    if (activeFilters.prioridad && item.prioridad !== activeFilters.prioridad) return false;
    if (activeFilters.categoria && item.categoria !== activeFilters.categoria) return false;
    if (activeFilters.responsable === 'sin_responsable' && item.assignedAdminEmail) return false;
    if (activeFilters.responsable === 'mias' && item.assignedAdminEmail !== usuario.email) return false;
    return true;
  }

  function slaBadge(item) {
    if (['resuelta', 'cerrada'].includes(item.estado)) return crmBadge('resuelta');
    if (item.isOverdue) return '<span class="badge badge-danger">SLA vencido</span>';
    return '<span class="badge badge-warning">SLA activo</span>';
  }

  function relatedSummary(item) {
    if (renderPerson) {
      const people = [];
      if (item.familyUid) people.push(renderPerson({ role: 'familia', id: item.familyUid, source: item, compact: true }));
      if (item.teacherUid) people.push(renderPerson({ role: 'profesor', id: item.teacherUid, source: item, compact: true }));
      if (item.studentId || item.alumno_id) people.push(renderPerson({ role: 'alumno', id: item.studentId || item.alumno_id, source: item, compact: true }));
      if (people.length) return `<div class="incident-related-people">${people.join('')}</div>`;
    }
    const parts = [
      item.classId ? `Clase ${item.classId}` : '',
      item.paymentId ? `Pago ${item.paymentId}` : '',
      item.documentId ? `Doc ${item.documentId}` : '',
      item.teacherUid ? `Prof ${item.teacherUid}` : '',
      item.familyUid ? `Fam ${item.familyUid}` : '',
    ].filter(Boolean);
    return parts.length ? parts.slice(0, 3).map(sanitize).join('<br>') : '<span style="color:var(--gray-mid)">Sin relacion</span>';
  }

  function renderSummary(stats) {
    const grid = field('incidents-summary-grid');
    if (!grid) return;
    grid.innerHTML = [
      { label: 'Por resolver', value: stats.open, tone: stats.open > 0 ? 'warning' : 'success', hint: stats.open > 0 ? 'requiere decision' : 'al dia' },
      { label: 'Urgentes', value: stats.critical, tone: stats.critical > 0 ? 'danger' : 'success', hint: stats.critical > 0 ? 'prioridad maxima' : 'sin urgencias' },
      { label: 'Fuera de plazo', value: stats.overdue, tone: stats.overdue > 0 ? 'danger' : 'success', hint: stats.overdue > 0 ? 'resolver primero' : 'SLA controlado' },
    ].map((item) => `
      <div class="stat-card">
        <div class="stat-card-label">${sanitize(item.label)}</div>
        <div class="stat-card-value">${safeText(sanitize, item.value)}</div>
        <div class="stat-card-change ${item.tone === 'danger' || item.tone === 'warning' ? 'negative' : 'positive'}">${sanitize(item.hint)}</div>
      </div>
    `).join('');
  }

  function renderPatterns(stats) {
    const target = field('incidents-patterns');
    if (!target) return;
    const card = field('incidents-patterns-card');
    if (card) card.style.display = 'none';
    target.innerHTML = '';
  }

  function rowGuide(item = {}) {
    return buildIncidentResolutionGuide(item, { config: platformConfig });
  }

  function render() {
    ensureFilters();
    const stats = buildIncidentStats(incidents, { config: platformConfig });
    renderSummary(stats);
    renderPatterns(stats);
    const activeFilters = filters();
    const filtered = incidents.filter((item) => matches(item, activeFilters));
    const tbody = field('tbody-incidencias');
    if (!tbody) return;
    const tableHead = tbody.closest('table')?.querySelector('thead');
    if (tableHead) {
      tableHead.innerHTML = `<tr>
        <th>Prioridad</th>
        <th>Problema</th>
        <th>Personas relacionadas</th>
        <th>Motivo probable</th>
        <th>Accion recomendada</th>
        <th>Estado</th>
        <th>Acciones</th>
      </tr>`;
    }
    if (!filtered.length) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:32px;color:var(--gray-mid)">Sin incidencias con estos filtros.</td></tr>';
    } else {
      tbody.innerHTML = filtered.map((item) => {
        const guide = rowGuide(item);
        const cause = item.rootCause || guide.suggestedCause || guide.possibleCauses?.[0] || 'Pendiente de revisar contexto.';
        const action = item.actionTaken || guide.suggestedAction || guide.suggestedActions?.[0] || 'Abrir y seguir la guia.';
        return `<tr class="incident-simple-row ${item.isOverdue ? 'is-overdue' : ''}">
        <td>${crmBadge(item.prioridad)}</td>
        <td style="max-width:340px">
          <strong>${sanitize(item.titulo)}</strong>
          <div class="incident-simple-meta">${sanitize(item.ticketId)} · ${sanitize(crmDateShort(item.createdAt))} · ${sanitize(optionLabel(item.categoria))}</div>
          <div class="incident-simple-desc" title="${sanitize(item.descripcion)}">${sanitize(item.descripcion || 'Sin descripcion')}</div>
        </td>
        <td>${relatedSummary(item)}</td>
        <td class="incident-simple-text">${sanitize(cause)}</td>
        <td class="incident-simple-text">${sanitize(action)}</td>
        <td>${crmBadge(item.estado)}</td>
        <td>
          <button class="btn btn-primary btn-sm" data-action="gestionar-inc" data-incident-fix-button="true" data-inc-id="${sanitize(item.id)}">Arreglar</button>
        </td>
      </tr>`;
      }).join('');
    }
    const count = field('incidents-count');
    if (count) count.textContent = `${filtered.length} de ${incidents.length} tickets`;
    const badge = field('badge-incidencias');
    if (badge) {
      badge.textContent = String(stats.open);
      badge.style.display = stats.open ? '' : 'none';
    }
  }

  async function refresh() {
    ensureFilters();
    const { data, error } = await db.from('incidencias').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    incidents = (data || []).map((item) => normalizeIncident(item, { config: platformConfig }))
      .sort((a, b) => (Number(a.priorityRank || 9) - Number(b.priorityRank || 9)) || ((crmDate(b.createdAt) || '').localeCompare(crmDate(a.createdAt) || '')));
    render();
  }

  function renderHistory(item = {}) {
    const rows = [
      ...(item.history || []),
      ...(item.conversations || []).map((msg) => ({ at: msg.at, action: 'nota', actorEmail: msg.authorEmail, note: msg.body })),
    ].sort((a, b) => (crmDate(b.at) || '').localeCompare(crmDate(a.at) || ''));
    return rows.length
      ? rows.slice(0, 20).map((row) => `<div style="padding:8px 0;border-bottom:1px solid rgba(15,31,61,.08)"><strong>${sanitize(row.action || 'evento')}</strong> - ${sanitize(crmDateShort(row.at))}<br><span>${sanitize(row.actorEmail || row.actorUid || 'sistema')}</span><br><span style="color:var(--gray-mid)">${sanitize(row.note || '')}</span></div>`).join('')
      : '<div style="color:var(--gray-mid)">Sin historial todavia.</div>';
  }

  function renderList(items = [], className = '') {
    return items.length
      ? `<ul class="${className}">${items.map((item) => `<li>${sanitize(item)}</li>`).join('')}</ul>`
      : '<div class="incident-guide-empty">Pendiente de completar con mas contexto.</div>';
  }

  function renderGuide(item = {}) {
    activeGuide = buildIncidentResolutionGuide(item, { config: platformConfig });
    return `
      <div class="incident-guide">
        <div class="incident-guide-head">
          <div>
            <span class="incident-guide-kicker">Guia rapida</span>
            <h3>${sanitize(activeGuide.title)}</h3>
            <p>Problema, motivo probable y siguiente accion clara para resolver sin ruido.</p>
          </div>
          <button type="button" class="btn btn-primary btn-sm" data-incident-guide-action="apply-plan">Arreglar con este plan</button>
        </div>
        <div class="incident-guide-grid">
          <section class="incident-guide-block">
            <h4>Posibles motivos</h4>
            ${renderList(activeGuide.possibleCauses)}
            <button type="button" class="btn btn-outline btn-sm" data-incident-guide-action="apply-cause">Usar causa probable</button>
          </section>
          <section class="incident-guide-block">
            <h4>Comprobacion minima</h4>
            ${renderList(activeGuide.checks)}
          </section>
          <section class="incident-guide-block incident-guide-block-primary">
            <h4>Que hago ahora</h4>
            ${renderList(activeGuide.suggestedActions)}
            <div class="incident-guide-actions">
              <button type="button" class="btn btn-primary btn-sm" data-incident-guide-action="apply-plan">Usar plan</button>
              <button type="button" class="btn btn-outline btn-sm" data-incident-guide-action="set-next-status">Pasar a siguiente estado</button>
            </div>
          </section>
          <section class="incident-guide-block">
            <h4>Resultado esperado</h4>
            <p>${sanitize(activeGuide.suggestedResolution)}</p>
            <div class="incident-guide-actions">
              <button type="button" class="btn btn-outline btn-sm" data-incident-guide-action="apply-resolution">Rellenar resolucion</button>
              <button type="button" class="btn btn-success btn-sm" data-incident-guide-action="resolve-now">Marcar resuelta</button>
            </div>
          </section>
        </div>
        <div class="incident-guide-footer">
          <strong>Mensaje cordial sugerido</strong>
          <span>${sanitize(activeGuide.userMessage)}</span>
          <button type="button" class="btn btn-ghost btn-sm" data-incident-guide-action="apply-message">Usar mensaje</button>
        </div>
      </div>
    `;
  }

  function applyGuideAction(action) {
    if (!activeGuide) return;
    if (action === 'apply-cause') {
      field('inc-causa').value = activeGuide.suggestedCause || '';
    }
    if (action === 'apply-plan') {
      field('inc-accion').value = activeGuide.suggestedAction || '';
      field('inc-mensaje').value = activeGuide.internalNote || '';
    }
    if (action === 'apply-resolution') {
      field('inc-resolucion').value = activeGuide.suggestedResolution || '';
    }
    if (action === 'apply-message') {
      field('inc-mensaje').value = activeGuide.userMessage || '';
    }
    if (action === 'set-next-status') {
      field('inc-estado').value = activeGuide.nextStatus || field('inc-estado').value;
    }
    if (action === 'assign-me') {
      field('inc-responsable-email').value = usuario.email || '';
    }
    if (action === 'resolve-now') {
      field('inc-estado').value = 'resuelta';
      if (!field('inc-causa').value) field('inc-causa').value = activeGuide.suggestedCause || '';
      if (!field('inc-accion').value) field('inc-accion').value = activeGuide.suggestedAction || '';
      if (!field('inc-resolucion').value) field('inc-resolucion').value = activeGuide.suggestedResolution || '';
    }
  }

  function openIncident(source) {
    ensureFilters();
    const incidentId = source?.incId || source?.id || source?.incidenciaId || '';
    const existing = incidentId ? incidents.find((item) => item.id === incidentId) : null;
    const item = normalizeIncident(existing || {
      titulo: 'Nueva incidencia',
      descripcion: '',
      categoria: 'operativa',
      prioridad: 'media',
      estado: 'abierta',
      assignedAdminEmail: usuario.email || '',
    }, { config: platformConfig });
    field('inc-id').value = existing?.id || '';
    field('inc-ticket-meta').innerHTML = `
      <div class="stat-card"><div class="stat-card-label">Ticket</div><div class="stat-card-value" style="font-size:1rem">${sanitize(item.ticketId)}</div></div>
      <div class="stat-card"><div class="stat-card-label">SLA</div><div class="stat-card-value" style="font-size:1rem">${sanitize(crmDateShort(item.slaDueAt))}</div></div>
      <div class="stat-card"><div class="stat-card-label">Origen</div><div class="stat-card-value" style="font-size:1rem">${sanitize(item.source || 'manual')}</div></div>
      <button type="button" class="btn btn-outline btn-sm incident-assign-btn" data-incident-guide-action="assign-me">Asignarmela</button>
      <div class="incident-related-people">${relatedSummary(item)}</div>`;
    field('inc-desc').innerHTML = existing
      ? `<strong>${sanitize(item.titulo)}</strong><br>${sanitize(item.descripcion || 'Sin descripcion')}`
      : '<input class="form-control" id="inc-new-title" placeholder="Titulo de la incidencia" style="margin-bottom:8px"><textarea class="form-control" id="inc-new-description" rows="3" placeholder="Descripcion detallada"></textarea>';
    const guideTarget = field('inc-ai-guide');
    if (guideTarget) guideTarget.innerHTML = renderGuide(item);
    field('inc-categoria').value = item.categoria;
    field('inc-estado').value = item.estado;
    field('inc-prioridad').value = item.prioridad;
    field('inc-responsable-email').value = item.assignedAdminEmail || '';
    field('inc-causa').value = item.rootCause || '';
    field('inc-accion').value = '';
    field('inc-mensaje').value = '';
    field('inc-adjunto-nombre').value = '';
    field('inc-adjunto-url').value = '';
    field('inc-resolucion').value = item.resolution || item.resolucion || '';
    field('inc-historial').innerHTML = renderHistory(item);
    openModal('modal-incidencia');
  }

  async function saveIncident(event) {
    event.preventDefault();
    event.stopImmediatePropagation();
    const id = field('inc-id').value;
    const existing = id ? incidents.find((item) => item.id === id) : null;
    const actor = { uid: usuario.uid || usuario.id || '', email: usuario.email || '', role: 'admin' };
    const responsibleEmail = clean(field('inc-responsable-email').value, 180);
    const resolution = clean(field('inc-resolucion').value, 4000);
    const changes = {
      titulo: clean(field('inc-new-title')?.value || existing?.titulo || 'Incidencia', 180),
      descripcion: clean(field('inc-new-description')?.value || existing?.descripcion || '', 4000),
      estado: field('inc-estado').value,
      prioridad: field('inc-prioridad').value,
      categoria: field('inc-categoria').value,
      assignedAdminEmail: responsibleEmail,
      assignedAdminUid: responsibleEmail === usuario.email ? (usuario.uid || usuario.id || '') : existing?.assignedAdminUid || '',
      rootCause: clean(field('inc-causa').value, 800),
      causa: clean(field('inc-causa').value, 800),
      actionTaken: clean(field('inc-accion').value, 500),
      message: clean(field('inc-mensaje').value, 2000),
      attachmentName: clean(field('inc-adjunto-nombre').value, 180),
      attachmentUrl: clean(field('inc-adjunto-url').value, 1200),
      resolution,
      resolucion: resolution,
      source: existing?.source || 'admin_manual',
    };
    const payload = existing
      ? buildIncidentUpdatePatch(existing, changes, actor, { config: platformConfig })
      : buildIncidentCreatePayload(changes, actor, { config: platformConfig });
    const write = existing
      ? db.from('incidencias').update(payload).eq('id', existing.id)
      : db.from('incidencias').insert(payload);
    const { error } = await write;
    if (error) { showToast('Error', error.message, 'error'); return; }
    await recordAdminAudit(existing ? 'incident.updated' : 'incident.created', {
      module: 'incidents',
      entityType: 'incidencias',
      entityId: existing?.id || payload.id || payload.ticketId,
      description: `${existing ? 'Actualizado' : 'Creado'} ticket ${payload.ticketId}.`,
      severity: incidentPriorityMeta(payload.prioridad).severity === 'critical' ? 'critical' : 'info',
      actor: {
        actorUid: usuario.uid || usuario.id || '',
        actorEmail: usuario.email || '',
        actorRole: 'admin',
        actorType: 'admin',
      },
      metadata: {
        ticketId: payload.ticketId,
        status: payload.estado,
        priority: payload.prioridad,
        category: payload.categoria,
      },
    }).catch((auditError) => console.warn('No se pudo auditar incidencia', auditError));
    closeModal('modal-incidencia');
    showToast(existing ? 'Incidencia actualizada' : 'Incidencia creada', payload.ticketId, 'success');
    await refresh();
  }

  ['filtro-inc-estado', 'filtro-inc-prioridad', 'filtro-inc-categoria', 'filtro-inc-responsable'].forEach((id) => {
    field(id)?.addEventListener('change', (event) => {
      event.stopImmediatePropagation();
      render();
    }, true);
  });
  field('filtro-inc-busqueda')?.addEventListener('input', debounce(render, 180));
  field('btn-nueva-incidencia')?.addEventListener('click', (event) => {
    event.preventDefault();
    openIncident(null);
  });
  field('btn-export-incidencias')?.addEventListener('click', (event) => {
    event.preventDefault();
    const rows = incidents.filter((item) => matches(item, filters())).map((item) => ({
      ticket: item.ticketId,
      estado: item.estado,
      prioridad: item.prioridad,
      categoria: item.categoria,
      titulo: item.titulo,
      responsable: item.assignedAdminEmail,
      sla: item.slaDueAt,
      resuelto_en_minutos: item.resolutionTimeMinutes || '',
    }));
    exportarCSV(rows, 'incidencias_clasesde10.csv', [
      { titulo: 'Ticket', campo: 'ticket' },
      { titulo: 'Estado', campo: 'estado' },
      { titulo: 'Prioridad', campo: 'prioridad' },
      { titulo: 'Categoria', campo: 'categoria' },
      { titulo: 'Titulo', campo: 'titulo' },
      { titulo: 'Responsable', campo: 'responsable' },
      { titulo: 'SLA', campo: 'sla' },
      { titulo: 'Resolucion minutos', campo: 'resuelto_en_minutos' },
    ]);
  });
  field('tbody-incidencias')?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-action="gestionar-inc"]');
    if (!button) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    openIncident({ incId: button.dataset.incId });
  }, true);
  field('modal-incidencia')?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-incident-guide-action]');
    if (!button) return;
    event.preventDefault();
    applyGuideAction(button.dataset.incidentGuideAction);
  }, true);
  field('btn-guardar-inc')?.addEventListener('click', saveIncident, true);

  const api = { refresh, render, openIncident };
  instances.set(section, api);
  await refresh();
  return api;
}
