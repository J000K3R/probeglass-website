// The only JavaScript on this site: a menu toggle and copy buttons.
//
// Both are enhancements. The page is readable and every command is selectable
// by hand with this file blocked, missing or broken — which is the point of
// keeping the site build-free.

(function () {
  'use strict';

  // --- mobile menu -------------------------------------------------------
  var toggle = document.getElementById('nav-toggle');
  var nav = document.getElementById('nav');

  if (toggle && nav) {
    toggle.addEventListener('click', function () {
      var open = nav.classList.toggle('is-open');
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });

    // Following a link inside the menu should close it, otherwise the menu
    // covers the section it just scrolled to.
    nav.addEventListener('click', function (event) {
      if (event.target.tagName === 'A' && nav.classList.contains('is-open')) {
        nav.classList.remove('is-open');
        toggle.setAttribute('aria-expanded', 'false');
      }
    });
  }

  // --- copy buttons ------------------------------------------------------
  document.querySelectorAll('.copy').forEach(function (button) {
    button.addEventListener('click', function () {
      var target = document.querySelector(button.dataset.copy);
      if (!target) return;

      var text = target.textContent;

      // navigator.clipboard is unavailable on plain HTTP outside localhost,
      // which is exactly how a self-hosted site is often reached. Fall back to
      // a hidden textarea and execCommand rather than leaving the button dead.
      var done = function (ok) {
        button.textContent = ok ? 'Copied' : 'Press Ctrl-C';
        button.classList.toggle('done', ok);
        window.setTimeout(function () {
          button.textContent = 'Copy';
          button.classList.remove('done');
        }, 1800);
      };

      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(text).then(
          function () { done(true); },
          function () { done(legacyCopy(text)); }
        );
        return;
      }
      done(legacyCopy(text));
    });
  });

  function legacyCopy(text) {
    var area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.top = '-1000px';
    document.body.appendChild(area);
    area.select();
    var ok = false;
    try {
      ok = document.execCommand('copy');
    } catch (err) {
      ok = false;
    }
    document.body.removeChild(area);
    return ok;
  }
})();
