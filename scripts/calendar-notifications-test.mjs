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
  studentDashboard,
  adminDashboard,
  chatWidget,
  notificationsProvider,
  calendarEngine,
  classLifecycleEngine,
  calendarSync,
  automationWorker,
  rules,
  serviceWorker,
] = await Promise.all([
  read('pages/dashboard/profesor.html'),
  read('pages/dashboard/familia.html'),
  read('pages/dashboard/alumno.html'),
  read('pages/dashboard/admin.html'),
  read('js/chat-widget.js'),
  read('js/notifications-provider.js'),
  read('js/calendar-engine.js'),
  read('js/class-lifecycle-engine.js'),
  read('js/calendar-sync.js'),
  read('scripts/firebase-automation-worker.mjs'),
  read('firebase/firestore.rules'),
  read('service-worker.js'),
]);

assert(calendarEngine.includes('CLASS_STATUSES'), 'Calendar engine must define class statuses.');
assert(calendarEngine.includes('SCHEDULED_CLASS_STATUSES'), 'Calendar engine must define scheduled aliases.');
assert(calendarEngine.includes('buildAdminClassPayload'), 'Calendar engine must build admin class payloads.');
assert(calendarEngine.includes('buildTeacherAttendancePayload'), 'Calendar engine must build teacher attendance payloads.');
assert(calendarEngine.includes('buildFamilyConfirmationPayload'), 'Calendar engine must build family confirmation payloads.');
assert(calendarEngine.includes('buildClassIncidentPayload'), 'Calendar engine must build class incidents.');
assert(calendarEngine.includes('buildParticipantClassIncidentCreatePayload'), 'Calendar engine must build rules-compatible participant class incidents.');
assert(calendarEngine.includes('classReminderWindows'), 'Calendar engine must expose reminder windows.');
assert(calendarEngine.includes('lifecycleStatusForClassStatus'), 'Calendar engine must write professional lifecycle states.');

assert(classLifecycleEngine.includes('CLASS_LIFECYCLE_STATES'), 'Class lifecycle engine must define lifecycle states.');
assert(classLifecycleEngine.includes('CLASS_LIFECYCLE_TRANSITIONS'), 'Class lifecycle engine must define allowed transitions.');
assert(classLifecycleEngine.includes('deriveLifecycleTargetState'), 'Class lifecycle engine must derive target state.');
assert(classLifecycleEngine.includes('buildClassLifecycleTransition'), 'Class lifecycle engine must build auditable transitions.');
assert(classLifecycleEngine.includes("'clase_proxima'"), 'Class lifecycle engine must represent upcoming classes explicitly.');
assert(classLifecycleEngine.includes("'pago_en_revision'"), 'Class lifecycle engine must represent linked payment review explicitly.');

assert(calendarSync.includes('buildIcsCalendar'), 'Calendar sync must prepare iCalendar export.');
assert(calendarSync.includes('googleCalendarTemplateUrl'), 'Calendar sync must prepare Google Calendar links.');
assert(calendarSync.includes('future_oauth_push'), 'Calendar sync must document future Google push architecture.');

assert(professorDashboard.includes('buildTeacherAttendancePayload'), 'Professor dashboard must use the calendar adapter payload for marking classes.');
assert(professorDashboard.includes('buildParticipantClassIncidentCreatePayload'), 'Professor dashboard must create class incidents when reporting no-show classes.');
assert(professorDashboard.includes("addDoc(firestoreCollection(firebaseDb, 'incidencias'), incidentPayload)"), 'Professor reported no-show classes must persist an incident immediately.');
assert(professorDashboard.includes('data-action="actualizar-asistencia-calendario"'), 'Professor calendar must expose quick attendance status select.');
assert(professorDashboard.includes('Cobras'), 'Professor calendar side panel must show the teacher earnings for each class.');
assert(professorDashboard.includes('teacherSelfDisplayName'), 'Professor calendar side panel must show the concrete teacher name.');
assert(professorDashboard.includes('classAttendanceCalendarVisual'), 'Professor calendar must prioritize the shared attendance visual state.');
assert(professorDashboard.includes('teacherCalendarClassVisual'), 'Professor calendar must combine attendance and economic status by urgency.');
assert(professorDashboard.includes('renderTeacherAttendanceSummary(c)'), 'Professor calendar cards must name the attendance state instead of relying on color.');
assert(professorDashboard.includes("{ className: 'dot-red', label: 'Revisar ahora' }"), 'Professor legend must define red as immediate review.');
assert(professorDashboard.includes("if (['solicitado', 'procesando'].includes(status))"), 'Only genuinely requested teacher payouts may appear as in process.');
assert(!professorDashboard.includes("['solicitado', 'procesando', 'pendiente'].includes(status)"), 'A default pending payout must not make future classes look financially in process.');
assert(professorDashboard.includes('isScheduledClassStatus'), 'Professor dashboard must support legacy and canonical scheduled states.');
assert(professorDashboard.includes('classStatusForBadge'), 'Professor dashboard must render normalized calendar status badges.');
assert(professorDashboard.includes('claseTerminada(clase, 0)'), 'Professor pending-class scan must use actual class end time.');

assert(familyDashboard.includes('buildFamilyConfirmationPayload'), 'Family dashboard must use the calendar adapter payload for confirmations.');
assert(familyDashboard.includes('buildParticipantClassIncidentCreatePayload'), 'Family dashboard must create class incidents through the shared rules-compatible builder.');
assert(familyDashboard.includes("addDoc(firestoreCollection(firebaseDb, 'incidencias'), incidentPayload)"), 'Family incidents must be persisted through Firestore rules-compatible writes.');
assert(familyDashboard.includes('createdAt: serverTimestamp()'), 'Family incidents must use server timestamps required by Firestore rules.');
assert(familyDashboard.includes('data-action="enviar-justificante-calendario"'), 'Family calendar side panel must expose the unified payment proof action.');
assert(familyDashboard.includes('renderFamilyCalendarProofMinimal'), 'Family calendar side panel must use the minimal proof block.');
assert(!familyDashboard.includes('renderPaymentStateBadgeCompact(c)'), 'Family calendar class card must stay minimal without duplicated payment status blocks.');
assert(familyDashboard.includes('classAttendanceCalendarVisual'), 'Family calendar must use the same attendance semantics as the professor calendar.');
assert(familyDashboard.includes('familyCalendarClassVisual'), 'Family calendar must combine attendance and payment status by urgency.');
assert(familyDashboard.includes('labelConfirmacionFamilia(c)'), 'Family calendar cards must explain the attendance state in text.');
assert(familyDashboard.includes("{ className: 'dot-red', label: 'Revisar ahora' }"), 'Family legend must define red as immediate review.');
assert(familyDashboard.includes("payment.state === 'pending' ? (attendance.ended ? 70 : 20)"), 'Future classes must not look like an immediately pending payment.');
assert(familyDashboard.includes('isScheduledClassStatus'), 'Family dashboard must support scheduled aliases.');

assert(studentDashboard.includes('isScheduledClassStatus'), 'Student dashboard must support scheduled aliases.');
assert(studentDashboard.includes('classStatusForBadge'), 'Student dashboard must render normalized status badges.');

assert(adminDashboard.includes('buildAdminClassPayload'), 'Admin dashboard must create classes through the calendar payload builder.');
assert(adminDashboard.includes('data-action="actualizar-asistencia-admin"'), 'Admin calendar must expose attendance status select.');
assert(adminDashboard.includes('Confirmada por ambos'), 'Admin calendar side panel must show both-party confirmation status.');
assert(adminDashboard.includes('validateClassTimeRange'), 'Admin dashboard must validate class time ranges.');
assert(adminDashboard.includes('calendarSyncMetadata'), 'Admin dashboard must store calendar sync metadata.');
assert(adminDashboard.includes('data-family-uid'), 'Admin class selector must preserve family recipient data.');
assert(adminDashboard.includes("type: 'class_schedule_change'"), 'Admin class changes must notify class participants.');
assert(adminDashboard.includes('result.data?.id'), 'New class notifications must use the real saved class id.');

assert(chatWidget.includes('<div class="chat-title">Mensajes <span'), 'Chat widget must expose a dedicated messaging surface.');
assert(chatWidget.includes('data-chat-tab="notificaciones"'), 'Chat widget must render a notifications tab.');
assert(chatWidget.includes('chat-layout-notifications'), 'Notifications view must be visually isolated from chat list.');
assert(chatWidget.includes('watchUserNotifications'), 'Chat widget must subscribe to user notifications.');
assert(chatWidget.includes('requestBrowserNotificationPermission'), 'Chat widget must offer browser/PWA notification permission.');
assert(chatWidget.includes('showBrowserNotification'), 'Chat widget must surface new notifications through browser notifications when allowed.');
assert(chatWidget.includes('data-admin-notification-form'), 'Chat widget must expose manual notification sending for admins.');

assert(notificationsProvider.includes("where('userUid', '==', usuarioId)"), 'Notifications provider must read by userUid.');
assert(notificationsProvider.includes('readAt'), 'Notifications provider must use readAt for unread state.');
assert(serviceWorker.includes('notificationclick'), 'Service worker must handle notification clicks.');

assert(automationWorker.includes('processUpcomingClassReminders'), 'Automation worker must process upcoming class reminders.');
assert(automationWorker.includes('class_reminder'), 'Automation worker must send class reminder notifications.');
assert(automationWorker.includes('processUnmarkedClasses'), 'Automation worker must process unmarked classes.');
assert(automationWorker.includes('class_unmarked_after_24h'), 'Automation worker must create 24h class result reminders.');
assert(automationWorker.includes('unmarked_after_24h'), 'Automation worker must escalate stale unmarked classes.');
assert(automationWorker.includes('processAttendanceConfirmations'), 'Automation worker must reconcile class attendance confirmations.');
assert(automationWorker.includes('createClassIncidentOnce'), 'Automation worker must create idempotent class incidents.');
assert(automationWorker.includes('findOpenClassIncident'), 'Automation worker must avoid duplicate class incidents when a participant already reported one.');
assert(automationWorker.includes('class_incident_${source}_${doc.id}_admin'), 'Automation worker must notify admins about attendance incidents with a stable dedupe key.');
assert(automationWorker.includes('processPaymentReminders'), 'Automation worker must process payment reminders.');
assert(automationWorker.includes('weekly_payment_due'), 'Automation worker must create weekly payment reminders.');
assert(automationWorker.includes('PAYMENT_PROOF_OVERDUE_PENALTY_POINTS'), 'Automation worker must penalize overdue proof notifications.');
assert(automationWorker.includes('CLASS_UNMARKED_PENALTY_POINTS'), 'Automation worker must penalize stale attendance notifications.');
assert(automationWorker.includes('trustPenaltyEvents'), 'Automation worker must persist trust penalty events.');
assert(automationWorker.includes('processLinkedFamilyPaymentContext'), 'Automation worker must sync linked family payment context before lifecycle transitions.');
assert(automationWorker.includes('linkedFamilyPaymentContextPatch'), 'Automation worker must materialize linked payment status on classes.');
assert(automationWorker.includes("type: 'class.payment_review_started'"), 'Automation worker must emit a specific event when class payment review starts.');
assert(automationWorker.includes('notifyUserOnce'), 'Automation notifications must be idempotent.');
assert(automationWorker.includes('processClassLifecycle'), 'Automation worker must process lifecycle transitions.');
assert(automationWorker.includes('classLifecycleEvents'), 'Automation worker must write lifecycle history events.');
assert(automationWorker.includes('class_lifecycle_transition'), 'Automation worker must audit lifecycle transitions.');
assert(automationWorker.includes('classId: data.id'), 'Lifecycle automation events must use the class row id from listCollection.');
assert(!automationWorker.includes('classId: doc.id,\n      from: transition.from'), 'Lifecycle automation must not reference an undefined doc variable.');

assert(rules.includes('validTeacherClassUpdate'), 'Firestore rules must validate teacher class updates.');
assert(rules.includes('validFamilyClassConfirmationUpdate'), 'Firestore rules must validate family class confirmations.');
assert(rules.includes('validClassIncidentCreate'), 'Firestore rules must validate participant-created class incidents.');
assert(rules.includes('match /incidencias/{incidentId}'), 'Firestore rules must expose class incident permissions.');
assert(rules.includes('lifecycleStatus'), 'Firestore rules must allow lifecycle status updates.');
assert(rules.includes('match /classLifecycleEvents/{eventId}'), 'Firestore rules must expose lifecycle event permissions.');

console.log('Calendar and notifications validation passed.');
