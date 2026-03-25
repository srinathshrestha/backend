from contextlib import asynccontextmanager
from pathlib import Path
from datetime import datetime

from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

import db
from config import cfg
from routes import public, auth, admin

_BASE = Path(__file__).parent
_tmpl = Jinja2Templates(directory=str(_BASE / "templates"))


@asynccontextmanager
async def lifespan(_: FastAPI):
    await db.connect()
    yield
    await db.close()


app = FastAPI(lifespan=lifespan)

# Static files (CSS, images, JS, favicon — unchanged from Node version)
app.mount("/uploads", StaticFiles(directory=str(_BASE / "public" / "uploads"), check_dir=False), name="uploads")
app.mount("/", StaticFiles(directory=str(_BASE / "public"), html=False), name="static")

# Inject global template context (mirrors res.locals in Express)
_fmt = lambda v: datetime.fromisoformat(v).strftime("%b %d, %Y") if v else ""

@app.middleware("http")
async def globals_middleware(req: Request, call_next):
    req.state.blog_title = cfg.BLOG_TITLE
    req.state.year = datetime.utcnow().year
    req.state.format_date = _fmt
    return await call_next(req)

_tmpl.env.globals.update(blog_title=cfg.BLOG_TITLE, year=datetime.utcnow().year, format_date=_fmt)

# Routers
app.include_router(public.router)
app.include_router(auth.router)
app.include_router(admin.router)


@app.exception_handler(404)
async def not_found(req: Request, _):
    return _tmpl.TemplateResponse(req, "404.html", {"title": "Not found"}, status_code=404)


@app.exception_handler(500)
async def server_error(req: Request, _):
    return _tmpl.TemplateResponse(req, "500.html", {"title": "Server error"}, status_code=500)
