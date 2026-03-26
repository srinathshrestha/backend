import re
from html import escape
import mistune

# ── Regexes ───────────────────────────────────────────────────
_CALLOUT      = re.compile(r"^> \[!(note|tip|warning|important|caution)\](.*)", re.MULTILINE | re.I)
_HIGHLIGHT    = re.compile(r"==(.*?)==")
_FOOTNOTE_DEF = re.compile(r"^\[\^([\w-]+)\]: (.+)$", re.MULTILINE)
_FOOTNOTE_REF = re.compile(r"\[\^([\w-]+)\](?!:)")
_SCRIPT       = re.compile(r"<script[\s\S]*?</script>", re.I)
_IMG_PARTS    = re.compile(r"^(.*?)(?:\|(\d+))?(?:\|(left|right|center))?$")
_STRIP_HTML   = re.compile(r"<[^>]+>")
_LANG_SAFE    = re.compile(r"[^a-z0-9#+.\-_]")


# ── Custom renderer ──────────────────────────────────────────
class BlogRenderer(mistune.HTMLRenderer):
    def heading(self, text, level, **attrs):
        plain = _STRIP_HTML.sub("", text).lower().strip()
        slug = re.sub(r"[^\w\s-]", "", plain)
        slug = re.sub(r"[\s_]+", "-", slug).strip("-")
        anchor = f'<a class="heading-anchor" href="#{slug}" aria-hidden="true">#</a>'
        return f'<h{level} id="{slug}">{anchor}{text}</h{level}>\n'

    def block_code(self, code, info=None, **attrs):
        """Code blocks with language pill + optional filename bar.
        Mirrors the Node.js renderer exactly: .code-container > .code-language pill + pre.code-block
        Supports info strings like 'ts', 'python:app.py', ':filename.txt'
        """
        info = (info or "").strip()
        first = info.split()[0] if info else ""
        raw_lang, _, raw_file = first.partition(":")
        lang = _LANG_SAFE.sub("", (raw_lang or "").lower())
        file = escape(raw_file[:160]) if raw_file else ""

        escaped_code = escape(code)

        if not lang and not file:
            return f'<pre class="code-block"><code>{escaped_code}</code></pre>\n'

        file_header = f'<div class="code-filename" title="{file}">{file}</div>' if file else ""
        pill = f'<span class="code-language">{lang}</span>' if lang else ""
        lang_cls = f" language-{lang}" if lang else ""

        return (
            f'<div class="code-container">{file_header}{pill}'
            f'<pre class="code-block{lang_cls}"><code>{escaped_code}</code></pre>'
            f'</div>\n'
        )

    def image(self, alt, url, title=None):
        """Image with custom sizing/alignment syntax: ![alt|width|align](url)"""
        m = _IMG_PARTS.match(alt or "")
        raw_alt = (m.group(1) if m else alt) or ""
        width = m.group(2) if m else None
        align = m.group(3) if m else None

        clean_alt = raw_alt.replace("_", " ").strip()
        style = ""
        if width:
            style += f"max-width:{width}px; width:100%"
        cls = "post-img"
        if align in ("left", "right"):
            cls += f" img-{align}"

        title_attr = f' title="{escape(title)}"' if title else ""
        style_attr = f' style="{style}"' if style else ""
        img = f'<img src="{url}" alt="{escape(clean_alt)}"{title_attr}{style_attr} class="{cls}" loading="lazy" />'

        if clean_alt:
            fig_cls = f"post-figure img-{align}" if align in ("left", "right") else "post-figure"
            return f'<figure class="{fig_cls}">{img}<figcaption>{escape(clean_alt)}</figcaption></figure>\n'
        return img + "\n"

    def block_quote(self, text):
        return f"<blockquote>{text}</blockquote>\n"


_md = mistune.create_markdown(
    renderer=BlogRenderer(escape=False),
    plugins=["table", "strikethrough"],
)


# ── Footnotes ─────────────────────────────────────────────────
def _extract_footnotes(src: str) -> tuple[str, dict[str, str]]:
    notes = {m.group(1): m.group(2) for m in _FOOTNOTE_DEF.finditer(src)}
    return _FOOTNOTE_DEF.sub("", src).strip(), notes


def _inject_refs(src: str, notes: dict) -> str:
    def repl(m):
        k = escape(m.group(1))
        return f'<sup><a href="#fn-{k}" id="fnref-{k}">[{k}]</a></sup>'
    return _FOOTNOTE_REF.sub(repl, src)


def _footnotes_html(notes: dict) -> str:
    if not notes:
        return ""
    items = "".join(
        f'<li id="fn-{escape(k)}">{v} <a href="#fnref-{escape(k)}">↩</a></li>'
        for k, v in notes.items()
    )
    return f'<section class="footnotes"><ol>{items}</ol></section>'


# ── Preprocessing ─────────────────────────────────────────────
def _preprocess(src: str) -> str:
    src = _CALLOUT.sub(
        lambda m: f'<div class="callout callout-{m.group(1).lower()}">'
                  f'<strong>{m.group(1).capitalize()}</strong>{m.group(2)}</div>',
        src
    )
    src = _HIGHLIGHT.sub(r"<mark>\1</mark>", src)
    return src


# ── Public API ────────────────────────────────────────────────
def render_markdown(markdown: str) -> str:
    src, notes = _extract_footnotes(markdown or "")
    src = _inject_refs(src, notes)
    src = _preprocess(src)
    html: str = _md(src)
    html += _footnotes_html(notes)
    return _SCRIPT.sub("", html)
