/* ── motion.js ──────────────────────────────────────────────────
   Fluid-interface plumbing, shared by every page.

   Three ideas do most of the work here:
     1. Respond on pointer-down, never on release.
     2. Animate from the current on-screen value, not the target, so any
        motion can be grabbed and redirected mid-flight.
     3. Springs, not fixed-duration curves — a spring has no duration, its
        settle emerges from damping + response, and it stays continuous
        when the target changes underneath it.
   ──────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  /* ── Spring ──────────────────────────────────────────────────
     Apple's two designer-facing parameters rather than the physics
     triplet: `damping` (1.0 = critically damped, no overshoot) and
     `response` (seconds to reach the target — not a duration).
     Retargeting keeps the current velocity, so a reversal blends
     instead of hitting a brick wall.
     ───────────────────────────────────────────────────────────── */
  function Spring(opts) {
    opts = opts || {};
    this.damping  = opts.damping  != null ? opts.damping  : 1.0;
    this.response = opts.response != null ? opts.response : 0.4;
    this.value    = opts.from     || 0;
    this.target   = opts.from     || 0;
    this.velocity = 0;
  }

  Spring.prototype.setTarget = function (target, velocity) {
    this.target = target;
    if (velocity != null) this.velocity = velocity;
  };

  // Semi-implicit Euler, substepped so a long frame can't blow it up.
  Spring.prototype.step = function (dt) {
    var omega = (2 * Math.PI) / this.response;
    var steps = Math.max(1, Math.ceil(dt / 0.004));
    var h = dt / steps;
    for (var i = 0; i < steps; i++) {
      var displacement = this.value - this.target;
      var accel = -(omega * omega) * displacement - 2 * this.damping * omega * this.velocity;
      this.velocity += accel * h;
      this.value += this.velocity * h;
    }
    return this.value;
  };

  Spring.prototype.isSettled = function (epsilon) {
    epsilon = epsilon || 0.4;
    return Math.abs(this.value - this.target) < epsilon &&
           Math.abs(this.velocity) < epsilon * 4;
  };

  /* ── Interruptible spring scrolling ──────────────────────────
     Anchor jumps ride a spring instead of the browser's canned
     `scroll-behavior: smooth`. Crucially, any real input — wheel,
     touch, keyboard — cancels it on the spot: the user always wins,
     and the page never fights a gesture that is already underway.
     ───────────────────────────────────────────────────────────── */
  var scrollSpring = null;
  var scrollFrame = null;

  function cancelSpringScroll() {
    if (scrollFrame) cancelAnimationFrame(scrollFrame);
    scrollFrame = null;
    scrollSpring = null;
  }

  function springScrollTo(targetY) {
    var maxY = document.documentElement.scrollHeight - window.innerHeight;
    targetY = Math.max(0, Math.min(targetY, maxY));

    if (reduceMotion.matches) {
      window.scrollTo(0, targetY);
      return;
    }

    // Start from the presentation value — where the page actually is right
    // now — carrying whatever velocity a previous spring still had.
    var carriedVelocity = scrollSpring ? scrollSpring.velocity : 0;
    if (scrollFrame) cancelAnimationFrame(scrollFrame);

    scrollSpring = new Spring({ damping: 1.0, response: 0.4, from: window.scrollY });
    scrollSpring.setTarget(targetY, carriedVelocity);

    var last = performance.now();
    (function tick(now) {
      if (!scrollSpring) return;
      var dt = Math.min((now - last) / 1000, 1 / 30);
      last = now;
      var y = scrollSpring.step(dt);
      window.scrollTo(0, y);
      if (scrollSpring.isSettled()) {
        window.scrollTo(0, scrollSpring.target);
        cancelSpringScroll();
        return;
      }
      scrollFrame = requestAnimationFrame(tick);
    })(last);
  }

  ['wheel', 'touchstart', 'keydown', 'pointerdown'].forEach(function (evt) {
    window.addEventListener(evt, function () {
      if (scrollSpring) cancelSpringScroll();
    }, { passive: true });
  });

  document.addEventListener('click', function (e) {
    var link = e.target.closest && e.target.closest('a[href^="#"]');
    if (!link) return;
    var href = link.getAttribute('href');
    if (!href || href === '#') {
      e.preventDefault();
      springScrollTo(0);
      return;
    }
    var el = document.getElementById(href.slice(1));
    if (!el) return;
    e.preventDefault();
    var navH = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--nav-h')) || 52;
    var top = el.getBoundingClientRect().top + window.scrollY - (navH + 28);
    springScrollTo(top);
    history.replaceState(null, '', href);
  });

  /* ── Press feedback ──────────────────────────────────────────
     The highlight lands on pointer-down, not on click. Dragging more
     than ~10px away cancels it — and coming back re-arms it — which is
     what makes a press feel forgiving rather than trigger-happy.
     ───────────────────────────────────────────────────────────── */
  var PRESSABLE = 'a, button, .btn, .button, .entry__link, .work, .article__more a';
  var HYSTERESIS = 10;

  document.addEventListener('pointerdown', function (e) {
    var el = e.target.closest && e.target.closest(PRESSABLE);
    if (!el) return;

    var startX = e.clientX, startY = e.clientY;
    el.classList.add('is-pressed');

    function onMove(ev) {
      var dx = ev.clientX - startX;
      var dy = ev.clientY - startY;
      var away = Math.sqrt(dx * dx + dy * dy) > HYSTERESIS;
      el.classList.toggle('is-pressed', !away);
    }
    function onEnd() {
      el.classList.remove('is-pressed');
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onEnd);
      window.removeEventListener('pointercancel', onEnd);
    }
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerup', onEnd, { passive: true });
    window.addEventListener('pointercancel', onEnd, { passive: true });
  }, { passive: true });

  /* ── Scroll edge effect ──────────────────────────────────────
     The nav divider exists only while content is actually underneath
     the floating bar. No permanent hairline. */
  var nav = document.querySelector('.nav');
  if (nav) {
    var updateNav = function () {
      nav.setAttribute('data-scrolled', window.scrollY > 4 ? 'true' : 'false');
    };
    updateNav();
    window.addEventListener('scroll', updateNav, { passive: true });
  }

  /* ── Entrance ────────────────────────────────────────────────
     Content materialises as it comes into view, staggered slightly so
     a list reads as arriving rather than snapping on all at once.
     Under reduced motion this collapses to a plain cross-fade.
     ───────────────────────────────────────────────────────────── */
  var revealTargets = document.querySelectorAll(
    '.archive > .entry, .grid > .work, .roles > .role, ' +
    '.reading > li, .spec, .stat-item'
  );

  if (revealTargets.length && 'IntersectionObserver' in window) {
    revealTargets.forEach(function (el) { el.setAttribute('data-reveal', ''); });

    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var el = entry.target;
        var siblings = el.parentElement ? Array.prototype.indexOf.call(el.parentElement.children, el) : 0;
        var delay = reduceMotion.matches ? 0 : Math.min(siblings, 6) * 45;
        setTimeout(function () { el.setAttribute('data-reveal', 'in'); }, delay);
        observer.unobserve(el);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.05 });

    revealTargets.forEach(function (el) { observer.observe(el); });
  } else {
    revealTargets.forEach(function (el) { el.setAttribute('data-reveal', 'in'); });
  }

  // Expose for page-level scripts.
  window.Motion = { Spring: Spring, springScrollTo: springScrollTo };
})();
