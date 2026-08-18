// Glue between the vendored KaTeX/Mermaid/highlight.js bundles and the
// markup src/app.js emits. Only loaded on posts that need it — see
// `hasMath`/`hasMermaid`/`hasCode` in src/app.js and the conditional
// <script> tags at the bottom of views/post.ejs.
(function () {
  'use strict';

  function cssVar(name, fallback) {
    var v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  }

  if (window.hljs) {
    document.querySelectorAll('pre.code-block code[class*="language-"]').forEach(function (el) {
      window.hljs.highlightElement(el);
    });
  }

  if (window.katex) {
    document.querySelectorAll('.math').forEach(function (el) {
      var expr = el.getAttribute('data-math') || '';
      var display = el.classList.contains('math-display');
      try {
        window.katex.render(expr, el, { throwOnError: false, displayMode: display });
      } catch (e) {
        el.classList.add('math-error');
      }
    });
  }

  var diagrams = document.querySelectorAll('pre.mermaid');
  if (diagrams.length && window.mermaid) {
    // A `theme: 'base'` with variables pulled from the page's own palette,
    // not one of mermaid's built-in themes — a diagram in mermaid's default
    // blue/purple would be the loudest thing on an otherwise monochrome
    // page. The colors already flip for dark mode via styles.css; reading
    // them here just carries that over.
    window.mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      theme: 'base',
      themeVariables: {
        background: cssVar('--bg', '#fff'),
        primaryColor: cssVar('--soft', '#f5f5f5'),
        primaryTextColor: cssVar('--text', '#111'),
        primaryBorderColor: cssVar('--rule', '#ccc'),
        lineColor: cssVar('--muted', '#666'),
        secondaryColor: cssVar('--soft', '#f5f5f5'),
        tertiaryColor: cssVar('--soft', '#f5f5f5'),
        textColor: cssVar('--text', '#111'),
        fontFamily: getComputedStyle(document.body).fontFamily,
      },
    });
    window.mermaid.run({ nodes: diagrams });
  }
})();
