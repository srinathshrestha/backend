from datetime import datetime, timezone
from slugify import slugify
from db import get_db
from excerpt import build_excerpt
from markdown_render import render_markdown

PUBLISHED, DRAFT = "published", "draft"
_COL = "posts"


def _col():
    return get_db()[_COL]


def _tags(raw) -> list[str]:
    if not raw:
        return []
    parts = raw if isinstance(raw, list) else str(raw).split(",")
    return [t.strip().lower() for t in parts if t.strip()]


def _slug(title: str, desired: str | None) -> str:
    return slugify(desired or title, separator="-") or slugify(title, separator="-")


def _fmt(v) -> str | None:
    if not v:
        return None
    return v.isoformat() if isinstance(v, datetime) else str(v)


def _map(doc: dict) -> dict:
    return {k: doc.get(k) for k in ("slug", "title", "status", "tags", "excerpt", "heroImage")} | {
        "createdAt": _fmt(doc.get("createdAt")),
        "updatedAt": _fmt(doc.get("updatedAt")),
        "publishedAt": _fmt(doc.get("publishedAt")),
    }


async def list_posts(include_drafts=False, tag=None, search=None) -> list[dict]:
    q = {} if include_drafts else {"status": PUBLISHED}
    if tag:
        q["tags"] = tag.lower()
    docs = await _col().find(q, {"markdown": 0}).sort([("publishedAt", -1), ("updatedAt", -1)]).to_list(None)
    posts = [_map(d) for d in docs]
    if search:
        low = search.lower()
        posts = [p for p in posts if low in p["title"].lower() or low in (p.get("excerpt") or "").lower()]
    return posts


async def get_post(slug: str, include_drafts=False) -> dict | None:
    q = {"slug": slug.strip().lower()}
    if not include_drafts:
        q["status"] = PUBLISHED
    doc = await _col().find_one(q)
    if not doc:
        return None
    return _map(doc) | {"markdown": doc.get("markdown", ""), "html": render_markdown(doc.get("markdown", ""))}


async def create_post(title: str, markdown: str, tags, status: str, slug: str | None = None) -> dict:
    s = _slug(title, slug)
    if await _col().find_one({"slug": s}, {"_id": 1}):
        raise ValueError(f'Slug "{s}" already exists')
    now = datetime.now(timezone.utc)
    status = PUBLISHED if status == PUBLISHED else DRAFT
    await _col().insert_one({
        "slug": s, "title": title, "markdown": markdown or "",
        "tags": _tags(tags), "status": status, "excerpt": build_excerpt(markdown),
        "heroImage": None, "attachments": [],
        "createdAt": now, "updatedAt": now,
        "publishedAt": now if status == PUBLISHED else None,
    })
    return await get_post(s, include_drafts=True)  # type: ignore[return-value]


async def update_post(orig_slug: str, *, title=None, markdown=None, tags=None, status=None, slug=None) -> dict:
    doc = await _col().find_one({"slug": orig_slug})
    if not doc:
        raise LookupError(f'Post "{orig_slug}" not found')
    new_title = title or doc["title"]
    new_slug = _slug(new_title, slug or doc["slug"])
    new_status = PUBLISHED if status == PUBLISHED else (DRAFT if status == DRAFT else doc["status"])
    new_md = markdown if markdown is not None else doc.get("markdown", "")
    now = datetime.now(timezone.utc)
    if new_slug != orig_slug and await _col().find_one({"slug": new_slug, "_id": {"$ne": doc["_id"]}}, {"_id": 1}):
        raise ValueError(f'Slug "{new_slug}" already exists')
    await _col().update_one({"_id": doc["_id"]}, {"$set": {
        "slug": new_slug, "title": new_title, "markdown": new_md,
        "tags": _tags(tags) if tags is not None else doc.get("tags", []),
        "status": new_status, "updatedAt": now,
        "publishedAt": (doc.get("publishedAt") or now) if new_status == PUBLISHED else None,
        "excerpt": build_excerpt(new_md),
    }})
    return await get_post(new_slug, include_drafts=True)  # type: ignore[return-value]


async def delete_post(slug: str) -> None:
    r = await _col().delete_one({"slug": slug})
    if r.deleted_count == 0:
        raise LookupError(f'Post "{slug}" not found')
