#!/usr/bin/env node
/**
 * Runs one or more repository Playwright function files through playwright-cli.
 *
 * The existing mobile audit scripts are async function expressions:
 *   async (page) => { ... }
 *
 * playwright-cli can execute them with `run-code`, but PowerShell passes
 * multiline files poorly. This runner opens Chrome once, compacts each function
 * into a single argument, and executes the functions sequentially.
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const DEFAULT_URL = 'https://clasesde10.com';

function usage() {
  console.error([
    'Usage:',
    '  node scripts/run-playwright-cli-function.mjs --url <url> [--session <name>] <script.playwright.js> [more scripts]',
    '',
    'Examples:',
    '  node scripts/run-playwright-cli-function.mjs --url https://clasesde10.com scripts/mobile-responsive-summary.playwright.js',
    '  node scripts/run-playwright-cli-function.mjs --url https://clasesde10.com scripts/mobile-admin-login.playwright.js scripts/mobile-responsive-summary.playwright.js',
  ].join('\n'));
}

function parseArgs(argv) {
  const options = {
    url: DEFAULT_URL,
    session: `cd10-${Date.now()}`,
    scripts: [],
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--url') {
      options.url = argv[index + 1];
      index += 1;
    } else if (arg === '--session') {
      options.session = argv[index + 1];
      index += 1;
    } else {
      options.scripts.push(arg);
    }
  }

  return options;
}

function npxInvocation() {
  if (process.platform !== 'win32') {
    return { command: 'npx', prefixArgs: [] };
  }

  const nodeDir = path.dirname(process.execPath);
  const npxCli = path.join(nodeDir, 'node_modules', 'npm', 'bin', 'npx-cli.js');
  if (!fs.existsSync(npxCli)) {
    throw new Error(`npx-cli.js not found at ${npxCli}`);
  }

  return {
    command: process.execPath,
    prefixArgs: [npxCli],
  };
}

function runPlaywright(session, args, env = process.env) {
  const invocation = npxInvocation();
  const fullArgs = [
    ...invocation.prefixArgs,
    '--yes',
    '--package',
    '@playwright/cli',
    'playwright-cli',
    `-s=${session}`,
    ...args,
  ];
  try {
    return execFileSync(invocation.command, fullArgs, {
      encoding: 'utf8',
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: Number(process.env.PWCLI_STEP_TIMEOUT_MS || 120000),
    });
  } catch (error) {
    const stdout = String(error.stdout || '').trim();
    const stderr = String(error.stderr || '').trim();
    const clean = [stderr, stdout].filter(Boolean).join('\n');
    const safe = new Error(clean || `playwright-cli failed with status ${error.status ?? 'unknown'}`);
    safe.status = error.status;
    throw safe;
  }
}

function compactFunctionSource(filePath) {
  const source = fs.readFileSync(filePath, 'utf8').trim()
    .replace(/process\.env\.([A-Z0-9_]+)/g, (_, name) => JSON.stringify(process.env[name] || ''));
  if (!/^async\s*\(/.test(source) && !/^\(\s*async\s*\(/.test(source)) {
    throw new Error(`${filePath} must export an async function expression.`);
  }
  return source.replace(/\s+/g, ' ');
}

function parseCliResult(output) {
  const errorMatch = output.match(/### Error\s*\n([\s\S]*)/);
  if (errorMatch) return { error: errorMatch[1].trim() };

  const match = output.match(/### Result\s*\n([\s\S]*?)\n### Ran Playwright code/);
  if (!match) return { raw: output.trim() };

  const text = match[1].trim();
  try {
    return JSON.parse(text);
  } catch {
    return { rawResult: text };
  }
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!options.scripts.length) {
    usage();
    process.exit(1);
  }

  const results = [];
  try {
    runPlaywright(options.session, ['open', options.url, '--browser', 'chrome']);

    for (const scriptPathRaw of options.scripts) {
      const scriptPath = path.resolve(scriptPathRaw);
      if (!fs.existsSync(scriptPath)) {
        throw new Error(`Script not found: ${scriptPathRaw}`);
      }

      const code = compactFunctionSource(scriptPath);
      const output = runPlaywright(options.session, ['run-code', code]);
      results.push({
        script: path.relative(process.cwd(), scriptPath),
        result: parseCliResult(output),
      });
    }
  } finally {
    try {
      runPlaywright(options.session, ['close']);
    } catch {}
  }

  console.log(JSON.stringify({
    ok: !results.some((item) => item.result?.error),
    url: options.url,
    session: options.session,
    results,
  }, null, 2));

  if (results.some((item) => item.result?.error)) {
    process.exitCode = 1;
  }
}

try {
  main();
} catch (error) {
  console.error(error?.message || error);
  process.exit(1);
}
