import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js';
import { firebaseDb } from './firebase-client.js?v=20260627-domain-auth';
import {
  markAllNotificationsRead,
  markNotificationRead,
  requestBrowserNotificationPermission,
  showBrowserNotification,
  watchUserNotifications,
} from './notifications-provider.js?v=20260627-domain-auth';

function clean(value, max = 2000) {
  return String(value || '').trim().slice(0, max);
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
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (typeof value.toDate === 'function') return value.toDate().toISOString();
  if (value.seconds) return new Date(value.seconds * 1000).toISOString();
  return '';
}

function formatDateTime(value) {
  const iso = normalizeDate(value);
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('es-ES', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function fullName(...parts) {
  return parts.map(clean).filter(Boolean).join(' ').trim();
}

function participantMap(ids) {
  return [...new Set(ids.map(clean).filter(Boolean))]
    .reduce((acc, id) => ({ ...acc, [id]: true }), {});
}

function assignmentIds(assignment) {
  const familyUid = clean(assignment.familyUid || assignment.familia_id);
  const teacherUid = clean(assignment.teacherUid || assignment.profesor_id);
  const studentId = clean(assignment.studentId || assignment.alumno_id);
  const familyUserUid = clean(assignment.familias?.userUid || assignment.familias?.usuario_id || assignment.familias?.id);
  const teacherUserUid = clean(assignment.teacherUserUid || assignment.profesores?.userUid || assignment.profesores?.usuario_id || assignment.profesores?.id);
  return { familyUid, teacherUid, studentId, familyUserUid, teacherUserUid };
}

function chatTitle(chat, role) {
  if (role === 'profesor') return chat.familyName || chat.studentName || 'Familia';
  if (role === 'familia') return chat.teacherName || 'Profesor';
  return [chat.familyName || 'Familia', chat.teacherName || 'Profesor'].join(' / ');
}

async function loadAssignments(dbCompat, role, profileId) {
  let queryBuilder = dbCompat.from('asignaciones')
    .select('*, alumnos(nombre,apellidos), familias(nombre,apellidos,usuarios(nombre,apellidos,email,telefono)), profesores(nombre,apellidos,email,usuarios(nombre,apellidos,email,telefono))')
    .eq('activa', true);

  if (role === 'familia') queryBuilder = queryBuilder.eq('familia_id', profileId);
  if (role === 'profesor') queryBuilder = queryBuilder.eq('profesor_id', profileId);

  const { data, error } = await queryBuilder;
  if (error) throw error;
  return data || [];
}

async function ensureChatForAssignment(assignment, usuario, role) {
  const assignmentId = clean(assignment.id);
  if (!assignmentId) return null;

  const { familyUid, teacherUid, studentId, familyUserUid, teacherUserUid } = assignmentIds(assignment);
  if (!familyUid || !teacherUid) return null;

  const ref = doc(firebaseDb, 'chats', assignmentId);
  const existing = await getDoc(ref);
  const teacherName = fullName(
    assignment.profesores?.usuarios?.nombre || assignment.profesores?.nombre,
    assignment.profesores?.usuarios?.apellidos || assignment.profesores?.apellidos,
  ) || assignment.profesores?.usuarios?.email || assignment.profesores?.email || 'Profesor';
  const familyName = fullName(
    assignment.familias?.usuarios?.nombre || assignment.familias?.nombre,
    assignment.familias?.usuarios?.apellidos || assignment.familias?.apellidos,
  ) || assignment.familias?.usuarios?.email || 'Familia';
  const studentName = fullName(assignment.alumnos?.nombre, assignment.alumnos?.apellidos);
  const participantUids = participantMap([
    familyUid,
    teacherUid,
    familyUserUid,
    teacherUserUid,
    usuario.uid,
    usuario.firebase_uid,
  ]);

  const base = {
    assignmentId,
    asignacion_id: assignmentId,
    familyUid,
    familia_id: familyUid,
    teacherUid,
    profesor_id: teacherUid,
    studentId: studentId || null,
    alumno_id: studentId || null,
    materia: clean(assignment.materia || assignment.subject, 180),
    familyName,
    teacherName,
    studentName,
    participantUids,
    active: true,
    updatedAt: serverTimestamp(),
  };

  if (!existing.exists()) {
    await setDoc(ref, {
      ...base,
      createdAt: serverTimestamp(),
      lastMessage: '',
      lastMessageAt: null,
    });
  } else if (role === 'admin') {
    await setDoc(ref, base, { merge: true });
  } else {
    return { id: existing.id, ...existing.data() };
  }

  const snap = await getDoc(ref);
  return { id: snap.id, ...snap.data() };
}

async function loadChats(dbCompat, role, profileId, usuario) {
  if (role === 'admin') {
    const assignments = await loadAssignments(dbCompat, role, profileId);
    await Promise.all(assignments.map((assignment) => ensureChatForAssignment(assignment, usuario, role)));
    const snap = await getDocs(collection(firebaseDb, 'chats'));
    const chats = snap.docs.map((item) => ({ id: item.id, ...item.data() }));
    chats.sort((a, b) => String(normalizeDate(b.lastMessageAt || b.updatedAt)).localeCompare(String(normalizeDate(a.lastMessageAt || a.updatedAt))));
    return chats;
  }

  const assignments = await loadAssignments(dbCompat, role, profileId);
  const chats = (await Promise.all(assignments.map((assignment) => ensureChatForAssignment(assignment, usuario, role))))
    .filter(Boolean);
  chats.sort((a, b) => String(normalizeDate(b.lastMessageAt || b.updatedAt)).localeCompare(String(normalizeDate(a.lastMessageAt || a.updatedAt))));
  return chats;
}

function renderShell(container, role) {
  container.innerHTML = `
    <div class="chat-layout">
      <aside class="chat-list-panel">
        <div class="chat-panel-header">
          <div>
            <div class="chat-title">Chat / Notificaciones</div>
            <div class="chat-subtitle">Familias, profesores y administracion</div>
          </div>
        </div>
        <div class="chat-tabs">
          <button type="button" class="chat-tab active" data-chat-tab="chats">Chats</button>
          <button type="button" class="chat-tab" data-chat-tab="notificaciones">Notificaciones <span data-notification-count></span></button>
        </div>
        <div class="chat-list" data-chat-list></div>
      </aside>
      <section class="chat-thread-panel" data-chat-panel="chats">
        <div class="chat-thread-header" data-chat-header>
          <div class="chat-empty-title">Selecciona una conversacion</div>
          <div class="chat-empty-subtitle">Solo aparecen chats de asignaciones activas.</div>
        </div>
        <div class="chat-messages" data-chat-messages></div>
        <form class="chat-compose" data-chat-form style="display:none">
          <textarea class="form-control" data-chat-input rows="2" maxlength="2000" aria-label="Escribe un mensaje" placeholder="Escribe un mensaje..."></textarea>
          <button class="btn btn-primary" type="submit">Enviar</button>
        </form>
      </section>
      <section class="chat-thread-panel notifications-panel" data-chat-panel="notificaciones" style="display:none">
        <div class="chat-thread-header">
          <div>
            <div class="chat-thread-title">Notificaciones</div>
            <div class="chat-thread-subtitle">Avisos enviados por administracion y automatizaciones</div>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end">
            <button class="btn btn-ghost btn-sm" type="button" data-enable-browser-notifications>Activar avisos</button>
            <button class="btn btn-ghost btn-sm" type="button" data-mark-all-notifications>Marcar leidas</button>
          </div>
        </div>
        <form class="admin-notification-form" data-admin-notification-form style="${role === 'admin' ? '' : 'display:none'}">
          <select class="form-control" data-admin-notification-target aria-label="Destinatarios">
            <option value="todos">Todos</option>
            <option value="familia">Familias</option>
            <option value="profesor">Profesores</option>
            <option value="alumno">Alumnos</option>
            <option value="admin">Admins</option>
          </select>
          <input class="form-control" type="text" maxlength="120" data-admin-notification-title placeholder="Titulo">
          <textarea class="form-control" rows="2" maxlength="800" data-admin-notification-body placeholder="Mensaje"></textarea>
          <button class="btn btn-primary btn-sm" type="submit">Enviar aviso</button>
        </form>
        <div class="notifications-list" data-notifications-list>
          <div class="chat-empty-state">Cargando notificaciones...</div>
        </div>
      </section>
    </div>`;
}

function renderChatList(container, chats, selectedId, role) {
  const list = container.querySelector('[data-chat-list]');
  if (!chats.length) {
    list.innerHTML = '<div class="chat-empty-state">No hay chats disponibles. Apareceran cuando exista una asignacion activa.</div>';
    return;
  }
  list.innerHTML = chats.map((chat) => `
    <button class="chat-list-item ${chat.id === selectedId ? 'active' : ''}" type="button" data-chat-id="${escapeHtml(chat.id)}">
      <span class="chat-list-name">${escapeHtml(chatTitle(chat, role))}</span>
      <span class="chat-list-meta">${escapeHtml(chat.materia || chat.studentName || 'Asignacion')}</span>
      <span class="chat-list-preview">${escapeHtml(chat.lastMessage || 'Sin mensajes todavia')}</span>
    </button>`).join('');
}

function renderThreadHeader(container, chat, role) {
  const header = container.querySelector('[data-chat-header]');
  if (!chat) return;
  header.innerHTML = `
    <div>
      <div class="chat-thread-title">${escapeHtml(chatTitle(chat, role))}</div>
      <div class="chat-thread-subtitle">${escapeHtml([chat.studentName, chat.materia].filter(Boolean).join(' · ') || 'Asignacion activa')}</div>
    </div>`;
}

function renderMessages(container, messages, currentUid) {
  const box = container.querySelector('[data-chat-messages]');
  if (!messages.length) {
    box.innerHTML = '<div class="chat-empty-state">Todavia no hay mensajes. Escribe el primero para coordinar la clase.</div>';
    return;
  }
  box.innerHTML = messages.map((message) => {
    const mine = message.senderUid === currentUid;
    return `
      <div class="chat-message ${mine ? 'mine' : ''}">
        <div class="chat-message-meta">${escapeHtml(message.senderName || message.senderRole || 'Usuario')} · ${escapeHtml(formatDateTime(message.createdAt))}</div>
        <div class="chat-message-body">${escapeHtml(message.body)}</div>
      </div>`;
  }).join('');
  box.scrollTop = box.scrollHeight;
}

function notificationTitle(notification) {
  return notification.title || notification.titulo || 'Notificacion';
}

function notificationBody(notification) {
  return notification.body || notification.cuerpo || '';
}

function isNotificationUnread(notification) {
  return !notification.readAt && notification.leida !== true;
}

function renderNotifications(container, notifications) {
  const list = container.querySelector('[data-notifications-list]');
  const count = notifications.filter(isNotificationUnread).length;
  const countNode = container.querySelector('[data-notification-count]');
  if (countNode) {
    countNode.textContent = count > 0 ? count : '';
    countNode.style.display = count > 0 ? '' : 'none';
  }
  if (!list) return;

  if (!notifications.length) {
    list.innerHTML = '<div class="chat-empty-state">No hay notificaciones todavia.</div>';
    return;
  }

  list.innerHTML = notifications.map((notification) => {
    const unread = isNotificationUnread(notification);
    return `
      <article class="notification-item ${unread ? 'unread' : ''}" data-notification-id="${escapeHtml(notification.id)}">
        <div>
          <div class="notification-title">${escapeHtml(notificationTitle(notification))}</div>
          <div class="notification-body">${escapeHtml(notificationBody(notification))}</div>
          <div class="notification-meta">${escapeHtml(formatDateTime(notification.createdAt))}</div>
        </div>
        ${unread ? '<button class="btn btn-ghost btn-sm" type="button" data-mark-notification>Leida</button>' : '<span class="badge badge-gray">Leida</span>'}
      </article>`;
  }).join('');
}

export async function initChatWidget({
  container,
  db,
  usuario,
  role,
  profileId,
  showToast = () => {},
}) {
  if (!container) return;
  renderShell(container, role);

  const state = {
    chats: [],
    notifications: [],
    notificationsReady: false,
    lastUnreadCount: 0,
    selectedChat: null,
    unsubscribe: null,
    unsubscribeNotifications: null,
  };
  const currentUid = clean(usuario.uid || usuario.firebase_uid || usuario.id);
  const senderName = fullName(usuario.nombre, usuario.apellidos) || usuario.email || role;

  async function sendAdminNotification(targetRole, title, body) {
    if (role !== 'admin') return 0;
    const usersQuery = targetRole && targetRole !== 'todos'
      ? query(collection(firebaseDb, 'users'), where('role', '==', targetRole))
      : collection(firebaseDb, 'users');
    const snap = await getDocs(usersQuery);
    const recipients = snap.docs
      .map((item) => ({ id: item.id, ...item.data() }))
      .filter((user) => user.active !== false);

    await Promise.all(recipients.map((user) => addDoc(collection(firebaseDb, 'notificaciones'), {
      userUid: user.id,
      usuario_id: user.id,
      title,
      titulo: title,
      body,
      cuerpo: body,
      type: 'admin_manual',
      payload: { type: 'admin_manual', targetRole, url: '/pages/login.html' },
      readAt: null,
      leida: false,
      fromRole: 'admin',
      createdByUid: currentUid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })));

    return recipients.length;
  }

  async function refreshChats() {
    container.querySelector('[data-chat-list]').innerHTML = '<div class="chat-empty-state">Cargando chats...</div>';
    state.chats = await loadChats(db, role, profileId, usuario);
    renderChatList(container, state.chats, state.selectedChat?.id, role);
    if (!state.selectedChat && state.chats.length) selectChat(state.chats[0].id);
  }

  function selectChat(chatId) {
    const chat = state.chats.find((item) => item.id === chatId);
    if (!chat) return;
    state.selectedChat = chat;
    renderChatList(container, state.chats, chat.id, role);
    renderThreadHeader(container, chat, role);
    container.querySelector('[data-chat-form]').style.display = '';

    if (state.unsubscribe) state.unsubscribe();
    const messagesQuery = query(
      collection(firebaseDb, 'chats', chat.id, 'mensajes'),
      orderBy('createdAt', 'asc'),
      limit(100),
    );
    state.unsubscribe = onSnapshot(messagesQuery, (snap) => {
      renderMessages(container, snap.docs.map((item) => ({ id: item.id, ...item.data() })), currentUid);
    }, (error) => {
      console.error('No se pudo abrir el chat', error);
      showToast('Chat no disponible', error.message || 'No se pudo abrir la conversacion.', 'error');
    });
  }

  function setPanel(panel) {
    container.querySelectorAll('[data-chat-tab]').forEach((tab) => {
      tab.classList.toggle('active', tab.dataset.chatTab === panel);
    });
    container.querySelectorAll('[data-chat-panel]').forEach((panelNode) => {
      panelNode.style.display = panelNode.dataset.chatPanel === panel ? '' : 'none';
    });
  }

  container.addEventListener('click', (event) => {
    const tab = event.target.closest('[data-chat-tab]');
    if (tab) {
      setPanel(tab.dataset.chatTab);
      return;
    }

    const enableNotifications = event.target.closest('[data-enable-browser-notifications]');
    if (enableNotifications) {
      requestBrowserNotificationPermission().then((permission) => {
        if (permission === 'granted') showToast('Avisos activados', 'Te avisaremos mientras la app este abierta o instalada.', 'success');
        else if (permission === 'denied') showToast('Avisos bloqueados', 'Activalos desde los ajustes del navegador si quieres recibir avisos.', 'warning');
        else showToast('Avisos no disponibles', 'Este navegador no permite notificaciones web.', 'warning');
      });
      return;
    }

    const markAll = event.target.closest('[data-mark-all-notifications]');
    if (markAll) {
      markAllNotificationsRead(state.notifications).catch((error) => {
        showToast('No se pudieron marcar', error.message || 'Revisa permisos de notificaciones.', 'error');
      });
      return;
    }

    const markOne = event.target.closest('[data-mark-notification]');
    if (markOne) {
      const item = markOne.closest('[data-notification-id]');
      markNotificationRead(item?.dataset.notificationId).catch((error) => {
        showToast('No se pudo marcar', error.message || 'Revisa permisos de notificaciones.', 'error');
      });
      return;
    }

    const item = event.target.closest('[data-chat-id]');
    if (!item) return;
    selectChat(item.dataset.chatId);
  });

  container.querySelector('[data-chat-form]').addEventListener('submit', async (event) => {
    event.preventDefault();
    const input = container.querySelector('[data-chat-input]');
    const body = clean(input.value, 2000);
    if (!body || !state.selectedChat) return;

    input.disabled = true;
    try {
      const chatRef = doc(firebaseDb, 'chats', state.selectedChat.id);
      await addDoc(collection(chatRef, 'mensajes'), {
        senderUid: currentUid,
        senderRole: role,
        senderName,
        body,
        createdAt: serverTimestamp(),
        readBy: { [currentUid]: true },
      });
      await updateDoc(chatRef, {
        lastMessage: body.slice(0, 180),
        lastMessageAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      input.value = '';
      await refreshChats();
      selectChat(state.selectedChat.id);
    } catch (error) {
      console.error('No se pudo enviar el mensaje', error);
      showToast('No se envio el mensaje', error.message || 'Revisa permisos de chat.', 'error');
    } finally {
      input.disabled = false;
      input.focus();
    }
  });

  container.querySelector('[data-admin-notification-form]')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const target = form.querySelector('[data-admin-notification-target]').value;
    const title = clean(form.querySelector('[data-admin-notification-title]').value, 120);
    const body = clean(form.querySelector('[data-admin-notification-body]').value, 800);
    if (!title || !body) {
      showToast('Faltan datos', 'Escribe titulo y mensaje.', 'warning');
      return;
    }

    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      const sent = await sendAdminNotification(target, title, body);
      form.reset();
      showToast('Aviso enviado', `${sent} destinatario(s).`, 'success');
    } catch (error) {
      showToast('No se envio', error.message || 'Revisa permisos de notificaciones.', 'error');
    } finally {
      button.disabled = false;
    }
  });

  try {
    state.unsubscribeNotifications = watchUserNotifications(currentUid, (notifications) => {
      const unreadCount = notifications.filter(isNotificationUnread).length;
      const latestUnread = notifications.find(isNotificationUnread);
      state.notifications = notifications;
      renderNotifications(container, notifications);

      if (state.notificationsReady && unreadCount > state.lastUnreadCount && latestUnread) {
        showBrowserNotification(notificationTitle(latestUnread), notificationBody(latestUnread), {
          url: '/pages/login.html',
          notificationId: latestUnread.id,
        });
      }
      state.notificationsReady = true;
      state.lastUnreadCount = unreadCount;
    });
    await refreshChats();
  } catch (error) {
    console.error('No se pudieron cargar chats', error);
    container.querySelector('[data-chat-list]').innerHTML = '<div class="chat-empty-state">No se pudieron cargar los chats.</div>';
    showToast('Chat no disponible', error.message || 'No se pudieron cargar los chats.', 'error');
  }
}
