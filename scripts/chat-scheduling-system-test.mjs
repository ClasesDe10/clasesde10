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

const [admin, chat, rules, functionsIndex, automationEngine, automationWorker, css] = await Promise.all([
  read('pages/dashboard/admin.html'),
  read('js/chat-widget.js'),
  read('firebase/firestore.rules'),
  read('functions/index.js'),
  read('functions/platform-automation-engine.js'),
  read('scripts/firebase-automation-worker.mjs'),
  read('css/dashboard.css'),
]);

assert(admin.includes('prepararFlujoAsignacion'), 'Admin assignment must prepare chat scheduling flow.');
assert(admin.includes("schedulingStatus: 'pendiente_horario'"), 'Assignments must start as pending scheduling.');
assert(admin.includes('buildAssignmentPricingQuote'), 'Admin assignment must attach pricing to matching decisions.');
assert(admin.includes('renderPricingQuoteLine'), 'Admin matching must display family price, teacher amount and margin.');
assert(admin.includes('Profesor asignado, chat creado'), 'Admin must confirm chat creation after assignment.');
assert(!admin.includes('assignment_ready_for_scheduling'), 'Admin must not write duplicate scheduling automation events from the browser.');
assert(!admin.includes('NOTIFICATION_EVENTS.ASSIGNMENT_CREATED'), 'Assignment notifications must be centralized in Functions.');

assert(chat.includes('data-schedule-form'), 'Chat widget must render schedule proposal form.');
assert(chat.includes('availability-engine.js'), 'Chat widget must use the shared availability engine.');
assert(chat.includes('loadChatAvailability'), 'Chat widget must load teacher and student availability.');
assert(chat.includes('validateScheduleAvailability'), 'Chat widget must validate proposals against availability slots.');
assert(chat.includes("collection(firebaseDb, 'busySlots')"), 'Chat widget must load sanitized busy slots for occupied class times.');
assert(chat.includes('busySlotsForChatValidation'), 'Chat widget must combine persisted busy slots and accepted chat proposals.');
assert(chat.includes('findBusySlotConflict'), 'Accepted proposals must be rechecked against occupied slots before class creation.');
assert(chat.includes('persistBusySlotsForClass'), 'Accepted proposal classes must materialize occupied slots for future scheduling.');
assert(chat.includes('repairBusySlotsFromVisibleClasses'), 'Chat widget must self-heal busy slots from visible existing classes when Functions are not available.');
assert(chat.includes('availabilityStatus'), 'Schedule proposals must store availability validation status.');
assert(chat.includes("collection(firebaseDb, 'chats', state.selectedChat.id, 'programaciones')"), 'Chat widget must persist schedule proposals.');
assert(chat.includes('acceptScheduleProposal'), 'Chat widget must support accepting schedule proposals.');
assert(chat.includes("createdFrom: 'chat_schedule_proposal'"), 'Accepted proposals must create traceable class documents.');
assert(chat.includes('buildAdminClassPayload'), 'Accepted proposals must reuse the shared class payload engine.');
assert(chat.includes('buildClassPricingQuote'), 'Accepted proposals must price classes before creating them.');
assert(chat.includes('proratedPricingFromHourly'), 'Chat scheduling must prorate assignment hourly pricing by class duration.');
assert(chat.includes('pickClassPriceFields(classFields)'), 'Accepted proposals must persist family, teacher and platform amounts.');
assert(chat.includes('participantUids'), 'Accepted proposal classes must store participant auth ids for legacy/id-compatible reads.');
assert(chat.includes('updatedAt: serverTimestamp()'), 'Class creation must satisfy Firestore timestamp rules.');
assert(chat.includes('data-chat-name-form'), 'Chat widget must let each participant save a private chat display name.');
assert(chat.includes('data-chat-layout-mode'), 'Chat widget must let users resize chat vs class scheduling space.');
assert(chat.includes('CHAT_LAYOUT_STORAGE_KEY'), 'Chat layout preference must persist per browser.');
assert(chat.includes("doc(firebaseDb, 'chats', chat.id, 'preferencias', currentUid)"), 'Chat widget must load per-user chat preferences.');
assert(chat.includes("doc(firebaseDb, 'chats', state.selectedChat.id, 'preferencias', currentUid)"), 'Chat widget must persist chat preferences per current user.');
assert(chat.includes('Esperando respuesta'), 'Own schedule proposals must clearly show they are waiting for the other participant.');
assert(chat.includes("relationshipStage: 'horario_propuesto'"), 'Schedule proposals must update the chat relationship stage.');
assert(chat.includes("relationshipStage: 'clase_programada'"), 'Accepted proposals must activate the scheduled relationship stage.');
assert(chat.includes("lastRelationshipEvent: 'class_scheduled_from_chat'"), 'Accepted proposals must leave a relationship event marker.');
assert(!chat.includes("collection(firebaseDb, 'notificaciones')"), 'Chat widget must not create chat notifications directly.');

assert(functionsIndex.includes("document: 'asignaciones/{assignmentId}'"), 'Functions must react to assignment creation.');
assert(functionsIndex.includes("'relationship.ensure_chat'"), 'Functions must support server-side chat repair/creation.');
assert(functionsIndex.includes("document: 'chats/{chatId}/programaciones/{proposalId}'"), 'Functions must react to chat schedule proposals.');
assert(functionsIndex.includes('syncBusySlotsForClass'), 'Functions must keep busySlots synchronized from class lifecycle changes.');
assert(functionsIndex.includes("db.collection('busySlots').doc"), 'Functions must write sanitized busySlots documents.');
assert(automationEngine.includes('schedule.proposed.core'), 'Automation rules must cover schedule proposals.');
assert(automationEngine.includes('assignment.created.core'), 'Automation rules must cover assignment creation.');
assert(automationWorker.includes('ensureChatForAssignmentWorker'), 'Worker must be able to repair assignment chats without deployed Functions.');
assert(automationWorker.includes("'relationship.ensure_chat'"), 'Worker must dispatch relationship.ensure_chat system jobs.');
assert(automationWorker.includes('createPaymentRequestForClassWorker'), 'Worker must be able to create payment requests from completed classes.');
assert(automationWorker.includes("'payment.request_for_class'"), 'Worker must dispatch payment.request_for_class system jobs.');

assert(rules.includes('match /programaciones/{proposalId}'), 'Firestore rules must protect chat schedule proposals.');
assert(rules.includes('validClassScheduleProposalCreate'), 'Firestore rules must validate proposal creation.');
assert(rules.includes('canReadAvailability'), 'Firestore rules must expose availability safely to scheduling participants.');
assert(rules.includes('match /busySlots/{busySlotId}'), 'Firestore rules must protect occupied schedule slots.');
assert(rules.includes('validBusySlotCreate'), 'Firestore rules must validate busy slot creation against a real class.');
assert(rules.includes('busySlotMatchesClass'), 'Busy slot rules must ensure occupied times match class times.');
assert(rules.includes('availabilityValidation'), 'Firestore rules must allow audited availability validation on proposals.');
assert(rules.includes('validClassScheduleProposalUpdate'), 'Firestore rules must validate proposal responses.');
assert(rules.includes('validParticipantClassCreate'), 'Firestore rules must allow only accepted proposal classes.');
assert(rules.includes("allow create: if isAdmin() || validParticipantClassCreate();"), 'Participants must create classes only through proposal validation.');
assert(rules.includes('chatTeacherUid(get(chatPath).data)'), 'Class creation rules must accept canonical or legacy chat teacher ids.');
assert(rules.includes("request.resource.data.participantUids[request.auth.uid] == true"), 'Class creation rules must require the creator in participantUids.');
assert(rules.includes('match /preferencias/{userUid}'), 'Firestore rules must protect per-user chat preferences.');
assert(rules.includes('validChatPreferenceCreate'), 'Firestore rules must validate chat preference creation.');
assert(rules.includes('availabilityTeacherBelongsToAuth'), 'Availability rules must support teacher profile ids as well as auth uids.');
assert(rules.includes("'assignmentIntroSentAt'"), 'Chat creation rules must allow the assignment intro marker.');
assert(rules.includes("'relationshipStage'"), 'Chat rules must allow validated relationship stage updates.');
assert(rules.includes("'class_scheduled_from_chat'"), 'Chat rules must validate accepted schedule relationship events.');

assert(css.includes('.chat-schedule-panel'), 'Dashboard CSS must style the schedule panel.');
assert(css.includes('.schedule-proposal'), 'Dashboard CSS must style schedule proposals.');
assert(css.includes('.chat-alias-form'), 'Dashboard CSS must style the private chat-name editor.');
assert(css.includes('.chat-view-controls'), 'Dashboard CSS must style chat/class layout controls.');
assert(css.includes('.chat-layout-classes'), 'Dashboard CSS must support a class-focused chat layout.');
assert(css.includes('.schedule-availability-busy'), 'Dashboard CSS must style occupied schedule slots.');

console.log('Chat scheduling system validation passed.');
