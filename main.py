from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.responses import RedirectResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

import db
import session as sess
from deps import AuthRedirect
from templates_env import tmpl
from routes import public, auth, admin

_BASE = Path(__file__).parent


@asynccontextmanager
async def lifespan(_: FastAPI):
    await db.connect()
    yield
    await db.close()


app = FastAPI(lifespan=lifespan)


@app.middleware("http")
async def purge_sessions(req: Request, call_next):
    sess.purge_expired()
    return await call_next(req)


# Routers (registered BEFORE static mounts so they take priority)
app.include_router(public.router)
app.include_router(auth.router)
app.include_router(admin.router)

# Static files — after routers so routes always win
app.mount("/uploads", StaticFiles(directory=str(_BASE / "public" / "uploads"), check_dir=False), name="uploads")
app.mount("/", StaticFiles(directory=str(_BASE / "public"), html=False), name="static")


@app.exception_handler(AuthRedirect)
async def auth_redirect(req: Request, exc: AuthRedirect):
    if req.url.path.startswith(("/admin/media/", "/admin/preview")):
        return JSONResponse({"error": "Authentication required"}, status_code=401)
    return RedirectResponse("/admin", status_code=302)


@app.exception_handler(404)
async def not_found(req: Request, _):
    return tmpl.TemplateResponse(req, "404.html", {"title": "Not found"}, status_code=404)


@app.exception_handler(500)
async def server_error(req: Request, _):
    return tmpl.TemplateResponse(req, "500.html", {"title": "Server error"}, status_code=500)
