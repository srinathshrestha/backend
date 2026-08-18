# Vendored assets

Self-hosted so post pages never make a third-party request. Loaded only on
posts that actually use the feature (see `hasMath`/`hasMermaid`/`hasCode` in
`src/app.js`).

| Library      | Version | Source                                            |
|--------------|---------|----------------------------------------------------|
| KaTeX        | 0.16.x  | `katex.min.js`/`.css` + `fonts/*.woff2` from the `katex` npm package's `dist/`. woff/ttf fallback `src` entries were stripped from the CSS — every browser this site targets supports woff2. |
| Mermaid      | 11.x    | `mermaid.min.js` from the `mermaid` npm package's `dist/`, unmodified. |
| highlight.js | 11.x    | `hljs.min.js` is a custom esbuild bundle of `highlight.js/lib/common` (the ~36-language common set), built because highlight.js no longer ships a browser UMD bundle in its npm tarball. Rebuild with esbuild against `highlight.js/lib/common`, format `iife`, exposing `window.hljs`. |

To upgrade: `npm install <pkg>@latest --no-save` in a scratch directory, copy
the new `dist/` output over these files (re-stripping the KaTeX CSS fallback
fonts, re-bundling highlight.js), and check a post using the feature still
renders.
