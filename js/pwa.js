(function () {
  const DISMISS_KEY = 'cd10-install-dismissed-at';
  const DISMISS_TTL = 7 * 24 * 60 * 60 * 1000;
  const INSTALL_ID = 'cd10-install-card';
  let deferredPrompt = null;
  let installCard = null;

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

  const canShow = () =>
    !isStandalone() &&
    !dismissedRecently() &&
    !window.location.pathname.startsWith('/pages/dashboard/') &&
    ![
      '/pages/login.html',
      '/pages/registro.html',
      '/pages/reset-password.html',
    ].includes(window.location.pathname);

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
        min-height: 42px;
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

    const iosSteps = mode === 'ios'
      ? '<div class="cd10-install-card__steps">En iPhone: pulsa Compartir y despues "Anadir a pantalla de inicio".</div>'
      : '';

    installCard.innerHTML = `
      <div class="cd10-install-card__top">
        <img src="/assets/img/logo-192.png" alt="" width="42" height="42">
        <div>
          <strong>Instala ClasesDe10 en tu movil</strong>
          <p>Accede como app, con icono propio y carga mas rapida en visitas futuras.</p>
          ${iosSteps}
        </div>
      </div>
      <div class="cd10-install-card__actions">
        <button class="cd10-install-card__primary" type="button" data-pwa-install>${mode === 'ios' ? 'Como instalar' : 'Instalar app'}</button>
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
          'Abre el menu Compartir de Safari y elige "Anadir a pantalla de inicio".';
      }
    });

    document.body.appendChild(installCard);
  }

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/service-worker.js', { scope: '/' }).catch(() => {});
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
})();
