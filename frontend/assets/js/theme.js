// Tema claro/escuro — aplica cedo (evita flash) e expõe um toggle global.
(function () {
  const STORAGE_KEY = 'teg-theme';

  function getSaved() {
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch {
      return null;
    }
  }

  function apply(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    document.querySelectorAll('[data-theme-toggle]').forEach((btn) => {
      btn.setAttribute('data-icon', theme === 'light' ? 'moon' : 'sun');
      btn.setAttribute('aria-pressed', theme === 'light' ? 'true' : 'false');
      btn.title = theme === 'light' ? 'Mudar para tema escuro' : 'Mudar para tema claro';
    });
    document.querySelectorAll('[data-theme-switch]').forEach((input) => {
      input.checked = theme === 'light';
    });
  }

  window.tegTheme = getSaved() || 'dark';
  apply(window.tegTheme);

  window.tegToggleTheme = function (forced) {
    const next = forced || (window.tegTheme === 'light' ? 'dark' : 'light');
    window.tegTheme = next;
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* localStorage indisponível — tema não persiste, mas segue funcionando */
    }
    apply(next);
    if (window.Icons && typeof window.fillIcons === 'function') {
      document.querySelectorAll('[data-theme-toggle]').forEach((btn) => {
        btn.removeAttribute('data-icon-done');
      });
      window.fillIcons();
    }
  };

  document.addEventListener('DOMContentLoaded', () => {
    apply(window.tegTheme);
    document.querySelectorAll('[data-theme-toggle]').forEach((btn) => {
      btn.addEventListener('click', () => window.tegToggleTheme());
    });
    document.querySelectorAll('[data-theme-switch]').forEach((input) => {
      input.checked = window.tegTheme === 'light';
      input.addEventListener('change', (ev) => {
        window.tegToggleTheme(ev.target.checked ? 'light' : 'dark');
      });
    });
  });
})();
