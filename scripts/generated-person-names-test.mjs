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

const files = Object.fromEntries(await Promise.all([
  'js/chat-widget.js',
  'pages/dashboard/admin.html',
  'pages/dashboard/familia.html',
  'pages/dashboard/profesor.html',
  'js/payment-engine.js',
  'js/class-cancellation.js',
  'js/finance-erp-engine.js',
  'js/analytics-engine.js',
  'js/calendar-sync.js',
  'js/relationship-engine.js',
  'scripts/firebase-automation-worker.mjs',
].map(async (file) => [file, await read(file)])));

for (const [file, source] of Object.entries(files)) {
  assert(source.includes('Profesor pendiente de nombre') || source.includes('`${role} pendiente de nombre`') || source.includes('`${label} pendiente de nombre`'), `${file} must avoid role+id person fallbacks.`);
  assert(!source.includes('slice(-4).toUpperCase()'), `${file} must not render short random ids as person names.`);
  assert(!source.includes('`${label} ${cleanId.slice(0, 6)}`'), `${file} must not render profile ids as person names.`);
  assert(!source.includes('`${role} ${cleanId.slice(0, 6)}`'), `${file} must not render profile ids as person names.`);
}

const chat = files['js/chat-widget.js'];
assert(chat.includes('dedupeGeneratedChats'), 'Chat list must remove duplicated generated-name chats.');
assert(chat.includes('messageSenderDisplayName'), 'Chat messages must resolve old one-letter sender names from participant ids.');
assert(chat.includes('loadRoleProfile'), 'Chat must use role profiles as a fallback for contact identity.');
assert(chat.includes('teacherProfile.foto_url'), 'Family chat must recover the teacher profile photo when assignment data is incomplete.');
assert(!chat.includes('teacherProfile.telefono'), 'Family chat must not read the teacher real phone for chat calls.');
assert(chat.includes('data-chat-start-call'), 'Chat must render an in-app voice call action.');
assert(chat.includes('RTCPeerConnection'), 'Chat voice calls must stay inside the browser.');
assert(chat.includes("messageType: 'call'"), 'Chat voice calls must stay inside the chat as call messages.');
assert(!chat.includes('href="tel:'), 'Chat must not expose real phone numbers through tel links.');
assert(chat.includes('Profesor RWS1') === false, 'No hardcoded generated teacher example should be rendered.');
assert(chat.includes('Alumno XDZJ') === false, 'No hardcoded generated student example should be rendered.');
assert(chat.includes('profesor(?:a|\\/a)?|profesor asignado|docente|alumno(?:a|\\/a)?|familia'), 'Chat must detect generated role+token names.');

console.log('Generated person names validation passed.');
