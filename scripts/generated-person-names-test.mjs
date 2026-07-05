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
  'functions/index.js',
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
assert(chat.includes('Profesor RWS1') === false, 'No hardcoded generated teacher example should be rendered.');
assert(chat.includes('Alumno XDZJ') === false, 'No hardcoded generated student example should be rendered.');
assert(chat.includes('profesor(?:a|\\/a)?|profesor asignado|docente|alumno(?:a|\\/a)?|familia'), 'Chat must detect generated role+token names.');

console.log('Generated person names validation passed.');
