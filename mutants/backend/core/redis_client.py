"""
Redis client — used for:
  - JWT refresh token blacklist (PRD Section 7.4)
  - Rate limiting counters (PRD Section 7.4: 100 req/min, 10 req/min for auth)
  - GARCH-MC result cache (PRD Section 6.3: results cached 24h)
"""

from __future__ import annotations

import redis.asyncio as redis

from backend.core.config import get_settings

settings = get_settings()

redis_client: redis.Redis | None = None


async def get_redis() -> redis.Redis:
    global redis_client
    if redis_client is None:
        redis_client = redis.from_url(
            settings.REDIS_URL,
            encoding="utf-8",
            decode_responses=True,
        )
    return redis_client


async def close_redis() -> None:
    global redis_client
    if redis_client is not None:
        await redis_client.close()
        redis_client = None
