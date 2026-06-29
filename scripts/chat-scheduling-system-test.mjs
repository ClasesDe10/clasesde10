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
assert(admin.includes('Profesor asignado, chat creado'), 'Admin must confirm chat creation after assignment.');
assert(!admin.includes('assignment_ready_for_scheduling'), 'Admin must not write duplicate scheduling automation events from the browser.');
assert(!admin.includes('NOTIFICATION_EVENTS.ASSIGNMENT_CREATED'), 'Assignment notifications must be centralized in Functions.');

assert(chat.includes('data-schedule-form'), 'Chat widget must render schedule proposal form.');
assert(chat.includes('availability-engine.js'), 'Chat widget must use the shared availability engine.');
assert(chat.includes('loadChatAvailability'), 'Chat widget must load teacher and student availability.');
assert(chat.includes('validateScheduleAvailability'), 'Chat widget must validate proposals against availability slots.');
assert(chat.includes('availabilityStatus'), 'Schedule proposals must store availability validation status.');
assert(chat.includes("collection(firebaseDb, 'chats', state.selectedChat.id, 'programaciones')"), 'Chat widget must persist schedule proposals.');
assert(chat.includes('acceptScheduleProposal'), 'Chat widget must support accepting schedule proposals.');
assert(chat.includes("createdFrom: 'chat_schedule_proposal'"), 'Accepted proposals must create traceable class documents.');
assert(chat.includes('buildAdminClassPayload'), 'Accepted proposals must reuse the shared class payload engine.');
assert(chat.includes('updatedAt: serverTimestamp()'), 'Class creation must satisfy Firestore timestamp rules.');
assert(chat.includes("relationshipStage: 'horario_propuesto'"), 'Schedule proposals must update the chat relationship stage.');
assert(chat.includes("relationshipStage: 'clase_programada'"), 'Accepted proposals must activate the scheduled relationship stage.');
assert(chat.includes("lastRelationshipEvent: 'class_scheduled_from_chat'"), 'Accepted proposals must leave a relationship event marker.');
assert(!chat.includes("collection(firebaseDb, 'notificaciones')"), 'Chat widget must not create chat notifications directly.');

assert(functionsIndex.includes("document: 'asignaciones/{assignmentId}'"), 'Functions must react to assignment creation.');
assert(functionsIndex.includes("'relationship.ensure_chat'"), 'Functions must support server-side chat repair/creation.');
assert(functionsIndex.includes("document: 'chats/{chatId}/programaciones/{proposalId}'"), 'Functions must react to chat schedule proposals.');
assert(automationEngine.includes('schedule.proposed.core'), 'Automation rules must cover schedule proposals.');
assert(automationEngine.includes('assignment.created.core'), 'Automation rules must cover assignment creation.');
assert(automationWorker.includes('ensureChatForAssignmentWorker'), 'Worker must be able to repair assignment chats without deployed Functions.');
assert(automationWorker.includes("'relationship.ensure_chat'"), 'Worker must dispatch relationship.ensure_chat system jobs.');
assert(automationWorker.includes('createPaymentRequestForClassWorker'), 'Worker must be able to create payment requests from completed classes.');
assert(automationWorker.includes("'payment.request_for_class'"), 'Worker must dispatch payment.request_for_class system jobs.');

assert(rules.includes('match /programaciones/{proposalId}'), 'Firestore rules must protect chat schedule proposals.');
assert(rules.includes('validClassScheduleProposalCreate'), 'Firestore rules must validate proposal creation.');
assert(rules.includes('canReadAvailability'), 'Firestore rules must expose availability safely to scheduling participants.');
assert(rules.includes('availabilityValidation'), 'Firestore rules must allow audited availability validation on proposals.');
assert(rules.includes('validClassScheduleProposalUpdate'), 'Firestore rules must validate proposal responses.');
assert(rules.includes('validParticipantClassCreate'), 'Firestore rules must allow only accepted proposal classes.');
assert(rules.includes("allow create: if isAdmin() || validParticipantClassCreate();"), 'Participants must create classes only through proposal validation.');
assert(rules.includes("'assignmentIntroSentAt'"), 'Chat creation rules must allow the assignment intro marker.');
assert(rules.includes("'relationshipStage'"), 'Chat rules must allow validated relationship stage updates.');
assert(rules.includes("'class_scheduled_from_chat'"), 'Chat rules must validate accepted schedule relationship events.');

assert(css.includes('.chat-schedule-panel'), 'Dashboard CSS must style the schedule panel.');
assert(css.includes('.schedule-proposal'), 'Dashboard CSS must style schedule proposals.');

console.log('Chat scheduling system validation passed.');
