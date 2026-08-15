#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { chromium } from 'playwright';

const root = process.cwd();
const baseUrl = process.env.SEO_AUDIT_URL || 'https://clasesde10.com';
const sourcePath = path.join(root, 'scripts', 'seo-public-smoke.playwright.js');
const source = fs.readFileSync(sourcePath, 'utf8').trim();
const audit = Function(`"use strict"; return (${source});`)();

async function launchBrowser() {
  try {
    return await chromium.launch({ channel: 'chrome', headless: true });
  } catch {
    return chromium.launch({ headless: true });
  }
}

const browser = await launchBrowser();
try {
  const context = await browser.newContext({
    locale: 'es-ES',
    serviceWorkers: 'block',
  });
  const page = await context.newPage();
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  const result = await audit(page);
  console.log(JSON.stringify({ ok: true, baseUrl, ...result }, null, 2));
  await context.close();
} finally {
  await browser.close();
}
