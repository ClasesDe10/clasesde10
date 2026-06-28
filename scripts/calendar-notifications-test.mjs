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
  professorDashboard,
  familyDashboard,
  adminDashboard,
  chatWidget,
  notificationsProvider,
  automationWorker,
  rules,
  serviceWorker,
] = await Promise.all([
  read('pages/dashboard/profesor.html'),
  read('pages/dashboard/familia.html'),
  read('pages/dashboard/admin.html'),
  read('js/chat-widget.js'),
  read('js/notifications-provider.js'),
  read('scripts/firebase-automation-worker.mjs'),
  read('firebase/firestore.rules'),
  read('service-worker.js'),
]);

assert(professorDashboard.includes('function claseTerminada'), 'Professor dashboard must decide if a class has really ended.');
assert(professorDashboard.includes(".lte('fecha', hoy).eq('estado','programada')"), 'Professor pending-class scan must include classes from today.');
assert(professorDashboard.includes('teacherMarkedAt'), 'Professor class registration must store teacherMarkedAt.');
assert(professorDashboard.includes("estado === 'programada' && claseTerminada"), 'Professor register action must use end time, not only date.');

assert(familyDashboard.includes('confirmar-clase-familia'), 'Family dashboard must allow confirming class delivery.');
assert(familyDashboard.includes('familyConfirmationStatus'), 'Family confirmation must write a structured confirmation status.');
assert(familyDashboard.includes('labelConfirmacionFamilia'), 'Family dashboard must render confirmation state.');

assert(chatWidget.includes('Chat / Notificaciones'), 'Chat widget must expose the combined chat/notifications surface.');
assert(chatWidget.includes('data-chat-tab="notificaciones"'), 'Chat widget must render a notifications tab.');
assert(chatWidget.includes('watchUserNotifications'), 'Chat widget must subscribe to user notifications.');
assert(chatWidget.includes('requestBrowserNotificationPermission'), 'Chat widget must offer browser/PWA notification permission.');
assert(chatWidget.includes('showBrowserNotification'), 'Chat widget must surface new notifications through browser notifications when allowed.');
assert(chatWidget.includes('data-admin-notification-form'), 'Chat widget must expose manual notification sending for admins.');
assert(chatWidget.includes("type: 'admin_manual'"), 'Admin manual notifications must be typed explicitly.');

assert(notificationsProvider.includes("where('userUid', '==', usuarioId)"), 'Notifications provider must read by userUid.');
assert(notificationsProvider.includes('readAt'), 'Notifications provider must use readAt for unread state.');
assert(serviceWorker.includes('notificationclick'), 'Service worker must handle notification clicks.');

assert(automationWorker.includes('processUnmarkedClasses'), 'Automation worker must process unmarked classes.');
assert(automationWorker.includes('class_unmarked_after_1h'), 'Automation worker must create one-hour class reminders.');
assert(automationWorker.includes('processPaymentReminders'), 'Automation worker must process payment reminders.');
assert(automationWorker.includes('weekly_payment_due'), 'Automation worker must create weekly payment reminders.');
assert(automationWorker.includes('notifyUserOnce'), 'Automation notifications must be idempotent.');

assert(rules.includes('validTeacherClassUpdate'), 'Firestore rules must validate teacher class updates.');
assert(rules.includes('validFamilyClassConfirmationUpdate'), 'Firestore rules must validate family class confirmations.');
assert(rules.includes('reprogramada'), 'Firestore rules must allow teacher reprogrammed status.');

console.log('Calendar and notifications validation passed.');
