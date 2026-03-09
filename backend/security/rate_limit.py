"""
Rate limiting — Redis-backed sliding window.
PRD Section 7.4: 100 req/min per user, 10 req/min for auth endpoints.
"""

from __future__ import annotations

from fastapi import HTTPException, Request, status

from backend.core.config import get_settings
from backend.core.redis_client import get_redis

settings = get_settings()


async def check_rate_limit(
    key: str,
    limit: int,
    window_seconds: int = 60,
) -> None:
    """
    Sliding window rate limiter using Redis.
    Raises 429 if limit exceeded.
    """
    redis = await get_redis()
    current = await redis.get(f"rate:{key}")

    if current and int(current) >= limit:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Rate limit exceeded. Try again later.",
        )

    pipe = redis.pipeline()
    pipe.incr(f"rate:{key}")
    pipe.expire(f"rate:{key}", window_seconds)
    await pipe.execute()


async def rate_limit_middleware(request: Request, limit: int | None = None) -> None:
    """Apply rate limit based on user identity or IP."""
    # Identify the caller
    user_id = getattr(request.state, "user_id", None)
    if user_id:
        key = f"user:{user_id}"
    else:
        forwarded = request.headers.get("X-Forwarded-For")
        key = f"ip:{forwarded or request.client.host}"

    effective_limit = limit or settings.RATE_LIMIT_PER_MINUTE
    await check_rate_limit(key, effective_limit)


async def auth_rate_limit(request: Request) -> None:
    """Stricter rate limit for auth endpoints — 10 req/min."""
    forwarded = request.headers.get("X-Forwarded-For")
    ip = forwarded or request.client.host
    await check_rate_limit(f"auth:{ip}", settings.AUTH_RATE_LIMIT_PER_MINUTE)
