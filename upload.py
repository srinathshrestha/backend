import os
import uuid
from datetime import datetime
from pathlib import Path

import aiofiles

# Mirrors the Node localUpload.js — saves to public/uploads/YYYY/MM/
_BASE = Path(__file__).parent / "public" / "uploads"
_ALLOWED = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg"}


async def save_upload(data: bytes, filename: str) -> str:
    ext = Path(filename).suffix.lower()
    if ext not in _ALLOWED:
        raise ValueError(f"File type {ext!r} not allowed")

    now = datetime.utcnow()
    folder = _BASE / str(now.year) / f"{now.month:02d}"
    folder.mkdir(parents=True, exist_ok=True)

    safe_name = f"{uuid.uuid4().hex}{ext}"
    dest = folder / safe_name

    async with aiofiles.open(dest, "wb") as f:
        await f.write(data)

    # Return URL path relative to /public
    return f"/uploads/{now.year}/{now.month:02d}/{safe_name}"
