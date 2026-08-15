import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import {
  buildNotificationDocument,
  humanReadableNotificationCopy,
  inferNotificationRole,
  minimalUserNotificationCopy,
  notificationActionUrl,
  notificationDisplayGroupKey,
  safeInternalActionUrl,
  shouldCreateUserFacingNotification,
  shouldDisplayNotification,
  userFacingNotificationDedupeKey,
  visibleNotificationsForRole,
} from '../js/notification-engine.js';

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
  automationWorker,
  rules,
  indexes,
  css,
  notificationCenter,
  familyDashboard,
  teacherDashboard,
  studentDashboard,
  adminDashboard,
] = await Promise.all([
  read('js/notification-engine.js'),
  read('js/notifications-provider.js'),
  read('js/push-notifications.js'),
  read('js/chat-widget.js'),
  read('service-worker.js'),
  read('scripts/firebase-automation-worker.mjs'),
  read('firebase/firestore.rules'),
  read('firebase/firestore.indexes.json'),
  read('css/dashboard.css'),
  read('js/notification-center.js'),
  read('pages/dashboard/familia.html'),
  read('pages/dashboard/profesor.html'),
  read('pages/dashboard/alumno.html'),
  read('pages/dashboard/admin.html'),
]);

assert(engine.includes('NOTIFICATION_EVENTS'), 'Notification engine must define event constants.');
assert(engine.includes('class_unmarked_after_24h'), 'Notification engine must include 24h unmarked class event.');
assert(engine.includes('weekly_payment_due'), 'Notification engine must include weekly payment event.');
assert(engine.includes('payment_overdue_reminder'), 'Notification engine must include overdue payment reminder events.');
assert(engine.includes('payment_teacher_pause_warning'), 'Notification engine must include teacher pause warning events.');
assert(engine.includes('alert_priority'), 'Notification engine must include prioritized alert event.');
assert(engine.includes('relationship_followup'), 'Notification engine must include relationship follow-up events.');
assert(engine.includes('proactive_assist'), 'Notification engine must include proactive assistance events.');
assert(engine.includes('chat_message'), 'Notification engine must include chat message event.');
assert(engine.includes('buildNotificationDocument'), 'Notification engine must build normalized documents.');
assert(engine.includes('isNotificationEnabled'), 'Notification engine must expose settings checks.');
assert(engine.includes('safeInternalActionUrl'), 'Notification engine must sanitize action URLs.');
assert(engine.includes('shouldCreateUserFacingNotification'), 'Notification engine must centralize low-noise user notification policy.');
assert(engine.includes('userFacingNotificationDedupeKey'), 'Notification engine must provide user-facing dedupe keys.');
assert(engine.includes('minimalUserNotificationCopy'), 'Notification engine must simplify noisy user-facing copy.');
assert(engine.includes('humanReadableNotificationCopy'), 'Notification engine must turn technical records into complete sentences.');
assert(engine.includes('notificationDisplayGroupKey'), 'Notification engine must group repeated alerts by real-world issue.');
assert(safeInternalActionUrl('/pages/dashboard/admin.html#pagos') === '/pages/dashboard/admin.html#pagos', 'Internal notification URLs must be preserved.');
assert(safeInternalActionUrl('https://evil.example/phishing') === '/pages/login.html', 'External HTTPS notification URLs must be rejected.');
assert(safeInternalActionUrl('//evil.example/phishing') === '/pages/login.html', 'Protocol-relative notification URLs must be rejected.');
assert(safeInternalActionUrl('javascript:alert(1)') === '/pages/login.html', 'Javascript notification URLs must be rejected.');
const unsafeNotification = buildNotificationDocument({
  userUid: 'user_1',
  title: 'Aviso',
  body: 'Prueba',
  payload: { url: 'https://evil.example/phishing' },
});
assert(unsafeNotification.actionUrl === '/pages/login.html', 'Unsafe notification actionUrl must be normalized.');
assert(unsafeNotification.payload.url === '/pages/login.html', 'Unsafe notification payload URL must be normalized.');
assert(notificationActionUrl({ actionUrl: '/pages/dashboard/familia.html#chat' }) === '/pages/dashboard/familia.html#chat', 'Internal notificationActionUrl must be preserved.');
assert(notificationActionUrl({ actionUrl: 'data:text/html,evil' }) === '/pages/login.html', 'Data URL notificationActionUrl must be rejected.');
assert(inferNotificationRole({ key: 'weekly_payment_due_class_1_family' }) === 'familia', 'Notification policy must infer family role from dedupe keys.');
assert(shouldCreateUserFacingNotification({ type: 'weekly_payment_due', role: 'familia' }) === true, 'Family payment due notifications must stay enabled.');
assert(shouldCreateUserFacingNotification({ type: 'profile_updated', role: 'profesor' }) === false, 'Generic profile updates must not notify teachers.');
assert(shouldCreateUserFacingNotification({
  type: 'relationship_followup',
  role: 'familia',
  priority: 'low',
  payload: { actionId: 'relationship_quality_check' },
}) === false, 'Low-value relationship check-ins must not notify families.');
assert(shouldCreateUserFacingNotification({
  type: 'proactive_assist',
  role: 'profesor',
  priority: 'high',
  payload: { category: 'profile' },
}) === true, 'High-priority onboarding/profile blockers must still notify teachers.');
const paymentKeyA = userFacingNotificationDedupeKey({
  type: 'weekly_payment_due',
  role: 'familia',
  payload: { dueAt: '2026-07-05T20:00:00.000Z' },
  key: 'weekly_payment_due_class_a_family',
});
const paymentKeyB = userFacingNotificationDedupeKey({
  type: 'weekly_payment_due',
  role: 'familia',
  payload: { dueAt: '2026-07-05T20:00:00.000Z' },
  key: 'weekly_payment_due_class_b_family',
});
assert(paymentKeyA === paymentKeyB, 'Family payment due notifications for the same due day must be grouped.');
assert(/clases pendientes de justificar/i.test(minimalUserNotificationCopy({
  title: 'Justificante pendiente',
  body: 'Clase concreta',
  type: 'weekly_payment_due',
  role: 'familia',
}).body), 'Grouped family payment notifications must use generic copy.');
assert(shouldDisplayNotification({ type: 'chat_message', readAt: null }, 'familia') === false, 'Chat messages must stay out of the notification centre.');
assert(shouldDisplayNotification({ type: 'class_incident', priority: 'critical', readAt: null }, 'profesor') === true, 'Critical incidents must stay visible.');
assert(shouldDisplayNotification({ type: 'payment_overdue', priority: 'critical', readAt: null, resolvedAt: '2026-08-15T10:00:00.000Z' }, 'admin') === false, 'Resolved family debt must disappear from the action inbox.');
assert(shouldDisplayNotification({
  type: 'payment_verified',
  priority: 'normal',
  readAt: '2026-07-01T10:00:00.000Z',
  createdAt: '2026-07-01T10:00:00.000Z',
}, 'familia', Date.parse('2026-08-08T10:00:00.000Z')) === false, 'Old read confirmations must leave the visible inbox.');
const visibleUserNotifications = visibleNotificationsForRole([
  { id: 'chat', type: 'chat_message', readAt: null },
  { id: 'payment', type: 'weekly_payment_due', priority: 'high', readAt: null },
], 'familia');
assert(visibleUserNotifications.length === 1 && visibleUserNotifications[0].id === 'payment', 'Visible inbox must contain actions, not chat noise.');
const familyDebtGroupA = notificationDisplayGroupKey({
  type: 'payment_overdue',
  payload: { familyUid: 'family-1', classId: 'class-a', url: '/pages/dashboard/admin.html#calendario' },
});
const familyDebtGroupB = notificationDisplayGroupKey({
  type: 'payment_overdue_reminder',
  payload: { familyUid: 'family-1', classId: 'class-b', url: '/pages/dashboard/admin.html#calendario' },
});
assert(familyDebtGroupA === familyDebtGroupB, 'All overdue class notices for one family must render as one issue.');
const clearDebtCopy = humanReadableNotificationCopy({
  type: 'payment_overdue',
  role: 'admin',
  title: 'PAYMENT_OVERDUE family_1',
  body: 'fingerprint: abc source: worker',
  payload: { familyUid: 'family-1', familyName: 'Familia Ruiz', amount: 75, classCount: 2 },
}, 'admin');
assert(clearDebtCopy.title.includes('Familia Ruiz') && clearDebtCopy.title.includes('75'), 'Admin debt title must name the family and exact amount.');
assert(!/fingerprint|source|payment_overdue/i.test(`${clearDebtCopy.title} ${clearDebtCopy.body}`), 'Visible debt copy must never expose internal codes.');
const visibleLimit = visibleNotificationsForRole(Array.from({ length: 30 }, (_, index) => ({
  id: `debt-${index}`,
  type: 'payment_overdue',
  priority: 'high',
  readAt: null,
  createdAt: new Date(Date.now() - index * 1000).toISOString(),
  payload: { familyUid: `family-${index}` },
})), 'admin');
assert(visibleLimit.length === 24, 'The low-noise inbox must cap visible items at 24.');

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
assert(chat.includes('notificationSourceLabel'), 'Notification cards must label Admin vs Sistema source.');
assert(chat.includes('chat-layout-notifications'), 'Notification view must hide chat list when opened from notifications.');
assert(chat.includes('notification-admin-tools'), 'Admin notification tools must stay available but collapsed.');
assert(chat.includes('Activar avisos'), 'Notification view must expose a clear PWA/mobile push activation action.');
assert(chat.includes('Marcar todo revisado'), 'Notification view must expose a simple bulk reviewed action.');
assert(chat.includes('Arreglar incidencia'), 'Incident notifications must lead to a fix action.');
assert(chat.includes('Marcar revisada'), 'Notification cards must use clear reviewed wording.');
assert(!chat.includes('>Abrir</button>'), 'Notification cards must not render a generic open button.');
assert(!chat.includes('>Leida</button>'), 'Notification cards must not render Leida as an action.');

assert(serviceWorker.includes('firebase-messaging-compat'), 'Service worker must load Firebase Messaging for background push.');
assert(serviceWorker.includes('onBackgroundMessage'), 'Service worker must handle FCM background messages.');
assert(serviceWorker.includes('notificationclick'), 'Service worker must handle notification clicks.');

assert(automationWorker.includes('buildNotificationDocument'), 'Automation worker must use the shared notification document contract.');
assert(automationWorker.includes('shouldCreateUserFacingNotification'), 'Automation worker must suppress non-essential family/professor notifications.');
assert(automationWorker.includes('userFacingNotificationDedupeKey'), 'Automation worker must coalesce repeated family payment notifications.');
assert(automationWorker.includes('processPendingPushNotifications'), 'Automation worker must send push notifications without Cloud Functions.');
assert(automationWorker.includes('sendEachForMulticast'), 'Automation worker must deliver web push through FCM.');
assert(automationWorker.includes('safeInternalActionUrl'), 'Automation worker must sanitize notification action URLs before push.');
assert(automationWorker.includes('processChatAutomationBackfill'), 'Automation worker must create chat notifications without deployed Functions.');
assert(automationWorker.includes('processEntityAutomationBackfill'), 'Automation worker must create entity notifications without deployed Functions.');
assert(automationWorker.includes('class_unmarked_after_24h'), 'Automation worker must keep 24h class unmarked notifications.');
assert(automationWorker.includes('teacher_payout_pending'), 'Automation worker must keep teacher payout notifications.');
assert(automationWorker.includes('PAYMENT_OVERDUE_ESCALATION_STEPS'), 'Automation worker must escalate unpaid family payments across days.');
assert(automationWorker.includes('teacher_pause_risk_day_15'), 'Automation worker must warn after more than two weeks unpaid.');
assert(automationWorker.includes('valorar pausar las clases con el profesor'), 'Final unpaid warning must stay cordial and clear about possible professor pause.');

assert(rules.includes('match /notificationTokens/{tokenId}'), 'Firestore rules must protect notification tokens.');
assert(rules.includes("['readAt', 'leida', 'updatedAt']"), 'Firestore rules must allow users to mark notifications read.');
assert(rules.includes('match /notificationPreferences/{userUid}'), 'Firestore rules must expose user notification preferences.');
assert(rules.includes('validInternalUrl'), 'Firestore rules must reject external notification action URLs.');
assert(indexes.includes('"collectionGroup": "notificaciones"'), 'Firestore indexes must include notification feed indexes.');
assert(indexes.includes('"collectionGroup": "notificationTokens"'), 'Firestore indexes must include token lookup indexes.');

assert(css.includes('.notification-settings-form'), 'Dashboard CSS must style notification settings.');
assert(css.includes('.notification-item.priority-critical'), 'Dashboard CSS must style critical notifications.');
assert(css.includes('.chat-layout-notifications'), 'Dashboard CSS must isolate notifications from chat list.');
assert(css.includes('.notification-center-shell'), 'Dashboard CSS must style the dedicated notification centre.');
assert(notificationCenter.includes('Centro de avisos'), 'Dedicated notification centre must have a distinct identity.');
assert(notificationCenter.includes('Los mensajes están en Chat'), 'Notification centre must explain the separation from chat.');
assert(notificationCenter.includes('data-resolve-notification'), 'Visible notifications must expose a direct resolution action.');
assert(notificationCenter.includes('visibleNotificationsForRole'), 'Notification centre must apply the low-noise policy.');
assert(notificationCenter.includes('notificationPeople(payload)') && notificationCenter.includes('payload.students') && notificationCenter.includes('payload.teachers'), 'Admin notices must render every related child and teacher.');
[familyDashboard, teacherDashboard, studentDashboard, adminDashboard].forEach((dashboard, index) => {
  assert(dashboard.includes('section-notificaciones'), `Dashboard ${index + 1} must have a dedicated notification section.`);
  assert(dashboard.includes('notification-center.js?v='), `Dashboard ${index + 1} must load a versioned notification centre.`);
});
assert(adminDashboard.includes('notification-center.js?v=20260815-debt-summary'), 'Admin must load the identity-aware, low-noise debt notification centre.');

console.log('Notification system validation passed.');
