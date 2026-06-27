/**
 * ClasesDe10 — Nav & Footer Injector
 * Inyecta la navegación principal y el footer en páginas SEO
 * que no tienen el HTML del nav inline.
 *
 * Uso: <script src="/js/nav.js"></script>   (sin type="module")
 *
 * Calcula las rutas relativas automáticamente según la profundidad
 * de la URL actual.
 */

(function () {
  'use strict';

  // ── Calcular prefijo de ruta según la profundidad de la página ──
  function getBase() {
    const depth = (location.pathname.match(/\//g) || []).length - 1;
    return depth <= 0 ? '.' : Array(depth).fill('..').join('/');
  }
  const BASE = getBase();
  const ROOT = (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
    ? `${location.protocol}//${location.host}`
    : 'https://clasesde10.com';

  function r(path) {
    return BASE + '/' + path;
  }

  // ── NAV HTML ──────────────────────────────────────────────────────
  const navHTML = `
<nav id="mainNav" style="position:fixed;top:0;left:0;right:0;z-index:100;display:flex;align-items:center;justify-content:space-between;padding:0 5vw;height:70px;background:rgba(15,31,61,0.97);backdrop-filter:blur(12px);border-bottom:1px solid rgba(255,255,255,0.07);transition:box-shadow .3s">
  <a href="${r('index.html')}" class="nav-logo" style="display:flex;align-items:center;gap:10px;text-decoration:none">
    <img src="/assets/img/logo-192.png"
         alt="ClasesDe10" style="height:44px;width:44px;border-radius:10px;object-fit:cover">
    <span style="font-family:'Playfair Display',serif;font-size:1.35rem;font-weight:700;color:#fff">
      Clases<span style="color:#e8a030">De10</span>
    </span>
  </a>
  <ul id="navLinks" style="display:flex;align-items:center;gap:4px;list-style:none;margin:0;padding:0">
    <li><a href="${r('como-funciona.html')}"   style="text-decoration:none;color:rgba(255,255,255,.75);font-size:.84rem;font-weight:500;padding:8px 14px;border-radius:6px;transition:color .2s,background .2s">Cómo funciona</a></li>
    <li><a href="${r('para-padres.html')}"     style="text-decoration:none;color:rgba(255,255,255,.75);font-size:.84rem;font-weight:500;padding:8px 14px;border-radius:6px;transition:color .2s,background .2s">Para familias</a></li>
    <li><a href="${r('para-profesores.html')}" style="text-decoration:none;color:rgba(255,255,255,.75);font-size:.84rem;font-weight:500;padding:8px 14px;border-radius:6px;transition:color .2s,background .2s">Para profesores</a></li>
    <li><a href="${r('clases-particulares/')}" style="text-decoration:none;color:rgba(255,255,255,.75);font-size:.84rem;font-weight:500;padding:8px 14px;border-radius:6px;transition:color .2s,background .2s">Clases</a></li>
    <li><a href="${r('contacto.html')}"        style="text-decoration:none;color:rgba(255,255,255,.75);font-size:.84rem;font-weight:500;padding:8px 14px;border-radius:6px;transition:color .2s,background .2s">Contactar</a></li>
    <li><a href="${r('pages/login.html')}"     style="text-decoration:none;color:rgba(255,255,255,.7);font-size:.84rem;font-weight:500;padding:8px 14px;border-radius:6px;transition:color .2s,background .2s">Acceder</a></li>
    <li><a href="${r('pages/registro.html')}"  style="display:inline-block;background:#e8a030;color:#0f1f3d;font-weight:700;font-size:.84rem;padding:8px 20px;border-radius:6px;text-decoration:none;transition:background .2s">Solicitar profesor</a></li>
  </ul>
  <button id="hamburger" aria-label="Menú móvil" style="display:none;flex-direction:column;gap:5px;cursor:pointer;background:none;border:none;padding:4px">
    <span style="width:22px;height:2px;background:#fff;border-radius:2px;display:block;transition:.3s"></span>
    <span style="width:22px;height:2px;background:#fff;border-radius:2px;display:block;transition:.3s"></span>
    <span style="width:22px;height:2px;background:#fff;border-radius:2px;display:block;transition:.3s"></span>
  </button>
</nav>

<div id="mobileMenu" style="display:none;position:fixed;top:70px;left:0;right:0;bottom:0;z-index:300;background:#0f1f3d;flex-direction:column;padding:32px 5vw;gap:6px;overflow-y:auto">
  <a href="${r('como-funciona.html')}"   data-mobile-close style="text-decoration:none;color:rgba(255,255,255,.8);font-size:1.05rem;font-weight:500;padding:14px 0;border-bottom:1px solid rgba(255,255,255,.07);display:block">Cómo funciona</a>
  <a href="${r('para-padres.html')}"     data-mobile-close style="text-decoration:none;color:rgba(255,255,255,.8);font-size:1.05rem;font-weight:500;padding:14px 0;border-bottom:1px solid rgba(255,255,255,.07);display:block">Para familias</a>
  <a href="${r('para-profesores.html')}" data-mobile-close style="text-decoration:none;color:rgba(255,255,255,.8);font-size:1.05rem;font-weight:500;padding:14px 0;border-bottom:1px solid rgba(255,255,255,.07);display:block">Para profesores</a>
  <a href="${r('clases-particulares/')}" data-mobile-close style="text-decoration:none;color:rgba(255,255,255,.8);font-size:1.05rem;font-weight:500;padding:14px 0;border-bottom:1px solid rgba(255,255,255,.07);display:block">Clases particulares</a>
  <a href="${r('contacto.html')}"        data-mobile-close style="text-decoration:none;color:rgba(255,255,255,.8);font-size:1.05rem;font-weight:500;padding:14px 0;border-bottom:1px solid rgba(255,255,255,.07);display:block">Contactar</a>
  <a href="${r('pages/login.html')}"     data-mobile-close style="text-decoration:none;color:rgba(255,255,255,.8);font-size:1.05rem;font-weight:500;padding:14px 0;border-bottom:1px solid rgba(255,255,255,.07);display:block">Acceder</a>
  <a href="${r('pages/registro.html')}"  style="display:inline-block;margin-top:12px;background:#e8a030;color:#0f1f3d;font-weight:700;font-size:1rem;padding:14px 20px;border-radius:8px;text-align:center;text-decoration:none">Solicitar profesor gratis</a>
</div>`;

  // ── FOOTER HTML ──────────────────────────────────────────────────
  const footerHTML = `
<footer style="background:#0f1f3d;color:rgba(255,255,255,.7);padding:52px 5vw 0;overflow-wrap:anywhere">
  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(240px,100%),1fr));gap:40px;max-width:1100px;margin:0 auto;padding-bottom:40px">
    <div>
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px">
        <img src="/assets/img/logo-192.png"
             style="width:40px;height:40px;border-radius:10px;object-fit:cover" alt="ClasesDe10">
        <span style="font-family:'Playfair Display',serif;font-size:1.2rem;font-weight:700;color:#fff">
          Clases<span style="color:#e8a030">De10</span>
        </span>
      </div>
      <p style="font-size:.875rem;line-height:1.8;max-width:320px">
        Conectamos familias con profesores particulares en Madrid. Aprendizaje personalizado, confianza y calidad.
      </p>
    </div>
    <div>
      <h4 style="color:#fff;font-weight:700;margin-bottom:16px;font-size:.9rem;text-transform:uppercase;letter-spacing:.06em">Clases</h4>
      <ul style="list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:10px">
        <li><a href="${r('clases-particulares/matematicas-madrid.html')}" style="text-decoration:none;color:rgba(255,255,255,.65);font-size:.875rem;transition:color .2s">Matemáticas</a></li>
        <li><a href="${r('clases-particulares/ingles-madrid.html')}"       style="text-decoration:none;color:rgba(255,255,255,.65);font-size:.875rem;transition:color .2s">Inglés</a></li>
        <li><a href="${r('clases-particulares/bachillerato-madrid.html')}" style="text-decoration:none;color:rgba(255,255,255,.65);font-size:.875rem;transition:color .2s">Bachillerato</a></li>
        <li><a href="${r('clases-particulares/selectividad-madrid.html')}" style="text-decoration:none;color:rgba(255,255,255,.65);font-size:.875rem;transition:color .2s">Selectividad (EBAU)</a></li>
        <li><a href="${r('clases-particulares/')}"                         style="text-decoration:none;color:rgba(255,255,255,.65);font-size:.875rem;transition:color .2s">Ver todas →</a></li>
      </ul>
    </div>
    <div>
      <h4 style="color:#fff;font-weight:700;margin-bottom:16px;font-size:.9rem;text-transform:uppercase;letter-spacing:.06em">Contacto</h4>
      <ul style="list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:10px">
        <li><a href="mailto:contacto.clasesde10@gmail.com" style="text-decoration:none;color:rgba(255,255,255,.65);font-size:.875rem">contacto.clasesde10@gmail.com</a></li>
        <li><a href="${r('contacto.html')}"     style="text-decoration:none;color:rgba(255,255,255,.65);font-size:.875rem;transition:color .2s">Formulario de contacto</a></li>
        <li><a href="${r('sobre-nosotros.html')}" style="text-decoration:none;color:rgba(255,255,255,.65);font-size:.875rem;transition:color .2s">Sobre nosotros</a></li>
        <li><a href="${r('pages/registro.html')}" style="text-decoration:none;color:rgba(255,255,255,.65);font-size:.875rem;transition:color .2s">Registrarse gratis</a></li>
        <li><a href="${r('terminos.html')}"     style="text-decoration:none;color:rgba(255,255,255,.65);font-size:.875rem;transition:color .2s">Términos de uso</a></li>
        <li><a href="${r('privacidad.html')}"   style="text-decoration:none;color:rgba(255,255,255,.65);font-size:.875rem;transition:color .2s">Privacidad</a></li>
        <li><a href="${r('cookies.html')}"      style="text-decoration:none;color:rgba(255,255,255,.65);font-size:.875rem;transition:color .2s">Cookies</a></li>
      </ul>
    </div>
  </div>
  <div style="border-top:1px solid rgba(255,255,255,.1);padding:20px 0;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;max-width:1100px;margin:0 auto">
    <span style="font-size:.78rem;color:rgba(255,255,255,.4)">© ${new Date().getFullYear()} ClasesDe10. Todos los derechos reservados.</span>
    <span style="font-size:.78rem;color:rgba(255,255,255,.4)">Hecho con ❤️ en Madrid</span>
  </div>
</footer>`;

  // ── INYECCIÓN ─────────────────────────────────────────────────────
  function inject() {
    // Añadir padding-top al body para compensar el nav fijo
    document.body.style.paddingTop = '70px';

    // Inyectar nav al inicio del body
    const navEl = document.createElement('div');
    navEl.innerHTML = navHTML;
    while (navEl.firstChild) {
      document.body.insertBefore(navEl.firstChild, document.body.firstChild);
    }

    // Inyectar footer al final del body
    const footerEl = document.createElement('div');
    footerEl.innerHTML = footerHTML;
    while (footerEl.firstChild) {
      document.body.appendChild(footerEl.firstChild);
    }

    // ── Comportamiento nav ─────────────────────────────────────────
    const mainNav   = document.getElementById('mainNav');
    const hamburger = document.getElementById('hamburger');
    const mobileMenu = document.getElementById('mobileMenu');
    const navLinks  = document.getElementById('navLinks');

    // Scroll shadow
    window.addEventListener('scroll', () => {
      if (mainNav) mainNav.style.boxShadow = window.scrollY > 10
        ? '0 4px 30px rgba(0,0,0,0.3)' : '';
    }, { passive: true });

    // Responsive: usar hamburger en móvil y tablet.
    function checkMobile() {
      const isMobile = window.innerWidth <= 900;
      if (hamburger) hamburger.style.display = isMobile ? 'flex' : 'none';
      if (navLinks)  navLinks.style.display  = isMobile ? 'none' : 'flex';
    }
    checkMobile();
    window.addEventListener('resize', checkMobile);

    // Toggle menú móvil
    if (hamburger && mobileMenu) {
      hamburger.addEventListener('click', () => {
        mobileMenu.style.display = mobileMenu.style.display === 'flex' ? 'none' : 'flex';
      });
      mobileMenu.addEventListener('click', (event) => {
        if (event.target.closest('[data-mobile-close]')) {
          mobileMenu.style.display = 'none';
        }
      });
    }

    // Marcar enlace activo
    const path = location.pathname;
    document.querySelectorAll('#navLinks a, #mobileMenu a').forEach(a => {
      try {
        const linkPath = new URL(a.href).pathname;
        if (linkPath === path || (path.endsWith('/') && linkPath === path + 'index.html')) {
          a.style.color = '#e8a030';
        }
      } catch (_) {}
    });
  }

  // Ejecutar cuando el DOM esté listo
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inject);
  } else {
    inject();
  }

})();
