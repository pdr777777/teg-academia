// Tema claro/escuro/automático — aplica cedo (evita flash) e expõe um toggle global.
(function () {
  const STORAGE_KEY = 'teg-theme';
  const media = window.matchMedia ? window.matchMedia('(prefers-color-scheme: light)') : null;

  function getSavedPref() {
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch {
      return null;
    }
  }

  function resolve(pref) {
    if (pref === 'auto') return media && media.matches ? 'light' : 'dark';
    return pref === 'light' ? 'light' : 'dark';
  }

  function apply(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    document.querySelectorAll('.brand-logo').forEach((img) => {
      img.src = theme === 'light'
        ? img.src.replace(/logo(-light)?\.svg/, 'logo-light.svg')
        : img.src.replace(/logo(-light)?\.svg/, 'logo.svg');
    });
    document.querySelectorAll('[data-theme-toggle]').forEach((btn) => {
      btn.setAttribute('data-icon', theme === 'light' ? 'moon' : 'sun');
      btn.setAttribute('aria-pressed', theme === 'light' ? 'true' : 'false');
      btn.title = theme === 'light' ? 'Mudar para tema escuro' : 'Mudar para tema claro';
    });
    document.querySelectorAll('[data-theme-switch]').forEach((input) => {
      input.checked = theme === 'light';
    });
    document.querySelectorAll('[data-theme-option]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.themeOption === window.tegThemePref);
    });
  }

  window.tegThemePref = getSavedPref() || 'dark';
  window.tegTheme = resolve(window.tegThemePref);
  apply(window.tegTheme);

  window.tegSetThemePref = function (pref) {
    window.tegThemePref = pref;
    try {
      localStorage.setItem(STORAGE_KEY, pref);
    } catch {
      /* localStorage indisponível — tema não persiste, mas segue funcionando */
    }
    window.tegTheme = resolve(pref);
    apply(window.tegTheme);
    if (window.Icons && typeof window.fillIcons === 'function') {
      document.querySelectorAll('[data-theme-toggle]').forEach((btn) => {
        btn.removeAttribute('data-icon-done');
      });
      window.fillIcons();
    }
  };

  window.tegToggleTheme = function (forced) {
    const next = forced || (window.tegTheme === 'light' ? 'dark' : 'light');
    window.tegSetThemePref(next);
  };

  if (media && media.addEventListener) {
    media.addEventListener('change', () => {
      if (window.tegThemePref === 'auto') {
        window.tegTheme = resolve('auto');
        apply(window.tegTheme);
      }
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    apply(window.tegTheme);
    document.querySelectorAll('[data-theme-toggle]').forEach((btn) => {
      btn.addEventListener('click', () => window.tegToggleTheme());
    });
    document.querySelectorAll('[data-theme-switch]').forEach((input) => {
      input.checked = window.tegTheme === 'light';
      input.addEventListener('change', (ev) => {
        window.tegSetThemePref(ev.target.checked ? 'light' : 'dark');
      });
    });
    document.querySelectorAll('[data-theme-option]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.themeOption === window.tegThemePref);
      btn.addEventListener('click', () => window.tegSetThemePref(btn.dataset.themeOption));
    });
  });
})();
