import fs from 'node:fs';

const checks = [
  {
    file: 'para-padres.html',
    primaryText: 'Entrar o crear cuenta',
    primaryHref: '/pages/login?rol=familia',
    secondaryText: 'Pedir un profesor',
    secondaryHref: '#formulario',
  },
  {
    file: 'para-profesores.html',
    primaryText: 'Entrar o crear cuenta',
    primaryHref: '/pages/login?rol=profesor',
    secondaryText: 'Ver cómo empezar',
    secondaryHref: '#formulario',
  },
];

const failures = [];

for (const check of checks) {
  const html = fs.readFileSync(check.file, 'utf8');
  const header = html.match(/<header class="page-header">([\s\S]*?)<\/header>/)?.[1] || '';
  const primaryPattern = new RegExp(
    `<a class="btn-primary" href="${check.primaryHref.replace(/[?]/g, '\\?')}">${check.primaryText}<\\/a>`,
  );
  const secondaryPattern = new RegExp(
    `<a class="btn-ghost" href="${check.secondaryHref}">${check.secondaryText}<\\/a>`,
  );

  if (!primaryPattern.test(header)) {
    failures.push(`${check.file}: falta el CTA principal "${check.primaryText}" en la cabecera`);
  }
  if (!secondaryPattern.test(header)) {
    failures.push(`${check.file}: falta el CTA secundario "${check.secondaryText}" en la cabecera`);
  }
  if (!/class="page-header-note"/.test(header)) {
    failures.push(`${check.file}: falta explicar que la acción continúa creando la cuenta`);
  }
}

const css = fs.readFileSync('css/style.css', 'utf8');
if (!/\.page-header-actions\s*\{/.test(css)) failures.push('css/style.css: faltan los estilos de los CTA de cabecera');
if (!/\.page-header-actions \.btn-primary,[\s\S]*\.page-header-actions \.btn-ghost \{ width: 100%; \}/.test(css)) {
  failures.push('css/style.css: los CTA no están adaptados a móvil');
}

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}

console.log('Audience CTA audit OK (familias + profesores).');
