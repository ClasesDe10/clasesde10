#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Genera todas las páginas SEO locales de ClasesDe10."""
import os

DIR = os.path.dirname(os.path.abspath(__file__))

PAGINAS = [
  {"slug":"ingles-madrid","titulo":"Inglés","emoji":"🇬🇧","desc":"Clases particulares de inglés en Madrid con profesores nativos y bilingües. First, Advanced, IELTS, TOEFL y conversación.","niveles":["Inglés Primaria","Inglés ESO","Inglés Bachillerato","Cambridge First/Advanced","TOEFL / IELTS","Inglés de negocios"],"precio":"15","km":"clases inglés Madrid, profesor inglés nativo Madrid, academia inglés Madrid","faq":[("¿Los profesores son nativos?","Contamos con profesores nativos angloparlantes y bilingües certificados."),("¿Preparáis exámenes Cambridge?","Sí. Preparamos FCE, CAE, IELTS, TOEFL y EOI.")]},
  {"slug":"fisica-madrid","titulo":"Física","emoji":"⚛️","desc":"Clases particulares de física en Madrid para ESO, Bachillerato, Selectividad y Universidad.","niveles":["Física ESO","Física y Química ESO","Física Bachillerato","Física EBAU","Física Universidad"],"precio":"18","km":"clases física Madrid, profesor física Madrid, refuerzo física Madrid","faq":[("¿Los profesores tienen titulación universitaria?","Sí. Graduados en Física, Ingeniería u otras con alta carga de física."),("¿Preparan la EBAU de Física?","Sí. Conocen el modelo específico de Madrid.")]},
  {"slug":"quimica-madrid","titulo":"Química","emoji":"🧪","desc":"Clases particulares de química en Madrid. Profesores especializados para ESO, Bachillerato, Selectividad y Universidad.","niveles":["Química ESO","Física y Química ESO","Química Bachillerato","Química EBAU","Química Universidad"],"precio":"18","km":"clases química Madrid, profesor química Madrid, refuerzo química Madrid","faq":[("¿Qué temas cubren?","Todo el temario: formulación, estequiometría, termodinámica, cinética, equilibrio y química orgánica."),("¿Dan Física y Química juntas?","Sí. Muchos profesores cubren ambas asignaturas de ESO.")]},
  {"slug":"lengua-madrid","titulo":"Lengua y Literatura","emoji":"📖","desc":"Clases particulares de Lengua Castellana y Literatura en Madrid. Ortografía, gramática, comentario de texto y selectividad.","niveles":["Lengua Primaria","Lengua ESO","Lengua Bachillerato","Lengua EBAU","Español para extranjeros ELE"],"precio":"15","km":"clases lengua Madrid, profesor lengua literatura Madrid, español extranjeros Madrid","faq":[("¿También para extranjeros?","Sí. Clases de ELE de A1 a C2."),("¿Ayudan con el comentario de texto?","Sí. Es clave en bachillerato y selectividad.")]},
  {"slug":"primaria-madrid","titulo":"Primaria","emoji":"🎒","desc":"Refuerzo escolar y clases particulares para Primaria en Madrid. Todas las asignaturas con profesores especializados.","niveles":["1º Primaria","2º Primaria","3º Primaria","4º Primaria","5º Primaria","6º Primaria"],"precio":"15","km":"clases primaria Madrid, refuerzo escolar primaria Madrid, apoyo escolar Madrid","faq":[("¿A partir de qué edad?","Desde 1º de Primaria (6 años)."),("¿Se trabajan todas las asignaturas?","Sí. Apoyo general: matemáticas, lengua, inglés y ciencias.")]},
  {"slug":"eso-madrid","titulo":"ESO","emoji":"📚","desc":"Clases particulares de ESO en Madrid. Refuerzo en todas las asignaturas de 1º a 4º de ESO.","niveles":["1º ESO","2º ESO","3º ESO","4º ESO","Recuperación y septiembre"],"precio":"15","km":"clases ESO Madrid, refuerzo ESO Madrid, profesor ESO Madrid","faq":[("¿Dan varias asignaturas?","Sí. Optimizan el tiempo cubriendo varias materias."),("¿Ayudan a recuperar suspensas?","Sí. Preparamos recuperaciones y exámenes de septiembre.")]},
  {"slug":"bachillerato-madrid","titulo":"Bachillerato","emoji":"🏫","desc":"Clases particulares de Bachillerato en Madrid. Profesores universitarios para 1º y 2º Bachillerato en todas las materias.","niveles":["1º Bach. Ciencias","1º Bach. Humanidades","2º Bach. Ciencias","2º Bach. Humanidades","Todas las asignaturas"],"precio":"20","km":"clases bachillerato Madrid, profesor bachillerato Madrid, clases 2 bachillerato Madrid","faq":[("¿Asignaturas más demandadas?","Matemáticas, Física, Química, Inglés, Historia de España y Biología."),("¿También preparan Selectividad?","Sí. Combinamos bachillerato y preparación EBAU.")]},
  {"slug":"selectividad-madrid","titulo":"Selectividad (EBAU)","emoji":"🎯","desc":"Preparación Selectividad Madrid (EBAU). Clases intensivas con profesores que conocen el examen de la Comunidad de Madrid.","niveles":["Matemáticas EBAU","Inglés EBAU","Física EBAU","Química EBAU","Historia España EBAU","Biología EBAU"],"precio":"22","km":"preparación selectividad Madrid, clases EBAU Madrid, academia selectividad Madrid","faq":[("¿Cuándo empezar?","Lo ideal es octubre-noviembre de 2º Bachillerato."),("¿Conocen el modelo de la EBAU de Madrid?","Sí. Temario, modelo y criterios específicos de la Comunidad de Madrid.")]},
  {"slug":"universidad-madrid","titulo":"Universidad","emoji":"🎓","desc":"Clases universitarias en Madrid. Apoyo en cálculo, álgebra, estadística, programación y todas las carreras.","niveles":["Cálculo","Álgebra Lineal","Estadística","Programación","Economía y ADE","Ciencias de la Salud"],"precio":"20","km":"clases universidad Madrid, apoyo académico universitario Madrid","faq":[("¿Cubren todas las carreras?","Ingeniería, Matemáticas, Física, Economía, Derecho, ADE, Medicina y más."),("¿Ayudan con TFG?","Orientación metodológica: estructura, metodología y presentación.")]},
  {"slug":"biologia-madrid","titulo":"Biología","emoji":"🧬","desc":"Clases particulares de Biología en Madrid para ESO, Bachillerato, Selectividad y Universidad.","niveles":["Biología ESO","Biología y Geología ESO","Biología Bachillerato","Biología EBAU","Biología Universidad"],"precio":"18","km":"clases biología Madrid, profesor biología Madrid, biología bachillerato Madrid","faq":[("¿Cubren también Geología?","Sí. En ESO van unidas y las cubrimos juntas."),("¿Preparan la EBAU de Biología?","Sí. Especializados en la EBAU de Madrid.")]},
  {"slug":"historia-madrid","titulo":"Historia","emoji":"🏛️","desc":"Clases particulares de Historia en Madrid. Historia de España, Historia del Mundo Contemporáneo y Arte.","niveles":["Historia ESO","Geografía e Historia ESO","Historia Mundo Contemporáneo","Historia España Bachillerato","Historia EBAU"],"precio":"15","km":"clases historia Madrid, profesor historia España Madrid, historia bachillerato Madrid","faq":[("¿También Historia del Arte?","Sí. Profesores especializados para Bachillerato y Selectividad."),("¿Ayudan con el comentario de texto?","Sí. El comentario y análisis de fuentes son habilidades clave que trabajamos.")]},
]

PLANTILLA = '''<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Clases Particulares de {titulo} en Madrid | ClasesDe10</title>
<meta name="description" content="{desc}">
<meta name="keywords" content="{km}">
<link rel="canonical" href="https://www.clasesde10.es/clases-particulares/{slug}.html">
<link rel="icon" type="image/png" href="https://clasesde10.wordpress.com/wp-content/uploads/2025/07/cropped-chatgpt-image-17-jul-2025-20_00_31.png">
<meta property="og:title" content="Clases Particulares de {titulo} en Madrid | ClasesDe10">
<meta property="og:description" content="{desc}">
<meta property="og:url" content="https://www.clasesde10.es/clases-particulares/{slug}.html">
<meta property="og:type" content="website">
<meta property="og:image" content="https://clasesde10.wordpress.com/wp-content/uploads/2025/07/cropped-chatgpt-image-17-jul-2025-20_00_31.png">
<meta property="og:site_name" content="ClasesDe10">
<meta property="og:locale" content="es_ES">
<meta name="twitter:card" content="summary_large_image">
<link rel="stylesheet" href="../css/style.css">
<script type="application/ld+json">
{{"@context":"https://schema.org","@type":"Course","name":"Clases de {titulo} en Madrid","description":"{desc}","provider":{{"@type":"Organization","name":"ClasesDe10","url":"https://www.clasesde10.es"}},"offers":{{"@type":"Offer","price":"{precio}","priceCurrency":"EUR","availability":"https://schema.org/InStock"}}}}
</script>
<style>
.seo-hero{{background:linear-gradient(135deg,#0f1f3d 0%,#0d2952 60%,#0e3a5a 100%);padding:calc(70px + 80px) 5vw 80px;text-align:center}}
.seo-breadcrumb{{display:flex;align-items:center;justify-content:center;gap:8px;font-size:.78rem;color:rgba(255,255,255,.5);margin-bottom:20px;flex-wrap:wrap}}
.seo-breadcrumb a{{color:rgba(255,255,255,.6);text-decoration:none}}
.seo-hero h1{{font-family:\'Playfair Display\',serif;font-size:clamp(2rem,5vw,3.6rem);font-weight:900;color:#fff;line-height:1.15;margin-bottom:16px}}
.seo-hero h1 span{{color:#e8a030}}
.seo-hero p{{font-size:clamp(.9rem,1.8vw,1.1rem);color:rgba(255,255,255,.75);max-width:600px;margin:0 auto 36px;line-height:1.7}}
.seo-pills{{display:flex;flex-wrap:wrap;gap:10px;justify-content:center;margin-bottom:36px}}
.seo-pill{{background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.18);color:rgba(255,255,255,.85);font-size:.8rem;font-weight:600;padding:6px 14px;border-radius:100px}}
.seo-ctas{{display:flex;gap:12px;justify-content:center;flex-wrap:wrap}}
.seo-section{{padding:64px 5vw}}.seo-section:nth-child(even){{background:#f0ede6}}
.seo-section h2{{font-family:\'Playfair Display\',serif;font-size:clamp(1.4rem,3vw,2.1rem);font-weight:700;color:#0f1f3d;margin-bottom:14px}}
.materias-grid{{display:grid;grid-template-columns:repeat(auto-fill,minmax(175px,1fr));gap:14px;margin-top:24px}}
.materia-card{{background:#fff;border:1px solid rgba(0,0,0,.07);border-radius:14px;padding:20px;text-align:center;transition:box-shadow .2s,transform .2s}}
.materia-card:hover{{box-shadow:0 8px 24px rgba(0,0,0,.1);transform:translateY(-3px)}}
.materia-icon{{font-size:1.8rem;margin-bottom:8px}}.materia-name{{font-weight:700;color:#0f1f3d;font-size:.88rem}}
.steps-grid{{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:18px;margin-top:24px}}
.step-card{{background:#fff;border-radius:14px;padding:22px;box-shadow:0 2px 12px rgba(0,0,0,.06)}}
.step-num{{width:32px;height:32px;border-radius:50%;background:#e8a030;color:#0f1f3d;font-weight:900;display:flex;align-items:center;justify-content:center;margin-bottom:10px;font-size:.9rem}}
.step-title{{font-weight:700;color:#0f1f3d;margin-bottom:6px}}.step-desc{{font-size:.84rem;color:#3d3830;line-height:1.6}}
.faq-list{{margin-top:24px;max-width:720px}}.faq-item{{border-bottom:1px solid rgba(0,0,0,.08);padding:16px 0}}
.faq-q{{font-weight:700;color:#0f1f3d;cursor:pointer;display:flex;justify-content:space-between;align-items:center;gap:12px}}
.faq-q::after{{content:"+";font-size:1.2rem;color:#e8a030;flex-shrink:0}}.faq-q.open::after{{content:"−"}}
.faq-a{{font-size:.875rem;color:#3d3830;line-height:1.7;margin-top:8px;display:none}}.faq-a.open{{display:block}}
.cta-banner{{background:linear-gradient(135deg,#0f1f3d,#1a3260);border-radius:20px;padding:52px;text-align:center;color:#fff;margin:0 5vw 60px}}
.cta-banner h2{{font-family:\'Playfair Display\',serif;font-size:clamp(1.4rem,3vw,2.1rem);font-weight:900;margin-bottom:12px}}
.cta-banner h2 span{{color:#e8a030}}.cta-banner p{{color:rgba(255,255,255,.75);margin-bottom:28px}}
</style>
</head>
<body>
<script src="../css/shared.js"></script>
<section class="seo-hero">
  <nav class="seo-breadcrumb" aria-label="Ruta de navegación">
    <a href="/">Inicio</a> &rsaquo; <a href="/clases-particulares/">Clases particulares</a> &rsaquo; {titulo} Madrid
  </nav>
  <h1>Clases Particulares de <span>{titulo}</span><br>en Madrid</h1>
  <p>{desc}</p>
  <div class="seo-pills">
    <span class="seo-pill">&#10003; Profesores verificados</span>
    <span class="seo-pill">&#10003; Respuesta en 24h</span>
    <span class="seo-pill">&#10003; Sin permanencia</span>
    <span class="seo-pill">&#10003; A domicilio u online</span>
    <span class="seo-pill">&#10003; Desde {precio}&#8364;/hora</span>
  </div>
  <div class="seo-ctas">
    <a href="/pages/registro.html" style="display:inline-block;background:#e8a030;color:#0f1f3d;font-weight:700;padding:14px 32px;border-radius:8px;text-decoration:none;font-size:1rem">Solicitar profesor gratis</a>
    <a href="/contacto.html" style="display:inline-block;border:2px solid rgba(255,255,255,.4);color:#fff;font-weight:600;padding:14px 28px;border-radius:8px;text-decoration:none;font-size:1rem">Hablar con nosotros</a>
  </div>
</section>
<section class="seo-section">
  <h2>Niveles disponibles</h2>
  <div class="materias-grid">
    {niveles_html}
  </div>
</section>
<section class="seo-section">
  <h2>&#191;C&#243;mo conseguir tu profesor?</h2>
  <div class="steps-grid">
    <div class="step-card"><div class="step-num">1</div><div class="step-title">Cu&#233;ntanos qu&#233; necesitas</div><div class="step-desc">Nivel, asignatura y horario. Gratis y sin compromiso.</div></div>
    <div class="step-card"><div class="step-num">2</div><div class="step-title">Seleccionamos el profesor</div><div class="step-desc">Elegimos el perfil m&#225;s adecuado de nuestra red verificada.</div></div>
    <div class="step-card"><div class="step-num">3</div><div class="step-title">Emp&#233;z&#225;is las clases</div><div class="step-desc">Recibes sus datos y coordinais directamente el primer dia.</div></div>
    <div class="step-card"><div class="step-num">4</div><div class="step-title">Seguimiento continuo</div><div class="step-desc">Supervisamos la evolucion y gestionamos cualquier cambio.</div></div>
  </div>
</section>
<section class="seo-section">
  <h2>Preguntas frecuentes</h2>
  <div class="faq-list">
    {faq_html}
    <div class="faq-item"><div class="faq-q">&#191;Hay permanencia o minimo de horas?</div><div class="faq-a">No. Sin contratos ni permanencia. Cancela cuando quieras.</div></div>
    <div class="faq-item"><div class="faq-q">&#191;Puedo cambiar de profesor?</div><div class="faq-a">S&#237;, sin coste adicional si el perfil asignado no se adapta.</div></div>
  </div>
</section>
<div class="cta-banner">
  <h2>&#191;Listo para mejorar en <span>{titulo_lower}</span>?</h2>
  <p>Solicita tu profesor ahora. Respuesta en menos de 24 horas. Sin compromiso.</p>
  <a href="/pages/registro.html" style="display:inline-block;background:#e8a030;color:#0f1f3d;font-weight:700;padding:15px 36px;border-radius:10px;text-decoration:none;font-size:1rem">Empezar ahora &mdash; Es gratis</a>
</div>
<script>document.querySelectorAll('.faq-q').forEach(function(q){q.addEventListener('click',function(){var a=q.nextElementSibling;var o=q.classList.contains('open');document.querySelectorAll('.faq-q').forEach(function(e){e.classList.remove('open');e.nextElementSibling.classList.remove('open')});if(!o){q.classList.add('open');a.classList.add('open')}})});</script>
</body>
</html>'''

for p in PAGINAS:
    niveles_html = "\n    ".join(
        '<div class="materia-card"><div class="materia-icon">{e}</div><div class="materia-name">{n}</div></div>'.format(e=p["emoji"], n=n)
        for n in p["niveles"]
    )
    faq_html = "\n    ".join(
        '<div class="faq-item"><div class="faq-q">{q}</div><div class="faq-a">{a}</div></div>'.format(q=f[0], a=f[1])
        for f in p["faq"]
    )
    html = PLANTILLA.format(
        slug=p["slug"], titulo=p["titulo"], titulo_lower=p["titulo"].lower(),
        desc=p["desc"], km=p["km"], precio=p["precio"],
        niveles_html=niveles_html, faq_html=faq_html,
    )
    ruta = os.path.join(DIR, p["slug"] + ".html")
    with open(ruta, "w", encoding="utf-8") as f:
        f.write(html)
    print("OK " + p["slug"] + ".html")

print("DONE " + str(len(PAGINAS)) + " paginas")
