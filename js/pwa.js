(function () {
  const DISMISS_KEY = 'cd10-install-dismissed-at';
  const DISMISS_TTL = 7 * 24 * 60 * 60 * 1000;
  const INSTALL_ID = 'cd10-install-card';
  let deferredPrompt = null;
  let installCard = null;
  let analyticsModulePromise = null;
  const clickTelemetry = new Map();
  let commandPaletteActions = [];
  let commandPaletteSelection = 0;
  const pendingButtonTimers = new WeakMap();
  const pendingFormTimers = new WeakMap();
  let pageProgressTimer = 0;

  const isStandalone = () =>
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true;

  const isIos = () =>
    /iphone|ipad|ipod/i.test(window.navigator.userAgent || '') &&
    !window.MSStream;

  const dismissedRecently = () => {
    try {
      const value = Number(window.localStorage.getItem(DISMISS_KEY) || 0);
      return value && Date.now() - value < DISMISS_TTL;
    } catch (_) {
      return false;
    }
  };

  const rememberDismiss = () => {
    try {
      window.localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch (_) {}
  };

  const isPanelInstallPath = (pathname = window.location.pathname) =>
    /^\/pages\/login(?:\.html)?$/i.test(pathname) ||
    /^\/pages\/dashboard\//i.test(pathname);

  const canShow = () =>
    !isStandalone() &&
    !dismissedRecently() &&
    isPanelInstallPath();

  function syncViewportVars() {
    const viewport = window.visualViewport;
    const height = viewport?.height || window.innerHeight || document.documentElement.clientHeight;
    const keyboardInset = viewport
      ? Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop)
      : 0;

    document.documentElement.style.setProperty('--app-vh', `${height * 0.01}px`);
    document.documentElement.style.setProperty('--keyboard-inset', `${Math.round(keyboardInset)}px`);
    document.documentElement.classList.toggle('is-standalone-app', isStandalone());
  }

  function keepFocusedFieldVisible(event) {
    const field = event.target;
    if (!field?.matches?.('input, select, textarea')) return;
    if (!window.matchMedia('(max-width: 768px)').matches) return;

    window.setTimeout(() => {
      field.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' });
    }, 180);
  }

  function bindViewportSignals() {
    syncViewportVars();
    window.addEventListener('resize', syncViewportVars, { passive: true });
    window.addEventListener('orientationchange', () => window.setTimeout(syncViewportVars, 250), { passive: true });
    window.visualViewport?.addEventListener('resize', syncViewportVars, { passive: true });
    window.visualViewport?.addEventListener('scroll', syncViewportVars, { passive: true });
    document.addEventListener('focusin', keepFocusedFieldVisible);
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function debounce(fn, wait = 180) {
    let timer = 0;
    return (...args) => {
      clearTimeout(timer);
      timer = window.setTimeout(() => fn(...args), wait);
    };
  }

  function productUxReady(callback) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', callback, { once: true });
    } else {
      callback();
    }
  }

  function analyticsModule() {
    analyticsModulePromise ||= import('/js/analytics-client.js?v=20260628-analytics').catch(() => null);
    return analyticsModulePromise;
  }

  function trackProductEvent(eventName, payload = {}) {
    analyticsModule().then((module) => module?.trackAnalyticsEvent?.(eventName, payload));
  }

  function formAnalyticsName(form) {
    return (form.id || form.getAttribute('name') || form.getAttribute('aria-label') || form.action || window.location.pathname || 'form')
      .replace(/^https?:\/\/[^/]+/i, '')
      .replace(/[^a-z0-9_-]+/gi, '_')
      .slice(0, 80);
  }

  function injectProductUxStyles() {
    if (document.getElementById('cd10-product-ux-styles')) return;
    const style = document.createElement('style');
    style.id = 'cd10-product-ux-styles';
    style.textContent = `
      .cd10-connection-banner {
        position: fixed;
        left: 50%;
        bottom: max(18px, env(safe-area-inset-bottom));
        transform: translateX(-50%);
        z-index: 2147482500;
        display: inline-flex;
        align-items: center;
        gap: 8px;
        max-width: min(520px, calc(100vw - 24px));
        padding: 10px 14px;
        border-radius: 999px;
        border: 1px solid rgba(15,31,61,.12);
        background: #ffffff;
        color: #0f1f3d;
        box-shadow: 0 18px 50px rgba(0,0,0,.16);
        font: 700 .82rem/1.3 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        opacity: 0;
        pointer-events: none;
        transition: opacity .18s ease, transform .18s ease;
      }
      .cd10-connection-banner.is-visible {
        opacity: 1;
        transform: translateX(-50%) translateY(-4px);
        pointer-events: auto;
      }
      .cd10-connection-banner[data-tone="warning"] { border-color: rgba(217,119,6,.28); }
      .cd10-connection-banner[data-tone="success"] { border-color: rgba(22,163,74,.24); }
      .cd10-form-progress {
        margin: 0 0 14px;
        padding: 10px 12px;
        border: 1px solid rgba(15,31,61,.08);
        border-radius: 10px;
        background: rgba(255,255,255,.72);
      }
      .cd10-form-progress__top {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 8px;
        color: #31405d;
        font-size: .78rem;
        font-weight: 800;
      }
      .cd10-form-progress__bar {
        height: 7px;
        overflow: hidden;
        border-radius: 999px;
        background: rgba(15,31,61,.1);
      }
      .cd10-form-progress__bar span {
        display: block;
        width: var(--cd10-progress, 0%);
        height: 100%;
        border-radius: inherit;
        background: linear-gradient(90deg, #e8a030, #1d7a6b);
        transition: width .22s ease;
      }
      .cd10-draft-status {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        min-height: 22px;
        margin-top: 8px;
        color: #6f695f;
        font-size: .78rem;
        font-weight: 700;
      }
      .cd10-draft-status::before {
        content: '';
        width: 7px;
        height: 7px;
        border-radius: 50%;
        background: #16a34a;
      }
      .cd10-draft-status[data-state="dirty"]::before { background: #d97706; }
      .cd10-draft-status[data-state="restored"]::before { background: #2563eb; }
      .cd10-command-trigger {
        min-height: 34px;
        border: 1px solid rgba(15,31,61,.1);
        border-radius: 8px;
        background: rgba(15,31,61,.04);
        color: #31405d;
        padding: 6px 10px;
        font: 800 .78rem/1 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        gap: 8px;
      }
      .cd10-command-trigger::before {
        content: '';
        width: 14px;
        height: 14px;
        border-radius: 50%;
        border: 2px solid currentColor;
        box-shadow: 6px 6px 0 -5px currentColor;
        transform: rotate(-16deg);
      }
      .cd10-command-overlay {
        position: fixed;
        inset: 0;
        z-index: 2147482600;
        display: none;
        align-items: flex-start;
        justify-content: center;
        padding: min(12vh, 86px) 14px 24px;
        background: rgba(15,31,61,.34);
        backdrop-filter: blur(5px);
      }
      .cd10-command-overlay.open { display: flex; }
      .cd10-command-panel {
        width: min(640px, 100%);
        max-height: min(680px, calc(100vh - 48px));
        overflow: hidden;
        border-radius: 14px;
        border: 1px solid rgba(255,255,255,.7);
        background: #ffffff;
        box-shadow: 0 30px 90px rgba(0,0,0,.28);
      }
      .cd10-command-head {
        display: grid;
        gap: 10px;
        padding: 14px 14px 0;
      }
      .cd10-command-title {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        color: #0f1f3d;
        font: 900 .86rem/1.2 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      .cd10-command-kbd {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        color: #6f695f;
        font-size: .72rem;
        font-weight: 800;
      }
      .cd10-command-kbd kbd {
        min-width: 22px;
        border: 1px solid rgba(15,31,61,.16);
        border-bottom-width: 2px;
        border-radius: 6px;
        background: rgba(15,31,61,.035);
        color: #0f1f3d;
        padding: 3px 6px;
        font: 800 .7rem/1 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        text-align: center;
      }
      .cd10-command-input {
        width: 100%;
        border: 1px solid rgba(15,31,61,.10);
        border-radius: 10px;
        outline: 0;
        padding: 13px 14px;
        color: #0f1f3d;
        font: 700 1rem system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      .cd10-command-list {
        max-height: min(520px, calc(100vh - 190px));
        overflow-y: auto;
        padding: 10px 8px 8px;
      }
      .cd10-command-group {
        padding: 8px 8px 4px;
        color: #8a5a00;
        font: 900 .68rem/1 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        letter-spacing: .04em;
        text-transform: uppercase;
      }
      .cd10-command-item {
        width: 100%;
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        gap: 10px;
        align-items: center;
        min-height: 54px;
        border: 0;
        border-radius: 10px;
        background: transparent;
        color: #0f1f3d;
        padding: 10px 12px;
        text-align: left;
        cursor: pointer;
      }
      .cd10-command-item:hover,
      .cd10-command-item:focus-visible,
      .cd10-command-item.is-active {
        outline: 0;
        background: rgba(232,160,48,.14);
      }
      .cd10-command-item.is-recommended {
        background: rgba(29,122,107,.08);
      }
      .cd10-command-copy {
        min-width: 0;
      }
      .cd10-command-item strong {
        display: block;
        font-size: .9rem;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .cd10-command-item span {
        color: #6f695f;
        font-size: .76rem;
        font-weight: 700;
        display: block;
        margin-top: 3px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .cd10-command-meta {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 68px;
        border-radius: 999px;
        background: rgba(15,31,61,.06);
        color: #0f1f3d;
        padding: 5px 8px;
        font-size: .68rem;
        font-weight: 900;
        text-align: center;
      }
      .cd10-command-foot {
        display: flex;
        justify-content: space-between;
        gap: 10px;
        border-top: 1px solid rgba(15,31,61,.08);
        padding: 9px 12px;
        color: #6f695f;
        font-size: .72rem;
        font-weight: 800;
      }
      .cd10-command-empty {
        padding: 28px;
        color: #6f695f;
        text-align: center;
        font-size: .9rem;
      }
      .cd10-tooltip-anchor {
        position: relative;
      }
      .cd10-tooltip-anchor:hover::after,
      .cd10-tooltip-anchor:focus-visible::after {
        content: attr(data-cd10-tooltip);
        position: absolute;
        right: 0;
        top: calc(100% + 8px);
        z-index: 30;
        width: max-content;
        max-width: 240px;
        padding: 7px 9px;
        border-radius: 7px;
        background: #0f1f3d;
        color: #ffffff;
        font-size: .74rem;
        line-height: 1.35;
        box-shadow: 0 10px 30px rgba(0,0,0,.2);
      }
      .cd10-context-action {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-height: 36px;
        margin-top: 12px;
        border-radius: 8px;
        border: 1px solid rgba(15,31,61,.12);
        background: #ffffff;
        color: #0f1f3d;
        padding: 8px 11px;
        font-size: .8rem;
        font-weight: 800;
        cursor: pointer;
      }
      .cd10-global-search-count {
        display: inline-flex;
        margin-left: 8px;
        color: #6f695f;
        font-size: .76rem;
        font-weight: 800;
      }
      .cd10-page-progress {
        position: fixed;
        top: 0;
        left: 0;
        z-index: 2147482450;
        width: 100%;
        height: 3px;
        transform: scaleX(0);
        transform-origin: left center;
        opacity: 0;
        pointer-events: none;
        background: linear-gradient(90deg, #e8a030, #1d7a6b, #0f1f3d);
        box-shadow: 0 0 18px rgba(232,160,48,.45);
        transition: transform .24s ease, opacity .16s ease;
      }
      .cd10-page-progress.is-active {
        opacity: 1;
        transform: scaleX(var(--cd10-page-progress, .64));
      }
      .cd10-page-progress.is-done {
        opacity: 0;
        transform: scaleX(1);
      }
      .cd10-live-region {
        position: absolute;
        width: 1px;
        height: 1px;
        padding: 0;
        margin: -1px;
        overflow: hidden;
        clip: rect(0, 0, 0, 0);
        white-space: nowrap;
        border: 0;
      }
      .cd10-button-spinner {
        display: inline-block;
        width: 13px;
        height: 13px;
        margin-left: 8px;
        border: 2px solid currentColor;
        border-right-color: transparent;
        border-radius: 999px;
        vertical-align: -2px;
        animation: cd10-spin .72s linear infinite;
      }
      .cd10-is-loading {
        opacity: .78;
        cursor: progress !important;
      }
      .cd10-smart-hint {
        display: block;
        margin-top: 6px;
        color: #6f695f;
        font-size: .75rem;
        font-weight: 750;
        line-height: 1.35;
      }
      .income-lab-toolbar .cd10-smart-hint,
      .student-section-toolbar .cd10-smart-hint,
      .ops-toolbar .cd10-smart-hint,
      .calendar-actions-bar .cd10-smart-hint,
      .topbar .cd10-smart-hint,
      [data-no-smart-hints] .cd10-smart-hint {
        display: none !important;
      }
      .form-row,
      .form-row-3,
      .income-payout-form {
        align-items: start;
      }
      .form-row > .form-group,
      .form-row-3 > .form-group,
      .income-payout-form > .form-group {
        min-width: 0;
        display: flex;
        flex-direction: column;
      }
      .form-control {
        min-height: 44px;
      }
      .income-lab-toolbar {
        align-items: flex-start;
      }
      .income-lab-toolbar label {
        align-content: start;
      }
      .income-payout-form .btn {
        align-self: start;
        min-height: 44px;
        margin-top: 28px;
      }
      @media (max-width: 760px) {
        .income-payout-form .btn {
          margin-top: 0;
        }
      }
      input.cd10-field-complete,
      select.cd10-field-complete,
      textarea.cd10-field-complete {
        border-color: rgba(29,122,107,.38) !important;
        box-shadow: 0 0 0 3px rgba(29,122,107,.08);
      }
      input.cd10-field-issue,
      select.cd10-field-issue,
      textarea.cd10-field-issue {
        border-color: rgba(185,28,28,.42) !important;
        box-shadow: 0 0 0 3px rgba(185,28,28,.08);
      }
      .cd10-polish-target {
        transition: transform .18s ease, box-shadow .18s ease, border-color .18s ease, background-color .18s ease;
      }
      @media (hover: hover) {
        .cd10-polish-target:hover {
          transform: translateY(-2px);
          box-shadow: 0 16px 38px rgba(15,31,61,.10);
        }
      }
      .empty-state.cd10-empty-polished {
        position: relative;
        border: 1px dashed rgba(15,31,61,.14);
        background:
          linear-gradient(180deg, rgba(255,255,255,.84), rgba(247,244,237,.58));
      }
      .empty-state.cd10-empty-polished::before {
        content: '';
        display: block;
        width: 34px;
        height: 34px;
        margin: 0 auto 10px;
        border-radius: 12px;
        background:
          radial-gradient(circle at 65% 35%, rgba(232,160,48,.95) 0 4px, transparent 5px),
          linear-gradient(135deg, rgba(29,122,107,.16), rgba(15,31,61,.08));
        box-shadow: inset 0 0 0 1px rgba(15,31,61,.08);
      }
      body.cd10-screen-ready main,
      body.cd10-screen-ready .dash-content,
      body.cd10-screen-ready .auth-card {
        animation: cd10-screen-in .26s ease both;
      }
      :focus-visible {
        outline: 3px solid rgba(232,160,48,.52);
        outline-offset: 3px;
      }
      @keyframes cd10-spin {
        to { transform: rotate(360deg); }
      }
      @keyframes cd10-screen-in {
        from { opacity: .88; transform: translateY(4px); }
        to { opacity: 1; transform: translateY(0); }
      }
      @media (max-width: 768px) {
        .cd10-command-trigger {
          min-width: 42px;
          min-height: 42px;
          padding: 0 10px;
          font-size: 0;
        }
        .cd10-command-trigger::before {
          width: 16px;
          height: 16px;
        }
        .cd10-command-overlay { padding-top: 14px; }
        .cd10-command-panel { border-radius: 12px; }
        .cd10-command-title {
          align-items: flex-start;
          flex-direction: column;
        }
        .cd10-command-item {
          grid-template-columns: minmax(0, 1fr);
        }
        .cd10-command-meta {
          justify-content: flex-start;
          width: max-content;
        }
        .cd10-command-foot {
          display: none;
        }
        .cd10-form-progress { padding: 9px 10px; }
        .cd10-connection-banner {
          bottom: max(12px, env(safe-area-inset-bottom));
          border-radius: 12px;
          width: calc(100vw - 24px);
          justify-content: center;
          text-align: center;
        }
      }
      @media (prefers-reduced-motion: reduce) {
        .cd10-connection-banner,
        .cd10-form-progress__bar span,
        .cd10-page-progress,
        .cd10-polish-target,
        body.cd10-screen-ready main,
        body.cd10-screen-ready .dash-content,
        body.cd10-screen-ready .auth-card {
          animation: none !important;
          transition: none;
        }
        .cd10-polish-target:hover { transform: none; }
      }
    `;
    document.head.appendChild(style);
  }

  function showConnectionBanner(message, tone = 'info', duration = 3500) {
    let banner = document.getElementById('cd10-connection-banner');
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'cd10-connection-banner';
      banner.className = 'cd10-connection-banner';
      banner.setAttribute('role', 'status');
      banner.setAttribute('aria-live', 'polite');
      document.body.appendChild(banner);
    }
    banner.dataset.tone = tone;
    banner.textContent = message;
    banner.classList.add('is-visible');
    clearTimeout(showConnectionBanner.timer);
    if (duration) {
      showConnectionBanner.timer = window.setTimeout(() => banner.classList.remove('is-visible'), duration);
    }
  }

  function ensureLiveRegion() {
    let region = document.getElementById('cd10-live-region');
    if (region) return region;
    region = document.createElement('div');
    region.id = 'cd10-live-region';
    region.className = 'cd10-live-region';
    region.setAttribute('role', 'status');
    region.setAttribute('aria-live', 'polite');
    region.setAttribute('aria-atomic', 'true');
    document.body.appendChild(region);
    return region;
  }

  function announce(message) {
    if (!message) return;
    const region = ensureLiveRegion();
    region.textContent = '';
    window.setTimeout(() => {
      region.textContent = message;
    }, 20);
  }

  function ensurePageProgress() {
    let bar = document.getElementById('cd10-page-progress');
    if (bar) return bar;
    bar = document.createElement('div');
    bar.id = 'cd10-page-progress';
    bar.className = 'cd10-page-progress';
    bar.setAttribute('aria-hidden', 'true');
    document.body.appendChild(bar);
    return bar;
  }

  function startPageProgress(message = 'Cargando') {
    const bar = ensurePageProgress();
    clearTimeout(pageProgressTimer);
    bar.classList.remove('is-done');
    bar.classList.add('is-active');
    bar.style.setProperty('--cd10-page-progress', '.54');
    window.setTimeout(() => bar.style.setProperty('--cd10-page-progress', '.82'), 90);
    announce(message);
    pageProgressTimer = window.setTimeout(() => finishPageProgress(), 1800);
  }

  function finishPageProgress(message = '') {
    const bar = document.getElementById('cd10-page-progress');
    if (!bar) return;
    clearTimeout(pageProgressTimer);
    bar.style.setProperty('--cd10-page-progress', '1');
    bar.classList.add('is-done');
    window.setTimeout(() => {
      bar.classList.remove('is-active', 'is-done');
      bar.style.setProperty('--cd10-page-progress', '.54');
    }, 180);
    if (message) announce(message);
  }

  function initPageProgress() {
    ensureLiveRegion();
    ensurePageProgress();
    document.body.classList.add('cd10-screen-ready');
    finishPageProgress('Pantalla lista');

    document.addEventListener('click', (event) => {
      const link = event.target.closest?.('a[href]');
      if (!link || link.target || link.hasAttribute('download')) return;
      let url;
      try {
        url = new URL(link.getAttribute('href'), window.location.href);
      } catch (_) {
        return;
      }
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.hash) return;
      startPageProgress('Abriendo pantalla');
    }, true);

    document.addEventListener('click', (event) => {
      const sectionTrigger = event.target.closest?.('[data-section]');
      if (!sectionTrigger?.dataset.section) return;
      startPageProgress('Cambiando seccion');
      window.setTimeout(() => finishPageProgress('Seccion lista'), 420);
    }, true);

    document.addEventListener('submit', (event) => {
      if (event.target?.checkValidity?.() === false) return;
      startPageProgress('Enviando formulario');
    }, true);

    window.addEventListener('pageshow', () => finishPageProgress());
    window.addEventListener('beforeunload', () => startPageProgress('Cargando'));
  }

  function initConnectionAwareness() {
    if (!('onLine' in navigator)) return;
    const offline = () => {
      showConnectionBanner('Sin conexion. Puedes seguir leyendo; los cambios se guardaran como borrador.', 'warning', 0);
      trackProductEvent('error.captured', {
        category: 'error',
        feature: 'connection',
        severity: 'warning',
        metadata: { state: 'offline' },
      });
    };
    const online = () => {
      showConnectionBanner('Conexion recuperada. Revisa los cambios pendientes antes de enviar.', 'success', 3500);
      trackProductEvent('system.connection.online', {
        category: 'system',
        feature: 'connection',
        metadata: { state: 'online' },
      });
    };
    window.addEventListener('offline', offline);
    window.addEventListener('online', online);
    if (!navigator.onLine) offline();

    window.addEventListener('cd10:pwa-status', (event) => {
      if (event.detail?.type === 'update-ready') {
        showConnectionBanner('Nueva version lista. Se aplicara automaticamente al recargar.', 'success', 6000);
      }
    });
  }

  function shouldSkipSmartForm(form) {
    if (!(form instanceof HTMLFormElement)) return true;
    if (form.dataset.cd10Ux === 'off') return true;
    if (form.closest('.auth-card') || /login|password|reset/i.test(form.id || form.action || window.location.pathname)) return true;
    return Array.from(form.elements || []).some((field) => field.type === 'password');
  }

  function serializableFields(form) {
    return Array.from(form.elements || []).filter((field) => (
      field instanceof HTMLElement
      && field.name
      && !field.disabled
      && !['hidden', 'password', 'file', 'submit', 'button', 'reset'].includes(field.type)
    ));
  }

  function draftKey(form) {
    const id = form.id || form.getAttribute('aria-label') || form.querySelector('button[type="submit"]')?.textContent || 'form';
    return `cd10:draft:${window.location.pathname}:${id.trim().replace(/\s+/g, '-').toLowerCase()}`;
  }

  function readFormDraft(form) {
    try {
      const raw = window.localStorage.getItem(draftKey(form));
      return raw ? JSON.parse(raw) : null;
    } catch (_) {
      return null;
    }
  }

  function writeFormDraft(form) {
    try {
      const data = {};
      for (const field of serializableFields(form)) {
        if (field.type === 'checkbox') data[field.name] = field.checked;
        else if (field.type === 'radio') {
          if (field.checked) data[field.name] = field.value;
        } else {
          data[field.name] = field.value;
        }
      }
      window.localStorage.setItem(draftKey(form), JSON.stringify({ data, savedAt: Date.now() }));
      return true;
    } catch (_) {
      return false;
    }
  }

  function restoreFormDraft(form, status) {
    const draft = readFormDraft(form);
    if (!draft?.data) return;
    let restored = 0;
    for (const field of serializableFields(form)) {
      if (!(field.name in draft.data)) continue;
      if (field.type === 'checkbox') field.checked = Boolean(draft.data[field.name]);
      else if (field.type === 'radio') field.checked = draft.data[field.name] === field.value;
      else if (!field.value) field.value = draft.data[field.name] || '';
      restored += 1;
    }
    if (restored) {
      form.dispatchEvent(new CustomEvent('cd10:draft-restored', { bubbles: true }));
      updateDraftStatus(status, 'restored', 'Borrador recuperado');
      trackProductEvent('form.progress', {
        category: 'forms',
        feature: formAnalyticsName(form),
        entityType: 'form',
        entityId: formAnalyticsName(form),
        metadata: { state: 'draft_restored', restored },
      });
    }
  }

  function clearFormDraft(form) {
    try {
      window.localStorage.removeItem(draftKey(form));
    } catch (_) {}
  }

  function updateDraftStatus(node, state, label) {
    if (!node) return;
    node.dataset.state = state;
    node.textContent = label;
  }

  function requiredProgress(form) {
    const required = serializableFields(form).filter((field) => field.required || field.getAttribute('aria-required') === 'true');
    if (!required.length) return null;
    const complete = required.filter((field) => {
      if (field.type === 'checkbox') return field.checked;
      if (field.type === 'radio') return form.querySelector(`[name="${CSS.escape(field.name)}"]:checked`);
      return String(field.value || '').trim().length > 0 && field.checkValidity();
    }).length;
    return Math.round((complete / required.length) * 100);
  }

  function ensureFormProgress(form) {
    if (form.dataset.cd10Progress === 'true') return form.querySelector('.cd10-form-progress');
    const firstControl = form.querySelector('input, select, textarea');
    if (!firstControl || requiredProgress(form) === null) return null;
    const box = document.createElement('div');
    box.className = 'cd10-form-progress';
    box.innerHTML = `
      <div class="cd10-form-progress__top">
        <span>Progreso del formulario</span>
        <span data-cd10-form-progress-label>0%</span>
      </div>
      <div class="cd10-form-progress__bar" aria-hidden="true"><span></span></div>
    `;
    let anchor = firstControl.closest('.form-group, .cf-field, label') || firstControl;
    while (anchor.parentElement && anchor.parentElement !== form) anchor = anchor.parentElement;
    if (anchor.parentElement === form) form.insertBefore(box, anchor);
    else form.prepend(box);
    form.dataset.cd10Progress = 'true';
    return box;
  }

  function updateFormProgress(form) {
    const progress = requiredProgress(form);
    const box = ensureFormProgress(form);
    if (!box || progress === null) return;
    box.style.setProperty('--cd10-progress', `${progress}%`);
    const label = box.querySelector('[data-cd10-form-progress-label]');
    if (label) label.textContent = `${progress}%`;
  }

  function initSmartForms() {
    document.querySelectorAll('form').forEach((form) => {
      if (shouldSkipSmartForm(form) || form.dataset.cd10SmartForm === 'true') return;
      form.dataset.cd10SmartForm = 'true';
      let formStartedTracked = false;
      const status = document.createElement('div');
      status.className = 'cd10-draft-status';
      status.dataset.state = 'saved';
      status.textContent = 'Sin cambios pendientes';
      form.appendChild(status);
      restoreFormDraft(form, status);
      updateFormProgress(form);

      const save = debounce(() => {
        if (!formStartedTracked) {
          formStartedTracked = true;
          trackProductEvent('form.started', {
            category: 'forms',
            feature: formAnalyticsName(form),
            entityType: 'form',
            entityId: formAnalyticsName(form),
            metadata: { progress: requiredProgress(form) ?? 0 },
          });
        }
        updateFormProgress(form);
        if (writeFormDraft(form)) updateDraftStatus(status, 'dirty', 'Borrador guardado en este dispositivo');
      }, 220);

      form.addEventListener('input', save, true);
      form.addEventListener('change', save, true);
      form.addEventListener('submit', () => {
        trackProductEvent('form.submitted', {
          category: 'forms',
          feature: formAnalyticsName(form),
          entityType: 'form',
          entityId: formAnalyticsName(form),
          metadata: { progress: requiredProgress(form) ?? 100 },
        });
        clearFormDraft(form);
        updateDraftStatus(status, 'saved', 'Enviando cambios');
      }, true);
      window.addEventListener('pagehide', () => {
        const progress = requiredProgress(form);
        if (formStartedTracked && progress !== null && progress > 0 && progress < 100) {
          trackProductEvent('form.abandoned', {
            category: 'forms',
            feature: formAnalyticsName(form),
            entityType: 'form',
            entityId: formAnalyticsName(form),
            metadata: { progress },
          });
        }
      }, { once: true });
    });
  }

  function initProductAnalyticsLayer() {
    analyticsModule().then((module) => module?.installGlobalAnalyticsListeners?.());
    document.addEventListener('click', (event) => {
      const target = event.target.closest('a[href], button, [data-section], [data-action]');
      if (!target) return;
      const label = (target.getAttribute('aria-label') || target.textContent || target.dataset.section || target.dataset.action || target.href || '').trim().replace(/\s+/g, ' ').slice(0, 100);
      if (!label) return;
      const key = `${window.location.pathname}:${label}`;
      const last = clickTelemetry.get(key) || 0;
      if (Date.now() - last < 1500) return;
      clickTelemetry.set(key, Date.now());
      trackProductEvent('cta.click', {
        category: 'interaction',
        feature: target.dataset.section ? 'dashboard_navigation' : 'cta',
        entityType: target.dataset.section ? 'section' : '',
        entityId: target.dataset.section || target.dataset.action || '',
        metadata: {
          label,
          href: target.getAttribute('href') || '',
          section: target.dataset.section || '',
          action: target.dataset.action || '',
        },
      });
    }, true);

    document.addEventListener('change', (event) => {
      const field = event.target;
      if (!field?.matches?.('select, input[type="checkbox"], input[type="radio"]')) return;
      trackProductEvent('filter.used', {
        category: 'search',
        feature: field.id || field.name || 'filter',
        entityType: 'filter',
        entityId: field.id || field.name || '',
        metadata: {
          field: field.id || field.name || '',
          value: field.type === 'checkbox' ? field.checked : field.value,
        },
      });
    }, true);

    document.addEventListener('input', debounce((event) => {
      const field = event.target;
      if (!field?.matches?.('input[type="search"], input[id*="busqueda"], input[id*="filtro"], input[name*="search"]')) return;
      const value = String(field.value || '').trim();
      if (value.length < 2) return;
      trackProductEvent('search.used', {
        category: 'search',
        feature: field.id || field.name || 'search',
        entityType: 'search',
        entityId: field.id || field.name || '',
        metadata: {
          field: field.id || field.name || '',
          query_length: value.length,
        },
      });
    }, 650), true);
  }

  function isDashboard() {
    return Boolean(document.querySelector('.dash-layout'));
  }

  function visibleText(node) {
    return String(node?.textContent || '').replace(/\s+/g, ' ').trim();
  }

  function dashboardRole() {
    const user = window.CD10CurrentUser || {};
    const role = String(user.role || user.rol || '').toLowerCase();
    if (role) return role;
    const path = window.location.pathname;
    if (path.includes('/admin')) return 'admin';
    if (path.includes('/profesor')) return 'profesor';
    if (path.includes('/familia')) return 'familia';
    if (path.includes('/alumno')) return 'alumno';
    return 'dashboard';
  }

  function dashboardRoleLabel(role = dashboardRole()) {
    return {
      admin: 'Admin',
      profesor: 'Profesor',
      familia: 'Familia',
      alumno: 'Alumno',
    }[role] || 'Panel';
  }

  function isNodeActionable(node) {
    if (!(node instanceof HTMLElement) || node.disabled) return false;
    if (node.closest('.cd10-command-overlay')) return false;
    if (node.matches('.sidebar-link[data-section], .topbar button, .topbar a')) return true;
    if (node.offsetParent) return true;
    return false;
  }

  function clickTarget(selector) {
    if (!selector) return false;
    const nodes = Array.from(document.querySelectorAll(selector)).filter((node) => node instanceof HTMLElement && !node.disabled);
    const visible = nodes.find(isNodeActionable) || nodes[0];
    if (!visible) return false;
    visible.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    return true;
  }

  function goToSection(section) {
    if (!section) return false;
    const escaped = window.CSS?.escape ? CSS.escape(section) : section.replace(/"/g, '\\"');
    return clickTarget(`.sidebar-link[data-section="${escaped}"], [data-section="${escaped}"]`);
  }

  function runStructuredCommand(action) {
    if (!action) return;
    closeCommandPalette();
    trackProductEvent('command_palette.action', {
      category: 'navigation',
      feature: 'command_palette',
      entityType: action.category || 'action',
      entityId: action.id || action.label || '',
      metadata: {
        label: action.label || '',
        role: dashboardRole(),
        section: action.section || '',
        source: action.source || '',
      },
    });
    window.setTimeout(() => {
      if (typeof action.run === 'function') {
        action.run();
        return;
      }
      if (action.section) goToSection(action.section);
      if (action.selector) window.setTimeout(() => clickTarget(action.selector), action.section ? 120 : 0);
    }, 20);
  }

  function addCommandAction(actions, seen, config = {}) {
    const label = String(config.label || '').replace(/\s+/g, ' ').trim();
    if (!label || label.length > 80) return;
    const id = config.id || `${config.category || 'accion'}:${config.section || ''}:${config.selector || ''}:${label}`;
    if (seen.has(id)) return;
    seen.add(id);
    actions.push({
      id,
      label,
      hint: config.hint || 'Accion',
      category: config.category || 'Acciones',
      keywords: config.keywords || '',
      selector: config.selector || '',
      section: config.section || '',
      priority: Number(config.priority || 50),
      recommended: Boolean(config.recommended),
      source: config.source || 'runtime',
      run: config.run,
    });
  }

  function rolePlaybookActions(role = dashboardRole()) {
    const shared = [
      { id: 'shared:inicio', label: 'Volver al inicio del panel', hint: 'Resumen y siguiente paso', category: 'Navegacion', section: role === 'admin' ? 'dashboard' : 'inicio', priority: 18, keywords: 'home resumen dashboard inicio' },
    ];
    const byRole = {
      admin: [
        { id: 'admin:solicitudes', label: 'Revisar solicitudes y matching', hint: 'Asignar profesores y desbloquear familias', category: 'Marketplace', section: 'solicitudes', priority: 4, recommended: true, keywords: 'matching profesor asignar leads familias' },
        { id: 'admin:mission-control', label: 'Abrir centro de control', hint: 'Estado completo de la plataforma', category: 'Operacion', section: 'dashboard', priority: 6, keywords: 'mission control metricas alertas salud' },
        { id: 'admin:ia', label: 'Preguntar a la IA admin', hint: 'Analisis operativo con datos estructurados', category: 'IA', section: 'ia', priority: 8, keywords: 'resumen semana churn pagos profesores' },
        { id: 'admin:incidencias', label: 'Gestionar incidencias abiertas', hint: 'Tickets, prioridad y resolucion', category: 'Operacion', section: 'incidencias', priority: 10, keywords: 'problemas tickets soporte alerta' },
        { id: 'admin:finanzas', label: 'Ver centro financiero', hint: 'Ingresos, pagos, comisiones y previsiones', category: 'Finanzas', section: 'finanzas', priority: 12, keywords: 'pagos bizum stripe comisiones dinero erp' },
        { id: 'admin:profesores', label: 'Buscar profesores', hint: 'Perfiles, verificacion y confianza', category: 'CRM', section: 'profesores', priority: 14, keywords: 'profesor reputacion documentos disponibilidad' },
        { id: 'admin:familias', label: 'Buscar familias', hint: 'CRM familiar, alumnos y actividad', category: 'CRM', section: 'familias', priority: 16, keywords: 'familia alumno pagos solicitudes' },
        { id: 'admin:config', label: 'Configurar plataforma', hint: 'Reglas, feature flags y parametros', category: 'Sistema', section: 'configuracion', priority: 20, keywords: 'feature flags reglas precios matching ia' },
      ],
      familia: [
        { id: 'familia:next', label: 'Hacer mi siguiente paso', hint: 'La guia decide que toca ahora', category: 'Recomendado', section: 'inicio', selector: '.family-journey-card [data-family-journey-action]', priority: 1, recommended: true, keywords: 'siguiente paso guia hijo solicitud profesor chat pago' },
        { id: 'familia:add-student', label: 'Anadir hijo/a', hint: 'Registrar alumno y continuar con solicitud', category: 'Familia', section: 'alumnos', selector: '#btn-nuevo-hijo, [data-family-journey-action="add_student"]', priority: 5, keywords: 'alumno hijo estudiante' },
        { id: 'familia:request', label: 'Solicitar profesor', hint: 'Materia, nivel y horario preferido', category: 'Familia', section: 'solicitudes', selector: '#btn-nueva-solicitud, #btn-nueva-solicitud-top, [data-family-journey-action="request_teacher"]', priority: 6, keywords: 'profesor matching materia solicitud' },
        { id: 'familia:chat', label: 'Abrir chat y notificaciones', hint: 'Mensajes, horarios y avisos', category: 'Comunicacion', section: 'chat', priority: 8, keywords: 'mensaje notificacion profesor horario' },
        { id: 'familia:calendar', label: 'Ver calendario de clases', hint: 'Fechas, asistencia y confirmaciones', category: 'Clases', section: 'calendario', priority: 11, keywords: 'clase fecha hora confirmar' },
        { id: 'familia:payments', label: 'Ver justificantes', hint: 'Estado de justificantes pendientes', category: 'Justificantes', section: 'pagos', priority: 12, keywords: 'justificante comprobante pendiente' },
        { id: 'familia:profile', label: 'Completar perfil familiar', hint: 'Datos para asignaciones mas precisas', category: 'Confianza', section: 'perfil', priority: 15, keywords: 'direccion telefono zona perfil' },
      ],
      profesor: [
        { id: 'profesor:next', label: 'Hacer mi siguiente paso', hint: 'La guia decide que toca ahora', category: 'Recomendado', section: 'inicio', selector: '.teacher-journey-card [data-teacher-journey-action]', priority: 1, recommended: true, keywords: 'siguiente paso profesor perfil documentos chat clase cobro' },
        { id: 'profesor:profile', label: 'Completar perfil profesional', hint: 'Foto, estudios, materias y confianza', category: 'Confianza', section: 'perfil', priority: 3, recommended: true, keywords: 'perfil foto estudios colegio notas materias idiomas' },
        { id: 'profesor:availability', label: 'Actualizar disponibilidad', hint: 'Franjas reales para recibir propuestas', category: 'Alumnos', section: 'disponibilidad', selector: '#btn-add-disponibilidad', priority: 5, keywords: 'horario disponibilidad calendario' },
        { id: 'profesor:documents', label: 'Subir documentos', hint: 'DNI, notas, certificados y curriculum opcional', category: 'Confianza', section: 'documentos', selector: '#btn-subir-doc', priority: 7, keywords: 'dni notas expediente curriculum certificado idiomas documentos verificacion' },
        { id: 'profesor:classes', label: 'Ver mis clases', hint: 'Registrar asistencia e incidencias', category: 'Clases', section: 'clases', priority: 9, keywords: 'clases asistencia realizada cancelar' },
        { id: 'profesor:chat', label: 'Abrir chat y notificaciones', hint: 'Familias, horarios y avisos', category: 'Comunicacion', section: 'chat', priority: 10, keywords: 'mensaje familia alumno horario' },
        { id: 'profesor:income', label: 'Revisar ingresos', hint: 'Cobros, Bizum y liquidaciones', category: 'Pagos', section: 'ingresos', priority: 12, keywords: 'dinero pagos bizum ingresos' },
      ],
      alumno: [
        { id: 'alumno:next-class', label: 'Ver proxima clase', hint: 'Calendario y horario', category: 'Clases', section: 'calendario', priority: 5, recommended: true, keywords: 'proxima clase fecha hora' },
        { id: 'alumno:classes', label: 'Ver mis clases', hint: 'Historial y estado', category: 'Clases', section: 'clases', priority: 8, keywords: 'historial asistencia' },
        { id: 'alumno:teacher', label: 'Ver mi profesor', hint: 'Contacto y especialidades', category: 'Profesor', section: 'profesor', priority: 10, keywords: 'profesor contacto materia' },
      ],
    };
    return [...shared, ...(byRole[role] || [])];
  }

  function dynamicRecommendedActions() {
    const actions = [];
    const familyPrimary = document.querySelector('.family-journey-card [data-family-journey-action]');
    if (familyPrimary) {
      actions.push({
        id: 'dynamic:family-primary',
        label: visibleText(familyPrimary) || 'Hacer siguiente paso',
        hint: 'Recomendado por la guia de familia',
        category: 'Recomendado',
        selector: '.family-journey-card [data-family-journey-action]',
        section: 'inicio',
        priority: 0,
        recommended: true,
        keywords: 'siguiente recomendado familia',
      });
    }
    const teacherPrimary = document.querySelector('.teacher-journey-card [data-teacher-journey-action]');
    if (teacherPrimary) {
      actions.push({
        id: 'dynamic:teacher-primary',
        label: visibleText(teacherPrimary) || 'Hacer siguiente paso',
        hint: 'Recomendado por la guia de profesor',
        category: 'Recomendado',
        selector: '.teacher-journey-card [data-teacher-journey-action]',
        section: 'inicio',
        priority: 0,
        recommended: true,
        keywords: 'siguiente recomendado profesor',
      });
    }
    const badge = document.getElementById('notif-badge');
    if (badge && window.getComputedStyle(badge).display !== 'none' && visibleText(badge)) {
      const chatSection = document.querySelector('[data-section="chat"]') ? 'chat' : 'chats';
      actions.push({
        id: 'dynamic:notifications',
        label: `Ver ${visibleText(badge)} notificaciones`,
        hint: 'Actividad nueva',
        category: 'Recomendado',
        section: chatSection,
        selector: '[data-chat-tab="notificaciones"]',
        priority: 2,
        recommended: true,
        keywords: 'notificaciones mensajes avisos inbox',
      });
    }
    return actions;
  }

  function dashboardActions() {
    const actions = [];
    const seen = new Set();
    [...dynamicRecommendedActions(), ...rolePlaybookActions()].forEach((action) => addCommandAction(actions, seen, { ...action, source: action.source || 'playbook' }));

    document.querySelectorAll('.sidebar-link[data-section]').forEach((node) => {
      const section = node.dataset.section;
      const label = visibleText(node) || section;
      addCommandAction(actions, seen, {
        id: `section:${section}`,
        label,
        hint: 'Ir a seccion',
        category: 'Navegacion',
        section,
        priority: 30,
        keywords: section,
        run: () => node.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })),
      });
    });

    document.querySelectorAll('.topbar button[id], .dash-section:not([style*="display:none"]) button[id], .dash-section:not([style*="display: none"]) button[data-action], .dash-section:not([style*="display:none"]) .btn').forEach((node) => {
      if (!isNodeActionable(node)) return;
      const label = visibleText(node) || node.getAttribute('aria-label') || node.title;
      const key = `action:${node.id || node.dataset.action || label}`;
      addCommandAction(actions, seen, {
        id: key,
        label,
        hint: node.dataset.action ? 'Accion de la pantalla actual' : 'Accion visible',
        category: 'Acciones visibles',
        priority: 40,
        keywords: `${node.id || ''} ${node.dataset.action || ''}`,
        run: () => node.click(),
      });
    });

    return actions.sort((a, b) => {
      if (a.recommended !== b.recommended) return a.recommended ? -1 : 1;
      if (a.priority !== b.priority) return a.priority - b.priority;
      return a.label.localeCompare(b.label, 'es');
    });
  }

  function ensureCommandPalette() {
    let overlay = document.getElementById('cd10-command-overlay');
    if (overlay) return overlay;
    overlay = document.createElement('div');
    overlay.id = 'cd10-command-overlay';
    overlay.className = 'cd10-command-overlay';
    overlay.innerHTML = `
      <div class="cd10-command-panel" role="dialog" aria-modal="true" aria-label="Acciones rapidas">
        <div class="cd10-command-head">
          <div class="cd10-command-title">
            <span>Centro de acciones ${escapeHtml(dashboardRoleLabel())}</span>
            <span class="cd10-command-kbd"><kbd>Ctrl</kbd><kbd>K</kbd></span>
          </div>
          <input class="cd10-command-input" type="search" placeholder="Buscar secciones, acciones o flujos..." autocomplete="off" aria-label="Buscar acciones">
        </div>
        <div class="cd10-command-list" role="listbox"></div>
        <div class="cd10-command-foot">
          <span>Arriba/abajo para moverte</span>
          <span>Enter ejecuta · Esc cierra</span>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) closeCommandPalette();
    });
    overlay.querySelector('.cd10-command-input').addEventListener('input', () => renderCommandPalette());
    overlay.querySelector('.cd10-command-input').addEventListener('keydown', handleCommandPaletteKeydown);
    return overlay;
  }

  function commandMatches(action, query) {
    const tokens = String(query || '').trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!tokens.length) return true;
    const haystack = [
      action.label,
      action.hint,
      action.category,
      action.keywords,
      action.section,
    ].join(' ').toLowerCase();
    return tokens.every((token) => haystack.includes(token));
  }

  function groupedCommandHtml(actions) {
    let lastCategory = '';
    return actions.map((action, index) => {
      const category = action.category || 'Acciones';
      const group = category !== lastCategory
        ? `<div class="cd10-command-group">${escapeHtml(category)}</div>`
        : '';
      lastCategory = category;
      const meta = action.recommended ? 'Recomendado' : (action.section ? 'Ir' : 'Abrir');
      return `${group}
        <button type="button" class="cd10-command-item ${index === commandPaletteSelection ? 'is-active' : ''} ${action.recommended ? 'is-recommended' : ''}" data-command-index="${index}" role="option" aria-selected="${index === commandPaletteSelection ? 'true' : 'false'}">
          <span class="cd10-command-copy">
            <strong>${escapeHtml(action.label)}</strong>
            <span>${escapeHtml(action.hint)}</span>
          </span>
          <span class="cd10-command-meta">${escapeHtml(meta)}</span>
        </button>`;
    }).join('');
  }

  function renderCommandPalette() {
    const overlay = ensureCommandPalette();
    const input = overlay.querySelector('.cd10-command-input');
    const list = overlay.querySelector('.cd10-command-list');
    const query = input.value.trim().toLowerCase();
    commandPaletteActions = dashboardActions().filter((action) => commandMatches(action, query)).slice(0, 14);
    commandPaletteSelection = Math.max(0, Math.min(commandPaletteSelection, commandPaletteActions.length - 1));
    if (!commandPaletteActions.length) {
      list.innerHTML = '<div class="cd10-command-empty">No hay acciones para esa busqueda.</div>';
      return;
    }
    list.innerHTML = groupedCommandHtml(commandPaletteActions);
    list.querySelectorAll('[data-command-index]').forEach((button) => {
      button.addEventListener('mouseenter', () => {
        commandPaletteSelection = Number(button.dataset.commandIndex);
        list.querySelectorAll('.cd10-command-item').forEach((item) => item.classList.toggle('is-active', item === button));
      });
      button.addEventListener('click', () => {
        runStructuredCommand(commandPaletteActions[Number(button.dataset.commandIndex)]);
      });
    });
  }

  function handleCommandPaletteKeydown(event) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (commandPaletteActions.length) commandPaletteSelection = (commandPaletteSelection + 1) % commandPaletteActions.length;
      renderCommandPalette();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (commandPaletteActions.length) commandPaletteSelection = (commandPaletteSelection - 1 + commandPaletteActions.length) % commandPaletteActions.length;
      renderCommandPalette();
    } else if (event.key === 'Enter') {
      event.preventDefault();
      runStructuredCommand(commandPaletteActions[commandPaletteSelection]);
    }
  }

  function openCommandPalette(seed = '') {
    if (!isDashboard()) return;
    const overlay = ensureCommandPalette();
    overlay.classList.add('open');
    const input = overlay.querySelector('.cd10-command-input');
    input.value = seed;
    commandPaletteSelection = 0;
    renderCommandPalette();
    window.setTimeout(() => input.focus(), 20);
  }

  function closeCommandPalette() {
    const overlay = document.getElementById('cd10-command-overlay');
    overlay?.classList.remove('open');
  }

  function syncDashboardHash(section) {
    if (!section || !history.replaceState) return;
    const target = `#${section}`;
    if (window.location.hash !== target) {
      history.replaceState(null, '', target);
    }
  }

  function initDashboardCommandPalette() {
    if (!isDashboard()) return;
    let topbarActions = document.querySelector('.topbar-actions');
    if (!topbarActions) {
      const topbar = document.querySelector('.topbar');
      if (topbar) {
        topbarActions = document.createElement('div');
        topbarActions.className = 'topbar-actions';
        topbar.appendChild(topbarActions);
      }
    }
    if (topbarActions && !document.getElementById('cd10-command-trigger')) {
      const trigger = document.createElement('button');
      trigger.id = 'cd10-command-trigger';
      trigger.className = 'cd10-command-trigger';
      trigger.type = 'button';
      trigger.textContent = 'Acciones / Ctrl K';
      trigger.setAttribute('aria-label', 'Abrir centro de acciones');
      trigger.addEventListener('click', () => openCommandPalette());
      topbarActions.prepend(trigger);
    }

    document.addEventListener('keydown', (event) => {
      const target = event.target;
      const typing = target instanceof HTMLElement && target.matches('input, textarea, select, [contenteditable="true"]');
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        openCommandPalette();
        return;
      }
      if (event.key === 'Escape') closeCommandPalette();
      if (!typing && event.key === '/') {
        event.preventDefault();
        openCommandPalette();
      }
    });

    document.addEventListener('click', (event) => {
      const trigger = event.target.closest?.('[data-section]');
      if (trigger?.dataset.section) window.setTimeout(() => syncDashboardHash(trigger.dataset.section), 0);
    });

    const initial = window.location.hash.replace(/^#section-?/, '').replace(/^#/, '');
    if (initial) {
      const trigger = document.querySelector(`.sidebar-link[data-section="${CSS.escape(initial)}"]`);
      if (trigger) window.setTimeout(() => trigger.click(), 80);
    }
  }

  function initDashboardSearchAssist() {
    const input = document.getElementById('busqueda-global');
    if (!input || input.dataset.cd10SearchAssist === 'true') return;
    input.dataset.cd10SearchAssist = 'true';
    input.placeholder = 'Buscar en la seccion actual...';
    const count = document.createElement('span');
    count.className = 'cd10-global-search-count';
    input.closest('.topbar-search')?.appendChild(count);

    const apply = debounce(() => {
      const section = Array.from(document.querySelectorAll('.dash-section'))
        .find((item) => window.getComputedStyle(item).display !== 'none')
        || document.querySelector('.dash-section');
      const query = input.value.trim().toLowerCase();
      const rows = Array.from(section?.querySelectorAll('tbody tr, .list-item, .prof-card, .card-row') || []);
      let visible = 0;
      rows.forEach((row) => {
        const match = !query || visibleText(row).toLowerCase().includes(query);
        row.style.display = match ? '' : 'none';
        row.dataset.cd10HiddenBySearch = match ? 'false' : 'true';
        if (match) visible += 1;
      });
      count.textContent = query && rows.length ? `${visible}/${rows.length}` : '';
    }, 120);

    input.addEventListener('input', apply);
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && input.value.trim()) {
        event.preventDefault();
        openCommandPalette(input.value.trim());
      }
    });
  }

  function clearButtonPending(button) {
    if (!(button instanceof HTMLElement)) return;
    const timer = pendingButtonTimers.get(button);
    if (timer) clearTimeout(timer);
    pendingButtonTimers.delete(button);
    delete button.dataset.cd10ActionLockUntil;
    button.classList.remove('cd10-is-loading');
    button.removeAttribute('aria-busy');
    button.querySelector?.('.cd10-button-spinner')?.remove();
  }

  function clearFormPending(form) {
    if (!(form instanceof HTMLFormElement)) return;
    const timer = pendingFormTimers.get(form);
    if (timer) clearTimeout(timer);
    pendingFormTimers.delete(form);
    delete form.dataset.cd10SubmitLockUntil;
  }

  function timestampLockActive(node, key) {
    if (!(node instanceof HTMLElement)) return false;
    const until = Number(node.dataset[key] || 0);
    if (!until) return false;
    if (Date.now() <= until) return true;
    delete node.dataset[key];
    return false;
  }

  function isActionLocked(button) {
    return timestampLockActive(button, 'cd10ActionLockUntil');
  }

  function isSubmitLocked(form) {
    return timestampLockActive(form, 'cd10SubmitLockUntil');
  }

  function setButtonPending(button, timeout = 1600) {
    if (!(button instanceof HTMLElement) || button.disabled || button.dataset.cd10Ux === 'off') return;
    button.dataset.cd10ActionLockUntil = String(Date.now() + timeout);
    button.classList.add('cd10-is-loading');
    button.setAttribute('aria-busy', 'true');
    if (button.tagName === 'BUTTON' && !button.querySelector('.cd10-button-spinner')) {
      const spinner = document.createElement('span');
      spinner.className = 'cd10-button-spinner';
      spinner.setAttribute('aria-hidden', 'true');
      button.appendChild(spinner);
    }
    const previous = pendingButtonTimers.get(button);
    if (previous) clearTimeout(previous);
    pendingButtonTimers.set(button, window.setTimeout(() => clearButtonPending(button), timeout));
  }

  function setFormPending(form, timeout = 6500) {
    if (!(form instanceof HTMLFormElement) || form.dataset.cd10Ux === 'off') return;
    form.dataset.cd10SubmitLockUntil = String(Date.now() + timeout);
    const previous = pendingFormTimers.get(form);
    if (previous) clearTimeout(previous);
    pendingFormTimers.set(form, window.setTimeout(() => clearFormPending(form), timeout));
  }

  function isActionFeedbackTarget(node) {
    if (!(node instanceof HTMLElement) || node.disabled) return false;
    if (node.closest('.cd10-command-overlay, .sidebar, [data-close-modal], .modal-close')) return false;
    if (node.matches('input[type="submit"], button[type="submit"]')) return true;
    if (!node.matches('button, [role="button"], .btn')) return false;
    const label = visibleText(node).toLowerCase();
    return /\b(guardar|enviar|crear|actualizar|subir|aceptar|confirmar|asignar|programar|marcar|generar|aplicar|publicar|invitar|resolver|validar)\b/.test(label);
  }

  function initActionFeedback() {
    document.addEventListener('click', (event) => {
      const target = event.target.closest?.('button, [role="button"], .btn, input[type="submit"]');
      if (!isActionFeedbackTarget(target)) return;
      if (isActionLocked(target)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        announce('Accion ya en curso');
        return;
      }
      setButtonPending(target, target.matches?.('button[type="submit"], input[type="submit"]') ? 5200 : 1300);
      announce(visibleText(target) ? `${visibleText(target)} en curso` : 'Accion en curso');
    }, true);

    document.addEventListener('submit', (event) => {
      const form = event.target;
      if (!(form instanceof HTMLFormElement)) return;
      if (form.checkValidity?.() === false) {
        announce('Revisa los campos marcados antes de continuar');
        finishPageProgress();
        return;
      }
      if (isSubmitLocked(form)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        announce('Accion ya en curso');
        return;
      }
      setFormPending(form, 6500);
      const submitter = event.submitter || form.querySelector('button[type="submit"], input[type="submit"]');
      if (submitter instanceof HTMLElement) setButtonPending(submitter, 6500);
    }, true);

    document.addEventListener('invalid', () => {
      announce('Hay un campo que necesita revision');
      finishPageProgress();
    }, true);

    window.addEventListener('cd10:action-complete', (event) => {
      const button = event.detail?.button;
      if (button instanceof HTMLElement) clearButtonPending(button);
      const form = event.detail?.form;
      if (form instanceof HTMLFormElement) clearFormPending(form);
      finishPageProgress(event.detail?.message || '');
    });
  }

  function fieldContext(field) {
    const label = field.labels?.[0]?.textContent || '';
    return [
      field.id,
      field.name,
      field.placeholder,
      field.getAttribute('aria-label'),
      label,
    ].filter(Boolean).join(' ').toLowerCase();
  }

  function hintForField(field) {
    if (!(field instanceof HTMLElement)) return '';
    if (field.closest('.auth-card')) return '';
    if (['hidden', 'password', 'submit', 'button', 'reset'].includes(field.type)) return '';
    if (isCompactFieldContext(field)) return '';
    const context = fieldContext(field);
    const rules = [
      [/email|correo/, 'Este correo se usara para acceso y avisos importantes.'],
      [/telefono|movil|phone/, 'Añade un teléfono de contacto para recibir avisos importantes.'],
      [/direccion|calle|zona|codigo postal|postal|cp\b/, 'Indica dónde puedes dar o recibir clases presenciales.'],
      [/materia|asignatura|especialidad|subject/, 'Incluye materias escolares y extraescolares: padel, piano, guitarra o programacion.'],
      [/preferencias educativas|observaciones|notas|seguimiento/, 'Cuenta lo que debe saber el profesor: objetivos, dificultades, ritmo y preferencias de clase.'],
      [/disponibilidad|horario|franja|availability/, 'Usa franjas reales; el matching las tendra en cuenta.'],
      [/bio|descripcion|experiencia|formacion|estudios|colegio|universidad/, 'Cuenta datos concretos y verificables para aumentar confianza.'],
      [/document|dni|titulo|certificado|verificacion/, 'Sube documentos solo si el equipo los solicita; quedan en revision privada.'],
      [/foto|imagen|avatar|photo|file/, 'Adjunta un archivo claro y legible; si es foto de perfil, evita imagenes borrosas.'],
      [/bizum/, 'Marca Bizum solo si puedes recibir pagos por ese canal.'],
      [/alumno|hijo|estudiante/, 'Estos datos ayudan a asignar el profesor mas adecuado.'],
    ];
    const found = rules.find(([pattern]) => pattern.test(context));
    return found?.[1] || '';
  }

  function isCompactFieldContext(field) {
    return Boolean(field.closest([
      '.income-lab-toolbar',
      '.student-section-toolbar',
      '.ops-toolbar',
      '.calendar-actions-bar',
      '.topbar',
      '.table-wrapper thead',
      '[data-no-smart-hints]',
    ].join(',')));
  }

  function updateFieldFeedback(field) {
    if (!(field instanceof HTMLElement) || ['hidden', 'password', 'submit', 'button', 'reset'].includes(field.type)) return;
    const hasValue = field.type === 'checkbox'
      ? field.checked
      : String(field.value || '').trim().length > 0;
    const valid = !hasValue || field.checkValidity?.() !== false;
    field.classList.toggle('cd10-field-complete', Boolean(hasValue && valid));
    field.classList.toggle('cd10-field-issue', Boolean(hasValue && !valid));
  }

  function bindFieldFeedback(field) {
    if (!(field instanceof HTMLElement) || field.dataset.cd10FieldFeedback === 'true') return;
    if (!field.matches('input, select, textarea')) return;
    field.dataset.cd10FieldFeedback = 'true';
    updateFieldFeedback(field);
    field.addEventListener('input', () => updateFieldFeedback(field));
    field.addEventListener('change', () => updateFieldFeedback(field));
  }

  function addSmartHint(field) {
    if (!(field instanceof HTMLElement) || field.dataset.cd10HintBound === 'true') return;
    if (isCompactFieldContext(field)) return;
    const group = field.closest('.form-group, .cf-field, .field, .input-group');
    const uploadZone = field.type === 'file' ? field.closest('.upload-zone') : null;
    if (!group && !uploadZone) return;
    const hint = hintForField(field);
    if (!hint) return;
    const id = `cd10-hint-${field.id || field.name || Math.random().toString(36).slice(2)}`.replace(/[^a-z0-9_-]/gi, '-');
    if (document.getElementById(id)) return;
    const node = document.createElement('small');
    node.id = id;
    node.className = 'cd10-smart-hint';
    node.textContent = hint;
    const describedBy = field.getAttribute('aria-describedby');
    field.setAttribute('aria-describedby', describedBy ? `${describedBy} ${id}` : id);
    if (uploadZone) {
      uploadZone.querySelectorAll('.cd10-smart-hint').forEach((item) => item.remove());
      uploadZone.insertAdjacentElement('afterend', node);
    } else if (group) {
      if (group.querySelector('.cd10-smart-hint')) {
        field.dataset.cd10HintBound = 'true';
        return;
      }
      group.appendChild(node);
    }
    field.dataset.cd10HintBound = 'true';
  }

  function enhanceFieldDetails(root = document) {
    root.querySelectorAll?.([
      '.income-lab-toolbar .cd10-smart-hint',
      '.student-section-toolbar .cd10-smart-hint',
      '.ops-toolbar .cd10-smart-hint',
      '.calendar-actions-bar .cd10-smart-hint',
      '.topbar .cd10-smart-hint',
      '[data-no-smart-hints] .cd10-smart-hint',
    ].join(',')).forEach((hint) => hint.remove());
    root.querySelectorAll?.('input, select, textarea').forEach((field) => {
      bindFieldFeedback(field);
      addSmartHint(field);
    });
  }

  function initMicroInteractions(root = document) {
    const selector = [
      '.card',
      '.dash-card',
      '.stat-card',
      '.metric-card',
      '.prof-card',
      '.feature-card',
      '.quick-action',
      '.list-item',
      '.payment-card',
      '.class-card',
      '.crm-card',
      '.notification-card',
    ].join(',');
    root.querySelectorAll?.(selector).forEach((node) => {
      if (!(node instanceof HTMLElement)) return;
      if (node.closest('.cd10-command-overlay, .cd10-install-card')) return;
      node.classList.add('cd10-polish-target');
    });
  }

  function initTooltips(root = document) {
    root.querySelectorAll?.('[title], [aria-label]').forEach((node) => {
      if (!(node instanceof HTMLElement) || node.dataset.cd10TooltipBound === 'true') return;
      const label = node.getAttribute('title') || node.getAttribute('aria-label');
      if (!label || label.length > 90) return;
      node.dataset.cd10Tooltip = label;
      node.dataset.cd10TooltipBound = 'true';
      node.classList.add('cd10-tooltip-anchor');
      if (!node.getAttribute('aria-label')) node.setAttribute('aria-label', label);
    });
  }

  function contextActionFor(sectionId) {
    const key = String(sectionId || '').replace(/^section-/, '');
    const map = {
      solicitudes: ['Crear o revisar solicitud', '[data-action="abrir-modal-solicitud"], #btn-nueva-solicitud-top, [data-section="solicitudes"]'],
      profesores: ['Revisar perfiles', '[data-section="profesores"]'],
      pagos: ['Ver finanzas', '[data-section="finanzas"], [data-section="pagos"]'],
      clases: ['Ir al calendario', '[data-section="calendario"]'],
      calendario: ['Ver clases', '[data-section="clases"]'],
      chat: ['Ver notificaciones', '[data-chat-tab="notificaciones"], [data-section="chats"]'],
      chats: ['Ver notificaciones', '[data-chat-tab="notificaciones"], [data-section="chats"]'],
      documentos: ['Subir o revisar documentos', '[data-section="documentos"]'],
    };
    return map[key] || null;
  }

  function enhanceEmptyStates(root = document) {
    root.querySelectorAll?.('.empty-state').forEach((empty) => {
      if (empty.dataset.cd10Polished !== 'true') {
        empty.classList.add('cd10-empty-polished');
        empty.dataset.cd10Polished = 'true';
        if (!visibleText(empty)) {
          const description = document.createElement('p');
          description.className = 'empty-desc';
          description.textContent = 'No hay elementos todavia.';
          empty.appendChild(description);
        }
      }
      if (empty.dataset.cd10Enhanced === 'true' || empty.querySelector('button, a')) return;
      const section = empty.closest('.dash-section');
      const action = contextActionFor(section?.id);
      if (!action) return;
      const [label, selector] = action;
      const target = document.querySelector(selector);
      if (!target) return;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'cd10-context-action';
      button.textContent = label;
      button.addEventListener('click', () => target.click());
      empty.appendChild(button);
      empty.dataset.cd10Enhanced = 'true';
    });
  }

  function polishDynamicNode(root = document) {
    enhanceEmptyStates(root);
    enhanceFieldDetails(root);
    initMicroInteractions(root);
    initTooltips(root);
  }

  function initEmptyStateObserver() {
    polishDynamicNode();
    if (typeof MutationObserver === 'undefined') return;
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node instanceof HTMLElement) polishDynamicNode(node);
        });
      });
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  function initProductUxLayer() {
    injectProductUxStyles();
    initPageProgress();
    initProductAnalyticsLayer();
    initConnectionAwareness();
    initSmartForms();
    enhanceFieldDetails();
    initActionFeedback();
    initMicroInteractions();
    initDashboardCommandPalette();
    initDashboardSearchAssist();
    initTooltips();
    initEmptyStateObserver();
    window.CD10ProductUX = {
      openCommandPalette,
      enhanceEmptyStates,
      enhanceFieldDetails,
      initSmartForms,
      startPageProgress,
      finishPageProgress,
      announce,
    };
  }

  function injectStyles() {
    if (document.getElementById('cd10-install-styles')) return;

    const style = document.createElement('style');
    style.id = 'cd10-install-styles';
    style.textContent = `
      .cd10-install-card {
        position: fixed;
        right: max(16px, env(safe-area-inset-right));
        bottom: max(16px, env(safe-area-inset-bottom));
        z-index: 2147483000;
        width: min(360px, calc(100vw - 32px));
        background: #fff;
        color: #0f1f3d;
        border: 1px solid rgba(15,31,61,.12);
        border-radius: 14px;
        box-shadow: 0 18px 60px rgba(0,0,0,.22);
        padding: 16px;
        font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      .cd10-install-card[hidden] { display: none; }
      .cd10-install-card__top { display: flex; gap: 12px; align-items: flex-start; }
      .cd10-install-card img { width: 42px; height: 42px; border-radius: 10px; flex: 0 0 auto; }
      .cd10-install-card strong { display: block; font-size: .98rem; line-height: 1.25; margin-bottom: 4px; }
      .cd10-install-card p { margin: 0; color: #5d6678; font-size: .84rem; line-height: 1.45; }
      .cd10-install-card__actions { display: flex; gap: 8px; margin-top: 14px; }
      .cd10-install-card button {
        min-height: 44px;
        border-radius: 9px;
        border: 0;
        padding: 9px 13px;
        font: inherit;
        font-weight: 750;
        cursor: pointer;
      }
      .cd10-install-card__primary { background: #e8a030; color: #0f1f3d; flex: 1; }
      .cd10-install-card__secondary { background: #f0ede6; color: #31405d; }
      .cd10-install-card__steps { margin-top: 10px; font-size: .8rem; color: #5d6678; line-height: 1.5; }
      @media (max-width: 520px) {
        .cd10-install-card {
          left: 12px;
          right: 12px;
          bottom: max(12px, env(safe-area-inset-bottom));
          width: auto;
          padding: 14px;
          border-radius: 12px;
        }
        .cd10-install-card__top {
          gap: 10px;
        }
        .cd10-install-card img {
          width: 34px;
          height: 34px;
          border-radius: 8px;
        }
        .cd10-install-card strong {
          font-size: .9rem;
        }
        .cd10-install-card p {
          font-size: .78rem;
        }
        .cd10-install-card__actions {
          display: grid;
          grid-template-columns: 1fr;
        }
        .cd10-install-card button {
          width: 100%;
          min-height: 44px;
          padding: 8px 10px;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function hideInstallCard(remember) {
    if (remember) rememberDismiss();
    if (installCard) {
      installCard.hidden = true;
      installCard.remove();
      installCard = null;
    }
  }

  function showInstallCard(mode) {
    if (!canShow() || installCard || document.getElementById(INSTALL_ID)) return;

    injectStyles();
    installCard = document.createElement('aside');
    installCard.id = INSTALL_ID;
    installCard.className = 'cd10-install-card';
    installCard.setAttribute('role', 'dialog');
    installCard.setAttribute('aria-live', 'polite');
    installCard.setAttribute('aria-label', 'Instalar panel de ClasesDe10');

    const iosSteps = mode === 'ios'
      ? '<div class="cd10-install-card__steps">En iPhone: pulsa Compartir y despues "Anadir a pantalla de inicio".</div>'
      : '';

    installCard.innerHTML = `
      <div class="cd10-install-card__top">
        <img src="/assets/img/logo-192.png" alt="" width="42" height="42">
        <div>
          <strong>Instala tu panel de ClasesDe10</strong>
          <p>El icono abre el acceso a tu cuenta. Si ya tienes sesion, entraras directo a tu panel.</p>
          ${iosSteps}
        </div>
      </div>
      <div class="cd10-install-card__actions">
        <button class="cd10-install-card__primary" type="button" data-pwa-install>${mode === 'ios' ? 'Como instalar' : 'Instalar panel'}</button>
        <button class="cd10-install-card__secondary" type="button" data-pwa-dismiss>Ahora no</button>
      </div>
    `;

    installCard.querySelector('[data-pwa-dismiss]').addEventListener('click', () => {
      hideInstallCard(true);
    });

    installCard.querySelector('[data-pwa-install]').addEventListener('click', async () => {
      if (deferredPrompt) {
        deferredPrompt.prompt();
        const choice = await deferredPrompt.userChoice;
        deferredPrompt = null;
        if (choice && choice.outcome === 'accepted') {
          hideInstallCard(true);
        }
        return;
      }

      if (mode === 'ios') {
        installCard.querySelector('.cd10-install-card__steps').textContent =
          'Abre el menu Compartir de Safari y elige "Anadir a pantalla de inicio". El acceso abrira tu login/panel.';
      }
    });

    document.body.appendChild(installCard);
  }

  function bindServiceWorkerUpdates(registration) {
    const notifyReady = (detail) => {
      window.dispatchEvent(new CustomEvent('cd10:pwa-status', { detail }));
    };

    const watchWorker = (worker) => {
      if (!worker) return;
      worker.addEventListener('statechange', () => {
        if (worker.state === 'installed' && navigator.serviceWorker.controller) {
          worker.postMessage({ type: 'SKIP_WAITING' });
          notifyReady({ type: 'update-ready' });
        }
      });
    };

    watchWorker(registration.installing);
    registration.addEventListener('updatefound', () => watchWorker(registration.installing));
    notifyReady({ type: 'registered', scope: registration.scope });
  }

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', async () => {
      try {
        const registration = await navigator.serviceWorker.register('/service-worker.js', { scope: '/' });
        bindServiceWorkerUpdates(registration);
        await navigator.serviceWorker.ready;
      } catch (_) {}
    });

    navigator.serviceWorker.addEventListener('controllerchange', () => {
      window.dispatchEvent(new CustomEvent('cd10:pwa-status', { detail: { type: 'controllerchange' } }));
    });
  }

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredPrompt = event;
    showInstallCard('native');
  });

  window.addEventListener('appinstalled', () => {
    hideInstallCard(true);
  });

  window.addEventListener('load', () => {
    if (canShow() && isIos()) {
      window.setTimeout(() => showInstallCard('ios'), 1800);
    }
  });

  function initPlatformRuntime() {
    import('/js/platform-public-runtime.js?v=20260628-config')
      .then((module) => module.initPlatformPublicRuntime?.())
      .catch(() => {});
  }

  function initExperimentationRuntime() {
    import('/js/experimentation-client.js?v=20260628-experiments')
      .then((module) => module.initExperimentationRuntime?.())
      .catch(() => {});
  }

  productUxReady(initPlatformRuntime);
  productUxReady(initExperimentationRuntime);
  productUxReady(initProductUxLayer);
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindViewportSignals, { once: true });
  } else {
    bindViewportSignals();
  }
})();
