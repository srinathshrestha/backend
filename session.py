import secrets
import time
from config import cfg

_TTL = cfg.SESSION_TTL_DAYS * 24 * 3600  # seconds
_sessions: dict[str, float] = {}         # token -> expires_at


def create() -> str:
    token = secrets.token_hex(32)
    _sessions[token] = time.time() + _TTL
    return token


def validate(token: str | None) -> bool:
    if not token:
        return False
    exp = _sessions.get(token)
    if exp is None:
        return False
    if time.time() > exp:
        _sessions.pop(token, None)
        return False
    return True


def revoke(token: str | None) -> None:
    if token:
        _sessions.pop(token, None)


def purge_expired() -> None:
    now = time.time()
    dead = [t for t, exp in _sessions.items() if exp <= now]
    for t in dead:
        del _sessions[t]
