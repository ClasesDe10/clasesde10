import fs from 'node:fs';

const files = [
  'index.html',
  'para-padres.html',
  'para-profesores.html',
  'termina-tu-cuenta.html',
  'pages/registro.html',
  'pages/dashboard/familia.html',
  'pages/dashboard/profesor.html',
  'js/family-journey-engine.js',
  'js/teacher-journey-engine.js',
  'js/profile-engine.js',
  'js/document-storage-provider.js',
  'js/trust-engine.js',
  'js/pwa.js',
  'js/notification-engine.js',
];

const forbidden = [
  /Google ya nos ha dado/i,
  /coordinaci[oó]n operativa/i,
  /datos sueltos/i,
  /perfiles duplicados/i,
  /guardamos tu identidad y acceso en Firebase/i,
  /El admin ve/i,
  /revisi[oó]n admin/i,
  /revisaremos el matching/i,
  /mejora el matching/i,
  /Origen datos[^\n]*Firebase/i,
  /Objetivo \/ admin/i,
  /Validado por admin/i,
  /Validada por admin/i,
  /Perfil completo para matching/i,
  /Direcci[oó]n para matching/i,
  /Firebase Storage aun no esta inicializado/i,
  /todos los datos ordenados/i,
  /cada dato quede en su sitio/i,
  /calcular cercania/i,
  /Aviso admin/i,
  /Franjas reales para matching/i,
  /El admin debe validar/i,
  /revisi[oó]n del admin/i,
];

const failures = [];
for (const file of files) {
  const source = fs.readFileSync(file, 'utf8');
  for (const pattern of forbidden) {
    if (pattern.test(source)) failures.push(`${file}: contiene texto interno (${pattern})`);
  }
}

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}

console.log(`Public copy boundary audit OK (${files.length} archivos).`);
