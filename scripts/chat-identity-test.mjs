import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const remoteUrl = process.argv[2] || '';
const source = remoteUrl
  ? await fetch(remoteUrl, { headers: { 'cache-control': 'no-cache' } }).then(async (response) => {
    if (!response.ok) throw new Error(`No se pudo cargar el chat productivo: ${response.status}`);
    return response.text();
  })
  : await readFile(new URL('../js/chat-widget.js', import.meta.url), 'utf8');
const executable = source
  .replace(/^import\s+[\s\S]*?\s+from\s+['"][^'"]+['"];\s*/gm, '')
  .replace(/\bexport\s+async\s+function\s+/g, 'async function ')
  .concat(`
    globalThis.__chatIdentity = {
      reliableName,
      readableChatIdentity,
      currentChatSenderName,
      chatParticipantDisplayName,
      typingCounterpartDisplayName,
      hydrateChatNames,
      chatCounterpartPhotoUrl,
      renderChatCounterpartAvatar,
    };
  `);

const context = vm.createContext({
  console,
  setTimeout,
  clearTimeout,
  URL,
});
vm.runInContext(executable, context, { filename: 'chat-widget.identity-test.js' });

const identity = context.__chatIdentity;
assert.equal(identity.readableChatIdentity('lucia@example.com', 'Lucía Rivera'), 'Lucía Rivera');
assert.equal(identity.reliableName('lucia@example.com'), '');
assert.equal(identity.currentChatSenderName({ displayName: 'lucia@example.com', email: 'lucia@example.com' }, 'familia'), 'Familia');
assert.equal(identity.chatParticipantDisplayName({ familyName: 'Lucía Rivera' }, 'familia', 'lucia@example.com'), 'Lucía');
assert.equal(identity.chatParticipantDisplayName({ teacherName: 'Marcos Ortega' }, 'profesor', 'marcos@example.com'), 'Marcos');
assert.equal(identity.typingCounterpartDisplayName({}, 'familia', { displayNameOverride: 'Profe de mates' }, 'marcos@example.com'), 'Profe de mates');
assert.equal(identity.typingCounterpartDisplayName({ teacherName: 'Marcos Ortega' }, 'familia', {}, 'Marcos Ortega'), 'Marcos');
assert.equal(identity.typingCounterpartDisplayName({ teacherName: 'Marcos Ortega' }, 'familia', {}, 'marcos@example.com'), 'Marcos');

const hydratedPhotoChat = identity.hydrateChatNames(
  { teacherName: 'Marcos Ortega' },
  { teacherPhotoUrl: 'https://cdn.example.com/profesores/marcos.jpg' },
);
assert.equal(hydratedPhotoChat.teacherPhotoUrl, 'https://cdn.example.com/profesores/marcos.jpg');
assert.equal(identity.chatCounterpartPhotoUrl(hydratedPhotoChat, 'familia'), 'https://cdn.example.com/profesores/marcos.jpg');
assert.match(identity.renderChatCounterpartAvatar(hydratedPhotoChat, 'familia'), /<img[^>]+marcos\.jpg/);

for (const value of [
  identity.currentChatSenderName({ displayName: 'lucia@example.com' }, 'familia'),
  identity.chatParticipantDisplayName({ familyName: 'Lucía Rivera' }, 'familia', 'lucia@example.com'),
  identity.typingCounterpartDisplayName({ teacherName: 'Marcos Ortega' }, 'familia', {}, 'marcos@example.com'),
]) {
  assert.equal(value.includes('@'), false, `No chat identity may expose an email: ${value}`);
}

console.log(`Chat identity privacy validation passed (${remoteUrl || 'local'}).`);
