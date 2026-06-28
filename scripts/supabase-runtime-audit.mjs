#!/usr/bin/env node
/**
 * Static inventory of runtime Supabase dependencies.
 *
 * This intentionally scans only frontend runtime files (`pages/` and `js/`).
 * SQL migrations and documentation are excluded because they are legacy/source
 * material, not browser-executed code.
 */

import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const RUNTIME_DIRS = ['pages', 'js'];
const TEXT_EXTENSIONS = new Set(['.html', '.js']);

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath, files);
    } else if (TEXT_EXTENSIONS.has(path.extname(entry.name))) {
      files.push(fullPath);
    }
  }
  return files;
}

function rel(file) {
  return path.relative(ROOT, file).replace(/\\/g, '/');
}

function count(text, regex) {
  return [...text.matchAll(regex)].length;
}

function matches(text, regex, group = 1) {
  return [...text.matchAll(regex)].map((match) => match[group]).filter(Boolean);
}

function unique(items) {
  return [...new Set(items)].sort();
}

function auditFile(file) {
  const text = fs.readFileSync(file, 'utf8');
  const info = {
    file: rel(file),
    supabaseCdn: /@supabase\/supabase-js/.test(text),
    importsSupabaseClient: /supabase-client\.js/.test(text),
    importsFirebaseDataClient: /firebase-data-client\.js/.test(text),
    importsAuthProvider: /auth-provider\.js/.test(text),
    directAuthJs: /from ['"][./]+js\/auth\.js['"]/.test(text),
    tables: unique(matches(text, /\.from\(['"`]([^'"`]+)['"`]\)/g)),
    storageBuckets: unique(matches(text, /\.storage\.from\(['"`]([^'"`]+)['"`]\)/g)),
    authMethods: unique(matches(text, /db\.auth\.([A-Za-z0-9_]+)/g)),
    realtimeChannels: count(text, /db\.channel\(/g),
    queryCount: count(text, /db\.from\(/g),
    storageCount: count(text, /db\.storage\.from\(/g),
  };

  const hasRealSupabaseDependency = Boolean(info.supabaseCdn
    || info.importsSupabaseClient
    || info.authMethods.length
    || info.realtimeChannels);
  const hasFirebaseCompatibilityApi = Boolean(info.importsFirebaseDataClient
    || info.tables.length
    || info.storageBuckets.length);

  return (hasRealSupabaseDependency || hasFirebaseCompatibilityApi) ? {
    ...info,
    hasRealSupabaseDependency,
    hasFirebaseCompatibilityApi,
  } : null;
}

const files = RUNTIME_DIRS.flatMap((dir) => walk(path.join(ROOT, dir)));
const inventory = files.map(auditFile).filter(Boolean);
const runtimeInventory = inventory.filter((item) => item.file !== 'js/supabase-client.example.js');

const allTables = unique(runtimeInventory.flatMap((item) => item.tables));
const allBuckets = unique(runtimeInventory.flatMap((item) => item.storageBuckets));
const allAuthMethods = unique(runtimeInventory.flatMap((item) => item.authMethods));

const tableUsage = Object.fromEntries(
  allTables.map((table) => [
    table,
    runtimeInventory
      .filter((item) => item.tables.includes(table))
      .map((item) => item.file),
  ]),
);

const bucketUsage = Object.fromEntries(
  allBuckets.map((bucket) => [
    bucket,
    runtimeInventory
      .filter((item) => item.storageBuckets.includes(bucket))
      .map((item) => item.file),
  ]),
);

const summary = {
  runtimeFilesWithSupabase: runtimeInventory.filter((item) => item.hasRealSupabaseDependency).length,
  runtimeFilesWithFirebaseCompatibilityApi: runtimeInventory.filter((item) => item.hasFirebaseCompatibilityApi).length,
  files: runtimeInventory,
  tables: tableUsage,
  storageBuckets: bucketUsage,
  authMethods: allAuthMethods,
  realtimeFiles: runtimeInventory.filter((item) => item.realtimeChannels > 0).map((item) => item.file),
  totals: {
    queries: runtimeInventory.reduce((sum, item) => sum + item.queryCount, 0),
    storageCalls: runtimeInventory.reduce((sum, item) => sum + item.storageCount, 0),
    realtimeChannels: runtimeInventory.reduce((sum, item) => sum + item.realtimeChannels, 0),
  },
};

console.log(JSON.stringify(summary, null, 2));
