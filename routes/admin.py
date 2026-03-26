from fastapi import APIRouter, Depends, Request, Form, HTTPException
from fastapi.responses import RedirectResponse, HTMLResponse
from urllib.parse import quote
import post_store as store
from markdown_render import render_markdown
from deps import require_auth
from config import cfg
from templates_env import tmpl

router = APIRouter(prefix="/admin", dependencies=[Depends(require_auth)])
_ctx = lambda title: {"title": f"{title} · {cfg.BLOG_TITLE}"}


@router.get("/posts")
async def posts_list(req: Request):
    all_posts = await store.list_posts(include_drafts=True)
    published = [p for p in all_posts if p["status"] == "published"]
    drafts = [p for p in all_posts if p["status"] == "draft"]
    return tmpl.TemplateResponse(req, "admin/posts.html", _ctx("Posts") | {"published": published, "drafts": drafts})


@router.get("/posts/new")
async def new_post(req: Request):
    return tmpl.TemplateResponse(req, "admin/edit.html", _ctx("New Post") | {"post": None, "previewHtml": "", "message": None})


@router.get("/posts/{slug}/edit")
async def edit_post(slug: str, req: Request, message: str = ""):
    post = await store.get_post(slug, include_drafts=True)
    if not post:
        return tmpl.TemplateResponse(req, "404.html", {"title": "Not found"}, status_code=404)
    return tmpl.TemplateResponse(req, "admin/edit.html", _ctx(f"Edit {post['title']}") | {
        "post": post, "previewHtml": post["html"], "message": message or None
    })


@router.post("/preview", response_class=HTMLResponse)
async def preview(markdown: str = Form("")):
    return HTMLResponse(render_markdown(markdown))



@router.post("/posts/save")
async def save_post(
    originalSlug: str = Form(""), title: str = Form(...), slug: str = Form(""),
    tags: str = Form(""), markdown: str = Form(""), action: str = Form("draft"),
):
    status = "published" if action == "publish" else "draft"
    try:
        saved = (await store.update_post(originalSlug, title=title, slug=slug or None,
                                          tags=tags, markdown=markdown, status=status)
                 if originalSlug
                 else await store.create_post(title, markdown, tags, status, slug=slug or None))
    except (ValueError, LookupError) as e:
        raise HTTPException(status_code=400, detail=str(e))
    msg = "Post published" if status == "published" else "Draft saved"
    return RedirectResponse(f"/admin/posts/{saved['slug']}/edit?message={quote(msg)}", status_code=302)


@router.post("/posts/{slug}/delete")
async def delete_post(slug: str):
    try:
        await store.delete_post(slug)
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return RedirectResponse("/admin/posts", status_code=302)
