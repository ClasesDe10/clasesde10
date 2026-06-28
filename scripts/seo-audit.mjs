#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const DOMAIN = 'https://clasesde10.com';
const failures = [];

const EXCLUDED_HTML = [
  /^404\.html$/,
  /^offline\.html$/,
  /^pages[\\/]login\.html$/,
  /^pages[\\/]registro\.html$/,
  /^pages[\\/]reset-password\.html$/,
  /^pages[\\/]dashboard[\\/]/,
];

function fail(message, detail = '') {
  failures.push(detail ? `${message}: ${detail}` : message);
}

function read(relative) {
  return fs.readFileSync(path.join(root, relative), 'utf8');
}

function walkHtml(dir = root) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    const relative = path.relative(root, full);
    if (entry.isDirectory()) {
      if (['.git', '.firebase', '.netlify', '.playwright-cli', 'node_modules', 'output', 'scripts', 'functions', 'firebase', 'supabase'].includes(entry.name)) continue;
      files.push(...walkHtml(full));
    } else if (entry.isFile() && entry.name.endsWith('.html')) {
      files.push(relative);
    }
  }
  return files.sort();
}

function isExcluded(relative) {
  return EXCLUDED_HTML.some((pattern) => pattern.test(relative));
}

function cleanUrlForFile(relative) {
  const normalized = relative.replaceAll('\\', '/');
  if (normalized === 'index.html') return `${DOMAIN}/`;
  if (normalized.endsWith('/index.html')) {
    return `${DOMAIN}/${normalized.replace(/\/index\.html$/, '')}`;
  }
  return `${DOMAIN}/${normalized.replace(/\.html$/, '')}`;
}

function matchOne(html, pattern) {
  const match = html.match(pattern);
  return match ? match[1].trim() : '';
}

function titleOf(html) {
  return matchOne(html, /<title>([\s\S]*?)<\/title>/i);
}

function metaContent(html, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const propertyPattern = new RegExp(`<meta\\s+(?:name|property)=["']${escaped}["']\\s+content=["']([^"']+)["'][^>]*>`, 'i');
  const contentFirstPattern = new RegExp(`<meta\\s+content=["']([^"']+)["']\\s+(?:name|property)=["']${escaped}["'][^>]*>`, 'i');
  return matchOne(html, propertyPattern) || matchOne(html, contentFirstPattern);
}

function canonicalOf(html) {
  return matchOne(html, /<link\s+rel=["']canonical["']\s+href=["']([^"']+)["'][^>]*>/i)
    || matchOne(html, /<link\s+href=["']([^"']+)["']\s+rel=["']canonical["'][^>]*>/i);
}

function schemaBlocks(html) {
  return [...html.matchAll(/<script\s+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)].map((item) => item[1].trim());
}

function sitemapUrls() {
  const sitemap = read('sitemap.xml');
  return [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((item) => item[1].trim());
}

function checkHtml(relative, html, sitemapSet, titleMap, descriptionMap) {
  if (/Ã|Â|â€|ðŸ/.test(html)) fail('HTML contiene texto con codificación rota', relative);

  const expectedCanonical = cleanUrlForFile(relative);
  const title = titleOf(html);
  const description = metaContent(html, 'description');
  const canonical = canonicalOf(html);
  const h1Count = (html.match(/<h1\b/gi) || []).length;

  if (!title || title.length < 10) fail('title SEO ausente o demasiado corto', relative);
  if (!description || description.length < 45 || description.length > 180) fail('description SEO fuera de rango', `${relative} (${description.length})`);
  if (!canonical) fail('canonical ausente', relative);
  if (canonical && canonical !== expectedCanonical) fail('canonical no coincide con URL limpia', `${relative} => ${canonical} esperado ${expectedCanonical}`);
  if (canonical?.endsWith('.html')) fail('canonical usa .html aunque Firebase publica URLs limpias', relative);
  if (!sitemapSet.has(canonical)) fail('canonical indexable no aparece en sitemap', `${relative} => ${canonical}`);
  if (h1Count !== 1) fail('la página debe tener exactamente un H1', `${relative} => ${h1Count}`);

  for (const field of ['og:title', 'og:description', 'og:url', 'og:image', 'twitter:card', 'twitter:title', 'twitter:description', 'twitter:image']) {
    if (!metaContent(html, field)) fail('meta social ausente', `${relative} => ${field}`);
  }
  if (metaContent(html, 'og:url') !== canonical) fail('og:url no coincide con canonical', relative);

  const blocks = schemaBlocks(html);
  if (!blocks.length) fail('JSON-LD ausente', relative);
  for (const block of blocks) {
    try {
      const parsed = JSON.parse(block);
      const graph = Array.isArray(parsed['@graph']) ? parsed['@graph'] : [parsed];
      if (relative !== 'index.html' && !graph.some((item) => item['@type'] === 'BreadcrumbList')) fail('schema sin BreadcrumbList', relative);
    } catch (error) {
      fail('JSON-LD no parsea', `${relative} => ${error.message}`);
    }
  }

  if (title) {
    const duplicate = titleMap.get(title) || [];
    duplicate.push(relative);
    titleMap.set(title, duplicate);
  }
  if (description) {
    const duplicate = descriptionMap.get(description) || [];
    duplicate.push(relative);
    descriptionMap.set(description, duplicate);
  }
}

const robots = read('robots.txt');
if (!robots.includes(`Sitemap: ${DOMAIN}/sitemap.xml`)) fail('robots.txt no declara el sitemap principal');
if (!/Disallow:\s*\/pages\/dashboard\//.test(robots)) fail('robots.txt no bloquea dashboards privados');

const urls = sitemapUrls();
const sitemapSet = new Set(urls);
if (urls.length !== sitemapSet.size) fail('sitemap tiene URLs duplicadas');
if (!urls.includes(`${DOMAIN}/`)) fail('sitemap no incluye home');
if (!urls.includes(`${DOMAIN}/clases-particulares`)) fail('sitemap no incluye hub SEO principal');
if (urls.some((url) => url.endsWith('.html'))) fail('sitemap incluye URLs .html en vez de URLs limpias');
if (urls.some((url) => /\/pages\/|\/offline|\/dashboard/.test(url))) fail('sitemap incluye URLs privadas o no indexables');
if (urls.length < 150) fail('sitemap no refleja arquitectura SEO escalable', `${urls.length} URLs`);

const titleMap = new Map();
const descriptionMap = new Map();
for (const relative of walkHtml()) {
  if (isExcluded(relative)) continue;
  checkHtml(relative, read(relative), sitemapSet, titleMap, descriptionMap);
}

for (const [title, pages] of titleMap.entries()) {
  if (pages.length > 1) fail('title duplicado', `${title} => ${pages.join(', ')}`);
}
for (const [description, pages] of descriptionMap.entries()) {
  if (pages.length > 1) fail('description duplicada', `${description} => ${pages.join(', ')}`);
}

if (failures.length) {
  console.error('SEO audit failed:');
  failures.forEach((item) => console.error(`- ${item}`));
  process.exit(1);
}

console.log(JSON.stringify({
  ok: true,
  sitemapUrls: urls.length,
  htmlChecked: walkHtml().filter((file) => !isExcluded(file)).length,
}, null, 2));
