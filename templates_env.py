from pathlib import Path
from datetime import datetime
from fastapi.templating import Jinja2Templates
from config import cfg

_BASE = Path(__file__).parent / "templates"
tmpl = Jinja2Templates(directory=str(_BASE))


def _fmt(v):
    if not v:
        return ""
    if isinstance(v, datetime):
        return v.strftime("%b %d, %Y")
    try:
        return datetime.fromisoformat(str(v)).strftime("%b %d, %Y")
    except (ValueError, TypeError):
        return str(v)


tmpl.env.globals.update(
    blog_title=cfg.BLOG_TITLE,
    year=datetime.utcnow().year,
    format_date=_fmt,
)
