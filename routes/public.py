from pathlib import Path
from fastapi import APIRouter, Request
from fastapi.responses import FileResponse, Response
import post_store as store
from rss import build_rss
from config import cfg
from templates_env import tmpl

router = APIRouter()
_RESUME = Path(__file__).parent.parent / "public" / "resume" / "srinathShresthaResume.pdf"


@router.get("/")
async def landing(req: Request):
    return tmpl.TemplateResponse(req, "landing.html", {"title": cfg.BLOG_TITLE})


@router.get("/blogs")
async def blogs(req: Request):
    posts = await store.list_posts()
    return tmpl.TemplateResponse(req, "index.html", {"title": cfg.BLOG_TITLE, "posts": posts})


@router.get("/blogs/{slug}")
async def blog_post(slug: str, req: Request):
    post = await store.get_post(slug)
    if not post or post["status"] != "published":
        return tmpl.TemplateResponse(req, "404.html", {"title": "Not found"}, status_code=404)
    return tmpl.TemplateResponse(req, "post.html", {"title": post["title"], "post": post})


@router.get("/portfolio")
async def portfolio(req: Request):
    return tmpl.TemplateResponse(req, "portfolio.html", {"title": f"Portfolio · {cfg.BLOG_TITLE}"})


@router.get("/resume")
def resume():
    return FileResponse(_RESUME, filename="SrinathShresthaResume.pdf")


@router.get("/rss.xml")
async def rss():
    posts = await store.list_posts()
    detailed = [await store.get_post(p["slug"]) for p in posts if p["status"] == "published"]
    xml = build_rss(cfg.SITE_URL, cfg.BLOG_TITLE, [p for p in detailed if p])
    return Response(xml, media_type="application/rss+xml")


@router.get("/health")
def health():
    return {"ok": True}
