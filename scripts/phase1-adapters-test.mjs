import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {
  ADAPTER_DOMAINS,
  BASE_ADAPTER_METHODS,
  DOMAIN_METHODS,
} from '../js/adapters/contracts.js';

const root = process.cwd();

const ADAPTER_FILES = {
  auth: 'js/adapters/firebase-auth-adapter.js',
  users: 'js/adapters/users-adapter.js',
  profesores: 'js/adapters/profesores-adapter.js',
  familias: 'js/adapters/familias-adapter.js',
  alumnos: 'js/adapters/alumnos-adapter.js',
  asignaciones: 'js/adapters/asignaciones-adapter.js',
  solicitudes: 'js/adapters/solicitudes-adapter.js',
  clases: 'js/adapters/clases-adapter.js',
  pagos: 'js/adapters/pagos-adapter.js',
  documentos: 'js/adapters/documentos-adapter.js',
  notificaciones: 'js/adapters/notificaciones-adapter.js',
  configuracion: 'js/adapters/configuracion-adapter.js',
};

const PRODUCTION_ENTRYPOINTS = [
  'pages/login.html',
  'pages/registro.html',
  'pages/reset-password.html',
  'pages/dashboard/admin.html',
  'pages/dashboard/alumno.html',
  'pages/dashboard/familia.html',
  'pages/dashboard/profesor.html',
  'js/auth-provider.js',
  'js/auth.js',
  'js/document-storage-provider.js',
  'js/notifications-provider.js',
];

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function readRelative(file) {
  return readFile(path.join(root, file), 'utf8');
}

for (const domain of ADAPTER_DOMAINS) {
  const file = ADAPTER_FILES[domain];
  assert(file, `No adapter file mapped for domain ${domain}`);
  assert(existsSync(path.join(root, file)), `Missing adapter file: ${file}`);

  const source = await readRelative(file);
  const expectedMethods = DOMAIN_METHODS[domain] || [];
  for (const method of expectedMethods) {
    if (BASE_ADAPTER_METHODS.includes(method) && source.includes('...base')) {
      continue;
    }

    assert(
      source.includes(`${method}(`) || source.includes(`${method}:`) || source.includes(` ${method},`),
      `Adapter ${domain} does not expose expected method ${method}`,
    );
  }
}

const registry = await readRelative('js/adapters/index.js');
for (const domain of ADAPTER_DOMAINS) {
  assert(registry.includes(domain), `Adapter registry does not export ${domain}`);
}

for (const file of PRODUCTION_ENTRYPOINTS) {
  const source = await readRelative(file);
  assert(
    !source.includes('/adapters/') && !source.includes('./adapters/') && !source.includes('../adapters/'),
    `Production entrypoint imports adapters before cutover: ${file}`,
  );
}

console.log(`Phase 1 adapter validation passed (${ADAPTER_DOMAINS.length} domains).`);
