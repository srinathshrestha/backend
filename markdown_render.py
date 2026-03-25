import re
import mistune

# ── Pre/post-processing regexes ───────────────────────────────
_CALLOUT   = re.compile(r"^> \[!(note|tip|warning|important|caution)\](.*)", re.MULTILINE | re.IGNORECASE)
_HIGHLIGHT = re.compile(r"==(.*?)==")
_FOOTNOTE_DEF = re.compile(r"^\[\^([\w-]+)\]: (.+)$", re.MULTILINE)
_FOOTNOTE_REF = re.compile(r"\[\^([\w-]+)\](?!:)")
_SCRIPT    = re.compile(r"<script[\s\S]*?</script>", re.IGNORECASE)
_IMG_EXT   = re.compile(r"^(.*?)(?:\|(\d+))?(?:\|(left|right|center))?$")


# ── Custom renderer ───────────────────────────────────────────
class BlogRenderer(mistune.HTMLRenderer):
    def heading(self, text, level, **attrs):
        slug = re.sub(r"[^\w\s-]", "", text.lower()).strip()
        slug = re.sub(r"[\s_]+", "-", slug)
        return f'<h{level} id="{slug}">{text}</h{level}>\n'

    def image(self, alt, url, title=None):
        m = _IMG_EXT.match(alt or "")
        clean_alt, width, align = (m.group(1), m.group(2), m.group(3)) if m else (alt, None, None)
        style = ""
        if width:
            style += f"max-width:{width}px;"
        if align in ("left", "right"):
            style += f"float:{align};margin:0 1em 1em 0;" if align == "left" else f"float:{align};margin:0 0 1em 1em;"
        return f'<img src="{url}" alt="{clean_alt}"{f" style=\"{style}\"" if style else ""}>\n'

    def block_quote(self, text):
        return f"<blockquote>{text}</blockquote>\n"


_md = mistune.create_markdown(renderer=BlogRenderer(), plugins=["table", "strikethrough"])


# ── Pipeline helpers ──────────────────────────────────────────
def _extract_footnotes(src: str) -> tuple[str, dict[str, str]]:
    notes = {m.group(1): m.group(2) for m in _FOOTNOTE_DEF.finditer(src)}
    cleaned = _FOOTNOTE_DEF.sub("", src).strip()
    return cleaned, notes


def _inject_footnote_refs(src: str, notes: dict) -> str:
    def replace(m):
        key = m.group(1)
        return f'<sup><a href="#fn-{key}" id="fnref-{key}">[{key}]</a></sup>'
    return _FOOTNOTE_REF.sub(replace, src)


def _build_footnotes_html(notes: dict) -> str:
    if not notes:
        return ""
    items = "".join(f'<li id="fn-{k}">{v} <a href="#fnref-{k}">↩</a></li>' for k, v in notes.items())
    return f'<section class="footnotes"><ol>{items}</ol></section>'


def _preprocess(src: str) -> str:
    src = _CALLOUT.sub(lambda m: f'<div class="callout callout-{m.group(1).lower()}"><strong>{m.group(1).capitalize()}</strong>{m.group(2)}</div>', src)
    src = _HIGHLIGHT.sub(r"<mark>\1</mark>", src)
    return src


# ── Public API ────────────────────────────────────────────────
def render_markdown(markdown: str) -> str:
    src, notes = _extract_footnotes(markdown or "")
    src = _inject_footnote_refs(src, notes)
    src = _preprocess(src)
    html: str = _md(src)
    html += _build_footnotes_html(notes)
    return _SCRIPT.sub("", html)
