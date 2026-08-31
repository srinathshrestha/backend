(function () {
  'use strict';

  function setTheme(theme) {
    var next = theme === 'dark' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', next);
    document.cookie = 'raw_theme=' + encodeURIComponent(next) + '; Max-Age=31536000; Path=/; SameSite=Lax';
  }

  document.addEventListener('click', function (event) {
    var link = event.target && event.target.closest ? event.target.closest('[data-theme-set]') : null;
    if (!link) return;
    event.preventDefault();
    setTheme(link.getAttribute('data-theme-set'));
  });
})();
