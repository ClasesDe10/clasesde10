#!/usr/bin/env node
import fs from 'node:fs';

const coreFiles = [
  'css/style.css',
  'index.html',
  'como-funciona.html',
  'para-padres.html',
  'para-profesores.html',
  'sobre-nosotros.html',
  'contacto.html',
  '404.html',
  'offline.html',
  'pages/login.html',
  'pages/registro.html',
  'pages/reset-password.html',
  'termina-tu-cuenta.html',
];

const failures = [];
const read = (file) => fs.readFileSync(file, 'utf8');

for (const file of coreFiles) {
  const source = read(file);
  if (/\b(?:linear|radial)-gradient\s*\(/i.test(source)) {
    failures.push(`${file}: contiene un degradado`);
  }
  for (const match of source.matchAll(/([^{}]+):hover\s*\{([^}]*)\}/gi)) {
    const nonInteractiveSurface = /(?:^|[\s,.])(?:card|ht-card|benefit-card|why-card|value-card|sv-card|future-item|tm-card|ci-card|step-body|materia-pill)(?:\b|[.#:[\]])/i.test(match[1]);
    const transform = match[2].match(/transform\s*:\s*([^;]+)/i)?.[1]?.trim();
    if (nonInteractiveSurface && transform && transform !== 'none' && transform !== 'none !important') {
      failures.push(`${file}: un hover desplaza el elemento`);
    }
  }
}

const globalCss = read('css/style.css');
const home = read('index.html');

if (!/--radius:\s*4px/.test(globalCss) || !/--radius-sm:\s*2px/.test(globalCss)) {
  failures.push('css/style.css: los radios globales han dejado de ser contenidos');
}
if (!/\.seo-hero,[\s\S]*?background-image:\s*none\s*!important/.test(globalCss)) {
  failures.push('css/style.css: falta la protección plana para landings SEO');
}
if (!/\.seo-card\s*\{[\s\S]*?border-radius:\s*0\s*!important/.test(globalCss)) {
  failures.push('css/style.css: las tarjetas SEO han recuperado card-soup');
}
if (/[✅🌍🔐💬🎓]/u.test(home) || /class="(?:ht-ico|tm-quote|tm-stars)"/.test(home)) {
  failures.push('index.html: han reaparecido iconos decorativos en la portada');
}

if (failures.length) {
  console.error('Public visual design audit failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(`Public visual design audit OK (${coreFiles.length} archivos base).`);
