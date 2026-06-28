import {
  trackAnalyticsEvent,
  trackAuthEvent,
  trackFormEvent,
} from './analytics-client.js?v=20260628-analytics';

const CONFIG = {
  GA4_ID: '',
  CLARITY_ID: '',
  META_PIXEL: '',
};

function initGA4() {
  if (!CONFIG.GA4_ID) return;
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

function initClarity() {
  if (!CONFIG.CLARITY_ID) return;
  /* eslint-disable */
  (function(c,l,a,r,i,t,y){
    c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
    t=l.createElement(r);t.async=1;t.src='https://www.clarity.ms/tag/'+i;
    y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
  })(window,document,'clarity','script',CONFIG.CLARITY_ID);
  /* eslint-enable */
}

function initMetaPixel() {
  if (!CONFIG.META_PIXEL) return;
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

function mapLegacyEventName(eventName) {
  const map = {
    sign_up: 'auth.signup.succeeded',
    login: 'auth.login.succeeded',
    solicitud_profesor: 'request.created',
    contact: 'form.submitted',
    page_materia: 'page.view',
  };
  return map[eventName] || (String(eventName).includes('.') ? eventName : `legacy.${eventName}`);
}

function metadataFromLegacy(params = {}) {
  return {
    ...params,
    user_rol: params.user_rol || params.role || params.rol || '',
    event_category: params.event_category || '',
    event_label: params.event_label || '',
  };
}

export function trackEvent(eventName, params = {}) {
  if (window.gtag) window.gtag('event', eventName, params);
  if (window.fbq) window.fbq('trackCustom', eventName, params);
  if (window.clarity) window.clarity('event', eventName);
  return trackAnalyticsEvent(mapLegacyEventName(eventName), {
    category: params.category || params.event_category || 'legacy',
    feature: params.feature || params.event_label || eventName,
    value: params.value || 0,
    metadata: metadataFromLegacy(params),
  });
}

export function trackRegistro(rol) {
  trackAuthEvent('auth.signup.succeeded', { method: 'email', role: rol });
  if (window.fbq) window.fbq('track', 'CompleteRegistration', { content_name: rol });
}

export function trackLogin(rol) {
  trackAuthEvent('auth.login.succeeded', { method: 'email', role: rol });
}

export function trackSolicitudProfesor(materia) {
  trackAnalyticsEvent('request.created', {
    category: 'conversion',
    feature: 'solicitudes',
    entityType: 'solicitudes',
    metadata: { materia },
    value: 1,
  });
  if (window.fbq) window.fbq('track', 'Lead', { content_name: materia, content_category: 'solicitud' });
}

export function trackContacto(origen) {
  trackFormEvent('form.submitted', 'contacto', { origen });
  if (window.fbq) window.fbq('track', 'Contact');
}

export function trackPaginaMateria(materia, nivel) {
  trackAnalyticsEvent('page.view', {
    category: 'seo',
    feature: 'materia',
    metadata: { materia, nivel },
  });
}

let initialized = false;

function initAll() {
  if (initialized) return;
  initialized = true;
  initGA4();
  initClarity();
  initMetaPixel();
  TRIGGER_EVENTS.forEach((eventName) => document.removeEventListener(eventName, trigger, { passive: true }));
}

const trigger = () => initAll();
const TRIGGER_EVENTS = ['scroll', 'click', 'keydown', 'touchstart'];
setTimeout(initAll, 3000);
TRIGGER_EVENTS.forEach((eventName) => document.addEventListener(eventName, trigger, { once: true, passive: true }));

export function init() {
  initAll();
}

export default {
  init,
  trackEvent,
  trackRegistro,
  trackLogin,
  trackSolicitudProfesor,
  trackContacto,
  trackPaginaMateria,
};
