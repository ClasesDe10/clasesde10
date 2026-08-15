/**
 * ClasesDe10 - dedicated, low-noise notification centre.
 *
 * Messages stay in Chat. This module only renders important changes and tasks
 * with a direct route to the place where the user can resolve them.
 */

import {
  createAdminNotification,
  loadNotificationSettings,
  markAllNotificationsRead,
  requestBrowserNotificationPermission,
  saveNotificationSettings,
  showBrowserNotification,
  watchUserNotifications,
} from './notifications-provider.js?v=20260815-clear-notices';
import {
  DEFAULT_NOTIFICATION_SETTINGS,
  humanReadableNotificationCopy,
  isNotificationUnread,
  mergeNotificationSettings,
  notificationActionUrl,
  notificationCategoryLabel,
  notificationDisplayGroupKey,
  notificationPriorityClass,
  visibleNotificationsForRole,
} from './notification-engine.js?v=20260815-clear-notices';
import {
  registerPushNotifications,
  watchForegroundPushMessages,
} from './push-notifications.js?v=20260628-push';

function clean(value, max = 500) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').slice(0, max);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function notificationDate(value) {
  if (!value) return null;
  if (typeof value?.toDate === 'function') return value.toDate();
  if (Number.isFinite(value?.seconds)) return new Date(Number(value.seconds) * 1000);
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDateTime(value) {
  const date = notificationDate(value);
  if (!date) return '';
  return new Intl.DateTimeFormat('es-ES', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function notificationTitle(notification = {}, role = '') {
  return clean(humanReadableNotificationCopy(notification, role).title || notificationCategoryLabel(notification.type), 160);
}

function notificationBody(notification = {}, role = '') {
  return clean(humanReadableNotificationCopy(notification, role).body, 1200);
}

function notificationSource(notification = {}) {
  const source = clean(notification.source || notification.fromRole || notification.createdByRole || '', 50).toLowerCase();
  return source === 'admin' || notification.type === 'admin_manual' ? 'Equipo ClasesDe10' : 'Sistema';
}

function notificationPriorityLabel(notification = {}) {
  const priority = notificationPriorityClass(notification);
  if (priority === 'critica') return 'Bloqueo';
  if (priority === 'alta') return 'Requiere atención';
  if (priority === 'media') return 'Conviene revisar';
  return 'Actualización';
}

function entityId(notification = {}) {
  const payload = notification.payload || {};
  return clean(
    payload.incidentId
      || payload.paymentId
      || payload.classId
      || payload.documentId
      || payload.requestId
      || payload.assignmentId
      || payload.chatId
      || '',
    180,
  );
}

function displayGroupKey(notification = {}) {
  return notificationDisplayGroupKey(notification);
}

function groupNotifications(notifications = []) {
  const groups = new Map();
  notifications.forEach((notification) => {
    const key = displayGroupKey(notification);
    const current = groups.get(key);
    if (!current) {
      groups.set(key, { ...notification, duplicateCount: 1, groupedIds: [notification.id].filter(Boolean) });
      return;
    }
    const keepNext = isNotificationUnread(notification) && !isNotificationUnread(current);
    groups.set(key, {
      ...(keepNext ? notification : current),
      duplicateCount: Number(current.duplicateCount || 1) + 1,
      groupedIds: [...(current.groupedIds || []), notification.id].filter(Boolean),
    });
  });
  return [...groups.values()];
}

function sectionAction(notification = {}, role = '') {
  const type = clean(notification.type, 80);
  const payload = notification.payload || {};

  if (['schedule_proposed', 'schedule_rejected'].includes(type)) {
    if (role === 'alumno') return { section: 'calendario', label: 'Ver horario' };
    return { section: role === 'admin' ? 'chats' : 'chat', label: 'Responder propuesta' };
  }
  if (type === 'schedule_accepted') return { section: 'calendario', label: 'Ver horario' };

  if (payload.classId || type.startsWith('class_')) {
    if (type === 'class_confirmation_needed') return { section: 'clases', label: 'Confirmar clase' };
    if (type.includes('unmarked')) return { section: 'clases', label: 'Registrar resultado' };
    if (type.includes('schedule_change') || type === 'class_reminder') return { section: 'calendario', label: 'Ver cambio' };
    return { section: role === 'admin' ? 'incidencias' : 'clases', label: type.includes('incident') ? 'Resolver incidencia' : 'Revisar clase' };
  }

  if (payload.paymentId || type.includes('payment') || type.includes('payout')) {
    if (role === 'profesor') return { section: 'ingresos', label: 'Revisar cobro' };
    if (role === 'familia') return { section: 'pagos', label: type === 'family_payment_pending' ? 'Ver justificante' : 'Subir justificante' };
    if (role === 'admin') return { section: 'calendario', label: 'Ver deuda en calendario' };
    return { section: 'clases', label: 'Ver estado' };
  }

  if (payload.documentId || type.startsWith('document_') || type === 'verification_pending') {
    if (role === 'admin') return { section: 'documentos', label: 'Revisar documento' };
    if (role === 'profesor') return { section: 'documentos', label: type === 'document_rejected' ? 'Corregir documento' : 'Ver documentos' };
    if (role === 'familia') return { section: 'perfil', label: type === 'document_rejected' ? 'Corregir documento' : 'Ver documentos' };
    return { section: 'profesor', label: 'Ver información' };
  }

  if (payload.requestId || type.startsWith('request_') || type.startsWith('matching_') || type === 'assignment_created') {
    if (role === 'admin') return { section: 'solicitudes', label: 'Gestionar solicitud' };
    if (role === 'profesor') return { section: 'alumnos', label: 'Ver asignación' };
    if (role === 'familia') return { section: 'solicitudes', label: 'Ver solicitud' };
    return { section: 'profesor', label: 'Ver profesor' };
  }

  if (payload.incidentId || type.includes('incident') || type === 'alert_priority') {
    if (role === 'admin') return { section: 'incidencias', label: 'Resolver incidencia' };
    if (role === 'alumno') return { section: 'clases', label: 'Revisar clase' };
    return { section: 'chat', label: 'Resolver con soporte' };
  }

  if (type === 'teacher_verified' || payload.profileId || payload.teacherId) {
    if (role === 'admin') return { section: 'profesores', label: 'Ver profesor' };
    if (role === 'familia') return { section: 'solicitudes', label: 'Ver profesor' };
    return { section: role === 'alumno' ? 'profesor' : 'perfil', label: 'Ver perfil' };
  }

  const url = notificationActionUrl(notification);
  if (url && !/\/pages\/login(?:\.html)?$/i.test(url)) return { url, label: 'Resolver ahora' };
  return null;
}

function renderShell(container, role) {
  container.className = `${container.className || ''} notification-center`.trim();
  container.innerHTML = `
    <section class="notification-center-shell" aria-labelledby="notification-center-title">
      <header class="notification-center-header">
        <div>
          <div class="notification-center-kicker">Prioridad</div>
          <h2 id="notification-center-title">Centro de avisos</h2>
          <p>Solo tareas importantes y cambios que requieren tu atención. Los mensajes están en Chat.</p>
        </div>
        <div class="notification-center-actions">
          <button class="btn btn-outline btn-sm" type="button" data-enable-notifications>Activar avisos del dispositivo</button>
          <button class="btn btn-ghost btn-sm" type="button" data-mark-all-visible>Marcar visibles como revisados</button>
        </div>
      </header>
      <div class="notification-center-summary" data-notification-summary role="status" aria-live="polite">Cargando avisos…</div>
      ${role === 'admin' ? `
        <details class="notification-center-admin">
          <summary>Enviar un aviso manual</summary>
          <form class="notification-center-admin-form" data-admin-notification-form>
            <select class="form-control" data-admin-target aria-label="Destinatarios">
              <option value="familia">Familias</option>
              <option value="profesor">Profesores</option>
              <option value="alumno">Alumnos</option>
              <option value="admin">Administradores</option>
            </select>
            <input class="form-control" data-admin-title maxlength="120" placeholder="Título del aviso" required>
            <textarea class="form-control" data-admin-body maxlength="800" rows="2" placeholder="Qué ha ocurrido y qué debe hacer la persona" required></textarea>
            <input class="form-control" data-admin-url maxlength="300" placeholder="Ruta interna opcional, por ejemplo /pages/dashboard/familia.html#pagos">
            <button class="btn btn-primary btn-sm" type="submit">Enviar aviso</button>
          </form>
        </details>
        <details class="notification-center-admin">
          <summary>Canales del sistema</summary>
          <form class="notification-center-settings" data-notification-settings-form>
            <label><input type="checkbox" data-setting="enabled"> Sistema activo</label>
            <label><input type="checkbox" data-channel="browser"> Avisos del navegador</label>
            <label><input type="checkbox" data-channel="push"> Push en segundo plano</label>
            <button class="btn btn-ghost btn-sm" type="submit">Guardar canales</button>
          </form>
        </details>` : ''}
      <div class="notification-center-list" data-notification-list>
        <div class="notification-center-empty">Cargando avisos…</div>
      </div>
    </section>`;
}

function renderNotifications(container, notifications, role) {
  const list = container.querySelector('[data-notification-list]');
  const summary = container.querySelector('[data-notification-summary]');
  const grouped = groupNotifications(notifications);
  const pending = grouped.filter(isNotificationUnread).length;
  if (summary) {
    summary.textContent = pending
      ? `${pending} ${pending === 1 ? 'asunto pendiente' : 'asuntos pendientes'} · ordenados por urgencia`
      : 'No tienes asuntos importantes pendientes.';
    summary.classList.toggle('has-pending', pending > 0);
  }
  if (!list) return;
  if (!grouped.length) {
    list.innerHTML = '<div class="notification-center-empty"><strong>Todo al día</strong><span>No hay tareas importantes pendientes. Los mensajes nuevos seguirán apareciendo en Chat.</span></div>';
    return;
  }

  list.innerHTML = grouped.map((notification) => {
    const unread = isNotificationUnread(notification);
    const priority = notificationPriorityClass(notification);
    const action = sectionAction(notification, role);
    const meta = [
      notificationSource(notification),
      notificationCategoryLabel(notification.type),
      formatDateTime(notification.createdAt),
      notification.duplicateCount > 1 ? `${notification.duplicateCount} avisos reunidos` : '',
    ].filter(Boolean).join(' · ');
    return `
      <article class="notification-center-item priority-${escapeHtml(priority)} ${unread ? 'unread' : ''}" data-notification-id="${escapeHtml(notification.id)}">
        <div class="notification-center-copy">
          <div class="notification-center-priority">${escapeHtml(notificationPriorityLabel(notification))}</div>
          <h3>${escapeHtml(notificationTitle(notification, role))}</h3>
          ${notificationBody(notification, role) ? `<p>${escapeHtml(notificationBody(notification, role))}</p>` : ''}
          <div class="notification-center-meta">${escapeHtml(meta)}</div>
        </div>
        <div class="notification-center-item-actions">
          ${action ? `<button class="btn btn-primary btn-sm" type="button" data-resolve-notification>${escapeHtml(action.label)}</button>` : ''}
          ${unread ? '<button class="notification-review-link" type="button" data-review-notification>Marcar como revisado</button>' : '<span class="notification-reviewed">Revisado</span>'}
        </div>
      </article>`;
  }).join('');
}

function defaultNavigate(section) {
  const trigger = [...document.querySelectorAll('.sidebar-link[data-section]')]
    .find((item) => item.dataset.section === section);
  if (trigger) {
    trigger.click();
    return true;
  }
  const sectionNode = document.getElementById(`section-${section}`);
  if (!sectionNode) return false;
  document.querySelectorAll('.dash-section').forEach((node) => { node.style.display = 'none'; });
  sectionNode.style.display = '';
  return true;
}

function hydrateAdminSettings(container, settings = DEFAULT_NOTIFICATION_SETTINGS) {
  const merged = mergeNotificationSettings(settings);
  const form = container.querySelector('[data-notification-settings-form]');
  if (!form) return;
  const enabled = form.querySelector('[data-setting="enabled"]');
  const browser = form.querySelector('[data-channel="browser"]');
  const push = form.querySelector('[data-channel="push"]');
  if (enabled) enabled.checked = merged.enabled !== false;
  if (browser) browser.checked = merged.channels.browser !== false;
  if (push) push.checked = merged.channels.push !== false;
}

export function initNotificationCenter({
  container,
  usuario = {},
  role = '',
  showToast = () => {},
  navigateSection = defaultNavigate,
} = {}) {
  if (!container) return null;
  const currentUid = clean(usuario.uid || usuario.firebase_uid || usuario.id, 180);
  if (!currentUid) return null;
  renderShell(container, role);

  const state = {
    raw: [],
    visible: [],
    ready: false,
    lastUnreadCount: 0,
    settings: DEFAULT_NOTIFICATION_SETTINGS,
    publicConfig: {},
    unsubscribe: null,
    unsubscribePush: null,
  };

  function updateBadge() {
    const count = state.visible.filter(isNotificationUnread).length;
    const badge = document.getElementById('notif-badge');
    if (!badge) return;
    badge.textContent = count > 9 ? '9+' : String(count || '');
    badge.style.display = count ? 'flex' : 'none';
  }

  function refresh(raw) {
    state.raw = raw;
    state.visible = visibleNotificationsForRole(raw, role);
    renderNotifications(container, state.visible, role);
    updateBadge();
  }

  function resolveAction(notification) {
    const action = sectionAction(notification, role);
    if (!action) {
      showToast('Aviso revisado', 'No requiere ninguna acción adicional.', 'info');
      return false;
    }
    if (action.section) return navigateSection(action.section, action) !== false;
    if (action.url) {
      window.location.href = action.url;
      return true;
    }
    return false;
  }

  function notificationsInSameGroup(notification) {
    const key = displayGroupKey(notification);
    return state.visible.filter((entry) => displayGroupKey(entry) === key);
  }

  container.addEventListener('click', async (event) => {
    const resolveButton = event.target.closest('[data-resolve-notification]');
    if (resolveButton) {
      const item = resolveButton.closest('[data-notification-id]');
      const notification = state.visible.find((entry) => entry.id === item?.dataset.notificationId);
      if (!notification) return;
      resolveButton.disabled = true;
      if (isNotificationUnread(notification)) await markAllNotificationsRead(notificationsInSameGroup(notification)).catch(() => {});
      resolveAction(notification);
      resolveButton.disabled = false;
      return;
    }

    const reviewButton = event.target.closest('[data-review-notification]');
    if (reviewButton) {
      const id = reviewButton.closest('[data-notification-id]')?.dataset.notificationId;
      const notification = state.visible.find((entry) => entry.id === id);
      reviewButton.disabled = true;
      await markAllNotificationsRead(notification ? notificationsInSameGroup(notification) : [{ id, readAt: null }])
        .then(() => showToast('Aviso revisado', 'Ya no aparecerá como pendiente.', 'success'))
        .catch((error) => showToast('No se pudo actualizar', error.message || 'Inténtalo de nuevo.', 'error'));
      reviewButton.disabled = false;
      return;
    }

    if (event.target.closest('[data-mark-all-visible]')) {
      const button = event.target.closest('[data-mark-all-visible]');
      button.disabled = true;
      await markAllNotificationsRead(state.visible)
        .then(() => showToast('Avisos revisados', 'Los asuntos visibles quedan revisados.', 'success'))
        .catch((error) => showToast('No se pudieron actualizar', error.message || 'Inténtalo de nuevo.', 'error'));
      button.disabled = false;
      return;
    }

    if (event.target.closest('[data-enable-notifications]')) {
      const permission = await requestBrowserNotificationPermission();
      if (permission !== 'granted') {
        showToast('Avisos no activados', permission === 'denied' ? 'Permítelos desde los ajustes del navegador.' : 'Este navegador no los admite.', 'warning');
        return;
      }
      const result = await registerPushNotifications({ userUid: currentUid, role }).catch((error) => ({ ok: false, status: error.message }));
      showToast(result.ok ? 'Avisos activados' : 'Avisos del navegador activados', result.ok ? 'Recibirás solo avisos importantes en este dispositivo.' : 'Los avisos funcionarán mientras la aplicación esté abierta.', result.ok ? 'success' : 'info');
    }
  });

  container.querySelector('[data-admin-notification-form]')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      const sent = await createAdminNotification({
        targetRole: clean(form.querySelector('[data-admin-target]')?.value, 40),
        title: clean(form.querySelector('[data-admin-title]')?.value, 120),
        body: clean(form.querySelector('[data-admin-body]')?.value, 800),
        actionUrl: clean(form.querySelector('[data-admin-url]')?.value, 300),
        currentUid,
      });
      form.reset();
      showToast('Aviso enviado', `Se ha enviado a ${sent} destinatario(s).`, 'success');
    } catch (error) {
      showToast('No se pudo enviar', error.message || 'Revisa los datos del aviso.', 'error');
    } finally {
      button.disabled = false;
    }
  });

  container.querySelector('[data-notification-settings-form]')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const settings = mergeNotificationSettings(state.settings);
    settings.enabled = form.querySelector('[data-setting="enabled"]')?.checked !== false;
    settings.channels.browser = form.querySelector('[data-channel="browser"]')?.checked !== false;
    settings.channels.push = form.querySelector('[data-channel="push"]')?.checked !== false;
    try {
      state.settings = await saveNotificationSettings(settings, state.publicConfig);
      showToast('Canales guardados', 'La configuración de avisos se ha actualizado.', 'success');
    } catch (error) {
      showToast('No se pudo guardar', error.message || 'Revisa tus permisos.', 'error');
    }
  });

  if (role === 'admin') {
    loadNotificationSettings().then((loaded) => {
      state.settings = loaded.settings;
      state.publicConfig = loaded.publicConfig;
      hydrateAdminSettings(container, state.settings);
    }).catch(() => {});
  }

  state.unsubscribe = watchUserNotifications(currentUid, (notifications) => {
    const visible = visibleNotificationsForRole(notifications, role);
    const unreadCount = visible.filter(isNotificationUnread).length;
    const latestUnread = visible.find(isNotificationUnread);
    refresh(notifications);
    if (state.ready && unreadCount > state.lastUnreadCount && latestUnread) {
      const action = sectionAction(latestUnread, role);
      showBrowserNotification(notificationTitle(latestUnread, role), notificationBody(latestUnread, role), {
        notificationId: latestUnread.id,
        type: latestUnread.type,
        url: action?.url || notificationActionUrl(latestUnread),
      });
    }
    state.ready = true;
    state.lastUnreadCount = unreadCount;
  });

  Promise.resolve(watchForegroundPushMessages((payload) => {
    const type = payload.data?.type || 'push';
    if (type === 'chat_message') return;
    showBrowserNotification(payload.notification?.title || payload.data?.title || 'ClasesDe10', payload.notification?.body || payload.data?.body || '', {
      type,
      url: payload.fcmOptions?.link || payload.data?.url || '/pages/login.html',
    });
  })).then((unsubscribe) => { state.unsubscribePush = unsubscribe; }).catch(() => {});

  const dispose = () => {
    if (typeof state.unsubscribe === 'function') state.unsubscribe();
    if (typeof state.unsubscribePush === 'function') state.unsubscribePush();
  };
  window.addEventListener('pagehide', dispose, { once: true });
  return { refresh: () => refresh(state.raw), dispose };
}
