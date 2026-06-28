#!/usr/bin/env node
/**
 * Checks the current ClasesDe10 centralization state.
 *
 * This script is read-only. It inspects DNS, public HTTP endpoints, local CLI
 * availability, and the remaining code touchpoints that keep the project split
 * between Netlify, Firebase, and Supabase.
 */

import { execFileSync, execSync } from 'node:child_process';
import dns from 'node:dns/promises';
import fs from 'node:fs';
import https from 'node:https';
import path from 'node:path';
import process from 'node:process';

const ROOT = process.cwd();
const PUBLIC_DOMAIN = 'clasesde10.com';
const WWW_DOMAIN = `www.${PUBLIC_DOMAIN}`;
const FIREBASE_HOSTING_URL = 'https://clasesde10-50add.web.app';
const PUBLIC_URL = `https://${PUBLIC_DOMAIN}`;
const WWW_URL = `https://${WWW_DOMAIN}`;
const EXPECTED_FIREBASE_A = '199.36.158.100';
const NETLIFY_A = '75.2.60.5';
const EXPECTED_FIREBASE_CNAME = 'clasesde10-50add.web.app';

const IGNORE_DIRS = new Set([
  '.github',
  '.git',
  '.firebase',
  '.netlify',
  'node_modules',
  'output',
]);

const TEXT_EXTENSIONS = new Set([
  '.css',
  '.html',
  '.js',
  '.json',
  '.md',
  '.mjs',
  '.sql',
  '.toml',
  '.txt',
]);

function ok(label, value = '') {
  console.log(`[OK] ${label}${value ? `: ${value}` : ''}`);
}

function warn(label, value = '') {
  console.log(`[WARN] ${label}${value ? `: ${value}` : ''}`);
}

function fail(label, value = '') {
  console.log(`[BLOCKED] ${label}${value ? `: ${value}` : ''}`);
}

async function resolveRecords() {
  console.log('\nDNS');

  try {
    const records = await resolve4(PUBLIC_DOMAIN);
    const value = records.join(', ');
    if (records.includes(EXPECTED_FIREBASE_A)) ok(`${PUBLIC_DOMAIN} A points to Firebase Hosting`, value);
    else if (records.includes(NETLIFY_A)) fail(`${PUBLIC_DOMAIN} still points to Netlify`, value);
    else warn(`${PUBLIC_DOMAIN} A has unexpected value`, value);
  } catch (error) {
    fail(`Could not resolve A for ${PUBLIC_DOMAIN}`, error.message);
  }

  try {
    const records = await resolveCname(WWW_DOMAIN);
    const value = records.join(', ');
    if (records.some((item) => item.replace(/\.$/, '') === EXPECTED_FIREBASE_CNAME)) {
      ok(`${WWW_DOMAIN} CNAME points to Firebase Hosting`, value);
    } else {
      fail(`${WWW_DOMAIN} does not point to Firebase Hosting`, value);
    }
  } catch (error) {
    fail(`Could not resolve CNAME for ${WWW_DOMAIN}`, error.message);
  }

  try {
    const records = await resolveTxt(PUBLIC_DOMAIN);
    const hasFirebaseVerification = records.some((item) => item === 'hosting-site=clasesde10-50add');
    if (hasFirebaseVerification) ok(`${PUBLIC_DOMAIN} Firebase TXT verification present`);
    else fail(`${PUBLIC_DOMAIN} Firebase TXT verification missing`, records.join(' | ') || 'no TXT records');
  } catch (error) {
    fail(`Could not resolve TXT for ${PUBLIC_DOMAIN}`, error.message);
  }
}

function powershellResolve(name, type) {
  try {
    const script = [
      `$r = Resolve-DnsName ${name} -Type ${type} -ErrorAction Stop`,
      '$r | ConvertTo-Json -Compress',
    ].join('; ');
    const raw = execFileSync('powershell', ['-NoProfile', '-Command', script], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return [];
  }
}

async function resolve4(name) {
  try {
    return await dns.resolve4(name);
  } catch {
    return powershellResolve(name, 'A')
      .map((record) => record.IPAddress)
      .filter(Boolean);
  }
}

async function resolveCname(name) {
  try {
    return await dns.resolveCname(name);
  } catch {
    return powershellResolve(name, 'CNAME')
      .map((record) => record.NameHost)
      .filter(Boolean);
  }
}

async function resolveTxt(name) {
  try {
    return (await dns.resolveTxt(name)).map((parts) => parts.join(''));
  } catch {
    return powershellResolve(name, 'TXT')
      .map((record) => {
        if (Array.isArray(record.Strings)) return record.Strings.join('');
        return record.Strings || record.DescriptiveText || '';
      })
      .filter(Boolean);
  }
}

function head(url) {
  return new Promise((resolve) => {
    const req = https.request(url, { method: 'HEAD', timeout: 12000 }, (res) => {
      res.resume();
      resolve({
        ok: res.statusCode >= 200 && res.statusCode < 400,
        status: res.statusCode,
        server: res.headers.server || '',
        location: res.headers.location || '',
        cache: res.headers['cache-status'] || res.headers['x-cache'] || '',
      });
    });

    req.on('timeout', () => {
      req.destroy(new Error('timeout'));
    });
    req.on('error', (error) => {
      resolve({ ok: false, error: error.message });
    });
    req.end();
  });
}

async function checkHttp() {
  console.log('\nHTTP');

  for (const url of [PUBLIC_URL, WWW_URL, FIREBASE_HOSTING_URL]) {
    const result = await head(url);
    if (!result.ok) {
      fail(`${url} not healthy`, result.error || `status ${result.status}`);
      continue;
    }

    const host = result.server || result.cache || 'unknown edge';
    if (url === PUBLIC_URL && /netlify/i.test(host)) {
      fail(`${url} is healthy but still served by Netlify`, `status ${result.status}`);
    } else if (url === FIREBASE_HOSTING_URL) {
      ok(`${url} is healthy`, `status ${result.status}`);
    } else {
      ok(`${url} is healthy`, `status ${result.status}${result.location ? ` -> ${result.location}` : ''}`);
    }
  }
}

function commandExists(command, args = ['--version']) {
  try {
    const output = process.platform === 'win32'
      ? execSync([command, ...args].join(' '), {
        cwd: ROOT,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      }).trim()
      : execFileSync(command, args, {
        cwd: ROOT,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      }).trim();
    return output.split(/\r?\n/)[0] || 'installed';
  } catch {
    return null;
  }
}

function checkCli() {
  console.log('\nLocal tooling');

  const nodeVersion = commandExists('node');
  if (nodeVersion) ok('Node.js available', nodeVersion);
  else fail('Node.js missing');

  const firebaseVersion = commandExists('firebase');
  if (firebaseVersion) ok('Firebase CLI available', firebaseVersion);
  else {
    const firebaseViaNpx = commandExists('npx.cmd', ['--yes', 'firebase-tools', '--version'])
      || commandExists('npx', ['--yes', 'firebase-tools', '--version']);
    if (firebaseViaNpx) ok('Firebase CLI available through npx', firebaseViaNpx);
    else fail('Firebase CLI missing', 'install or use npx firebase-tools for deploys/rules');
  }

  const netlifyVersion = commandExists('netlify');
  if (netlifyVersion) warn('Netlify CLI available', netlifyVersion);
  else ok('Netlify CLI not installed locally', 'fine if migrating away');
}

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (IGNORE_DIRS.has(entry.name)) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath, files);
      continue;
    }

    if (TEXT_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      files.push(fullPath);
    }
  }
  return files;
}

function countMatches(patterns) {
  const result = new Map();
  for (const file of walk(ROOT)) {
    const rel = path.relative(ROOT, file).replace(/\\/g, '/');
    const text = fs.readFileSync(file, 'utf8');
    const matches = patterns.filter((pattern) => pattern.test(text));
    if (matches.length) result.set(rel, matches.length);
  }
  return result;
}

function checkCodeTouchpoints() {
  console.log('\nCode touchpoints');

  const authImports = countMatches([/from ['"](?:\.\.\/|\.\.\/\.\.\/)js\/auth\.js['"]/]);
  if (authImports.size === 0) ok('Auth imports centralized through js/auth-provider.js');
  else fail('Direct js/auth.js imports remain', [...authImports.keys()].join(', '));

  const supabaseRuntime = countMatches([
    /supabase-client\.js/,
    /window\.supabase/,
    /@supabase\/supabase-js/,
    /\.from\(['"][a-z_]+['"]\)/,
    /\.storage\.from\(/,
  ]);
  const runtimeFiles = [...supabaseRuntime.keys()]
    .filter((file) => (
      !file.startsWith('supabase/')
      && !file.startsWith('scripts/')
      && !file.endsWith('.md')
      && file !== 'js/auth.js'
      && file !== 'js/supabase-client.js'
      && file !== 'js/supabase-client.example.js'
      && file !== 'firebase.json'
      && file !== 'netlify.toml'
      && file !== 'package.json'
      && file !== 'package-lock.json'
    ));

  if (runtimeFiles.length === 0) ok('No runtime Supabase touchpoints outside legacy modules');
  else {
    warn('Legacy Supabase-shaped compatibility API touchpoints still present', `${runtimeFiles.length} files`);
    for (const file of runtimeFiles) {
      console.log(`       - ${file}`);
    }
  }

  const netlifyConfig = fs.existsSync(path.join(ROOT, 'netlify.toml'));
  const firebaseConfig = fs.existsSync(path.join(ROOT, 'firebase.json'));
  if (firebaseConfig) ok('Firebase hosting config present', 'firebase.json');
  else fail('Firebase hosting config missing');
  if (netlifyConfig) warn('Netlify config still present', 'legacy rollback artifact; Firebase DNS is already verified');
}

async function main() {
  console.log('ClasesDe10 centralization check');
  console.log(`Root: ${ROOT}`);
  await resolveRecords();
  await checkHttp();
  checkCli();
  checkCodeTouchpoints();
  console.log('\nNext external gates');
  console.log('- Firebase Storage: initialize the default bucket.');
  console.log('- Private app: replace legacy db.from compatibility calls with dedicated Firebase adapters when each dashboard is migrated module by module.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
