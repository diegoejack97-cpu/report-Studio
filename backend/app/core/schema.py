from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine


USER_TABLE_PATCHES = [
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS reports_limit INTEGER DEFAULT 3",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS reports_used INTEGER DEFAULT 0",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_id INTEGER",
    "ALTER TABLE users ALTER COLUMN reports_this_month SET DEFAULT 0",
]


USER_TABLE_DATA_SYNC = [
    "UPDATE users SET reports_limit = COALESCE(reports_limit, 3)",
    "UPDATE users SET reports_used = COALESCE(reports_used, reports_this_month, 0)",
]


async def ensure_schema(engine: AsyncEngine) -> None:
    async with engine.begin() as conn:
        for statement in USER_TABLE_PATCHES:
            await conn.execute(text(statement))
        for statement in USER_TABLE_DATA_SYNC:
            await conn.execute(text(statement))
