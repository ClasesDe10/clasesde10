#!/usr/bin/env node
import fs from 'node:fs';

const expected = ['Cómo funciona', 'Para familias', 'Para profesores', 'Contacto', 'Acceder'];
const inlinePages = [
  'index.html',
  'como-funciona.html',
  'para-padres.html',
  'para-profesores.html',
  'sobre-nosotros.html',
  'contacto.html',
];
const failures = [];
const read = (file) => fs.readFileSync(file, 'utf8');
const anchorTexts = (block) => [...block.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/gi)]
  .map((match) => match[1].replace(/<[^>]+>/g, '').trim());
const same = (actual) => JSON.stringify(actual) === JSON.stringify(expected);

for (const file of inlinePages) {
  const source = read(file);
  const desktop = source.match(/<ul class="nav-links">([\s\S]*?)<\/ul>/i)?.[1] || '';
  const mobile = source.match(/<div class="mobile-menu"[^>]*>([\s\S]*?)<\/div>/i)?.[1] || '';
  if (!same(anchorTexts(desktop))) failures.push(`${file}: navegación de escritorio incorrecta`);
  if (!same(anchorTexts(mobile))) failures.push(`${file}: navegación móvil incorrecta`);
  if ((desktop.match(/class="nav-cta"/g) || []).length !== 1 || !/class="nav-cta"[^>]*>Acceder<\/a>/.test(desktop)) {
    failures.push(`${file}: Acceder no es el único CTA de escritorio`);
  }
  if ((mobile.match(/class="m-cta"/g) || []).length !== 1 || !/class="m-cta"[^>]*data-mobile-close[^>]*>Acceder<\/a>/.test(mobile)) {
    failures.push(`${file}: Acceder no es el único CTA móvil`);
  }
}

const injector = read('js/nav.js');
const injectedDesktop = injector.match(/<ul id="navLinks"[\s\S]*?>([\s\S]*?)<\/ul>/i)?.[1] || '';
const injectedMobile = injector.match(/<div id="mobileMenu"[\s\S]*?>([\s\S]*?)<\/div>`/i)?.[1] || '';
if (!same(anchorTexts(injectedDesktop))) failures.push('js/nav.js: navegación inyectada de escritorio incorrecta');
if (!same(anchorTexts(injectedMobile))) failures.push('js/nav.js: navegación inyectada móvil incorrecta');
if (!/class="nav-cta"[^>]*[\s\S]*?>Acceder<\/a>/.test(injectedDesktop)) failures.push('js/nav.js: Acceder no es CTA de escritorio');
if (!/class="m-cta"[^>]*[\s\S]*?>Acceder<\/a>/.test(injectedMobile)) failures.push('js/nav.js: Acceder no es CTA móvil');

const generated = read('clases-particulares/matematicas.html');
if (!generated.includes('/js/nav.js?v=20260809-seo')) failures.push('páginas de clases: falta la versión actual del menú');

if (failures.length) {
  console.error('Public navigation audit failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(`Public navigation audit OK (${inlinePages.length} plantillas inline + inyector global).`);
