from fastapi import Request, HTTPException
import session as sess

COOKIE = "rawdog_session"


def get_token(request: Request) -> str | None:
    return request.cookies.get(COOKIE)


def require_auth(request: Request) -> str:
    token = get_token(request)
    if not sess.validate(token):
        raise HTTPException(status_code=302, headers={"Location": "/admin"})
    sess.purge_expired()
    return token  # type: ignore[return-value]
