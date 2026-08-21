#!/usr/bin/env node

import process from 'node:process';
import { applicationDefault, deleteApp, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const projectId = 'clasesde10-50add';
const apply = process.argv.includes('--apply');
const confirmed = process.argv.includes('--confirm=BACKFILL_CHAT_TEACHER_PHOTOS');

if (apply && !confirmed) {
  throw new Error('Para aplicar usa --apply --confirm=BACKFILL_CHAT_TEACHER_PHOTOS.');
}

function clean(value, max = 300000) {
  return String(value || '').trim().slice(0, max);
}

function safePhoto(value) {
  const photo = clean(value);
  if (!photo) return '';
  if (/^data:image\/(?:png|jpe?g|webp|gif);base64,/i.test(photo.slice(0, 80))) return photo;
  if (/^https?:\/\//i.test(photo)) return photo;
  if (/^(\/|\.\/|\.\.\/)/.test(photo)) return photo;
  return '';
}

function profilePhoto(data = {}) {
  return safePhoto(
    data.foto_url
    || data.photoUrl
    || data.profilePhotoUrl
    || data.avatarUrl
    || data.photoURL
    || data.foto,
  );
}

function identityAliases(id = '', data = {}) {
  return [id, data.userUid, data.firebase_uid, data.usuario_id, data.user_id]
    .map((value) => clean(value, 180))
    .filter(Boolean);
}

const app = initializeApp({ credential: applicationDefault(), projectId }, `chat-teacher-photo-backfill-${Date.now()}`);
const db = getFirestore(app);

try {
  const [chatSnap, assignmentSnap, teacherSnap, userSnap] = await Promise.all([
    db.collection('chats').get(),
    db.collection('asignaciones').get(),
    db.collection('profesores').get(),
    db.collection('users').get(),
  ]);

  const teacherByIdentity = new Map();
  teacherSnap.docs.forEach((item) => {
    const data = item.data();
    identityAliases(item.id, data).forEach((id) => teacherByIdentity.set(id, { id: item.id, ...data }));
  });
  const userByIdentity = new Map();
  userSnap.docs.forEach((item) => userByIdentity.set(item.id, { id: item.id, ...item.data() }));

  const assignmentByIdentity = new Map();
  assignmentSnap.docs.forEach((item) => {
    const data = item.data();
    [item.id, data.assignmentId, data.asignacion_id, data.chatId]
      .map((value) => clean(value, 180))
      .filter(Boolean)
      .forEach((id) => assignmentByIdentity.set(id, { ref: item.ref, id: item.id, ...data }));
  });

  const updates = [];
  let chatsWithPhoto = 0;
  let chatsWithoutResolvablePhoto = 0;

  for (const item of chatSnap.docs) {
    const chat = item.data();
    const assignmentId = clean(chat.assignmentId || chat.asignacion_id || item.id, 180);
    const assignment = assignmentByIdentity.get(assignmentId) || assignmentByIdentity.get(item.id) || {};
    const teacherIdentity = clean(
      chat.teacherUid
      || chat.profesor_id
      || assignment.teacherUid
      || assignment.profesor_id,
      180,
    );
    const teacher = teacherByIdentity.get(teacherIdentity) || {};
    const teacherUserId = clean(teacher.userUid || teacher.firebase_uid || teacher.usuario_id || teacherIdentity, 180);
    const teacherUser = userByIdentity.get(teacherUserId) || {};
    const photo = profilePhoto(teacher)
      || profilePhoto(teacherUser)
      || safePhoto(assignment.teacherPhotoUrl || assignment.profesor_foto_url)
      || safePhoto(chat.teacherPhotoUrl || chat.profesor_foto_url);

    if (!photo) {
      chatsWithoutResolvablePhoto += 1;
      continue;
    }
    chatsWithPhoto += 1;

    if (chat.teacherPhotoUrl !== photo || chat.profesor_foto_url !== photo) {
      updates.push({ ref: item.ref, data: { teacherPhotoUrl: photo, profesor_foto_url: photo }, type: 'chat' });
    }
    if (assignment.ref && (assignment.teacherPhotoUrl !== photo || assignment.profesor_foto_url !== photo)) {
      updates.push({ ref: assignment.ref, data: { teacherPhotoUrl: photo, profesor_foto_url: photo }, type: 'assignment' });
    }
  }

  if (apply) {
    for (let offset = 0; offset < updates.length; offset += 400) {
      const batch = db.batch();
      updates.slice(offset, offset + 400).forEach((update) => batch.set(update.ref, update.data, { merge: true }));
      await batch.commit();
    }
  }

  console.log(JSON.stringify({
    ok: true,
    mode: apply ? 'apply' : 'dry-run',
    chatsScanned: chatSnap.size,
    chatsWithResolvablePhoto: chatsWithPhoto,
    chatsWithoutResolvablePhoto,
    chatUpdates: updates.filter((item) => item.type === 'chat').length,
    assignmentUpdates: updates.filter((item) => item.type === 'assignment').length,
  }, null, 2));
} finally {
  await deleteApp(app).catch(() => {});
}
