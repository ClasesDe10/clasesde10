/**
 * ClasesDe10 — Analytics Module
 * Google Analytics 4, Microsoft Clarity, Meta Pixel
 *
 * CONFIGURACIÓN: Reemplazar los IDs en CONFIG con los valores reales.
 * Carga diferida para no penalizar LCP ni Core Web Vitals.
 */

const CONFIG = {
  GA4_ID:     'G-XXXXXXXXXX',    // ← Reemplazar con Measurement ID de GA4
  CLARITY_ID: 'XXXXXXXXXX',      // ← Reemplazar con Project ID de Clarity
  META_PIXEL: 'XXXXXXXXXXXXXXXX', // ← Reemplazar con Pixel ID de Meta
};

// ── GOOGLE ANALYTICS 4 ───────────────────────────────────────────
function initGA4() {
  if (!CONFIG.GA4_ID || CONFIG.GA4_ID.includes('X')) return;
  const script = document.createElement('script');
  script.src = `https://www.googletagmanager.com/gtag/js?id=${CONFIG.GA4_ID}`;
  script.async = true;
  document.head.appendChild(script);
  window.dataLayer = window.dataLayer || [];
  function gtag() { window.dataLayer.push(arguments); }
  window.gtag = gtag;
  gtag('js', new Date());
  gtag('config', CONFIG.GA4_ID, {
    anonymize_ip: true,
    cookie_flags: 'SameSite=None;Secure',
  });
}

// ── MICROSOFT CLARITY ────────────────────────────────────────────
function initClarity() {
  if (!CONFIG.CLARITY_ID || CONFIG.CLARITY_ID.includes('X')) return;
  /* eslint-disable */
  (function(c,l,a,r,i,t,y){
    c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
    t=l.createElement(r);t.async=1;t.src='https://www.clarity.ms/tag/'+i;
    y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
  })(window,document,'clarity','script',CONFIG.CLARITY_ID);
  /* eslint-enable */
}

// ── META PIXEL ───────────────────────────────────────────────────
function initMetaPixel() {
  if (!CONFIG.META_PIXEL || CONFIG.META_PIXEL.includes('X')) return;
  /* eslint-disable */
  !function(f,b,e,v,n,t,s){
    if(f.fbq)return;n=f.fbq=function(){n.callMethod?
    n.callMethod.apply(n,arguments):n.queue.push(arguments)};
    if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
    n.queue=[];t=b.createElement(e);t.async=!0;
    t.src=v;s=b.getElementsByTagName(e)[0];
    s.parentNode.insertBefore(t,s)
  }(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');
  window.fbq('init', CONFIG.META_PIXEL);
  window.fbq('track', 'PageView');
  /* eslint-enable */
}

// ── EVENTOS PERSONALIZADOS ───────────────────────────────────────

/**
 * Evento genérico
 */
export function trackEvent(eventName, params = {}) {
  if (window.gtag)    window.gtag('event', eventName, params);
  if (window.fbq)     window.fbq('trackCustom', eventName, params);
  if (window.clarity) window.clarity('event', eventName);
}

/**
 * Evento: registro completado
 * Llamar después de db.auth.signUp exitoso
 */
export function trackRegistro(rol) {
  trackEvent('sign_up', { method: 'email', user_rol: rol });
  if (window.fbq) window.fbq('track', 'CompleteRegistration', { content_name: rol });
}

/**
 * Evento: login exitoso
 * Llamar después de db.auth.signInWithPassword exitoso
 */
export function trackLogin(rol) {
  trackEvent('login', { method: 'email', user_rol: rol });
}

/**
 * Evento: solicitud de profesor enviada
 * Llamar después de INSERT en tabla solicitudes
 */
export function trackSolicitudProfesor(materia) {
  trackEvent('solicitud_profesor', {
    materia,
    event_category: 'conversión',
    event_label: materia,
    value: 1,
  });
  if (window.fbq) window.fbq('track', 'Lead', { content_name: materia, content_category: 'solicitud' });
}

/**
 * Evento: formulario de contacto enviado
 */
export function trackContacto(origen) {
  trackEvent('contact', { event_category: 'formulario', event_label: origen });
  if (window.fbq) window.fbq('track', 'Contact');
}

/**
 * Evento: visita a página de materia SEO
 */
export function trackPaginaMateria(materia, nivel) {
  trackEvent('page_materia', { materia, nivel });
}

// ── CARGA DIFERIDA ──────────────────────────────────────────────
// Se inicializa tras la primera interacción del usuario o a los 3 seg.
// Esto evita impactar LCP y FID en páginas de entrada.

let _initialized = false;

function initAll() {
  if (_initialized) return;
  _initialized = true;
  initGA4();
  initClarity();
  initMetaPixel();
  // Eliminar listeners tras la primera ejecución
  TRIGGER_EVENTS.forEach(ev => document.removeEventListener(ev, _trigger, { passive: true }));
}

const _trigger = () => initAll();
const TRIGGER_EVENTS = ['scroll', 'click', 'keydown', 'touchstart'];

// Inicializar a los 3 segundos aunque no haya interacción
const _timer = setTimeout(initAll, 3000);

// Inicializar en la primera interacción (antes de los 3 seg)
TRIGGER_EVENTS.forEach(ev => document.addEventListener(ev, _trigger, { once: true, passive: true }));

/**
 * API pública para inicialización manual (ej: en SPAs o dashboards)
 */
export function init() { initAll(); }

export default { init, trackEvent, trackRegistro, trackLogin, trackSolicitudProfesor, trackContacto, trackPaginaMateria };
