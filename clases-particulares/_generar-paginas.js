/**
 * Script Node.js para generar todas las páginas SEO locales de Madrid.
 * Ejecutar: node clases-particulares/_generar-paginas.js
 *
 * Genera una página HTML completa y optimizada para cada materia/nivel,
 * reutilizando la estructura de matematicas-madrid.html como plantilla.
 */

const fs   = require('fs');
const path = require('path');

const PAGINAS = [
  {
    slug:        'ingles-madrid',
    titulo:      'Inglés',
    emoji:       '🇬🇧',
    keyword:     'clases particulares inglés Madrid',
    descripcion: 'Mejora tu inglés con profesores nativos y bilingües en Madrid. First, Advanced, IELTS, TOEFL y conversación.',
    niveles:     ['Primaria','ESO','Bachillerato','Cambridge','TOEFL / IELTS','Inglés de negocios'],
    precio_desde: '15',
    precio_hasta: '40',
    keywords_meta: 'clases inglés Madrid, profesor inglés Madrid, academia inglés Madrid, profesor nativo inglés Madrid',
    faq: [
      { q:'¿Los profesores de inglés son nativos?', a:'Contamos con profesores nativos angloparlantes y también con profesores bilingües certificados. Según tu necesidad, asignamos el perfil más adecuado.' },
      { q:'¿Preparáis exámenes oficiales de inglés?', a:'Sí. Preparamos First Certificate (FCE), Advanced (CAE), IELTS, TOEFL y los exámenes de la EOI. Nuestros profesores conocen a fondo el formato de cada prueba.' },
      { q:'¿Las clases son a domicilio o online?', a:'Ambas modalidades. Puedes elegir clases presenciales en tu domicilio de Madrid o sesiones online por videollamada.' },
      { q:'¿Cuánto cuesta una clase de inglés en Madrid?', a:'Los precios van desde 15€/hora para conversación básica hasta 40€/hora para preparación de exámenes oficiales con profesores nativos certificados.' },
    ],
  },
  {
    slug:        'fisica-madrid',
    titulo:      'Física',
    emoji:       '⚛️',
    keyword:     'clases particulares física Madrid',
    descripcion: 'Clases particulares de física en Madrid con profesores universitarios especializados. ESO, Bachillerato y Universidad.',
    niveles:     ['Física ESO','Física y Química ESO','Física Bachillerato','Física Selectividad','Física Universidad'],
    precio_desde: '18',
    precio_hasta: '40',
    keywords_meta: 'clases física Madrid, profesor física Madrid, refuerzo física Madrid, clases física bachillerato Madrid',
    faq: [
      { q:'¿Los profesores de física tienen titulación universitaria?', a:'Sí. Todos nuestros profesores de física son graduados en Física, Ingeniería o carreras similares con alta carga de física.' },
      { q:'¿Pueden preparar la Selectividad de Física?', a:'Por supuesto. Tenemos profesores especializados en la preparación de la EBAU de Física en Madrid, con conocimiento del temario específico de la Comunidad de Madrid.' },
      { q:'¿A qué cursos van dirigidas las clases?', a:'Impartimos clases de física para 3º y 4º de ESO (Física y Química), 1º y 2º de Bachillerato y asignaturas universitarias como Mecánica, Electromagnetismo o Termodinámica.' },
    ],
  },
  {
    slug:        'quimica-madrid',
    titulo:      'Química',
    emoji:       '🧪',
    keyword:     'clases particulares química Madrid',
    descripcion: 'Clases particulares de química en Madrid. Profesores expertos para ESO, Bachillerato, Selectividad y Universidad.',
    niveles:     ['Química ESO','Física y Química ESO','Química Bachillerato','Química Selectividad','Química Universidad'],
    precio_desde: '18',
    precio_hasta: '40',
    keywords_meta: 'clases química Madrid, profesor química Madrid, refuerzo química Madrid, clases química bachillerato Madrid',
    faq: [
      { q:'¿Qué temas de química se pueden repasar?', a:'Cubrimos todo el temario: formulación y nomenclatura, estequiometría, termodinámica química, cinética, equilibrio químico, electroquímica y química orgánica.' },
      { q:'¿Pueden ayudar con Física y Química de ESO juntas?', a:'Sí. Muchos de nuestros profesores imparten ambas asignaturas juntas, que es como aparecen en los curriculos de 3º y 4º de ESO.' },
    ],
  },
  {
    slug:        'lengua-madrid',
    titulo:      'Lengua y Literatura',
    emoji:       '📖',
    keyword:     'clases particulares lengua Madrid',
    descripcion: 'Clases particulares de Lengua Castellana y Literatura en Madrid. Ortografía, gramática, comentario de texto y selectividad.',
    niveles:     ['Lengua Primaria','Lengua ESO','Lengua Bachillerato','Lengua Selectividad','Español para extranjeros'],
    precio_desde: '15',
    precio_hasta: '35',
    keywords_meta: 'clases lengua Madrid, profesor lengua literatura Madrid, refuerzo lengua Madrid, español extranjeros Madrid',
    faq: [
      { q:'¿También imparten español para extranjeros?', a:'Sí. Ofrecemos clases de español como lengua extranjera (ELE) con profesores certificados, adaptadas al nivel del alumno (A1 a C2).' },
      { q:'¿Ayudan con el comentario de texto?', a:'El comentario de texto y el análisis literario son áreas clave de nuestras clases de Lengua, especialmente para bachillerato y selectividad.' },
    ],
  },
  {
    slug:        'primaria-madrid',
    titulo:      'Primaria',
    emoji:       '🎒',
    keyword:     'clases particulares primaria Madrid',
    descripcion: 'Refuerzo escolar y clases particulares para Primaria en Madrid. Profesores especializados en educación infantil y primaria.',
    niveles:     ['1º Primaria','2º Primaria','3º Primaria','4º Primaria','5º Primaria','6º Primaria'],
    precio_desde: '15',
    precio_hasta: '25',
    keywords_meta: 'clases particulares primaria Madrid, refuerzo escolar primaria Madrid, profesor primaria Madrid, apoyo escolar Madrid',
    faq: [
      { q:'¿A partir de qué edad pueden recibir clases?', a:'Trabajamos con alumnos desde 1º de Primaria (6 años). Para educación infantil, consúltanos caso por caso.' },
      { q:'¿Cuántas horas a la semana son recomendables?', a:'Para Primaria, normalmente 1-2 horas semanales es suficiente para un buen refuerzo. El profesor adaptará el ritmo según las necesidades del alumno.' },
      { q:'¿Se puede trabajar todas las asignaturas a la vez?', a:'Sí. Muchas familias contratan un profesor de apoyo general que repasa todas las asignaturas de Primaria: matemáticas, lengua, inglés, ciencias...' },
    ],
  },
  {
    slug:        'eso-madrid',
    titulo:      'ESO',
    emoji:       '📚',
    keyword:     'clases particulares ESO Madrid',
    descripcion: 'Clases particulares de ESO en Madrid. Refuerzo en todas las asignaturas de 1º a 4º de ESO con profesores especializados.',
    niveles:     ['1º ESO','2º ESO','3º ESO','4º ESO','Todas las asignaturas'],
    precio_desde: '15',
    precio_hasta: '30',
    keywords_meta: 'clases particulares ESO Madrid, refuerzo ESO Madrid, profesor ESO Madrid, apoyo escolar ESO Madrid',
    faq: [
      { q:'¿Pueden dar clase de varias asignaturas a la vez?', a:'Sí. Muchos de nuestros profesores están capacitados para impartir varias asignaturas de ESO en la misma sesión, optimizando el tiempo de estudio.' },
      { q:'¿Hay profesores para recuperar asignaturas suspensas?', a:'Sí, es uno de los casos más habituales. Preparamos al alumno para superar las pruebas de recuperación y exámenes de septiembre.' },
    ],
  },
  {
    slug:        'bachillerato-madrid',
    titulo:      'Bachillerato',
    emoji:       '🏫',
    keyword:     'clases particulares bachillerato Madrid',
    descripcion: 'Clases particulares de bachillerato en Madrid. Profesores universitarios para 1º y 2º de Bachillerato en todas las materias.',
    niveles:     ['1º Bachillerato Ciencias','1º Bachillerato Humanidades','2º Bachillerato Ciencias','2º Bachillerato Humanidades','Todas las asignaturas'],
    precio_desde: '20',
    precio_hasta: '40',
    keywords_meta: 'clases bachillerato Madrid, profesor bachillerato Madrid, refuerzo bachillerato Madrid, clases particulares 2 bachillerato Madrid',
    faq: [
      { q:'¿Cuáles son las asignaturas más demandadas en Bachillerato?', a:'Las más solicitadas son Matemáticas, Física, Química, Inglés, Historia de España y Biología. También tenemos profesores para Economía, Filosofía, Latín y Arte.' },
      { q:'¿Ayudan también con la preparación de la Selectividad?', a:'Sí. Muchos de nuestros alumnos de 2º de Bachillerato también preparan con nosotros la EBAU. Conocemos perfectamente el temario y el modelo de examen de Madrid.' },
    ],
  },
  {
    slug:        'selectividad-madrid',
    titulo:      'Selectividad (EBAU)',
    emoji:       '🎯',
    keyword:     'preparación selectividad Madrid',
    descripcion: 'Preparación Selectividad Madrid (EBAU/EvAU). Clases intensivas con profesores que conocen el examen de la Comunidad de Madrid.',
    niveles:     ['Matemáticas EBAU','Inglés EBAU','Física EBAU','Química EBAU','Historia España EBAU','Biología EBAU'],
    precio_desde: '22',
    precio_hasta: '45',
    keywords_meta: 'preparación selectividad Madrid, clases EBAU Madrid, academia selectividad Madrid, refuerzo selectividad Madrid',
    faq: [
      { q:'¿Cuándo es mejor empezar a preparar la Selectividad?', a:'Lo ideal es empezar en octubre o noviembre del curso de 2º de Bachillerato. Sin embargo, muchos alumnos empiezan en febrero-marzo y consiguen excelentes resultados.' },
      { q:'¿Conocen el modelo de examen específico de Madrid?', a:'Sí. Todos nuestros profesores de Selectividad conocen el temario, el modelo de examen y los criterios de corrección específicos de la Comunidad de Madrid (EBAU).' },
      { q:'¿Hacen simulacros de examen?', a:'Sí. Realizamos exámenes de prueba con modelos reales de años anteriores, con corrección y análisis detallado de los errores.' },
    ],
  },
  {
    slug:        'universidad-madrid',
    titulo:      'Universidad',
    emoji:       '🎓',
    keyword:     'clases particulares universidad Madrid',
    descripcion: 'Clases particulares universitarias en Madrid. Apoyo en cálculo, álgebra, estadística, programación y todas las carreras.',
    niveles:     ['Cálculo','Álgebra Lineal','Estadística','Programación','Economía','Derecho'],
    precio_desde: '20',
    precio_hasta: '50',
    keywords_meta: 'clases universidad Madrid, profesor universitario Madrid, refuerzo carrera Madrid, apoyo académico universitario Madrid',
    faq: [
      { q:'¿Tenéis profesores para todas las carreras?', a:'Cubrimos las principales áreas: Ingeniería, Matemáticas, Física, Economía, Derecho, ADE, Medicina y más. Consúltanos tu caso concreto.' },
      { q:'¿Pueden ayudar con trabajos y TFG?', a:'Ofrecemos orientación y apoyo metodológico para TFG y TFM. No redactamos el trabajo, pero sí guiamos en estructura, metodología y presentación.' },
    ],
  },
  {
    slug:        'biologia-madrid',
    titulo:      'Biología',
    emoji:       '🧬',
    keyword:     'clases particulares biología Madrid',
    descripcion: 'Clases particulares de Biología en Madrid. Profesores especializados para ESO, Bachillerato, Selectividad y carreras universitarias.',
    niveles:     ['Biología ESO','Biología y Geología ESO','Biología Bachillerato','Biología Selectividad','Biología Universidad'],
    precio_desde: '18',
    precio_hasta: '40',
    keywords_meta: 'clases biología Madrid, profesor biología Madrid, refuerzo biología Madrid, clases biología bachillerato Madrid',
    faq: [
      { q:'¿Cubren también Geología?', a:'Sí. En ESO Biología y Geología van unidas. Nuestros profesores cubren ambas partes del temario.' },
      { q:'¿Preparan la EBAU de Biología?', a:'Sí. La Biología es una de las asignaturas con mayor peso en la nota de acceso para carreras de Ciencias de la Salud. Tenemos profesores especializados en la EBAU de Biología de Madrid.' },
    ],
  },
  {
    slug:        'historia-madrid',
    titulo:      'Historia',
    emoji:       '🏛️',
    keyword:     'clases particulares historia Madrid',
    descripcion: 'Clases particulares de Historia en Madrid. Historia de España, Historia del Mundo Contemporáneo, Geografía e Historia del Arte.',
    niveles:     ['Historia ESO','Geografía e Historia ESO','Historia del Mundo Contemporáneo','Historia de España Bachillerato','Historia Selectividad'],
    precio_desde: '15',
    precio_hasta: '35',
    keywords_meta: 'clases historia Madrid, profesor historia Madrid, refuerzo historia España Madrid, clases historia bachillerato Madrid',
    faq: [
      { q:'¿También imparten Historia del Arte?', a:'Sí. Contamos con profesores especializados en Historia del Arte para Bachillerato y Selectividad.' },
      { q:'¿Ayudan con el comentario de texto histórico?', a:'Sí. El comentario de texto histórico y el análisis de fuentes son habilidades clave que trabajamos intensamente, especialmente de cara a la EBAU.' },
    ],
  },
];

const plantilla = (p) => `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Clases Particulares de ${p.titulo} en Madrid | ClasesDe10</title>
<meta name="description" content="${p.descripcion}">
<meta name="keywords" content="${p.keywords_meta}">
<link rel="canonical" href="https://www.clasesde10.es/clases-particulares/${p.slug}.html">
<link rel="icon" type="image/png" href="https://clasesde10.wordpress.com/wp-content/uploads/2025/07/cropped-chatgpt-image-17-jul-2025-20_00_31.png">
<meta property="og:title" content="Clases Particulares de ${p.titulo} en Madrid | ClasesDe10">
<meta property="og:description" content="${p.descripcion}">
<meta property="og:url" content="https://www.clasesde10.es/clases-particulares/${p.slug}.html">
<meta property="og:type" content="website">
<meta property="og:image" content="https://clasesde10.wordpress.com/wp-content/uploads/2025/07/cropped-chatgpt-image-17-jul-2025-20_00_31.png">
<meta property="og:site_name" content="ClasesDe10">
<meta property="og:locale" content="es_ES">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="Clases Particulares de ${p.titulo} en Madrid | ClasesDe10">
<meta name="twitter:description" content="${p.descripcion}">
<link rel="stylesheet" href="../css/style.css">
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "BreadcrumbList",
      "itemListElement": [
        {"@type":"ListItem","position":1,"name":"Inicio","item":"https://www.clasesde10.es/"},
        {"@type":"ListItem","position":2,"name":"Clases particulares","item":"https://www.clasesde10.es/clases-particulares/"},
        {"@type":"ListItem","position":3,"name":"${p.titulo} Madrid","item":"https://www.clasesde10.es/clases-particulares/${p.slug}.html"}
      ]
    },
    {
      "@type": "Course",
      "name": "Clases Particulares de ${p.titulo} en Madrid",
      "description": "${p.descripcion}",
      "provider": {"@type":"Organization","name":"ClasesDe10","url":"https://www.clasesde10.es"},
      "inLanguage": "es",
      "offers": {
        "@type": "Offer",
        "price": "${p.precio_desde}",
        "priceCurrency": "EUR",
        "priceSpecification": {"@type":"UnitPriceSpecification","price":"${p.precio_desde}","priceCurrency":"EUR","unitText":"HOUR"},
        "availability": "https://schema.org/InStock"
      }
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        ${p.faq.map(f => `{"@type":"Question","name":"${f.q}","acceptedAnswer":{"@type":"Answer","text":"${f.a}"}}`).join(',\n        ')}
      ]
    }
  ]
}
<\/script>
<style>
.seo-hero{background:linear-gradient(135deg,var(--navy) 0%,#0d2952 60%,#0e3a5a 100%);padding:calc(var(--nav-h) + 80px) 5vw 80px;text-align:center;position:relative;overflow:hidden}
.seo-breadcrumb{display:flex;align-items:center;justify-content:center;gap:8px;font-size:.78rem;color:rgba(255,255,255,.5);margin-bottom:20px;flex-wrap:wrap}
.seo-breadcrumb a{color:rgba(255,255,255,.6);text-decoration:none}.seo-breadcrumb a:hover{color:var(--gold)}
.seo-hero h1{font-family:'Playfair Display',serif;font-size:clamp(2rem,5vw,3.8rem);font-weight:900;color:var(--white);line-height:1.15;margin-bottom:16px}
.seo-hero h1 span{color:var(--gold)}.seo-hero p{font-size:clamp(.95rem,1.8vw,1.15rem);color:rgba(255,255,255,.75);max-width:600px;margin:0 auto 36px;line-height:1.7}
.seo-pills{display:flex;flex-wrap:wrap;gap:10px;justify-content:center;margin-bottom:36px}
.seo-pill{background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.18);color:rgba(255,255,255,.85);font-size:.8rem;font-weight:600;padding:6px 14px;border-radius:100px}
.seo-ctas{display:flex;gap:12px;justify-content:center;flex-wrap:wrap}
.seo-section{padding:64px 5vw}.seo-section:nth-child(even){background:var(--gray-soft)}
.seo-section h2{font-family:'Playfair Display',serif;font-size:clamp(1.4rem,3vw,2.1rem);font-weight:700;color:var(--navy);margin-bottom:14px}
.materias-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:14px;margin-top:28px}
.materia-card{background:var(--white);border:1px solid rgba(0,0,0,.07);border-radius:14px;padding:20px;text-align:center;transition:box-shadow .2s,transform .2s}
.materia-card:hover{box-shadow:0 8px 24px rgba(0,0,0,.1);transform:translateY(-3px)}
.materia-icon{font-size:1.8rem;margin-bottom:8px}.materia-name{font-weight:700;color:var(--navy);font-size:.9rem}
.steps-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:20px;margin-top:28px}
.step-card{background:var(--white);border-radius:14px;padding:24px;box-shadow:0 2px 12px rgba(0,0,0,.06)}
.step-num{width:34px;height:34px;border-radius:50%;background:var(--gold);color:var(--navy);font-weight:900;display:flex;align-items:center;justify-content:center;margin-bottom:12px}
.step-title{font-weight:700;color:var(--navy);margin-bottom:6px}.step-desc{font-size:.875rem;color:var(--text-body);line-height:1.6}
.faq-list{margin-top:28px;max-width:720px}
.faq-item{border-bottom:1px solid rgba(0,0,0,.08);padding:18px 0}
.faq-q{font-weight:700;color:var(--navy);cursor:pointer;display:flex;justify-content:space-between;align-items:center;gap:12px}
.faq-q::after{content:'+';font-size:1.2rem;color:var(--gold);flex-shrink:0}
.faq-q.open::after{content:'−'}.faq-a{font-size:.875rem;color:var(--text-body);line-height:1.7;margin-top:10px;display:none}
.faq-a.open{display:block}
.cta-banner{background:linear-gradient(135deg,var(--navy),#1a3260);border-radius:20px;padding:52px;text-align:center;color:white;margin:0 5vw 60px}
.cta-banner h2{font-family:'Playfair Display',serif;font-size:clamp(1.4rem,3vw,2.1rem);font-weight:900;margin-bottom:12px}
.cta-banner h2 span{color:var(--gold)}.cta-banner p{color:rgba(255,255,255,.75);margin-bottom:28px}
</style>
</head>
<body>
<script src="../css/shared.js"><\/script>

<section class="seo-hero">
  <nav class="seo-breadcrumb" aria-label="Ruta de navegación">
    <a href="/">Inicio</a> › <a href="/clases-particulares/">Clases particulares</a> › ${p.titulo} Madrid
  </nav>
  <h1>Clases Particulares de <span>${p.titulo}</span><br>en Madrid</h1>
  <p>${p.descripcion}</p>
  <div class="seo-pills">
    <span class="seo-pill">✓ Profesores verificados</span>
    <span class="seo-pill">✓ Respuesta en 24h</span>
    <span class="seo-pill">✓ Sin permanencia</span>
    <span class="seo-pill">✓ A domicilio u online</span>
    <span class="seo-pill">✓ Desde ${p.precio_desde}€/hora</span>
  </div>
  <div class="seo-ctas">
    <a href="/pages/registro.html" style="display:inline-block;background:var(--gold);color:var(--navy);font-weight:700;padding:14px 32px;border-radius:8px;text-decoration:none;font-size:1rem">Solicitar profesor gratis</a>
    <a href="/contacto.html" style="display:inline-block;border:2px solid rgba(255,255,255,.4);color:white;font-weight:600;padding:14px 28px;border-radius:8px;text-decoration:none;font-size:1rem">Hablar con nosotros</a>
  </div>
</section>

<section class="seo-section">
  <h2>Clases de ${p.titulo.toLowerCase()} para todos los niveles</h2>
  <p>Nuestros profesores están especializados en cada etapa educativa. Encontramos el perfil exacto que necesitas.</p>
  <div class="materias-grid">
    ${p.niveles.map(n => `<div class="materia-card"><div class="materia-icon">${p.emoji}</div><div class="materia-name">${n}</div></div>`).join('\n    ')}
  </div>
</section>

<section class="seo-section">
  <h2>¿Cómo conseguir tu profesor de ${p.titulo.toLowerCase()}?</h2>
  <div class="steps-grid">
    <div class="step-card"><div class="step-num">1</div><div class="step-title">Cuéntanos qué necesitas</div><div class="step-desc">Indica el nivel, la asignatura y el horario. Gratis y sin compromiso.</div></div>
    <div class="step-card"><div class="step-num">2</div><div class="step-title">Seleccionamos el mejor profesor</div><div class="step-desc">Analizamos tu caso y asignamos el profesor más adecuado de nuestra red verificada.</div></div>
    <div class="step-card"><div class="step-num">3</div><div class="step-title">Empezáis las clases</div><div class="step-desc">Recibes los datos del profesor y coordináis directamente el primer día.</div></div>
    <div class="step-card"><div class="step-num">4</div><div class="step-title">Seguimiento continuo</div><div class="step-desc">Supervisamos la evolución y estamos disponibles si necesitas cambios.</div></div>
  </div>
</section>

<section class="seo-section">
  <h2>Preguntas frecuentes</h2>
  <div class="faq-list">
    ${p.faq.map(f => `<div class="faq-item"><div class="faq-q">${f.q}</div><div class="faq-a">${f.a}</div></div>`).join('\n    ')}
    <div class="faq-item"><div class="faq-q">¿Hay permanencia o mínimo de horas?</div><div class="faq-a">No. Sin contratos ni permanencia. Cancela cuando quieras con solo avisarnos.</div></div>
    <div class="faq-item"><div class="faq-q">¿Puedo cambiar de profesor?</div><div class="faq-a">Sí, sin coste adicional si el perfil asignado no se adapta a vuestras necesidades.</div></div>
  </div>
</section>

<div class="cta-banner">
  <h2>¿Listo para mejorar en <span>${p.titulo.toLowerCase()}</span>?</h2>
  <p>Solicita tu profesor ahora. Respuesta en menos de 24 horas. Sin compromiso.</p>
  <a href="/pages/registro.html" style="display:inline-block;background:var(--gold);color:var(--navy);font-weight:700;padding:15px 36px;border-radius:10px;text-decoration:none;font-size:1rem">Empezar ahora — Es gratis</a>
</div>

<script>
document.querySelectorAll('.faq-q').forEach(q=>{q.addEventListener('click',()=>{const a=q.nextElementSibling;const isOpen=q.classList.contains('open');document.querySelectorAll('.faq-q').forEach(el=>{el.classList.remove('open');el.nextElementSibling.classList.remove('open')});if(!isOpen){q.classList.add('open');a.classList.add('open')}})});
<\/script>
</body>
</html>`;

// Generar archivos
const dir = __dirname;
PAGINAS.forEach(p => {
  const ruta = path.join(dir, `${p.slug}.html`);
  fs.writeFileSync(ruta, plantilla(p), 'utf8');
  console.log(`✓ Generado: ${p.slug}.html`);
});
console.log(`\n✅ ${PAGINAS.length} páginas SEO generadas.`);
