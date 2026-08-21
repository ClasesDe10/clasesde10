#!/usr/bin/env node

const PRIMARY = 'https://clasesde10.com';
const ALIAS = 'https://clasesde10-50add.web.app';
const failures = [];
const timings = [];

function fail(message) {
  failures.push(message);
}

async function request(url, options = {}) {
  const started = performance.now();
  const response = await fetch(url, {
    cache: 'no-store',
    headers: {
      'cache-control': 'no-cache',
      'user-agent': 'Googlebot/2.1 (+http://www.google.com/bot.html)',
      ...(options.headers || {}),
    },
    ...options,
  });
  timings.push(performance.now() - started);
  return response;
}

function canonicalOf(html) {
  return html.match(/<link\s+rel=["']canonical["']\s+href=["']([^"']+)["']/i)?.[1]
    || html.match(/<link\s+href=["']([^"']+)["']\s+rel=["']canonical["']/i)?.[1]
    || '';
}

const robotsResponse = await request(`${PRIMARY}/robots.txt?audit=${Date.now()}`);
const robots = await robotsResponse.text();
if (robotsResponse.status !== 200) fail(`robots.txt responde ${robotsResponse.status}`);
if (!robots.includes(`Sitemap: ${PRIMARY}/sitemap.xml`)) fail('robots.txt no declara el sitemap canónico');
if (/Disallow:\s*\/$/m.test(robots)) fail('robots.txt bloquea el sitio completo');

const sitemapResponse = await request(`${PRIMARY}/sitemap.xml?audit=${Date.now()}`);
const sitemap = await sitemapResponse.text();
if (sitemapResponse.status !== 200) fail(`sitemap.xml responde ${sitemapResponse.status}`);
const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
if (urls.length !== 38) fail(`sitemap publica ${urls.length} URLs; se esperaban 38`);
if (new Set(urls).size !== urls.length) fail('sitemap publica URLs duplicadas');

const results = await Promise.all(urls.map(async (url) => {
  const response = await request(`${url}?seo_audit=${Date.now()}`, { redirect: 'manual' });
  const html = await response.text();
  return { url, response, html };
}));

for (const { url, response, html } of results) {
  if (response.status !== 200) {
    fail(`${url} responde ${response.status} en vez de 200`);
    continue;
  }
  if (!response.headers.get('content-type')?.includes('text/html')) fail(`${url} no se sirve como HTML`);
  if (/noindex/i.test(response.headers.get('x-robots-tag') || '')) fail(`${url} recibe X-Robots-Tag noindex`);
  if (canonicalOf(html) !== url) fail(`${url} publica una canonical distinta: ${canonicalOf(html) || 'ausente'}`);
  if (!/<meta\s+name=["']description["']/i.test(html)) fail(`${url} no publica meta description`);
  if (!/<script\s+type=["']application\/ld\+json["']/i.test(html)) fail(`${url} no publica JSON-LD`);
}

const priorityPaths = [
  '/clases-particulares/matematicas-madrid',
  '/clases-particulares/primaria-madrid',
  '/clases-particulares/eso-madrid',
  '/clases-particulares/bachillerato-madrid',
  '/clases-particulares/selectividad-madrid',
  '/clases-particulares/profesor-a-domicilio-madrid',
  '/guias/como-elegir-profesor-particular',
];
for (const pathname of priorityPaths) {
  const response = await request(`${PRIMARY}${pathname}?priority_audit=${Date.now()}`, { redirect: 'manual' });
  if (response.status !== 200) fail(`la URL prioritaria ${pathname} responde ${response.status}`);
}

for (const city of ['barcelona', 'valencia', 'sevilla', 'zaragoza', 'malaga', 'murcia', 'alicante', 'bilbao', 'valladolid']) {
  const response = await request(`${PRIMARY}/clases-particulares/${city}?redirect_audit=${Date.now()}`, { redirect: 'manual' });
  const location = response.headers.get('location') || '';
  if (response.status !== 301) fail(`la antigua página de ${city} no responde 301 (${response.status})`);
  const redirectPath = location ? new URL(location, PRIMARY).pathname : '';
  if (redirectPath !== '/clases-particulares') fail(`la antigua página de ${city} redirige a ${location || 'ningún destino'}`);
}

for (const pathname of ['/', '/clases-particulares/madrid', ...priorityPaths]) {
  const response = await request(`${ALIAS}${pathname}?alias_audit=${Date.now()}`, { redirect: 'manual' });
  if (response.status !== 200) fail(`el alias de Firebase para ${pathname} responde ${response.status}`);
  const html = await response.text();
  const expected = `${PRIMARY}${pathname === '/' ? '/' : pathname}`;
  if (canonicalOf(html) !== expected) fail(`el alias de Firebase no conserva la canonical de ${pathname}`);
}

if (failures.length) {
  console.error('SEO production HTTP audit failed:');
  failures.forEach((item) => console.error(`- ${item}`));
  process.exit(1);
}

const sortedTimings = timings.toSorted((a, b) => a - b);
const percentile = (ratio) => Math.round(sortedTimings[Math.min(sortedTimings.length - 1, Math.floor(sortedTimings.length * ratio))] || 0);
console.log(JSON.stringify({
  ok: true,
  sitemapUrls: urls.length,
  priorityUrls: priorityPaths.length,
  consolidatedCityRedirects: 9,
  hostsChecked: [PRIMARY, ALIAS],
  httpLatencyMs: { median: percentile(0.5), p95: percentile(0.95) },
}, null, 2));
