import bcrypt
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    PORT: int = 3000
    SITE_URL: str = "http://localhost:3000"
    BLOG_TITLE: str = "Rawdog Dev Log"
    SESSION_TTL_DAYS: int = 7
    ADMIN_PASSWORD_HASH: str = ""
    ADMIN_PASSWORD: str = ""
    MONGODB_URI: str
    MONGODB_DB_NAME: str = "myblogs"

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


cfg = Settings()

if not cfg.ADMIN_PASSWORD_HASH:
    if not cfg.ADMIN_PASSWORD:
        raise RuntimeError("ADMIN_PASSWORD_HASH (or ADMIN_PASSWORD for dev) must be set")
    print("[blog] ADMIN_PASSWORD provided — hashing for this session (dev only)")
    cfg.ADMIN_PASSWORD_HASH = bcrypt.hashpw(
        cfg.ADMIN_PASSWORD.encode(), bcrypt.gensalt()
    ).decode()

if not cfg.MONGODB_URI:
    raise RuntimeError("MONGODB_URI must be set")


def verify_password(plain: str) -> bool:
    return bcrypt.checkpw(plain.encode(), cfg.ADMIN_PASSWORD_HASH.encode())
