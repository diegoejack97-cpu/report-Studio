from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine


USER_TABLE_PATCHES = [
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS reports_limit INTEGER DEFAULT 3",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS reports_used INTEGER DEFAULT 0",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_id INTEGER",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_price_id VARCHAR(255)",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS cancel_at_period_end BOOLEAN DEFAULT FALSE",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS pending_price_id VARCHAR(255)",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS current_period_end TIMESTAMPTZ",
    "ALTER TABLE users ALTER COLUMN reports_this_month SET DEFAULT 0",
    "ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS stripe_price_id VARCHAR(255)",
    "ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS cancel_at_period_end BOOLEAN DEFAULT FALSE",
    "ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS pending_price_id VARCHAR(255)",
]


USER_TABLE_DATA_SYNC = [
    "UPDATE users SET reports_limit = COALESCE(reports_limit, 3)",
    "UPDATE users SET reports_used = COALESCE(reports_used, reports_this_month, 0)",
    "UPDATE users SET cancel_at_period_end = COALESCE(cancel_at_period_end, FALSE)",
    "UPDATE subscriptions SET cancel_at_period_end = COALESCE(cancel_at_period_end, FALSE)",
]


async def ensure_schema(engine: AsyncEngine) -> None:
    async with engine.begin() as conn:
        for statement in USER_TABLE_PATCHES:
            await conn.execute(text(statement))
        for statement in USER_TABLE_DATA_SYNC:
            await conn.execute(text(statement))
