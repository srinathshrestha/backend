from fastapi import Request
from fastapi.responses import RedirectResponse, JSONResponse
import session as sess

COOKIE = "rawdog_session"


def get_token(request: Request) -> str | None:
    return request.cookies.get(COOKIE)


class AuthRedirect(Exception):
    """Raised when auth fails — handled by exception handler in main.py."""
    def __init__(self, request: Request):
        self.request = request


def require_auth(request: Request) -> str:
    token = get_token(request)
    if not sess.validate(token):
        raise AuthRedirect(request)
    return token  # type: ignore[return-value]
