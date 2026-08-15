import fs from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const errors = [];
const warnings = [];

async function readJson(relativePath) {
  const file = path.join(root, relativePath);
  const content = await fs.readFile(file, 'utf8');
  return JSON.parse(content);
}

function assert(condition, message) {
  if (!condition) errors.push(message);
}

function warn(condition, message) {
  if (!condition) warnings.push(message);
}

async function exists(relativePath) {
  try {
    await fs.access(path.join(root, relativePath));
    return true;
  } catch {
    return false;
  }
}

async function pngSize(relativePath) {
  const file = path.join(root, relativePath);
  const buffer = await fs.readFile(file);
  const isPng = buffer.length > 24 && buffer.toString('ascii', 1, 4) === 'PNG';
  assert(isPng, `${relativePath} no es PNG valido`);
  if (!isPng) return null;
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20)
  };
}

function hasIgnoreException(ignore, entry) {
  return Array.isArray(ignore) && ignore.includes(entry);
}

const pwaManifest = await readJson('manifest.json');
const twaManifest = await readJson('android/twa/twa-manifest.json');
const firebaseConfig = await readJson('firebase.json');

assert(pwaManifest.name === 'ClasesDe10 Panel', 'manifest.json debe instalar el panel, no la web publica');
assert(pwaManifest.start_url === '/pages/login.html?source=pwa', 'manifest.json debe arrancar en login del panel');
assert(pwaManifest.scope === '/', 'manifest.json debe cubrir el dominio completo');
assert(pwaManifest.display === 'standalone', 'manifest.json debe instalarse en modo standalone');

const icon192 = await pngSize('assets/img/logo-192.png');
const icon512 = await pngSize('assets/img/logo-512.png');
assert(icon192?.width === 192 && icon192?.height === 192, 'logo-192.png debe medir 192x192');
assert(icon512?.width === 512 && icon512?.height === 512, 'logo-512.png debe medir 512x512');

assert(twaManifest.packageId === 'com.clasesde10.panel', 'El packageId Android debe ser com.clasesde10.panel');
assert(twaManifest.host === 'clasesde10.com', 'La TWA debe abrir clasesde10.com');
assert(twaManifest.startUrl === '/pages/login.html?source=android-twa', 'La TWA debe arrancar en login del panel');
assert(twaManifest.webManifestUrl === 'https://clasesde10.com/manifest.json', 'La TWA debe apuntar al manifest publico');
assert(twaManifest.display === 'standalone', 'La TWA debe usar standalone');
assert(twaManifest.orientation === 'portrait-primary', 'La TWA debe fijar orientacion portrait-primary');
assert(twaManifest.enableNotifications === true, 'La TWA debe permitir delegacion de notificaciones');
assert(twaManifest.fallbackType === 'customtabs', 'La TWA debe degradar a Custom Tabs si no hay navegador compatible');
assert(twaManifest.features?.playBilling?.enabled === false, 'No debe activarse Play Billing');
assert(twaManifest.features?.locationDelegation?.enabled === false, 'No debe activarse delegacion de ubicacion');
assert(twaManifest.signingKey?.alias === 'clasesde10', 'La firma Android debe usar alias clasesde10');

const hosting = firebaseConfig.hosting || {};
assert(hosting.public === '.', 'Firebase Hosting debe publicar desde la raiz web');
assert(
  hasIgnoreException(hosting.ignore, '!.well-known/**') || !hosting.ignore?.includes('**/.*'),
  'Firebase Hosting debe permitir publicar .well-known/assetlinks.json'
);

const workflowExists = await exists('.github/workflows/android-twa.yml');
assert(workflowExists, 'Debe existir el workflow .github/workflows/android-twa.yml');

const assetLinksExists = await exists('.well-known/assetlinks.json');
if (assetLinksExists) {
  const assetLinks = await readJson('.well-known/assetlinks.json');
  const statement = Array.isArray(assetLinks)
    ? assetLinks.find((entry) => entry?.target?.package_name === twaManifest.packageId)
    : null;
  const fingerprints = statement?.target?.sha256_cert_fingerprints || [];

  assert(Boolean(statement), 'assetlinks.json debe incluir el package Android de ClasesDe10');
  assert(
    statement?.relation?.includes('delegate_permission/common.handle_all_urls'),
    'assetlinks.json debe delegar handle_all_urls'
  );
  assert(
    statement?.target?.namespace === 'android_app',
    'assetlinks.json debe apuntar a namespace android_app'
  );
  assert(
    fingerprints.length > 0 && fingerprints.every((value) => /^([A-F0-9]{2}:){31}[A-F0-9]{2}$/.test(value)),
    'assetlinks.json debe incluir fingerprints SHA-256 Android validas'
  );
} else {
  warn(false, 'No hay .well-known/assetlinks.json desplegable aun; el workflow lo genera al firmar el APK');
}

if (warnings.length > 0) {
  console.warn('Avisos Android/TWA:');
  for (const warning of warnings) console.warn(`- ${warning}`);
}

if (errors.length > 0) {
  console.error('Errores Android/TWA:');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log('Android/TWA audit OK');
