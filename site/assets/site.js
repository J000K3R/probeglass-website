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

  // --- GitHub stars ------------------------------------------------------
  //
  // The count is fetched from the public API and cached for ten minutes, so a
  // reader refreshing the page does not spend the unauthenticated allowance the
  // API gives each address. Without JavaScript the badge still reads "GitHub";
  // with it, the number replaces the word and the link is unchanged.
  var starBox = document.querySelector('[data-gh-stars]');
  if (starBox) {
    var key = 'pg-gh-stars';
    var cached = null;
    try {
      cached = JSON.parse(sessionStorage.getItem(key) || 'null');
    } catch (err) {
      cached = null;
    }
    var fresh = cached && typeof cached.at === 'number' && Date.now() - cached.at < 600000;
    if (fresh) {
      starBox.textContent = String(cached.n);
    } else {
      fetch('https://api.github.com/repos/J000K3R/probeglass', {
        headers: { Accept: 'application/vnd.github+json' },
      })
        .then(function (response) {
          return response.ok ? response.json() : null;
        })
        .then(function (data) {
          if (!data || typeof data.stargazers_count !== 'number') return;
          starBox.textContent = String(data.stargazers_count);
          try {
            sessionStorage.setItem(key, JSON.stringify({ n: data.stargazers_count, at: Date.now() }));
          } catch (err) {
            // A full or blocked sessionStorage is not a reason to lose the count.
          }
        })
        .catch(function () {
          // Offline or rate-limited: the badge stays the word, which is true.
        });
    }
  }
})();
