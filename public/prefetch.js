/**
 * Bounded background warm-up for portfolio + blog pages.
 * After paint, pull a limited set of next destinations (HTML + a few images)
 * in parallel so navigation often hits cache. Never floods the network.
 */
(function () {
  'use strict';

  var MAX_POSTS = 12;
  var CONCURRENCY = 2;
  var MAX_IMAGES = 8;
  var PRERENDER = 2;

  var done = Object.create(null);
  var imageCount = 0;

  function connectionIsTight() {
    var c = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (!c) return false;
    if (c.saveData) return true;
    var t = String(c.effectiveType || '');
    return t === 'slow-2g' || t === '2g';
  }

  function sameOriginPath(href) {
    try {
      var u = new URL(href, location.origin);
      if (u.origin !== location.origin) return null;
      return u.pathname + u.search;
    } catch (e) {
      return null;
    }
  }

  /** Post article paths only: /blogs/:slug */
  function postPath(href) {
    var path = sameOriginPath(href);
    if (!path) return null;
    var pathname = path.split('?')[0];
    if (!pathname.startsWith('/blogs/')) return null;
    if (pathname === '/blogs/' || pathname === '/blogs') return null;
    return pathname;
  }

  function isWarmTarget(path) {
    if (!path) return false;
    var pathname = path.split('?')[0];
    if (pathname === '/blogs' || pathname === '/blogs/') return true;
    if (pathname.indexOf('/blogs/') === 0) return true;
    return false;
  }

  function unique(list) {
    var out = [];
    var seen = Object.create(null);
    for (var i = 0; i < list.length; i++) {
      var p = list[i];
      if (!p || seen[p]) continue;
      seen[p] = true;
      out.push(p);
    }
    return out;
  }

  function collectFromDom() {
    var nodes = document.querySelectorAll('a[href]');
    var posts = [];
    var hubs = [];
    for (var i = 0; i < nodes.length; i++) {
      var href = nodes[i].getAttribute('href');
      var post = postPath(href);
      if (post) {
        posts.push(post);
        continue;
      }
      var path = sameOriginPath(href);
      if (path && isWarmTarget(path)) hubs.push(path.split('?')[0]);
    }
    return { posts: unique(posts), hubs: unique(hubs) };
  }

  function extractPostsFromHtml(html, limit) {
    var out = [];
    var seen = Object.create(null);
    var re = /href=["'](\/blogs\/[^"'#?]+)/gi;
    var m;
    while (out.length < limit && (m = re.exec(html))) {
      var p = postPath(m[1]);
      if (!p || seen[p]) continue;
      seen[p] = true;
      out.push(p);
    }
    return out;
  }

  function warmImages(html) {
    if (imageCount >= MAX_IMAGES || !html) return;
    var re = /<img\b[^>]*\bsrc=["']([^"']+)["']/gi;
    var m;
    while (imageCount < MAX_IMAGES && (m = re.exec(html))) {
      var src = m[1];
      if (!src || src.indexOf('data:') === 0) continue;
      try {
        var u = new URL(src, location.origin);
        if (u.protocol !== 'http:' && u.protocol !== 'https:') continue;
        imageCount += 1;
        var img = new Image();
        img.decoding = 'async';
        img.src = u.href;
      } catch (e) { /* ignore bad urls */ }
    }
  }

  function fetchHtml(path) {
    if (done[path]) return Promise.resolve(null);
    done[path] = true;
    return fetch(path, {
      credentials: 'same-origin',
      priority: 'low',
      headers: {
        'Purpose': 'prefetch',
        'X-Raw-Prefetch': '1',
        'Accept': 'text/html',
      },
    })
      .then(function (res) {
        if (!res.ok) return null;
        return res.text();
      })
      .then(function (html) {
        if (html) warmImages(html);
        return html;
      })
      .catch(function () {
        return null;
      });
  }

  function runPool(paths, concurrency) {
    var i = 0;
    var active = 0;

    return new Promise(function (resolve) {
      function next() {
        if (i >= paths.length && active === 0) {
          resolve();
          return;
        }
        while (active < concurrency && i < paths.length) {
          var path = paths[i++];
          active += 1;
          fetchHtml(path).then(function () {
            active -= 1;
            next();
          });
        }
      }
      next();
    });
  }

  function injectSpeculation(paths) {
    if (!paths.length) return;
    if (!HTMLScriptElement.supports || !HTMLScriptElement.supports('speculationrules')) return;

    var prerender = paths.slice(0, PRERENDER);
    var prefetch = paths.slice(PRERENDER);
    var rules = {};
    if (prerender.length) {
      rules.prerender = [{ source: 'list', urls: prerender, eagerness: 'moderate' }];
    }
    if (prefetch.length) {
      rules.prefetch = [{ source: 'list', urls: prefetch, eagerness: 'moderate' }];
    }
    var el = document.createElement('script');
    el.type = 'speculationrules';
    el.textContent = JSON.stringify(rules);
    document.head.appendChild(el);
  }

  function onHover(e) {
    var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    if (!a) return;
    var post = postPath(a.getAttribute('href'));
    if (post) {
      fetchHtml(post);
      return;
    }
    var path = sameOriginPath(a.getAttribute('href'));
    if (path && isWarmTarget(path)) fetchHtml(path.split('?')[0]);
  }

  /**
   * Resolve the warm list:
   * - Prefer post links already on the page (blog index / pager).
   * - On portfolio (no post links), warm /blogs then discover posts from it.
   */
  function resolveTargets() {
    var found = collectFromDom();
    var posts = found.posts.slice(0, MAX_POSTS);
    var hubs = found.hubs;

    // Home/portfolio: always warm the writing index next.
    if (location.pathname === '/' || location.pathname === '/portfolio') {
      if (hubs.indexOf('/blogs') === -1) hubs.unshift('/blogs');
    }

    // Blog list / post pager already expose article links — use those.
    if (posts.length > 0) {
      return Promise.resolve(unique(hubs.concat(posts)));
    }

    // Portfolio path: fetch /blogs (caches it), scrape post URLs, warm those.
    if (hubs.indexOf('/blogs') === -1) {
      return Promise.resolve(hubs);
    }

    return fetchHtml('/blogs').then(function (html) {
      var more = html ? extractPostsFromHtml(html, MAX_POSTS) : [];
      // /blogs is already in the HTTP cache; return remaining article paths.
      return unique(more);
    });
  }

  function start() {
    if (connectionIsTight()) return;

    document.addEventListener('pointerover', onHover, { passive: true, capture: true });
    document.addEventListener('focusin', onHover, { passive: true, capture: true });

    var kick = function () {
      resolveTargets().then(function (paths) {
        if (!paths.length) return;
        injectSpeculation(paths);
        // Skip paths already fetched while discovering (/blogs).
        var pending = paths.filter(function (p) { return !done[p]; });
        // /blogs may already be done; still include remaining posts.
        return runPool(pending, CONCURRENCY);
      });
    };

    if ('requestIdleCallback' in window) {
      requestIdleCallback(kick, { timeout: 1500 });
    } else {
      setTimeout(kick, 200);
    }
  }

  if (document.readyState === 'complete') start();
  else window.addEventListener('load', start, { once: true });
})();
