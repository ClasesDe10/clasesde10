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

const [admin, chat, rules, automationEngine, automationWorker, css, classCancellation, firebaseConfig] = await Promise.all([
  read('pages/dashboard/admin.html'),
  read('js/chat-widget.js'),
  read('firebase/firestore.rules'),
  read('functions/platform-automation-engine.js'),
  read('scripts/firebase-automation-worker.mjs'),
  read('css/dashboard.css'),
  read('js/class-cancellation.js'),
  read('firebase.json'),
]);

assert(admin.includes('prepararFlujoAsignacion'), 'Admin assignment must prepare chat scheduling flow.');
assert(admin.includes("schedulingStatus: 'pendiente_horario'"), 'Assignments must start as pending scheduling.');
assert(admin.includes('buildAssignmentPricingQuote'), 'Admin assignment must attach pricing to matching decisions.');
assert(admin.includes('renderPricingQuoteLine'), 'Admin matching must display family price, teacher amount and margin.');
assert(admin.includes('Profesor asignado, chat creado'), 'Admin must confirm chat creation after assignment.');
assert(!admin.includes('assignment_ready_for_scheduling'), 'Admin must not write duplicate scheduling automation events from the browser.');
assert(!admin.includes('NOTIFICATION_EVENTS.ASSIGNMENT_CREATED'), 'Assignment notifications must be centralized in the automation worker.');

assert(chat.includes('data-schedule-form'), 'Chat widget must render schedule proposal form.');
assert(chat.includes('availability-engine.js'), 'Chat widget must use the shared availability engine.');
assert(chat.includes('loadChatAvailability'), 'Chat widget must load teacher and student availability.');
assert(chat.includes('validateScheduleAvailability'), 'Chat widget must validate proposals against availability slots.');
assert(chat.includes("collection(firebaseDb, 'busySlots')"), 'Chat widget must load sanitized busy slots for occupied class times.');
assert(chat.includes('busySlotsForChatValidation'), 'Chat widget must combine persisted busy slots and accepted chat proposals.');
assert(chat.includes('findBusySlotConflict'), 'Accepted proposals must be rechecked against occupied slots before class creation.');
assert(chat.includes('persistBusySlotsForClass'), 'Accepted proposal classes must materialize occupied slots for future scheduling.');
assert(chat.includes('repairBusySlotsFromVisibleClasses'), 'Chat widget must self-heal busy slots from visible existing classes when Functions are not available.');
assert(chat.includes("availabilityValidation.reason === 'outside_own_availability'"), 'Acceptance must allow the accepting user to override their own availability while preserving counterparty/busy checks.');
assert(chat.includes('availabilityStatus'), 'Schedule proposals must store availability validation status.');
assert(chat.includes("collection(firebaseDb, 'chats', state.selectedChat.id, 'programaciones')"), 'Chat widget must persist schedule proposals.');
assert(chat.includes('acceptScheduleProposal'), 'Chat widget must support accepting schedule proposals.');
assert(chat.includes("createdFrom: 'chat_schedule_proposal'"), 'Accepted proposals must create traceable class documents.');
assert(chat.includes('buildAdminClassPayload'), 'Accepted proposals must reuse the shared class payload engine.');
assert(chat.includes('buildClassPricingQuote'), 'Accepted proposals must price classes before creating them.');
assert(chat.includes('proratedPricingFromHourly'), 'Chat scheduling must prorate assignment hourly pricing by class duration.');
assert(chat.includes('precio_hora_familia: familyHourly'), 'Chat scheduling must preserve family hourly rate on accepted classes.');
assert(chat.includes('importe_hora_profesor: teacherHourly'), 'Chat scheduling must preserve teacher hourly rate on accepted classes.');
assert(chat.includes('pickClassPriceFields(occurrenceFields)'), 'Accepted proposals must persist family, teacher and platform amounts on every occurrence.');
assert(chat.includes('participantUids'), 'Accepted proposal classes must store participant auth ids for legacy/id-compatible reads.');
assert(chat.includes('updatedAt: serverTimestamp()'), 'Class creation must satisfy Firestore timestamp rules.');
assert(chat.includes('data-chat-name-form'), 'Chat widget must let each participant save a private chat display name.');
assert(chat.includes('data-open-schedule-planner'), 'Chat widget must keep schedule planning collapsed behind explicit actions.');
assert(chat.includes('chat-schedule-visible-proposals'), 'Pending or accepted schedule proposals must stay visible while the planner form is collapsed.');
assert(chat.includes('data-focus-active-proposal'), 'Chat widget must expose one clear action to respond to active schedule proposals.');
assert(chat.includes('data-open-dashboard-section'), 'Chat widget must route missing own availability to the right dashboard section.');
assert(chat.includes('data-chat-open-panel="chats"'), 'Secondary notification actions must switch panels without duplicating chat tab selectors.');
assert(!chat.includes('data-chat-tab="chats">Ver chats'), 'Only real tabs should use data-chat-tab to avoid ambiguous chat controls.');
assert(chat.includes('weekly_recurring'), 'Chat widget must support fixed weekly class schedules.');
assert(chat.includes('one_off'), 'Chat widget must support one-off class exceptions.');
assert(chat.includes('data-schedule-weekday'), 'Weekly fixed schedules must ask for a weekday, not a numeric calendar date.');
assert(chat.includes('nextDateForWeekday'), 'Weekly fixed schedules must calculate the first real class date automatically.');
assert(chat.includes('dayOfWeek: selectedWeekday'), 'Weekly schedules must store the selected weekday in recurrence metadata.');
assert(chat.includes('readScheduleDraft'), 'Schedule planner must preserve user-entered draft values across async rerenders.');
assert(chat.includes('recurrenceLabelFromFields'), 'Weekly schedules must render a compact recurring label.');
assert(chat.includes('academicYearEndForDate'), 'Weekly accepted schedules must calculate the academic-year end in June.');
assert(chat.includes('buildWeeklyClassOccurrences'), 'Weekly accepted schedules must create all calendar occurrences.');
assert(chat.includes('writeBatch(firebaseDb)'), 'Weekly accepted schedules must persist the class series consistently.');
assert(chat.includes('Se han creado ${classIds.length} clases'), 'Weekly accepted schedules must explain how many classes were created.');
assert(!chat.includes('data-chat-layout-mode'), 'Chat widget must not expose the old mixed chat/classes layout selector.');
assert(chat.includes("doc(firebaseDb, 'chats', chat.id, 'preferencias', currentUid)"), 'Chat widget must load per-user chat preferences.');
assert(chat.includes("doc(firebaseDb, 'chats', state.selectedChat.id, 'preferencias', currentUid)"), 'Chat widget must persist chat preferences per current user.');
assert(chat.includes('readableChatIdentity'), 'Chat widget must reject one-letter/generic chat names before rendering titles.');
assert(chat.includes('shortChatEntityLabel'), 'Chat widget must fall back to role labels with short ids when chat names are incomplete.');
assert(chat.includes('realChatTitle'), 'Chat widget must only show a real chat name when it comes from profile data, not from fallback labels.');
assert(chat.includes('renderChatCounterpartAvatar'), 'Family chat must render the professor avatar next to the teacher name.');
assert(chat.includes('chatCounterpartPhotoUrl'), 'Family chat must resolve the professor profile photo from chat data.');
assert(chat.includes('teacherPhotoUrl') && chat.includes('profesor_foto_url'), 'Chat documents must carry professor profile photo aliases.');
assert(chat.includes('data-chat-start-call'), 'Chat must expose an in-app voice call action.');
assert(chat.includes('data-chat-start-call="video"'), 'Chat must expose a first-party video call action.');
assert(chat.includes('chat-call-primary') && chat.includes('<span>Llamar</span>'), 'The voice call action must be visibly labelled instead of relying on an icon.');
assert(!chat.includes("if (!chat?.id || role === 'admin') return '';"), 'Admin chat must render the same call action as family and professor chats.');
assert(!chat.includes("if (!chat?.id || role === 'admin') return null;"), 'Admin chat must receive incoming call state.');
assert(!chat.includes("if (!state.selectedChat || role === 'admin') return;"), 'Admin chat must be able to start and join calls.');
assert(chat.includes('data-chat-join-call'), 'Chat call messages must let the other participant join the call.');
assert(chat.includes('RTCPeerConnection'), 'Chat calls must use browser audio calls instead of phone numbers.');
assert(chat.includes('echoCancellation: true') && chat.includes('noiseSuppression: true') && chat.includes("callKind === 'video'"), 'Chat calls must request processed audio and optional camera video.');
assert(chat.includes('startFirestoreAudioFallback'), 'Chat calls must include a first-party HTTPS audio fallback for restrictive networks.');
assert(chat.includes("transportMode: 'firestore_audio'"), 'Chat calls must synchronize the HTTPS fallback between both participants.');
assert(chat.includes("codec: 'mulaw'") && chat.includes('VOICE_CALL_FALLBACK_CHUNK_SAMPLES'), 'The HTTPS fallback must use bounded low-bandwidth audio chunks.');
assert(!chat.includes('openrelay.metered.ca'), 'Chat calls must not depend on unauthenticated public TURN relays.');
assert(chat.includes('pendingRemoteCandidates'), 'Chat calls must queue remote ICE candidates until the remote description is ready.');
assert(chat.includes('flushRemoteCandidates'), 'Chat calls must flush queued ICE candidates after setting the remote description.');
assert(!chat.includes('sdp: clean(description?.sdp'), 'Chat calls must preserve the SDP final CRLF required by browsers.');
assert(chat.includes('watchIncomingVoiceCalls'), 'Chat must surface incoming calls in real time without depending on message rendering.');
assert(chat.includes('VOICE_CALL_RING_TIMEOUT_MS'), 'Unanswered calls must expire instead of remaining permanently open.');
assert(chat.includes('data-chat-toggle-mute'), 'Active calls must let each participant mute their microphone.');
assert(chat.includes('data-chat-enable-audio'), 'Calls must recover from browser autoplay blocking.');
assert(chat.includes("messageType: 'call'"), 'Chat voice calls must be persisted as call messages.');
assert(chat.includes('ClasesDe10 no comparte telefonos reales'), 'Chat voice calls must explain that real phones are not shared.');
assert(!chat.includes('Solicitud de llamada'), 'Chat must not use the old call-request-only wording.');
assert(!chat.includes('href="tel:'), 'Chat must not expose real phone numbers through tel links.');
assert(chat.includes('renderVideoCallStage') && chat.includes('data-chat-toggle-camera'), 'Video calls must render remote/local video and expose a camera control.');
assert(firebaseConfig.includes('camera=(self), microphone=(self)'), 'Production hosting must allow first-party camera and microphone access for chat calls.');
assert(chat.includes('chatUnreadCount') && chat.includes('data-chat-total-unread'), 'Chat must expose persistent unread counters.');
assert(chat.includes('markChatDelivered') && chat.includes('markChatRead'), 'Chat must distinguish delivered messages from read messages.');
assert(chat.includes('renderMessageReceipt') && chat.includes('Entregado') && chat.includes('Visto'), 'Outgoing messages must show sent, delivered and seen receipts.');
assert(chat.includes('watchTyping') && chat.includes('está escribiendo'), 'Chat must show a real-time typing indicator.');
assert(chat.includes('isEmailLikeChatIdentity') && chat.includes("text.includes('@')"), 'Chat identities must reject email addresses before rendering them.');
assert(chat.includes('!isEmailLikeChatIdentity(fallbackText)'), 'Chat names and private aliases must also reject email fallbacks.');
assert(chat.includes('currentChatSenderName(usuario, role)'), 'Typing and messages must publish the profile first name instead of an email fallback.');
assert(chat.includes('chatParticipantDisplayName(chat, role, senderName)'), 'Typing must recover the sender name from the chat participant profile when the session lacks it.');
assert(chat.includes('typingCounterpartDisplayName(chat, role'), 'Typing indicators must resolve the receiver alias or the sender first name.');
assert(!chat.includes('usuario.displayName, usuario.email) || role'), 'Chat sender identity must never fall back to the account email.');
assert(chat.includes('syncChatRealtimeSubscriptions'), 'Conversation list metadata must update in real time outside the selected thread.');
assert(chat.includes('showBrowserNotification') && chat.includes('chat-nav-unread'), 'Incoming messages must surface outside the open chat.');
assert(chat.includes("'hidden style=\"display:none\"'"), 'The dedicated notification centre must stay visually separate when chat notifications are disabled.');
assert(!chat.includes('meet.jit.si'), 'Chat must not generate external videocall rooms.');
assert(chat.includes('Esperando respuesta'), 'Own schedule proposals must clearly show they are waiting for the other participant.');
assert(chat.includes("relationshipStage: 'horario_propuesto'"), 'Schedule proposals must update the chat relationship stage.');
assert(chat.includes("relationshipStage: 'clase_programada'"), 'Accepted proposals must activate the scheduled relationship stage.');
assert(chat.includes("lastRelationshipEvent: 'class_scheduled_from_chat'"), 'Accepted proposals must leave a relationship event marker.');
assert(!chat.includes("collection(firebaseDb, 'notificaciones')"), 'Chat widget must not create chat notifications directly.');

assert(automationEngine.includes('schedule.proposed.core'), 'Automation rules must cover schedule proposals.');
assert(automationEngine.includes('assignment.created.core'), 'Automation rules must cover assignment creation.');
assert(automationWorker.includes('ensureChatForAssignmentWorker'), 'Worker must be able to repair assignment chats without deployed Functions.');
assert(automationWorker.includes("'relationship.ensure_chat'"), 'Worker must dispatch relationship.ensure_chat system jobs.');
assert(automationWorker.includes('createPaymentRequestForClassWorker'), 'Worker must be able to create payment requests from completed classes.');
assert(automationWorker.includes("'payment.request_for_class'"), 'Worker must dispatch payment.request_for_class system jobs.');
assert(automationWorker.includes('processEntityAutomationBackfill'), 'Worker must backfill entity automation events when Functions are not deployed.');
assert(automationWorker.includes('entityBackfillLookbackHours'), 'Worker entity backfill must avoid turning old history into new notifications.');
assert(automationWorker.includes('entityBackfillEventsMaterialized'), 'Worker must report materialized entity automation events.');
for (const eventType of [
  'user.registered',
  'profile.updated',
  'teacher.verified',
  'request.created',
  'assignment.created',
  'class.scheduled',
  'payment.created',
  'payment.verified',
  'document.created',
  'incident.created',
  'review.created',
]) {
  assert(automationWorker.includes(`'${eventType}'`), `Worker entity backfill must materialize ${eventType}.`);
}
assert(automationWorker.includes('processChatAutomationBackfill'), 'Worker must backfill chat automation events when Functions are not deployed.');
assert(automationWorker.includes('recipientUidsForChat'), 'Worker message backfill must notify participants and admins like Functions.');
assert(automationWorker.includes("listCollectionGroup(db, 'mensajes'"), 'Worker must scan chat messages for notification backfill.');
assert(automationWorker.includes("listCollectionGroup(db, 'programaciones'"), 'Worker must scan schedule proposals for notification backfill.');
assert(automationWorker.includes("'message.received'"), 'Worker must materialize message.received automation events from chat messages.');
assert(automationWorker.includes("'schedule.proposed'"), 'Worker must materialize schedule.proposed automation events from chat proposals.');
assert(automationWorker.includes("'schedule.accepted'"), 'Worker must materialize schedule.accepted automation events from accepted proposals.');
assert(automationWorker.includes('chatBackfillLookbackHours'), 'Worker chat backfill must avoid turning old history into new notifications.');
assert(automationWorker.includes('chatBackfillSkippedOld'), 'Worker must report old chat events skipped by backfill.');
assert(automationWorker.indexOf('await processEntityAutomationBackfill(db, stats);') < automationWorker.indexOf('await processChatAutomationBackfill(db, stats);'), 'Entity automation backfill must run before chat backfill and downstream follow-ups.');
assert(automationWorker.indexOf('await processChatAutomationBackfill(db, stats);') < automationWorker.indexOf('await processRelationshipFollowups(db, stats);'), 'Chat automation backfill must run before relationship follow-ups consume signals.');

assert(rules.includes('match /programaciones/{proposalId}'), 'Firestore rules must protect chat schedule proposals.');
assert(rules.includes('validClassScheduleProposalCreate'), 'Firestore rules must validate proposal creation.');
assert(rules.includes('canReadAvailability'), 'Firestore rules must expose availability safely to scheduling participants.');
assert(rules.includes('match /busySlots/{busySlotId}'), 'Firestore rules must protect occupied schedule slots.');
assert(rules.includes('validBusySlotCreate'), 'Firestore rules must validate busy slot creation against a real class.');
assert(rules.includes('busySlotMatchesClass'), 'Busy slot rules must ensure occupied times match class times.');
assert(rules.includes('availabilityValidation'), 'Firestore rules must allow audited availability validation on proposals.');
assert(rules.includes('validScheduleRecurrence'), 'Firestore rules must validate weekly recurring schedule metadata.');
assert(rules.includes('validClassScheduleProposalUpdate'), 'Firestore rules must validate proposal responses.');
assert(rules.includes('validParticipantClassCreate'), 'Firestore rules must allow only accepted proposal classes.');
assert(rules.includes("allow create: if isAdmin() || validParticipantClassCreate();"), 'Participants must create classes only through proposal validation.');
assert(rules.includes("'familyHourlyRate'"), 'Participant class creation rules must allow family hourly rates.');
assert(rules.includes("'teacherHourlyRate'"), 'Participant class creation rules must allow teacher hourly rates.');
assert(rules.includes("'classSeriesId'"), 'Participant class creation rules must allow recurring class series metadata.');
assert(rules.includes('validParticipantClassCancellationUpdate'), 'Firestore rules must validate participant calendar cancellations.');
assert(rules.includes('validClassCancelledNotificationCreate'), 'Firestore rules must allow only class-linked cancellation notifications.');
assert(rules.includes("request.resource.data.responsibilityPenalty.points == -3"), 'Calendar cancellation rules must enforce the responsibility penalty.');
assert(rules.includes('validParticipantBusySlotDelete'), 'Firestore rules must let participants release occupied slots only after cancellation.');
assert(rules.includes('validClassResetMarkers'), 'Firestore rules must validate class reset markers written by class scheduling.');
assert(rules.includes("'classResetGeneration'"), 'Firestore rules must allow class reset generation on classes, proposals and busy slots.');
assert(rules.includes("'createdAfterClassReset'"), 'Firestore rules must allow class reset boolean markers on class scheduling writes.');
assert(rules.includes("'classResetCutoffIso'"), 'Firestore rules must allow class reset cutoff markers on class scheduling writes.');
assert(rules.includes('chatTeacherUid(get(chatPath).data)'), 'Class creation rules must accept canonical or legacy chat teacher ids.');
assert(rules.includes("request.resource.data.participantUids[request.auth.uid] == true"), 'Class creation rules must require the creator in participantUids.');
assert(rules.includes('match /preferencias/{userUid}'), 'Firestore rules must protect per-user chat preferences.');
assert(/isAdmin\(\)\s*\|\|\s*isChatParticipant\(get\(\/databases\/\$\(database\)\/documents\/chats\/\$\(chatId\)\)\.data\)/.test(rules), 'Admin calls must retain the secure audio fallback used by chat participants.');
assert(rules.includes('validChatPreferenceCreate'), 'Firestore rules must validate chat preference creation.');
assert(rules.includes('availabilityTeacherBelongsToAuth'), 'Availability rules must support teacher profile ids as well as auth uids.');
assert(rules.includes("'assignmentIntroSentAt'"), 'Chat creation rules must allow the assignment intro marker.');
assert(rules.includes("'relationshipStage'"), 'Chat rules must allow validated relationship stage updates.');
assert(rules.includes("'class_scheduled_from_chat'"), 'Chat rules must validate accepted schedule relationship events.');

assert(css.includes('.chat-schedule-panel'), 'Dashboard CSS must style the schedule panel.');
assert(css.includes('.schedule-proposal'), 'Dashboard CSS must style schedule proposals.');
assert(css.includes('.chat-alias-form'), 'Dashboard CSS must style the private chat-name editor.');
assert(css.includes('.chat-schedule-summary'), 'Dashboard CSS must style compact schedule summaries.');
assert(css.includes('.chat-schedule-visible-proposals'), 'Dashboard CSS must style visible schedule proposal strips.');
assert(css.includes('.schedule-availability-action'), 'Dashboard CSS must style availability recovery actions.');
assert(css.includes('.chat-layout-notifications'), 'Dashboard CSS must isolate notification-only view.');
assert(css.includes('.chat-thread-panel[hidden]') && css.includes('display: none !important'), 'Hidden chat panels must not leak into the active conversation view.');
assert(css.includes('.chat-header-secondary'), 'Mobile chat must hide secondary header actions to preserve the contact identity.');
assert(css.includes('.schedule-availability-busy'), 'Dashboard CSS must style occupied schedule slots.');
assert(css.includes('.class-cancel-action'), 'Dashboard CSS must style calendar cancellation as a sensitive action.');

assert(classCancellation.includes('CLASS_CANCELLATION_PENALTY_POINTS = -3'), 'Class cancellation helper must apply a clear responsibility penalty.');
assert(classCancellation.includes('cancelClassFromCalendar'), 'Class cancellation helper must expose one shared cancellation flow.');
assert(classCancellation.includes("type: 'class_cancelled'"), 'Class cancellation helper must notify the counterparty with a class cancellation event.');
assert(classCancellation.includes('canCancelClassFromCalendar'), 'Class cancellation helper must hide cancellation when a class is already closed.');
assert(classCancellation.includes("where('classId', '==', id)"), 'Class cancellation helper must release busy slots for the cancelled occurrence.');

console.log('Chat scheduling system validation passed.');
