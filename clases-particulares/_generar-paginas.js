#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const DOMAIN = 'https://clasesde10.com';
const TODAY = new Date().toISOString().slice(0, 10);
const SEO_ENGINE_VERSION = 'seo-engine-2026-06-28';

const CITIES = [
  { slug: 'madrid', name: 'Madrid', region: 'Comunidad de Madrid', intent: 'alta demanda de refuerzo escolar, Bachillerato y EBAU', modality: 'presencial y online' },
  { slug: 'barcelona', name: 'Barcelona', region: 'Cataluña', intent: 'familias que buscan refuerzo bilingüe, ciencias e idiomas', modality: 'online y presencial bajo disponibilidad' },
  { slug: 'valencia', name: 'Valencia', region: 'Comunidad Valenciana', intent: 'apoyo escolar, idiomas y preparación de exámenes', modality: 'online y presencial bajo disponibilidad' },
  { slug: 'sevilla', name: 'Sevilla', region: 'Andalucía', intent: 'clases de refuerzo, Selectividad y universidad', modality: 'online y presencial bajo disponibilidad' },
  { slug: 'zaragoza', name: 'Zaragoza', region: 'Aragón', intent: 'refuerzo escolar y clases técnicas para ESO, Bachillerato y adultos', modality: 'online y presencial bajo disponibilidad' },
  { slug: 'malaga', name: 'Málaga', region: 'Andalucía', intent: 'apoyo escolar, idiomas y clases de alto seguimiento familiar', modality: 'online y presencial bajo disponibilidad' },
  { slug: 'murcia', name: 'Murcia', region: 'Región de Murcia', intent: 'profesores particulares para Primaria, ESO, Bachillerato y universidad', modality: 'online y presencial bajo disponibilidad' },
  { slug: 'alicante', name: 'Alicante', region: 'Comunidad Valenciana', intent: 'clases flexibles para familias, estudiantes y adultos', modality: 'online y presencial bajo disponibilidad' },
  { slug: 'bilbao', name: 'Bilbao', region: 'País Vasco', intent: 'refuerzo académico, idiomas y materias técnicas', modality: 'online y presencial bajo disponibilidad' },
  { slug: 'valladolid', name: 'Valladolid', region: 'Castilla y León', intent: 'apoyo escolar cercano, preparación de exámenes y clases online', modality: 'online y presencial bajo disponibilidad' },
];

const SUBJECTS = [
  {
    slug: 'matematicas',
    name: 'Matemáticas',
    short: 'mates',
    category: 'ciencias',
    levels: ['Primaria', 'ESO', 'Bachillerato', 'EBAU', 'Universidad'],
    pains: ['bloqueos con problemas', 'falta de base', 'preparación de exámenes'],
    outcomes: ['razonamiento paso a paso', 'seguridad en ejercicios', 'mejora de notas'],
    faq: [
      ['¿Qué nivel de matemáticas cubrís?', 'Trabajamos desde Primaria hasta universidad, incluyendo ESO, Bachillerato, EBAU, álgebra, cálculo y estadística.'],
      ['¿Puedo pedir profesor para preparar un examen concreto?', 'Sí. La solicitud puede centrarse en un examen, recuperación, selectividad o seguimiento semanal.'],
    ],
  },
  {
    slug: 'ingles',
    name: 'Inglés',
    short: 'inglés',
    category: 'idiomas',
    levels: ['Primaria', 'ESO', 'Bachillerato', 'Cambridge', 'IELTS', 'Conversación'],
    pains: ['falta de fluidez', 'gramática irregular', 'preparación de certificados'],
    outcomes: ['más conversación', 'mejor comprensión', 'preparación orientada a objetivos'],
    faq: [
      ['¿Hay profesores para conversación?', 'Sí. Puedes pedir clases centradas en conversación, pronunciación, gramática o preparación de certificados.'],
      ['¿Preparáis Cambridge, IELTS o TOEFL?', 'La plataforma permite encontrar profesores con experiencia en certificados oficiales cuando el caso lo requiere.'],
    ],
  },
  {
    slug: 'fisica',
    name: 'Física',
    short: 'física',
    category: 'ciencias',
    levels: ['ESO', 'Bachillerato', 'EBAU', 'Universidad', 'Ingeniería'],
    pains: ['problemas de teoría', 'ejercicios largos', 'poca práctica guiada'],
    outcomes: ['método de resolución', 'comprensión de fórmulas', 'entrenamiento de examen'],
    faq: [
      ['¿Cubren Física y Química de ESO?', 'Sí. Muchos casos de ESO combinan Física y Química, y se pueden trabajar juntas.'],
      ['¿Hay apoyo para ingeniería?', 'Sí, especialmente en asignaturas de base como mecánica, electricidad, termodinámica o física general.'],
    ],
  },
  {
    slug: 'quimica',
    name: 'Química',
    short: 'química',
    category: 'ciencias',
    levels: ['ESO', 'Bachillerato', 'EBAU', 'Universidad', 'Ciencias de la Salud'],
    pains: ['formulación', 'estequiometría', 'química orgánica'],
    outcomes: ['dominio de ejercicios tipo', 'orden en procedimientos', 'mejor preparación de pruebas'],
    faq: [
      ['¿Se puede trabajar formulación desde cero?', 'Sí. El profesor puede empezar por nomenclatura, formulación y base teórica antes de avanzar.'],
      ['¿Preparáis Química de selectividad?', 'Sí. Se puede orientar la clase al modelo de examen y a los criterios de corrección.'],
    ],
  },
  {
    slug: 'lengua',
    name: 'Lengua y Literatura',
    short: 'lengua',
    category: 'humanidades',
    levels: ['Primaria', 'ESO', 'Bachillerato', 'EBAU', 'ELE'],
    pains: ['sintaxis', 'comentario de texto', 'ortografía y redacción'],
    outcomes: ['mejor expresión escrita', 'análisis ordenado', 'seguridad en exámenes'],
    faq: [
      ['¿Ayudáis con comentario de texto?', 'Sí. Se puede trabajar estructura, análisis, argumentación y práctica con textos reales.'],
      ['¿También hay clases de español para extranjeros?', 'Sí. Puedes solicitar apoyo de español como lengua extranjera según nivel y objetivo.'],
    ],
  },
  {
    slug: 'biologia',
    name: 'Biología',
    short: 'biología',
    category: 'ciencias',
    levels: ['ESO', 'Bachillerato', 'EBAU', 'Universidad', 'Ciencias de la Salud'],
    pains: ['temario amplio', 'memorización sin método', 'preparación EBAU'],
    outcomes: ['esquemas útiles', 'comprensión de procesos', 'repaso orientado a examen'],
    faq: [
      ['¿Incluye Biología y Geología?', 'Sí. En ESO se puede trabajar Biología y Geología en la misma planificación.'],
      ['¿Sirve para carreras sanitarias?', 'Sí. También puede orientarse a contenidos de base universitaria.'],
    ],
  },
  {
    slug: 'historia',
    name: 'Historia',
    short: 'historia',
    category: 'humanidades',
    levels: ['ESO', 'Bachillerato', 'EBAU', 'Historia del Arte', 'Geografía'],
    pains: ['demasiada teoría', 'comentario histórico', 'fechas sin contexto'],
    outcomes: ['líneas temporales claras', 'mejor argumentación', 'respuestas de examen más sólidas'],
    faq: [
      ['¿Preparáis Historia de España para EBAU?', 'Sí. Se puede trabajar temario, comentarios, temas largos y práctica de examen.'],
      ['¿Hay apoyo en Historia del Arte?', 'Sí. Puedes pedir profesores con perfil de humanidades o arte.'],
    ],
  },
  {
    slug: 'primaria',
    name: 'Primaria',
    short: 'primaria',
    category: 'refuerzo escolar',
    levels: ['1º Primaria', '2º Primaria', '3º Primaria', '4º Primaria', '5º Primaria', '6º Primaria'],
    pains: ['falta de hábito', 'dificultades de lectura', 'base de matemáticas'],
    outcomes: ['rutina de estudio', 'confianza', 'seguimiento cercano con la familia'],
    faq: [
      ['¿Puede ser apoyo general?', 'Sí. En Primaria es habitual trabajar varias asignaturas en la misma clase.'],
      ['¿Cuántas clases semanales suelen hacer falta?', 'Depende del caso, pero muchas familias empiezan con una o dos sesiones por semana.'],
    ],
  },
  {
    slug: 'eso',
    name: 'ESO',
    short: 'ESO',
    category: 'refuerzo escolar',
    levels: ['1º ESO', '2º ESO', '3º ESO', '4º ESO', 'Recuperaciones'],
    pains: ['salto de dificultad', 'asignaturas acumuladas', 'falta de organización'],
    outcomes: ['plan semanal', 'recuperación de base', 'seguimiento de deberes y exámenes'],
    faq: [
      ['¿Se pueden trabajar varias asignaturas?', 'Sí. Muchos casos de ESO combinan matemáticas, lengua, inglés o ciencias.'],
      ['¿Ayudáis con recuperaciones?', 'Sí. Se puede preparar un plan intensivo orientado a recuperar asignaturas.'],
    ],
  },
  {
    slug: 'bachillerato',
    name: 'Bachillerato',
    short: 'bachillerato',
    category: 'refuerzo escolar',
    levels: ['1º Bachillerato', '2º Bachillerato', 'Ciencias', 'Sociales', 'Humanidades'],
    pains: ['ritmo alto', 'notas de acceso', 'materias muy específicas'],
    outcomes: ['priorización del temario', 'preparación de exámenes', 'continuidad hasta EBAU'],
    faq: [
      ['¿Hay profesores por modalidad?', 'Sí. Se puede buscar perfil para ciencias, sociales, humanidades o asignaturas concretas.'],
      ['¿Se puede combinar con preparación EBAU?', 'Sí. Muchos planes de Bachillerato se orientan ya a la prueba de acceso.'],
    ],
  },
  {
    slug: 'selectividad',
    name: 'Selectividad EBAU',
    short: 'EBAU',
    category: 'preparación de exámenes',
    levels: ['EBAU', 'EvAU', 'PAU', '2º Bachillerato', 'Intensivos'],
    pains: ['poco tiempo', 'presión por la nota', 'dudas de criterios de corrección'],
    outcomes: ['simulacros', 'ejercicios tipo', 'plan de repaso medible'],
    faq: [
      ['¿Cuándo conviene empezar?', 'Lo ideal es empezar con margen, pero también se pueden organizar intensivos antes de la prueba.'],
      ['¿Los profesores conocen el formato EBAU?', 'La solicitud permite priorizar profesores con experiencia específica en preparación de selectividad.'],
    ],
  },
  {
    slug: 'universidad',
    name: 'Universidad',
    short: 'universidad',
    category: 'universidad',
    levels: ['Cálculo', 'Álgebra', 'Estadística', 'Programación', 'Economía', 'Ingeniería'],
    pains: ['asignaturas densas', 'prácticas difíciles', 'exámenes parciales'],
    outcomes: ['resolución guiada', 'preparación de parciales', 'mejor método de estudio'],
    faq: [
      ['¿Hay clases para carreras técnicas?', 'Sí. Puedes pedir apoyo en cálculo, álgebra, estadística, física, programación u otras materias.'],
      ['¿Ayudáis con trabajos?', 'Se puede recibir orientación metodológica y explicación, manteniendo siempre un uso académico responsable.'],
    ],
  },
  {
    slug: 'programacion',
    name: 'Programación',
    short: 'programación',
    category: 'tecnología',
    levels: ['Python', 'JavaScript', 'Java', 'Universidad', 'FP', 'Adultos'],
    pains: ['errores de lógica', 'falta de práctica', 'proyectos bloqueados'],
    outcomes: ['pensamiento computacional', 'código explicado', 'mejor autonomía'],
    faq: [
      ['¿Puedo aprender desde cero?', 'Sí. Hay clases para principiantes, estudiantes de FP, universidad y adultos.'],
      ['¿Se puede trabajar con mi propio proyecto?', 'Sí, siempre que se use como aprendizaje y no como sustitución del trabajo personal.'],
    ],
  },
  {
    slug: 'guitarra',
    name: 'Guitarra',
    short: 'guitarra',
    category: 'música',
    levels: ['Principiantes', 'Intermedio', 'Adultos', 'Niños', 'Acompañamiento'],
    pains: ['falta de constancia', 'técnica irregular', 'dificultad con acordes'],
    outcomes: ['rutina de práctica', 'mejor técnica', 'canciones adaptadas al nivel'],
    faq: [
      ['¿Hay clases para niños?', 'Sí. Se puede solicitar profesor con experiencia infantil y metodología práctica.'],
      ['¿Puede ser guitarra española o eléctrica?', 'Sí. Indica estilo, nivel y objetivo en la solicitud.'],
    ],
  },
  {
    slug: 'piano',
    name: 'Piano',
    short: 'piano',
    category: 'música',
    levels: ['Principiantes', 'Conservatorio', 'Adultos', 'Niños', 'Lenguaje musical'],
    pains: ['lectura de partituras', 'coordinación', 'práctica sin guía'],
    outcomes: ['técnica progresiva', 'repertorio adecuado', 'mejor disciplina de estudio'],
    faq: [
      ['¿Hace falta tener piano en casa?', 'Es recomendable contar con piano o teclado para practicar entre clases.'],
      ['¿También se trabaja lenguaje musical?', 'Sí. Se puede combinar piano, lectura, ritmo y teoría musical.'],
    ],
  },
  {
    slug: 'padel',
    name: 'Pádel',
    short: 'pádel',
    category: 'deporte',
    levels: ['Iniciación', 'Intermedio', 'Adultos', 'Niños', 'Parejas'],
    pains: ['técnica de golpeo', 'colocación', 'falta de progresión'],
    outcomes: ['mejor técnica', 'lectura de partido', 'entrenamiento adaptado'],
    faq: [
      ['¿Se pueden organizar clases en pareja?', 'Sí. Indica si buscas clase individual, pareja o grupo reducido.'],
      ['¿Hay profesores para iniciación?', 'Sí. Puedes solicitar clases desde cero o perfeccionamiento técnico.'],
    ],
  },
];

const CORE_PAGES = [
  { path: '/', file: 'index.html', priority: '1.0', changefreq: 'weekly' },
  { path: '/como-funciona', file: 'como-funciona.html', priority: '0.8', changefreq: 'monthly' },
  { path: '/para-padres', file: 'para-padres.html', priority: '0.9', changefreq: 'monthly' },
  { path: '/para-profesores', file: 'para-profesores.html', priority: '0.8', changefreq: 'monthly' },
  { path: '/sobre-nosotros', file: 'sobre-nosotros.html', priority: '0.6', changefreq: 'monthly' },
  { path: '/contacto', file: 'contacto.html', priority: '0.6', changefreq: 'monthly' },
  { path: '/terminos', file: 'terminos.html', priority: '0.2', changefreq: 'yearly' },
  { path: '/privacidad', file: 'privacidad.html', priority: '0.2', changefreq: 'yearly' },
  { path: '/cookies', file: 'cookies.html', priority: '0.2', changefreq: 'yearly' },
];

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function escapeJson(value) {
  return String(value ?? '').replaceAll('</script', '<\\/script');
}

function cleanUrl(pathname) {
  if (pathname === '/') return `${DOMAIN}/`;
  return `${DOMAIN}${pathname}`;
}

function subjectUrl(subject, city) {
  return `/clases-particulares/${subject.slug}-${city.slug}`;
}

function subjectFile(subject, city) {
  return path.join(__dirname, `${subject.slug}-${city.slug}.html`);
}

function cityUrl(city) {
  return `/clases-particulares/${city.slug}`;
}

function cityFile(city) {
  return path.join(__dirname, `${city.slug}.html`);
}

function listNatural(items) {
  const values = items.filter(Boolean);
  if (!values.length) return '';
  if (values.length === 1) return values[0];
  return `${values.slice(0, -1).join(', ')} y ${values.at(-1)}`;
}

function nearbyCities(city) {
  return CITIES.filter((item) => item.slug !== city.slug).slice(0, 6);
}

function relatedSubjects(subject) {
  const sameCategory = SUBJECTS.filter((item) => item.category === subject.category && item.slug !== subject.slug);
  const others = SUBJECTS.filter((item) => item.category !== subject.category && item.slug !== subject.slug);
  return [...sameCategory, ...others].slice(0, 6);
}

function jsonLd(graph) {
  return `<script type="application/ld+json">${escapeJson(JSON.stringify({
    '@context': 'https://schema.org',
    '@graph': graph,
  }))}</script>`;
}

function head({ title, description, canonical, schema, type = 'website' }) {
  const image = `${DOMAIN}/assets/img/logo-512.png`;
  return `<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(description)}">
<meta name="robots" content="index,follow,max-image-preview:large">
<link rel="canonical" href="${escapeHtml(canonical)}">
<link rel="manifest" href="/manifest.json">
<meta name="theme-color" content="#0f1f3d">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="ClasesDe10">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<link rel="icon" type="image/png" href="/assets/img/logo-192.png">
<link rel="apple-touch-icon" href="/assets/img/logo-192.png">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:url" content="${escapeHtml(canonical)}">
<meta property="og:type" content="${escapeHtml(type)}">
<meta property="og:image" content="${image}">
<meta property="og:site_name" content="ClasesDe10">
<meta property="og:locale" content="es_ES">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escapeHtml(title)}">
<meta name="twitter:description" content="${escapeHtml(description)}">
<meta name="twitter:image" content="${image}">
<link rel="stylesheet" href="../css/style.css">
${schema}
<style>
.seo-main { background: var(--cream); }
.seo-hero { padding: calc(var(--nav-h) + 52px) 5vw 64px; background: linear-gradient(135deg, var(--navy), #173866); color: var(--white); }
.seo-hero-inner { max-width: 1120px; margin: 0 auto; display: grid; grid-template-columns: minmax(0, 1.15fr) minmax(260px, .85fr); gap: 34px; align-items: center; }
.seo-breadcrumb { display: flex; gap: 8px; flex-wrap: wrap; color: rgba(255,255,255,.64); font-size: .82rem; margin-bottom: 20px; }
.seo-breadcrumb a { color: rgba(255,255,255,.78); text-decoration: none; }
.seo-breadcrumb a:hover { color: var(--gold); }
.seo-eyebrow { color: var(--gold-light); font-size: .76rem; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; margin-bottom: 12px; }
.seo-hero h1 { font-family: 'Playfair Display', serif; font-size: clamp(2rem, 5vw, 4.1rem); line-height: 1.08; color: var(--white); margin-bottom: 18px; }
.seo-hero h1 em { color: var(--gold); font-style: normal; }
.seo-hero p { color: rgba(255,255,255,.78); font-size: clamp(1rem, 1.7vw, 1.16rem); line-height: 1.75; max-width: 680px; }
.seo-actions { display: flex; gap: 12px; flex-wrap: wrap; margin-top: 28px; }
.seo-button { display: inline-flex; align-items: center; justify-content: center; min-height: 46px; padding: 12px 22px; border-radius: 8px; text-decoration: none; font-weight: 800; }
.seo-button.primary { background: var(--gold); color: var(--navy); }
.seo-button.secondary { border: 1px solid rgba(255,255,255,.32); color: var(--white); }
.seo-proof { display: grid; gap: 12px; padding: 22px; border: 1px solid rgba(255,255,255,.16); border-radius: 8px; background: rgba(255,255,255,.07); box-shadow: 0 18px 60px rgba(0,0,0,.18); }
.seo-proof strong { color: var(--white); font-size: 1rem; }
.seo-proof span { color: rgba(255,255,255,.72); line-height: 1.5; font-size: .9rem; }
.seo-section { padding: 64px 5vw; }
.seo-section:nth-of-type(odd) { background: var(--gray-soft); }
.seo-section-inner { max-width: 1120px; margin: 0 auto; }
.seo-section h2 { font-family: 'Playfair Display', serif; color: var(--navy); font-size: clamp(1.5rem, 3vw, 2.4rem); line-height: 1.18; margin-bottom: 12px; }
.seo-section p { color: var(--gray-mid); line-height: 1.75; max-width: 760px; }
.seo-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(230px, 100%), 1fr)); gap: 14px; margin-top: 26px; }
.seo-card { display: grid; gap: 8px; padding: 18px; background: var(--white); border: 1px solid rgba(15,31,61,.1); border-radius: 8px; color: var(--text-body); text-decoration: none; min-width: 0; }
.seo-card:hover { border-color: var(--gold); box-shadow: 0 10px 28px rgba(15,31,61,.08); transform: translateY(-1px); }
.seo-card strong { color: var(--navy); overflow-wrap: anywhere; }
.seo-card span { color: var(--gray-mid); font-size: .86rem; line-height: 1.55; }
.seo-steps { counter-reset: step; }
.seo-step { position: relative; padding-left: 54px; }
.seo-step::before { counter-increment: step; content: counter(step); position: absolute; left: 18px; top: 18px; width: 26px; height: 26px; border-radius: 50%; display: grid; place-items: center; background: var(--gold); color: var(--navy); font-weight: 900; }
.seo-faq { display: grid; gap: 12px; margin-top: 26px; }
.seo-faq details { background: var(--white); border: 1px solid rgba(15,31,61,.1); border-radius: 8px; padding: 16px 18px; }
.seo-faq summary { cursor: pointer; color: var(--navy); font-weight: 800; }
.seo-faq details p { margin-top: 10px; font-size: .94rem; }
.seo-cta { margin: 0 5vw 64px; padding: 42px 5vw; border-radius: 8px; background: linear-gradient(135deg, var(--navy), var(--teal)); color: var(--white); text-align: center; }
.seo-cta h2 { font-family: 'Playfair Display', serif; color: var(--white); font-size: clamp(1.6rem, 4vw, 2.7rem); margin-bottom: 12px; }
.seo-cta p { color: rgba(255,255,255,.78); max-width: 660px; margin: 0 auto 24px; line-height: 1.7; }
@media (max-width: 760px) {
  .seo-hero-inner { grid-template-columns: 1fr; }
  .seo-proof { padding: 16px; }
  .seo-actions .seo-button { flex: 1 1 180px; }
  .seo-section { padding: 48px 5vw; }
}
</style>
</head>`;
}

function pageShell({ title, description, canonical, schema, body }) {
  return `<!DOCTYPE html>
<html lang="es">
${head({ title, description, canonical, schema })}
<body>
<script src="../js/nav.js"></script>
${body}
<script src="/js/pwa.js" defer></script>
</body>
</html>
`;
}

function breadcrumb(items) {
  return `<nav class="seo-breadcrumb" aria-label="Ruta de navegación">
${items.map((item, index) => item.url
    ? `<a href="${item.url}">${escapeHtml(item.name)}</a>${index < items.length - 1 ? '<span>/</span>' : ''}`
    : `<span>${escapeHtml(item.name)}</span>`).join('\n')}
</nav>`;
}

function faqItems(subject, city) {
  return [
    ...subject.faq,
    [`¿Las clases de ${subject.short} en ${city.name} pueden ser online?`, `Sí. Puedes solicitar clases online y, cuando haya disponibilidad local, también ${city.modality}.`],
    ['¿Cómo se elige el profesor?', 'ClasesDe10 revisa la materia, nivel, disponibilidad y contexto del alumno para proponer un profesor adecuado.'],
    ['¿Hay permanencia?', 'No. Puedes empezar sin permanencia y ajustar el ritmo de clases según la evolución del alumno.'],
  ];
}

function subjectCityPage(subject, city) {
  const pathname = subjectUrl(subject, city);
  const canonical = cleanUrl(pathname);
  const title = `Clases particulares de ${subject.name} en ${city.name} | ClasesDe10`;
  const description = `Profesor de ${subject.name} en ${city.name} para ${listNatural(subject.levels.slice(0, 3))}. Clases online o presenciales según disponibilidad, con perfiles verificados.`;
  const serviceName = `Clases particulares de ${subject.name} en ${city.name}`;
  const faqs = faqItems(subject, city);
  const graph = [
    {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Inicio', item: `${DOMAIN}/` },
        { '@type': 'ListItem', position: 2, name: 'Clases particulares', item: cleanUrl('/clases-particulares') },
        { '@type': 'ListItem', position: 3, name: city.name, item: cleanUrl(cityUrl(city)) },
        { '@type': 'ListItem', position: 4, name: subject.name, item: canonical },
      ],
    },
    {
      '@type': 'WebPage',
      '@id': `${canonical}#webpage`,
      name: title,
      description,
      url: canonical,
      inLanguage: 'es-ES',
      dateModified: TODAY,
      isPartOf: { '@id': `${DOMAIN}/#website` },
      about: { '@id': `${canonical}#service` },
    },
    {
      '@type': 'Service',
      '@id': `${canonical}#service`,
      name: serviceName,
      description,
      provider: { '@type': 'EducationalOrganization', name: 'ClasesDe10', url: DOMAIN },
      areaServed: { '@type': 'City', name: city.name, addressRegion: city.region, addressCountry: 'ES' },
      serviceType: `Profesor particular de ${subject.name}`,
      audience: { '@type': 'Audience', audienceType: 'familias, estudiantes y adultos' },
    },
    {
      '@type': 'FAQPage',
      mainEntity: faqs.map(([question, answer]) => ({
        '@type': 'Question',
        name: question,
        acceptedAnswer: { '@type': 'Answer', text: answer },
      })),
    },
  ];
  const related = relatedSubjects(subject);
  const cities = nearbyCities(city);
  return pageShell({
    title,
    description,
    canonical,
    schema: jsonLd(graph),
    body: `<main class="seo-main" data-seo-engine="${SEO_ENGINE_VERSION}">
  <section class="seo-hero">
    <div class="seo-hero-inner">
      <div>
        ${breadcrumb([
          { name: 'Inicio', url: '/' },
          { name: 'Clases particulares', url: '/clases-particulares' },
          { name: city.name, url: cityUrl(city) },
          { name: subject.name },
        ])}
        <div class="seo-eyebrow">Profesores verificados · ${escapeHtml(city.modality)}</div>
        <h1>Clases particulares de <em>${escapeHtml(subject.name)}</em> en ${escapeHtml(city.name)}</h1>
        <p>${escapeHtml(description)} Diseñado para familias que necesitan avanzar sin perder semanas buscando profesor.</p>
        <div class="seo-actions">
          <a class="seo-button primary" href="/pages/registro">Solicitar profesor</a>
          <a class="seo-button secondary" href="/contacto">Hablar con ClasesDe10</a>
        </div>
      </div>
      <aside class="seo-proof" aria-label="Resumen del servicio">
        <strong>Encaje recomendado para ${escapeHtml(city.name)}</strong>
        <span>Demanda habitual: ${escapeHtml(city.intent)}.</span>
        <span>Niveles: ${escapeHtml(listNatural(subject.levels.slice(0, 5)))}.</span>
        <span>Objetivo: ${escapeHtml(listNatural(subject.outcomes.slice(0, 3)))}.</span>
      </aside>
    </div>
  </section>

  <section class="seo-section">
    <div class="seo-section-inner">
      <h2>Qué trabajamos en las clases de ${escapeHtml(subject.short)} en ${escapeHtml(city.name)}</h2>
      <p>El profesor se adapta al punto de partida del alumno. La prioridad no es solo resolver ejercicios, sino crear un método que permita mejorar de forma constante.</p>
      <div class="seo-grid">
        ${subject.levels.map((level) => `<article class="seo-card"><strong>${escapeHtml(level)}</strong><span>Plan adaptado al temario, ritmo del centro y próximos exámenes.</span></article>`).join('\n        ')}
      </div>
    </div>
  </section>

  <section class="seo-section">
    <div class="seo-section-inner">
      <h2>Por qué estas clases convierten mejor que buscar a ciegas</h2>
      <p>ClasesDe10 reduce fricción: recoge la necesidad, filtra perfiles y mantiene seguimiento para que la familia no tenga que coordinar todo desde cero.</p>
      <div class="seo-grid seo-steps">
        <article class="seo-card seo-step"><strong>Diagnóstico inicial</strong><span>Materia, nivel, disponibilidad, modalidad y urgencia.</span></article>
        <article class="seo-card seo-step"><strong>Selección del profesor</strong><span>Encaje por especialidad, experiencia, confianza y disponibilidad real.</span></article>
        <article class="seo-card seo-step"><strong>Inicio de clases</strong><span>Coordinación sencilla y seguimiento del progreso.</span></article>
        <article class="seo-card seo-step"><strong>Mejora continua</strong><span>Si algo no encaja, se revisa el perfil o el plan de trabajo.</span></article>
      </div>
    </div>
  </section>

  <section class="seo-section">
    <div class="seo-section-inner">
      <h2>También puedes necesitar</h2>
      <p>Enlazado interno útil para comparar alternativas sin volver a Google.</p>
      <div class="seo-grid">
        ${related.map((item) => `<a class="seo-card" href="${subjectUrl(item, city)}"><strong>${escapeHtml(item.name)} en ${escapeHtml(city.name)}</strong><span>${escapeHtml(listNatural(item.levels.slice(0, 3)))}</span></a>`).join('\n        ')}
        ${cities.slice(0, 4).map((item) => `<a class="seo-card" href="${subjectUrl(subject, item)}"><strong>${escapeHtml(subject.name)} en ${escapeHtml(item.name)}</strong><span>${escapeHtml(item.modality)}</span></a>`).join('\n        ')}
      </div>
    </div>
  </section>

  <section class="seo-section">
    <div class="seo-section-inner">
      <h2>Preguntas frecuentes</h2>
      <div class="seo-faq">
        ${faqs.map(([question, answer]) => `<details><summary>${escapeHtml(question)}</summary><p>${escapeHtml(answer)}</p></details>`).join('\n        ')}
      </div>
    </div>
  </section>

  <section class="seo-cta">
    <h2>Encuentra profesor de ${escapeHtml(subject.short)} sin perder tiempo</h2>
    <p>Cuéntanos el caso y buscamos el perfil más adecuado para ${escapeHtml(city.name)}. Sin permanencia y con seguimiento.</p>
    <a class="seo-button primary" href="/pages/registro">Solicitar profesor gratis</a>
  </section>
</main>`,
  });
}

function cityHubPage(city) {
  const pathname = cityUrl(city);
  const canonical = cleanUrl(pathname);
  const title = `Clases particulares en ${city.name} | Profesores verificados`;
  const description = `Clases particulares en ${city.name} para Matemáticas, Inglés, ciencias, música, deporte y refuerzo escolar. Profesores verificados y modalidad online o presencial.`;
  const graph = [
    {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Inicio', item: `${DOMAIN}/` },
        { '@type': 'ListItem', position: 2, name: 'Clases particulares', item: cleanUrl('/clases-particulares') },
        { '@type': 'ListItem', position: 3, name: city.name, item: canonical },
      ],
    },
    {
      '@type': 'CollectionPage',
      name: title,
      description,
      url: canonical,
      inLanguage: 'es-ES',
      dateModified: TODAY,
      mainEntity: {
        '@type': 'ItemList',
        itemListElement: SUBJECTS.map((subject, index) => ({
          '@type': 'ListItem',
          position: index + 1,
          name: `${subject.name} en ${city.name}`,
          url: cleanUrl(subjectUrl(subject, city)),
        })),
      },
    },
  ];
  return pageShell({
    title,
    description,
    canonical,
    schema: jsonLd(graph),
    body: `<main class="seo-main" data-seo-engine="${SEO_ENGINE_VERSION}">
  <section class="seo-hero">
    <div class="seo-hero-inner">
      <div>
        ${breadcrumb([
          { name: 'Inicio', url: '/' },
          { name: 'Clases particulares', url: '/clases-particulares' },
          { name: city.name },
        ])}
        <div class="seo-eyebrow">Hub local · ${escapeHtml(city.region)}</div>
        <h1>Clases particulares en <em>${escapeHtml(city.name)}</em></h1>
        <p>${escapeHtml(description)} Este hub agrupa las materias con mayor intención de búsqueda para familias y estudiantes.</p>
        <div class="seo-actions">
          <a class="seo-button primary" href="/pages/registro">Solicitar profesor</a>
          <a class="seo-button secondary" href="/clases-particulares">Ver todas las ciudades</a>
        </div>
      </div>
      <aside class="seo-proof">
        <strong>SEO local sin contenido duplicado</strong>
        <span>Ciudad: ${escapeHtml(city.name)}.</span>
        <span>Contexto: ${escapeHtml(city.intent)}.</span>
        <span>Modalidad: ${escapeHtml(city.modality)}.</span>
      </aside>
    </div>
  </section>
  <section class="seo-section">
    <div class="seo-section-inner">
      <h2>Materias disponibles en ${escapeHtml(city.name)}</h2>
      <p>Elige una materia para ver una página específica con niveles, preguntas frecuentes y enlaces relacionados.</p>
      <div class="seo-grid">
        ${SUBJECTS.map((subject) => `<a class="seo-card" href="${subjectUrl(subject, city)}"><strong>${escapeHtml(subject.name)}</strong><span>${escapeHtml(listNatural(subject.levels.slice(0, 4)))}</span></a>`).join('\n        ')}
      </div>
    </div>
  </section>
  <section class="seo-section">
    <div class="seo-section-inner">
      <h2>Otras ciudades populares</h2>
      <p>La arquitectura permite crecer ciudad a ciudad sin rehacer la web ni el sitemap a mano.</p>
      <div class="seo-grid">
        ${nearbyCities(city).map((item) => `<a class="seo-card" href="${cityUrl(item)}"><strong>Clases en ${escapeHtml(item.name)}</strong><span>${escapeHtml(item.region)}</span></a>`).join('\n        ')}
      </div>
    </div>
  </section>
  <section class="seo-cta">
    <h2>Cuéntanos qué profesor necesitas en ${escapeHtml(city.name)}</h2>
    <p>Materia, nivel, horario y modalidad. Nosotros filtramos perfiles para que no tengas que buscar desde cero.</p>
    <a class="seo-button primary" href="/pages/registro">Solicitar profesor gratis</a>
  </section>
</main>`,
  });
}

function nationalHubPage() {
  const canonical = cleanUrl('/clases-particulares');
  const title = 'Clases particulares en España | Profesores verificados';
  const description = 'Encuentra profesores particulares por ciudad y materia: Matemáticas, Inglés, ciencias, música, pádel, programación y refuerzo escolar.';
  const graph = [
    {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Inicio', item: `${DOMAIN}/` },
        { '@type': 'ListItem', position: 2, name: 'Clases particulares', item: canonical },
      ],
    },
    {
      '@type': 'CollectionPage',
      name: title,
      description,
      url: canonical,
      inLanguage: 'es-ES',
      dateModified: TODAY,
      mainEntity: {
        '@type': 'ItemList',
        itemListElement: CITIES.map((city, index) => ({
          '@type': 'ListItem',
          position: index + 1,
          name: `Clases particulares en ${city.name}`,
          url: cleanUrl(cityUrl(city)),
        })),
      },
    },
  ];
  return pageShell({
    title,
    description,
    canonical,
    schema: jsonLd(graph),
    body: `<main class="seo-main" data-seo-engine="${SEO_ENGINE_VERSION}">
  <section class="seo-hero">
    <div class="seo-hero-inner">
      <div>
        ${breadcrumb([{ name: 'Inicio', url: '/' }, { name: 'Clases particulares' }])}
        <div class="seo-eyebrow">Arquitectura SEO nacional</div>
        <h1>Clases particulares por <em>ciudad y materia</em></h1>
        <p>${escapeHtml(description)} Cada página está generada con canónica limpia, datos estructurados, FAQs visibles y enlaces internos.</p>
        <div class="seo-actions">
          <a class="seo-button primary" href="/pages/registro">Solicitar profesor</a>
          <a class="seo-button secondary" href="/para-profesores">Soy profesor</a>
        </div>
      </div>
      <aside class="seo-proof">
        <strong>Preparado para escalar</strong>
        <span>${CITIES.length} ciudades activas.</span>
        <span>${SUBJECTS.length} materias y niveles.</span>
        <span>${CITIES.length * SUBJECTS.length} landings específicas generadas automáticamente.</span>
      </aside>
    </div>
  </section>
  <section class="seo-section">
    <div class="seo-section-inner">
      <h2>Buscar por ciudad</h2>
      <p>Hubs locales para orientar la búsqueda según zona, intención y modalidad.</p>
      <div class="seo-grid">
        ${CITIES.map((city) => `<a class="seo-card" href="${cityUrl(city)}"><strong>${escapeHtml(city.name)}</strong><span>${escapeHtml(city.region)} · ${escapeHtml(city.modality)}</span></a>`).join('\n        ')}
      </div>
    </div>
  </section>
  <section class="seo-section">
    <div class="seo-section-inner">
      <h2>Materias populares</h2>
      <p>Rutas internas hacia las combinaciones con más intención de contratación.</p>
      <div class="seo-grid">
        ${SUBJECTS.map((subject) => `<a class="seo-card" href="${subjectUrl(subject, CITIES[0])}"><strong>${escapeHtml(subject.name)}</strong><span>${escapeHtml(listNatural(subject.levels.slice(0, 4)))}</span></a>`).join('\n        ')}
      </div>
    </div>
  </section>
  <section class="seo-cta">
    <h2>Encuentra profesor sin recorrer decenas de anuncios</h2>
    <p>ClasesDe10 centraliza la solicitud, filtra perfiles y reduce el tiempo hasta encontrar un profesor adecuado.</p>
    <a class="seo-button primary" href="/pages/registro">Solicitar profesor gratis</a>
  </section>
</main>`,
  });
}

function sitemapEntries() {
  const seoEntries = [
    { path: '/clases-particulares', priority: '0.95', changefreq: 'weekly' },
    ...CITIES.map((city) => ({ path: cityUrl(city), priority: city.slug === 'madrid' ? '0.92' : '0.82', changefreq: 'weekly' })),
    ...CITIES.flatMap((city) => SUBJECTS.map((subject) => ({
      path: subjectUrl(subject, city),
      priority: city.slug === 'madrid' && ['matematicas', 'ingles', 'bachillerato', 'selectividad'].includes(subject.slug) ? '0.94' : '0.78',
      changefreq: 'weekly',
    }))),
  ];
  return [...CORE_PAGES.map(({ path: pathname, priority, changefreq }) => ({ path: pathname, priority, changefreq })), ...seoEntries];
}

function writeSitemap() {
  const entries = sitemapEntries();
  const body = entries.map((entry) => `  <url>
    <loc>${cleanUrl(entry.path)}</loc>
    <lastmod>${TODAY}</lastmod>
    <changefreq>${entry.changefreq}</changefreq>
    <priority>${entry.priority}</priority>
  </url>`).join('\n');
  fs.writeFileSync(path.join(ROOT, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${body}
</urlset>
`, 'utf8');
  return entries.length;
}

function writeRobots() {
  fs.writeFileSync(path.join(ROOT, 'robots.txt'), `User-agent: *
Allow: /
Disallow: /pages/dashboard/
Disallow: /pages/login
Disallow: /pages/registro
Disallow: /pages/reset-password
Disallow: /offline
Disallow: /offline.html
Disallow: /supabase/
Disallow: /firebase/
Disallow: /functions/
Disallow: /scripts/
Disallow: /output/
Disallow: /.claude/
Disallow: /.github/
Disallow: /.firebase/
Disallow: /.netlify/
Disallow: /package.json
Disallow: /package-lock.json
Disallow: /firebase.json
Disallow: /.firebaserc
Disallow: /clases-particulares/_generar-paginas.js

Sitemap: ${DOMAIN}/sitemap.xml
`, 'utf8');
}

function syncCoreCanonicals() {
  for (const page of CORE_PAGES.filter((item) => item.path !== '/')) {
    const filePath = path.join(ROOT, page.file);
    if (!fs.existsSync(filePath)) continue;
    const clean = cleanUrl(page.path);
    const htmlUrl = `${clean}.html`;
    const current = fs.readFileSync(filePath, 'utf8');
    const next = current.replaceAll(htmlUrl, clean);
    if (next !== current) fs.writeFileSync(filePath, next, 'utf8');
  }
}

function cleanGeneratedHtml() {
  const keep = new Set(['index.html']);
  for (const entry of fs.readdirSync(__dirname, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.html') || keep.has(entry.name)) continue;
    fs.unlinkSync(path.join(__dirname, entry.name));
  }
}

function main() {
  cleanGeneratedHtml();
  fs.writeFileSync(path.join(__dirname, 'index.html'), nationalHubPage(), 'utf8');
  for (const city of CITIES) {
    fs.writeFileSync(cityFile(city), cityHubPage(city), 'utf8');
    for (const subject of SUBJECTS) {
      fs.writeFileSync(subjectFile(subject, city), subjectCityPage(subject, city), 'utf8');
    }
  }
  syncCoreCanonicals();
  writeRobots();
  const sitemapCount = writeSitemap();
  console.log(JSON.stringify({
    ok: true,
    engine: SEO_ENGINE_VERSION,
    cities: CITIES.length,
    subjects: SUBJECTS.length,
    generatedPages: 1 + CITIES.length + (CITIES.length * SUBJECTS.length),
    sitemapUrls: sitemapCount,
  }, null, 2));
}

main();
