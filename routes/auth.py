from fastapi import APIRouter, Request, Form
from fastapi.responses import RedirectResponse
import session as sess
from deps import get_token, COOKIE
from config import cfg, verify_password
from templates_env import tmpl

router = APIRouter()


@router.get("/admin")
async def login_page(req: Request):
    if sess.validate(get_token(req)):
        return RedirectResponse("/admin/posts", status_code=302)
    return tmpl.TemplateResponse(req, "admin/login.html", {
        "title": f"Login · {cfg.BLOG_TITLE}", "error": None
    })


@router.post("/admin/login")
async def handle_login(req: Request, password: str = Form("")):
    if not verify_password(password):
        return tmpl.TemplateResponse(req, "admin/login.html", {
            "title": f"Login · {cfg.BLOG_TITLE}", "error": "Invalid password"
        }, status_code=401)
    token = sess.create()
    resp = RedirectResponse("/admin/posts", status_code=302)
    resp.set_cookie(COOKIE, token, httponly=True, samesite="lax",
                    max_age=cfg.SESSION_TTL_DAYS * 86400,
                    secure=(req.headers.get("x-forwarded-proto") == "https"))
    return resp


@router.post("/admin/logout")
async def handle_logout(req: Request):
    sess.revoke(get_token(req))
    resp = RedirectResponse("/admin", status_code=302)
    resp.delete_cookie(COOKIE)
    return resp
