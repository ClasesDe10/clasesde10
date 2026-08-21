#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const DOMAIN = 'https://clasesde10.com';
const TODAY_IN_MADRID = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Madrid',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
}).format(new Date());
const failures = [];
const warnings = [];

const EXCLUDED_HTML = [
  /^404\.html$/,
  /^offline\.html$/,
  /^pages[\\/]login\.html$/,
  /^pages[\\/]registro\.html$/,
  /^pages[\\/]reset-password\.html$/,
  /^pages[\\/]crear-contrasena\.html$/,
  /^pages[\\/]dashboard[\\/]/,
  /^termina-tu-cuenta\.html$/,
];
const PRIVATE_HTML = [
  'offline.html',
  'pages/login.html',
  'pages/registro.html',
  'pages/reset-password.html',
  'pages/crear-contrasena.html',
  'termina-tu-cuenta.html',
];
const EXCLUDED_DIRS = new Set([
  '.git',
  '.firebase',
  '.netlify',
  '.playwright-cli',
  '.tools',
  'android',
  'node_modules',
  'output',
  'tmp',
  'scripts',
  'functions',
  'firebase',
  'supabase',
]);
const INTERNAL_COPY_PATTERNS = [
  /arquitectura seo/i,
  /seo local/i,
  /sin contenido duplicado/i,
  /intenci[oó]n de b[uú]squeda/i,
  /can[oó]nica limpia/i,
  /datos estructurados/i,
  /enlazado interno/i,
  /sitemap a mano/i,
  /landings? espec[ií]ficas?/i,
  /generad[ao]s? autom[aá]ticamente/i,
  /este hub/i,
  /hubs? locales?/i,
  /convierten? mejor/i,
];

function fail(message, detail = '') {
  failures.push(detail ? `${message}: ${detail}` : message);
}

function warn(message, detail = '') {
  warnings.push(detail ? `${message}: ${detail}` : message);
}

function read(relative) {
  return fs.readFileSync(path.join(root, relative), 'utf8');
}

function walkHtml(dir = root) {
  const files = [];
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (error) {
    if (error?.code === 'EACCES' || error?.code === 'EPERM') {
      warn('Directorio omitido por permisos', path.relative(root, dir));
      return files;
    }
    throw error;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    const relative = path.relative(root, full);
    if (entry.isDirectory()) {
      if (EXCLUDED_DIRS.has(entry.name)) continue;
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

function stripHtml(html) {
  return html
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#(?:39|x27);/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function sitemapEntries() {
  const sitemap = read('sitemap.xml');
  return [...sitemap.matchAll(/<url>([\s\S]*?)<\/url>/g)].map((match) => ({
    loc: matchOne(match[1], /<loc>([^<]+)<\/loc>/i),
    lastmod: matchOne(match[1], /<lastmod>([^<]+)<\/lastmod>/i),
  }));
}

function schemaHasType(item, type) {
  const types = Array.isArray(item?.['@type']) ? item['@type'] : [item?.['@type']];
  return types.includes(type);
}

function hrefsOf(html) {
  return [...html.matchAll(/<a\b[^>]*\bhref=["']([^"']+)["'][^>]*>/gi)].map((match) => match[1].trim());
}

function sameOriginUrl(raw, base) {
  if (!raw || /^(?:#|mailto:|tel:|javascript:)/i.test(raw)) return null;
  try {
    const url = new URL(raw, base);
    if (url.origin !== DOMAIN) return null;
    url.hash = '';
    url.search = '';
    if (url.pathname !== '/' && url.pathname.endsWith('/')) url.pathname = url.pathname.slice(0, -1);
    return url;
  } catch {
    return null;
  }
}

function localTargetExists(url) {
  const pathname = decodeURIComponent(url.pathname);
  if (pathname === '/') return fs.existsSync(path.join(root, 'index.html'));
  const relative = pathname.replace(/^\/+/, '');
  const candidates = path.extname(relative)
    ? [relative]
    : [`${relative}.html`, path.join(relative, 'index.html')];
  return candidates.some((candidate) => fs.existsSync(path.join(root, candidate)));
}

function checkHeadingOrder(relative, html) {
  const levels = [...html.matchAll(/<h([1-6])\b[^>]*>/gi)].map((match) => Number(match[1]));
  for (let index = 1; index < levels.length; index += 1) {
    if (levels[index] > levels[index - 1] + 1) {
      warn('jerarquía de encabezados salta niveles', `${relative} => H${levels[index - 1]} a H${levels[index]}`);
      break;
    }
  }
}

function checkHtml(relative, html, sitemapSet, titleMap, descriptionMap, pageLinks, metrics) {
  if (/Ã|Â|â€|ðŸ/.test(html)) fail('HTML contiene texto con codificación rota', relative);
  if (!/^<!doctype html>/i.test(html.trimStart())) fail('DOCTYPE HTML ausente', relative);
  if (!/<html\b[^>]*\blang=["']es(?:-[A-Z]{2})?["']/i.test(html)) fail('idioma HTML no declarado como español', relative);
  if (!/<meta\s+charset=["']?utf-8/i.test(html.slice(0, 2048))) fail('charset UTF-8 ausente al inicio del documento', relative);
  if (!metaContent(html, 'viewport')) fail('viewport móvil ausente', relative);
  if (metaContent(html, 'keywords')) fail('meta keywords obsoleta detectada', relative);

  const expectedCanonical = cleanUrlForFile(relative);
  const title = titleOf(html);
  const description = metaContent(html, 'description');
  const canonical = canonicalOf(html);
  const canonicalCount = (html.match(/<link\b[^>]*\brel=["']canonical["']/gi) || []).length;
  const h1Count = (html.match(/<h1\b/gi) || []).length;
  const robots = metaContent(html, 'robots');

  if (!title || title.length < 15 || title.length > 75) fail('title SEO fuera de rango útil', `${relative} (${title.length})`);
  if (!description || description.length < 70 || description.length > 170) fail('description SEO fuera de rango útil', `${relative} (${description.length})`);
  if (canonicalCount !== 1) fail('debe existir una sola canonical', `${relative} => ${canonicalCount}`);
  if (canonical && canonical !== expectedCanonical) fail('canonical no coincide con URL limpia', `${relative} => ${canonical} esperado ${expectedCanonical}`);
  if (canonical?.endsWith('.html')) fail('canonical usa .html aunque Firebase publica URLs limpias', relative);
  if (!sitemapSet.has(canonical)) fail('canonical indexable no aparece en sitemap', `${relative} => ${canonical}`);
  if (h1Count !== 1) fail('la página debe tener exactamente un H1', `${relative} => ${h1Count}`);
  if (/noindex/i.test(robots)) fail('página del sitemap marcada noindex', relative);
  checkHeadingOrder(relative, html);

  const visibleText = stripHtml(html);
  for (const pattern of INTERNAL_COPY_PATTERNS) {
    if (pattern.test(visibleText)) fail('texto interno o técnico visible al usuario', `${relative} => ${pattern}`);
  }
  if (relative.replaceAll('\\', '/').startsWith('clases-particulares/')) {
    const wordCount = visibleText.split(/\s+/).filter(Boolean).length;
    if (wordCount < 90) fail('página de clases con contenido insuficiente para el usuario', `${relative} => ${wordCount} palabras`);
  }

  for (const field of ['og:title', 'og:description', 'og:url', 'og:image', 'og:image:width', 'og:image:height', 'og:image:alt', 'twitter:card', 'twitter:title', 'twitter:description', 'twitter:image', 'twitter:image:alt']) {
    if (!metaContent(html, field)) fail('meta social ausente', `${relative} => ${field}`);
  }
  if (metaContent(html, 'og:url') !== canonical) fail('og:url no coincide con canonical', relative);
  if (metaContent(html, 'og:image') !== `${DOMAIN}/assets/img/social-share.png`) fail('imagen social no usa el formato horizontal de marca', relative);
  if (metaContent(html, 'twitter:card') !== 'summary_large_image') fail('twitter card no está configurada como imagen grande', relative);

  const imageTags = [...html.matchAll(/<img\b[^>]*>/gi)].map((match) => match[0]);
  for (const tag of imageTags) {
    if (!/\balt=["'][^"']*["']/i.test(tag)) fail('imagen sin atributo alt', relative);
    if (!/\bwidth=["']?\d+/i.test(tag) || !/\bheight=["']?\d+/i.test(tag)) metrics.imagesWithoutDimensions += 1;
  }

  const blocks = schemaBlocks(html);
  if (!blocks.length) fail('JSON-LD ausente', relative);
  const graph = [];
  for (const block of blocks) {
    try {
      const parsed = JSON.parse(block);
      graph.push(...(Array.isArray(parsed['@graph']) ? parsed['@graph'] : [parsed]));
    } catch (error) {
      fail('JSON-LD no parsea', `${relative} => ${error.message}`);
    }
  }
  if (relative !== 'index.html' && !graph.some((item) => schemaHasType(item, 'BreadcrumbList'))) fail('schema sin BreadcrumbList', relative);
  if (graph.some((item) => schemaHasType(item, 'FAQPage'))) fail('FAQPage sin elegibilidad de resultado enriquecido para este tipo de sitio', relative);
  if (graph.some((item) => schemaHasType(item, 'LocalBusiness') || schemaHasType(item, 'EducationalOrganization'))) fail('tipo de organización inexacto o no demostrado', relative);
  for (const item of graph) {
    if (item?.sameAs && Array.isArray(item.sameAs) && item.sameAs.length === 0) fail('sameAs vacío en datos estructurados', relative);
    if (item?.dateModified && (!/^\d{4}-\d{2}-\d{2}$/.test(item.dateModified) || item.dateModified > TODAY_IN_MADRID)) {
      fail('dateModified inválido o futuro', `${relative} => ${item.dateModified}`);
    }
  }
  if (relative === 'index.html') {
    const organization = graph.find((item) => schemaHasType(item, 'Organization'));
    const website = graph.find((item) => schemaHasType(item, 'WebSite'));
    if (!organization || organization['@id'] !== `${DOMAIN}/#organization`) fail('Organization principal ausente o sin @id estable');
    if (!website || website['@id'] !== `${DOMAIN}/#website` || website.name !== 'ClasesDe10') fail('WebSite no define la marca principal con un @id estable');
    if (!organization?.foundingLocation || !Array.isArray(organization?.areaServed)) fail('Organization no explica origen y cobertura real del servicio');
  }

  const links = new Set();
  for (const href of hrefsOf(html)) {
    if (/\.html(?:[?#]|$)/i.test(href)) fail('enlace interno conserva extensión .html', `${relative} => ${href}`);
    const url = sameOriginUrl(href, expectedCanonical);
    if (!url) continue;
    if (!localTargetExists(url)) fail('enlace interno roto', `${relative} => ${url.pathname}`);
    const normalized = `${DOMAIN}${url.pathname}`;
    if (sitemapSet.has(normalized)) links.add(normalized);
  }
  pageLinks.set(canonical, links);

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

const robotsText = read('robots.txt');
if (!robotsText.includes(`Sitemap: ${DOMAIN}/sitemap.xml`)) fail('robots.txt no declara el sitemap principal');
if (/Disallow:\s*\/pages\/(?:dashboard|login|registro|reset-password)/i.test(robotsText)) {
  fail('robots.txt impide que Google vea el noindex de páginas privadas');
}

const firebaseConfig = JSON.parse(read('firebase.json'));
const consolidationRedirects = (firebaseConfig.hosting?.redirects || []).filter((redirect) => (
  redirect.type === 301
  && redirect.regex?.startsWith('/clases-particulares/')
  && (redirect.destination === '/clases-particulares' || redirect.destination?.startsWith('/clases-particulares/'))
));
if (consolidationRedirects.length !== 17) {
  fail('faltan redirecciones 301 desde páginas combinadas antiguas', consolidationRedirects.length);
}
for (const pathname of [
  '/clases-particulares/matematicas-madrid',
  '/clases-particulares/primaria-madrid',
  '/clases-particulares/eso-madrid',
  '/clases-particulares/bachillerato-madrid',
  '/clases-particulares/selectividad-madrid',
]) {
  if (consolidationRedirects.some((redirect) => new RegExp(redirect.regex).test(pathname))) {
    fail('una landing prioritaria de Madrid queda interceptada por una redirección', pathname);
  }
}

for (const relative of PRIVATE_HTML) {
  if (!fs.existsSync(path.join(root, relative))) {
    fail('página privada esperada ausente', relative);
    continue;
  }
  if (!/noindex/i.test(metaContent(read(relative), 'robots'))) fail('página privada sin meta noindex', relative);
}

const entries = sitemapEntries();
const urls = entries.map((entry) => entry.loc);
const sitemapSet = new Set(urls);
if (urls.length !== sitemapSet.size) fail('sitemap tiene URLs duplicadas');
if (!urls.includes(`${DOMAIN}/`)) fail('sitemap no incluye home');
if (!urls.includes(`${DOMAIN}/clases-particulares`)) fail('sitemap no incluye el directorio principal de clases');
if (urls.some((url) => url.endsWith('.html'))) fail('sitemap incluye URLs .html en vez de URLs limpias');
if (urls.some((url) => /\/pages\/|\/offline|\/dashboard/.test(url))) fail('sitemap incluye URLs privadas o no indexables');
if (urls.length !== 38) fail('sitemap no coincide con la arquitectura editorial prevista', `${urls.length} URLs`);
if (!urls.includes(`${DOMAIN}/guias`) || !urls.includes(`${DOMAIN}/clases-particulares/matematicas-madrid`)) {
  fail('sitemap no incluye los nuevos centros de autoridad editorial y local');
}
if (/<(?:changefreq|priority)>/i.test(read('sitemap.xml'))) warn('sitemap contiene señales que Google ignora');
for (const entry of entries) {
  if (!entry.lastmod || !/^\d{4}-\d{2}-\d{2}$/.test(entry.lastmod)) fail('lastmod ausente o inválido', entry.loc);
  else if (entry.lastmod > TODAY_IN_MADRID) fail('lastmod está en el futuro', entry.loc);
  const url = sameOriginUrl(entry.loc, DOMAIN);
  if (!url || !localTargetExists(url)) fail('URL del sitemap no tiene archivo publicable', entry.loc);
}

const titleMap = new Map();
const descriptionMap = new Map();
const pageLinks = new Map();
const metrics = { imagesWithoutDimensions: 0 };
const htmlFiles = walkHtml().filter((file) => !isExcluded(file));
for (const relative of htmlFiles) {
  checkHtml(relative, read(relative), sitemapSet, titleMap, descriptionMap, pageLinks, metrics);
}

for (const [title, pages] of titleMap.entries()) {
  if (pages.length > 1) fail('title duplicado', `${title} => ${pages.join(', ')}`);
}
for (const [description, pages] of descriptionMap.entries()) {
  if (pages.length > 1) fail('description duplicada', `${description} => ${pages.join(', ')}`);
}

const incoming = new Map(urls.map((url) => [url, 0]));
for (const links of pageLinks.values()) {
  for (const target of links) incoming.set(target, (incoming.get(target) || 0) + 1);
}
for (const [url, count] of incoming.entries()) {
  if (url !== `${DOMAIN}/` && count === 0) fail('página huérfana sin enlaces internos entrantes', url);
}

if (metrics.imagesWithoutDimensions) warn('imágenes sin dimensiones intrínsecas', metrics.imagesWithoutDimensions);

if (failures.length) {
  console.error('SEO audit failed:');
  failures.forEach((item) => console.error(`- ${item}`));
  if (warnings.length) {
    console.error('SEO audit warnings:');
    warnings.forEach((item) => console.error(`- ${item}`));
  }
  process.exit(1);
}

console.log(JSON.stringify({
  ok: true,
  sitemapUrls: urls.length,
  htmlChecked: htmlFiles.length,
  orphanPages: 0,
  duplicateTitles: 0,
  duplicateDescriptions: 0,
  warnings,
}, null, 2));
