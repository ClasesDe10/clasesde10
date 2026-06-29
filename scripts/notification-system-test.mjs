import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function read(relativePath) {
  return readFile(path.join(root, relativePath), 'utf8');
}

const [
  engine,
  provider,
  push,
  chat,
  serviceWorker,
  functions,
  automationWorker,
  rules,
  indexes,
  css,
] = await Promise.all([
  read('js/notification-engine.js'),
  read('js/notifications-provider.js'),
  read('js/push-notifications.js'),
  read('js/chat-widget.js'),
  read('service-worker.js'),
  read('functions/index.js'),
  read('scripts/firebase-automation-worker.mjs'),
  read('firebase/firestore.rules'),
  read('firebase/firestore.indexes.json'),
  read('css/dashboard.css'),
]);

assert(engine.includes('NOTIFICATION_EVENTS'), 'Notification engine must define event constants.');
assert(engine.includes('class_unmarked_after_1h'), 'Notification engine must include unmarked class event.');
assert(engine.includes('weekly_payment_due'), 'Notification engine must include weekly payment event.');
assert(engine.includes('chat_message'), 'Notification engine must include chat message event.');
assert(engine.includes('buildNotificationDocument'), 'Notification engine must build normalized documents.');
assert(engine.includes('isNotificationEnabled'), 'Notification engine must expose settings checks.');

assert(provider.includes('loadNotificationSettings'), 'Provider must load admin notification settings.');
assert(provider.includes('saveNotificationSettings'), 'Provider must save admin notification settings.');
assert(provider.includes('createAdminNotification'), 'Provider must create admin notifications through the shared contract.');
assert(provider.includes("orderBy('createdAt', 'desc')"), 'Provider must order notification feed by createdAt.');
assert(provider.includes('leida: true'), 'Provider must keep legacy leida state in sync.');

assert(push.includes('getToken'), 'Push module must obtain FCM tokens.');
assert(push.includes('notificationTokens'), 'Push module must persist device tokens.');
assert(push.includes('configuracionPublica'), 'Push module must read public VAPID configuration.');
assert(push.includes('watchForegroundPushMessages'), 'Push module must handle foreground push messages.');

assert(chat.includes('data-notification-settings-form'), 'Chat widget must expose admin notification settings.');
assert(chat.includes('registerPushNotifications'), 'Chat widget must register push devices.');
assert(chat.includes('data-open-notification'), 'Chat widget must allow opening notification actions.');
assert(chat.includes('notificationPriorityClass'), 'Chat widget must render notification priority.');
assert(chat.includes('dashboardSectionForNotification'), 'Chat widget must map notification actions to dashboard sections.');
assert(chat.includes('notificationDisplayItems'), 'Chat widget must group duplicate notification cards.');
assert(chat.includes('Marcar revisada'), 'Notification cards must use clear reviewed wording.');
assert(!chat.includes('>Abrir</button>'), 'Notification cards must not render a generic open button.');
assert(!chat.includes('>Leida</button>'), 'Notification cards must not render Leida as an action.');

assert(serviceWorker.includes('firebase-messaging-compat'), 'Service worker must load Firebase Messaging for background push.');
assert(serviceWorker.includes('onBackgroundMessage'), 'Service worker must handle FCM background messages.');
assert(serviceWorker.includes('notificationclick'), 'Service worker must handle notification clicks.');

assert(functions.includes('sendPushOnNotificationCreated'), 'Functions must send push when notification documents are created.');
assert(functions.includes('notifyOnChatMessage'), 'Functions must create notifications for new chat messages.');
assert(functions.includes('notifyOnDocumentCreated'), 'Functions must notify admins about pending documents.');
assert(functions.includes('notifyOnIncidentCreated'), 'Functions must notify admins about incidents.');
assert(functions.includes('notifyOnTeacherProfileUpdated'), 'Functions must notify admins about teacher profile updates.');
assert(functions.includes('notifyOnFamilyProfileUpdated'), 'Functions must notify admins about family profile updates.');
assert(functions.includes('assignment_created'), 'Functions must notify assignment creation.');

assert(automationWorker.includes('buildNotificationDocument'), 'Automation worker must use the shared notification document contract.');
assert(automationWorker.includes('class_unmarked_after_1h'), 'Automation worker must keep class unmarked notifications.');
assert(automationWorker.includes('teacher_payout_pending'), 'Automation worker must keep teacher payout notifications.');

assert(rules.includes('match /notificationTokens/{tokenId}'), 'Firestore rules must protect notification tokens.');
assert(rules.includes("['readAt', 'leida', 'updatedAt']"), 'Firestore rules must allow users to mark notifications read.');
assert(rules.includes('match /notificationPreferences/{userUid}'), 'Firestore rules must expose user notification preferences.');
assert(indexes.includes('"collectionGroup": "notificaciones"'), 'Firestore indexes must include notification feed indexes.');
assert(indexes.includes('"collectionGroup": "notificationTokens"'), 'Firestore indexes must include token lookup indexes.');

assert(css.includes('.notification-settings-form'), 'Dashboard CSS must style notification settings.');
assert(css.includes('.notification-item.priority-critical'), 'Dashboard CSS must style critical notifications.');

console.log('Notification system validation passed.');
