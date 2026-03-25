import re

_STRIP = [
    (re.compile(r"```[\s\S]*?```"), ""),
    (re.compile(r"`([^`]*)`"), r"\1"),
    (re.compile(r"!\[[^\]]*\]\([^)]*\)"), ""),
    (re.compile(r"\[([^\]]*)\]\([^)]*\)"), r"\1"),
    (re.compile(r"[#>*_~\-]"), ""),
    (re.compile(r"\s+"), " "),
]


def build_excerpt(markdown: str, max_words: int = 40) -> str:
    text = markdown
    for pattern, repl in _STRIP:
        text = pattern.sub(repl, text)
    text = text.strip()
    if not text:
        return ""
    words = text.split()
    return " ".join(words[:max_words]) + ("…" if len(words) > max_words else "")
