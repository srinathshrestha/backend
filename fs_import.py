from pathlib import Path
from datetime import datetime, timezone
from slugify import slugify
import frontmatter
from excerpt import build_excerpt

_BASE = Path(__file__).parent / "content"
_POSTS = _BASE / "posts"
_DRAFTS = _BASE / "drafts"


def _to_date(val, fallback: datetime) -> datetime:
    if not val:
        return fallback
    if isinstance(val, datetime):
        return val
    try:
        return datetime.fromisoformat(str(val))
    except (ValueError, TypeError):
        return fallback


def _read_dir(directory: Path, status: str) -> list[dict]:
    if not directory.is_dir():
        return []
    docs = []
    for f in sorted(directory.glob("*.md")):
        post = frontmatter.load(str(f))
        fm = post.metadata
        base_slug = fm.get("slug") or f.stem
        slug = slugify(base_slug, separator="-")
        md = post.content.strip()
        created = _to_date(fm.get("createdAt"), datetime.now(timezone.utc))
        updated = _to_date(fm.get("updatedAt"), created)
        published = _to_date(fm.get("publishedAt"), created) if status == "published" else None
        tags = fm.get("tags") or []
        if isinstance(tags, str):
            tags = [t.strip().lower() for t in tags.split(",") if t.strip()]
        docs.append({
            "slug": slug, "title": fm.get("title") or base_slug,
            "markdown": md, "tags": tags, "status": status,
            "createdAt": created, "updatedAt": updated, "publishedAt": published,
            "excerpt": fm.get("excerpt") or build_excerpt(md),
            "heroImage": fm.get("heroImage"), "attachments": fm.get("attachments") or [],
        })
    return docs


async def import_from_filesystem(db) -> None:
    col = db["posts"]
    if await col.estimated_document_count() > 0:
        return
    docs = _read_dir(_POSTS, "published") + _read_dir(_DRAFTS, "draft")
    if not docs:
        return
    await col.insert_many(docs)
    n = len(docs)
    print(f"[blog] imported {n} {'post' if n == 1 else 'posts'} from filesystem")
