#!/usr/bin/env node

import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const roots = ['js', 'functions', 'scripts', 'clases-particulares'];
const supportedExtensions = new Set(['.js', '.mjs', '.cjs']);
const ignoredDirectories = new Set(['node_modules', '.git', 'dist', 'build']);

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const relativePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (ignoredDirectories.has(entry.name)) continue;
      files.push(...await sourceFiles(relativePath));
      continue;
    }
    if (entry.isFile() && supportedExtensions.has(path.extname(entry.name).toLowerCase())) files.push(relativePath);
  }
  return files;
}

const files = (await Promise.all(roots.map(sourceFiles))).flat().sort();
const failures = [];

for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], {
    cwd: process.cwd(),
    encoding: 'utf8',
    windowsHide: true,
  });
  if (result.status !== 0) {
    failures.push({ file, output: `${result.stdout || ''}${result.stderr || ''}`.trim() });
  }
}

if (failures.length) {
  failures.forEach(({ file, output }) => {
    console.error(`\nSyntax error: ${file}`);
    if (output) console.error(output);
  });
  process.exit(1);
}

console.log(`Syntax validation passed for ${files.length} source files.`);
