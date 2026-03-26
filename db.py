from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase
from config import cfg

_client: AsyncIOMotorClient | None = None
_db: AsyncIOMotorDatabase | None = None


async def connect() -> None:
    global _client, _db
    
    try:
        _client = AsyncIOMotorClient(
            cfg.MONGODB_URI, 
            serverSelectionTimeoutMS=10000,
            connectTimeoutMS=10000,
            socketTimeoutMS=10000,
            retryWrites=True,
            retryReads=True
        )
        _db = _client[cfg.MONGODB_DB_NAME]

        # Test the connection
        await _client.admin.command('ping')
        
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
    except Exception as e:
        print(f'[blog] ERROR: Failed to connect to MongoDB: {e}')
        print('[blog] Please check:')
        print('  1. Your internet connection')
        print('  2. MongoDB Atlas cluster is running')
        print('  3. Your IP address is whitelisted in MongoDB Atlas')
        print('  4. DNS resolution is working (try: nslookup cluster0.fv6lmcm.mongodb.net)')
        raise


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
