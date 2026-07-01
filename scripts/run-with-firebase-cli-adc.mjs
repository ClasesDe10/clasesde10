#!/usr/bin/env node

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const FIREBASE_CLI_CLIENT_ID = '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com';
const FIREBASE_CLI_CLIENT_SECRET = 'j9iVZfS8kkCEFUPaAeJV0sAi';

function candidateConfigPaths() {
  const home = os.homedir();
  return [
    path.join(home, '.config', 'configstore', 'firebase-tools.json'),
    process.env.APPDATA ? path.join(process.env.APPDATA, 'configstore', 'firebase-tools.json') : '',
  ].filter(Boolean);
}

function readFirebaseCliRefreshToken() {
  for (const filePath of candidateConfigPaths()) {
    if (!fs.existsSync(filePath)) continue;
    const config = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const refreshToken = config?.tokens?.refresh_token;
    if (refreshToken) return refreshToken;
  }
  throw new Error('No Firebase CLI refresh token found. Run firebase login before using this wrapper.');
}

function writeTemporaryAdc(refreshToken) {
  const filePath = path.join(os.tmpdir(), `cd10-firebase-cli-adc-${process.pid}.json`);
  fs.writeFileSync(filePath, JSON.stringify({
    client_id: FIREBASE_CLI_CLIENT_ID,
    client_secret: FIREBASE_CLI_CLIENT_SECRET,
    refresh_token: refreshToken,
    type: 'authorized_user',
  }), 'utf8');
  return filePath;
}

async function main() {
  const command = process.argv[2];
  const args = process.argv.slice(3);
  if (!command) {
    throw new Error('Usage: node scripts/run-with-firebase-cli-adc.mjs <command> [...args]');
  }

  const adcPath = writeTemporaryAdc(readFirebaseCliRefreshToken());
  const child = spawn(command, args, {
    cwd: process.cwd(),
    env: {
      ...process.env,
      GOOGLE_APPLICATION_CREDENTIALS: adcPath,
    },
    stdio: 'inherit',
    windowsHide: true,
  });

  const exitCode = await new Promise((resolve) => {
    child.on('exit', (code) => resolve(code ?? 1));
    child.on('error', () => resolve(1));
  });

  fs.rmSync(adcPath, { force: true });
  process.exit(exitCode);
}

main().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});
