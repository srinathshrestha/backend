from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase
from config import cfg

_client: AsyncIOMotorClient | None = None
_db: AsyncIOMotorDatabase | None = None


async def connect() -> None:
    global _client, _db
    _client = AsyncIOMotorClient(cfg.MONGODB_URI, serverSelectionTimeoutMS=5000)
    _db = _client[cfg.MONGODB_DB_NAME]

    col = _db["posts"]
    await col.create_index([("slug", 1)], unique=True)
    await col.create_index([("status", 1), ("publishedAt", -1)])

    # Import markdown files from filesystem on startup (if any)
    try:
        from fs_import import import_from_filesystem
        await import_from_filesystem(_db)
    except (ImportError, Exception):
        pass

    print(f'[blog] connected to MongoDB "{cfg.MONGODB_DB_NAME}"')


async def close() -> None:
    global _client, _db
    if _client:
        _client.close()
        _client = None
        _db = None


def get_db() -> AsyncIOMotorDatabase:
    if _db is None:
        raise RuntimeError("Database not initialised — call connect() first")
    return _db
