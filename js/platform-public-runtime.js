import {
  doc,
  getDoc,
} from 'https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js';
import { firebaseDb } from './firebase-client.js?v=20260627-domain-auth';

const PUBLIC_DOC = 'platformRuntime';
let initialized = false;

function clean(value, max = 1000) {
  return String(value ?? '').trim().slice(0, max);
}

function escapeHtml(value) {
  return clean(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function setCssVar(name, value) {
  const color = clean(value, 20);
  if (!/^#[0-9a-f]{6}$/i.test(color)) return;
  document.documentElement.style.setProperty(name, color);
}

function injectStyles() {
  if (document.getElementById('cd10-platform-runtime-styles')) return;
  const style = document.createElement('style');
  style.id = 'cd10-platform-runtime-styles';
  style.textContent = `
    .cd10-platform-banner {
      position: relative;
      z-index: 2147482000;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      padding: 9px 16px;
      background: var(--navy, #0f1f3d);
      color: #fff;
      font: 800 .84rem/1.35 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      text-align: center;
    }
    .cd10-platform-banner a {
      color: var(--gold, #e8a030);
      font-weight: 900;
      text-decoration: none;
    }
    .cd10-platform-maintenance {
      margin: 0;
      border-bottom: 1px solid rgba(217,119,6,.22);
      background: #fff7ed;
      color: #7c2d12;
    }
    .cd10-platform-promotion {
      background: var(--gold, #e8a030);
      color: #0f1f3d;
    }
  `;
  document.head.appendChild(style);
}

function renderBanner(id, className, text, url = '') {
  const existing = document.getElementById(id);
  if (!text) {
    existing?.remove();
    return;
  }
  injectStyles();
  const element = existing || document.createElement('div');
  element.id = id;
  element.className = `cd10-platform-banner ${className}`;
  element.innerHTML = url
    ? `<span>${escapeHtml(text)}</span><a href="${escapeHtml(url)}">Ver</a>`
    : `<span>${escapeHtml(text)}</span>`;
  if (!existing) document.body.insertBefore(element, document.body.firstChild);
}

function applyBrand(runtime = {}) {
  setCssVar('--navy', runtime.brand?.primaryColor);
  setCssVar('--gold', runtime.brand?.accentColor);
  setCssVar('--gold-text', runtime.brand?.accentColor);
  setCssVar('--success', runtime.brand?.successColor);
  setCssVar('--danger', runtime.brand?.dangerColor);
}

function applyMeta(runtime = {}) {
  const description = clean(runtime.seo?.description, 320);
  const suffix = clean(runtime.seo?.titleSuffix, 80);
  if (description) {
    document.querySelector('meta[name="description"]')?.setAttribute('content', description);
  }
  if (suffix && document.title && !document.title.includes(suffix)) {
    document.title = `${document.title} | ${suffix}`;
  }
}

export async function initPlatformPublicRuntime() {
  if (initialized) return null;
  initialized = true;
  try {
    const snap = await getDoc(doc(firebaseDb, 'configuracionPublica', PUBLIC_DOC));
    if (!snap.exists()) return null;
    const runtime = snap.data() || {};
    applyBrand(runtime);
    applyMeta(runtime);
    if (runtime.maintenance?.enabled) {
      renderBanner('cd10-maintenance-banner', 'cd10-platform-maintenance', runtime.maintenance.message || 'Estamos realizando mejoras.');
    }
    if (runtime.banner?.enabled) {
      renderBanner('cd10-public-banner', '', runtime.banner.text, runtime.banner.url);
    }
    if (runtime.promotion?.enabled) {
      renderBanner('cd10-promotion-banner', 'cd10-platform-promotion', runtime.promotion.text);
    }
    window.CD10PublicRuntimeConfig = runtime;
    window.dispatchEvent(new CustomEvent('cd10:public-config-ready', { detail: runtime }));
    return runtime;
  } catch (error) {
    console.warn('No se pudo cargar configuracion publica', error);
    return null;
  }
}
