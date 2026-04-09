"""
Rate limiting — Redis-backed sliding window.
PRD Section 7.4: 100 req/min per user, 10 req/min for auth endpoints.
"""

from __future__ import annotations

from fastapi import HTTPException, Request, status

from backend.core.config import get_settings
from backend.core.redis_client import get_redis

settings = get_settings()
from typing import Annotated
from typing import Callable
from typing import ClassVar

MutantDict = Annotated[dict[str, Callable], "Mutant"] # type: ignore


def _mutmut_trampoline(orig, mutants, call_args, call_kwargs, self_arg = None): # type: ignore
    """Forward call to original or mutated function, depending on the environment"""
    import os # type: ignore
    mutant_under_test = os.environ['MUTANT_UNDER_TEST'] # type: ignore
    if mutant_under_test == 'fail': # type: ignore
        from mutmut.__main__ import MutmutProgrammaticFailException # type: ignore
        raise MutmutProgrammaticFailException('Failed programmatically')       # type: ignore
    elif mutant_under_test == 'stats': # type: ignore
        from mutmut.__main__ import record_trampoline_hit # type: ignore
        record_trampoline_hit(orig.__module__ + '.' + orig.__name__) # type: ignore
        # (for class methods, orig is bound and thus does not need the explicit self argument)
        result = orig(*call_args, **call_kwargs) # type: ignore
        return result # type: ignore
    prefix = orig.__module__ + '.' + orig.__name__ + '__mutmut_' # type: ignore
    if not mutant_under_test.startswith(prefix): # type: ignore
        result = orig(*call_args, **call_kwargs) # type: ignore
        return result # type: ignore
    mutant_name = mutant_under_test.rpartition('.')[-1] # type: ignore
    if self_arg is not None: # type: ignore
        # call to a class method where self is not bound
        result = mutants[mutant_name](self_arg, *call_args, **call_kwargs) # type: ignore
    else:
        result = mutants[mutant_name](*call_args, **call_kwargs) # type: ignore
    return result # type: ignore


async def check_rate_limit(
    key: str,
    limit: int,
    window_seconds: int = 60,
) -> None:
    args = [key, limit, window_seconds]# type: ignore
    kwargs = {}# type: ignore
    return await _mutmut_trampoline(x_check_rate_limit__mutmut_orig, x_check_rate_limit__mutmut_mutants, args, kwargs, None)


async def x_check_rate_limit__mutmut_orig(
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


async def x_check_rate_limit__mutmut_1(
    key: str,
    limit: int,
    window_seconds: int = 61,
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


async def x_check_rate_limit__mutmut_2(
    key: str,
    limit: int,
    window_seconds: int = 60,
) -> None:
    """
    Sliding window rate limiter using Redis.
    Raises 429 if limit exceeded.
    """
    redis = None
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


async def x_check_rate_limit__mutmut_3(
    key: str,
    limit: int,
    window_seconds: int = 60,
) -> None:
    """
    Sliding window rate limiter using Redis.
    Raises 429 if limit exceeded.
    """
    redis = await get_redis()
    current = None

    if current and int(current) >= limit:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Rate limit exceeded. Try again later.",
        )

    pipe = redis.pipeline()
    pipe.incr(f"rate:{key}")
    pipe.expire(f"rate:{key}", window_seconds)
    await pipe.execute()


async def x_check_rate_limit__mutmut_4(
    key: str,
    limit: int,
    window_seconds: int = 60,
) -> None:
    """
    Sliding window rate limiter using Redis.
    Raises 429 if limit exceeded.
    """
    redis = await get_redis()
    current = await redis.get(None)

    if current and int(current) >= limit:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Rate limit exceeded. Try again later.",
        )

    pipe = redis.pipeline()
    pipe.incr(f"rate:{key}")
    pipe.expire(f"rate:{key}", window_seconds)
    await pipe.execute()


async def x_check_rate_limit__mutmut_5(
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

    if current or int(current) >= limit:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Rate limit exceeded. Try again later.",
        )

    pipe = redis.pipeline()
    pipe.incr(f"rate:{key}")
    pipe.expire(f"rate:{key}", window_seconds)
    await pipe.execute()


async def x_check_rate_limit__mutmut_6(
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

    if current and int(None) >= limit:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Rate limit exceeded. Try again later.",
        )

    pipe = redis.pipeline()
    pipe.incr(f"rate:{key}")
    pipe.expire(f"rate:{key}", window_seconds)
    await pipe.execute()


async def x_check_rate_limit__mutmut_7(
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

    if current and int(current) > limit:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Rate limit exceeded. Try again later.",
        )

    pipe = redis.pipeline()
    pipe.incr(f"rate:{key}")
    pipe.expire(f"rate:{key}", window_seconds)
    await pipe.execute()


async def x_check_rate_limit__mutmut_8(
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
            status_code=None,
            detail="Rate limit exceeded. Try again later.",
        )

    pipe = redis.pipeline()
    pipe.incr(f"rate:{key}")
    pipe.expire(f"rate:{key}", window_seconds)
    await pipe.execute()


async def x_check_rate_limit__mutmut_9(
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
            detail=None,
        )

    pipe = redis.pipeline()
    pipe.incr(f"rate:{key}")
    pipe.expire(f"rate:{key}", window_seconds)
    await pipe.execute()


async def x_check_rate_limit__mutmut_10(
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
            detail="Rate limit exceeded. Try again later.",
        )

    pipe = redis.pipeline()
    pipe.incr(f"rate:{key}")
    pipe.expire(f"rate:{key}", window_seconds)
    await pipe.execute()


async def x_check_rate_limit__mutmut_11(
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
            )

    pipe = redis.pipeline()
    pipe.incr(f"rate:{key}")
    pipe.expire(f"rate:{key}", window_seconds)
    await pipe.execute()


async def x_check_rate_limit__mutmut_12(
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
            detail="XXRate limit exceeded. Try again later.XX",
        )

    pipe = redis.pipeline()
    pipe.incr(f"rate:{key}")
    pipe.expire(f"rate:{key}", window_seconds)
    await pipe.execute()


async def x_check_rate_limit__mutmut_13(
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
            detail="rate limit exceeded. try again later.",
        )

    pipe = redis.pipeline()
    pipe.incr(f"rate:{key}")
    pipe.expire(f"rate:{key}", window_seconds)
    await pipe.execute()


async def x_check_rate_limit__mutmut_14(
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
            detail="RATE LIMIT EXCEEDED. TRY AGAIN LATER.",
        )

    pipe = redis.pipeline()
    pipe.incr(f"rate:{key}")
    pipe.expire(f"rate:{key}", window_seconds)
    await pipe.execute()


async def x_check_rate_limit__mutmut_15(
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

    pipe = None
    pipe.incr(f"rate:{key}")
    pipe.expire(f"rate:{key}", window_seconds)
    await pipe.execute()


async def x_check_rate_limit__mutmut_16(
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
    pipe.incr(None)
    pipe.expire(f"rate:{key}", window_seconds)
    await pipe.execute()


async def x_check_rate_limit__mutmut_17(
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
    pipe.expire(None, window_seconds)
    await pipe.execute()


async def x_check_rate_limit__mutmut_18(
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
    pipe.expire(f"rate:{key}", None)
    await pipe.execute()


async def x_check_rate_limit__mutmut_19(
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
    pipe.expire(window_seconds)
    await pipe.execute()


async def x_check_rate_limit__mutmut_20(
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
    pipe.expire(f"rate:{key}", )
    await pipe.execute()

x_check_rate_limit__mutmut_mutants : ClassVar[MutantDict] = { # type: ignore
'x_check_rate_limit__mutmut_1': x_check_rate_limit__mutmut_1, 
    'x_check_rate_limit__mutmut_2': x_check_rate_limit__mutmut_2, 
    'x_check_rate_limit__mutmut_3': x_check_rate_limit__mutmut_3, 
    'x_check_rate_limit__mutmut_4': x_check_rate_limit__mutmut_4, 
    'x_check_rate_limit__mutmut_5': x_check_rate_limit__mutmut_5, 
    'x_check_rate_limit__mutmut_6': x_check_rate_limit__mutmut_6, 
    'x_check_rate_limit__mutmut_7': x_check_rate_limit__mutmut_7, 
    'x_check_rate_limit__mutmut_8': x_check_rate_limit__mutmut_8, 
    'x_check_rate_limit__mutmut_9': x_check_rate_limit__mutmut_9, 
    'x_check_rate_limit__mutmut_10': x_check_rate_limit__mutmut_10, 
    'x_check_rate_limit__mutmut_11': x_check_rate_limit__mutmut_11, 
    'x_check_rate_limit__mutmut_12': x_check_rate_limit__mutmut_12, 
    'x_check_rate_limit__mutmut_13': x_check_rate_limit__mutmut_13, 
    'x_check_rate_limit__mutmut_14': x_check_rate_limit__mutmut_14, 
    'x_check_rate_limit__mutmut_15': x_check_rate_limit__mutmut_15, 
    'x_check_rate_limit__mutmut_16': x_check_rate_limit__mutmut_16, 
    'x_check_rate_limit__mutmut_17': x_check_rate_limit__mutmut_17, 
    'x_check_rate_limit__mutmut_18': x_check_rate_limit__mutmut_18, 
    'x_check_rate_limit__mutmut_19': x_check_rate_limit__mutmut_19, 
    'x_check_rate_limit__mutmut_20': x_check_rate_limit__mutmut_20
}
x_check_rate_limit__mutmut_orig.__name__ = 'x_check_rate_limit'


async def rate_limit_middleware(request: Request, limit: int | None = None) -> None:
    args = [request, limit]# type: ignore
    kwargs = {}# type: ignore
    return await _mutmut_trampoline(x_rate_limit_middleware__mutmut_orig, x_rate_limit_middleware__mutmut_mutants, args, kwargs, None)


async def x_rate_limit_middleware__mutmut_orig(request: Request, limit: int | None = None) -> None:
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


async def x_rate_limit_middleware__mutmut_1(request: Request, limit: int | None = None) -> None:
    """Apply rate limit based on user identity or IP."""
    # Identify the caller
    user_id = None
    if user_id:
        key = f"user:{user_id}"
    else:
        forwarded = request.headers.get("X-Forwarded-For")
        key = f"ip:{forwarded or request.client.host}"

    effective_limit = limit or settings.RATE_LIMIT_PER_MINUTE
    await check_rate_limit(key, effective_limit)


async def x_rate_limit_middleware__mutmut_2(request: Request, limit: int | None = None) -> None:
    """Apply rate limit based on user identity or IP."""
    # Identify the caller
    user_id = getattr(None, "user_id", None)
    if user_id:
        key = f"user:{user_id}"
    else:
        forwarded = request.headers.get("X-Forwarded-For")
        key = f"ip:{forwarded or request.client.host}"

    effective_limit = limit or settings.RATE_LIMIT_PER_MINUTE
    await check_rate_limit(key, effective_limit)


async def x_rate_limit_middleware__mutmut_3(request: Request, limit: int | None = None) -> None:
    """Apply rate limit based on user identity or IP."""
    # Identify the caller
    user_id = getattr(request.state, None, None)
    if user_id:
        key = f"user:{user_id}"
    else:
        forwarded = request.headers.get("X-Forwarded-For")
        key = f"ip:{forwarded or request.client.host}"

    effective_limit = limit or settings.RATE_LIMIT_PER_MINUTE
    await check_rate_limit(key, effective_limit)


async def x_rate_limit_middleware__mutmut_4(request: Request, limit: int | None = None) -> None:
    """Apply rate limit based on user identity or IP."""
    # Identify the caller
    user_id = getattr("user_id", None)
    if user_id:
        key = f"user:{user_id}"
    else:
        forwarded = request.headers.get("X-Forwarded-For")
        key = f"ip:{forwarded or request.client.host}"

    effective_limit = limit or settings.RATE_LIMIT_PER_MINUTE
    await check_rate_limit(key, effective_limit)


async def x_rate_limit_middleware__mutmut_5(request: Request, limit: int | None = None) -> None:
    """Apply rate limit based on user identity or IP."""
    # Identify the caller
    user_id = getattr(request.state, None)
    if user_id:
        key = f"user:{user_id}"
    else:
        forwarded = request.headers.get("X-Forwarded-For")
        key = f"ip:{forwarded or request.client.host}"

    effective_limit = limit or settings.RATE_LIMIT_PER_MINUTE
    await check_rate_limit(key, effective_limit)


async def x_rate_limit_middleware__mutmut_6(request: Request, limit: int | None = None) -> None:
    """Apply rate limit based on user identity or IP."""
    # Identify the caller
    user_id = getattr(request.state, "user_id", )
    if user_id:
        key = f"user:{user_id}"
    else:
        forwarded = request.headers.get("X-Forwarded-For")
        key = f"ip:{forwarded or request.client.host}"

    effective_limit = limit or settings.RATE_LIMIT_PER_MINUTE
    await check_rate_limit(key, effective_limit)


async def x_rate_limit_middleware__mutmut_7(request: Request, limit: int | None = None) -> None:
    """Apply rate limit based on user identity or IP."""
    # Identify the caller
    user_id = getattr(request.state, "XXuser_idXX", None)
    if user_id:
        key = f"user:{user_id}"
    else:
        forwarded = request.headers.get("X-Forwarded-For")
        key = f"ip:{forwarded or request.client.host}"

    effective_limit = limit or settings.RATE_LIMIT_PER_MINUTE
    await check_rate_limit(key, effective_limit)


async def x_rate_limit_middleware__mutmut_8(request: Request, limit: int | None = None) -> None:
    """Apply rate limit based on user identity or IP."""
    # Identify the caller
    user_id = getattr(request.state, "USER_ID", None)
    if user_id:
        key = f"user:{user_id}"
    else:
        forwarded = request.headers.get("X-Forwarded-For")
        key = f"ip:{forwarded or request.client.host}"

    effective_limit = limit or settings.RATE_LIMIT_PER_MINUTE
    await check_rate_limit(key, effective_limit)


async def x_rate_limit_middleware__mutmut_9(request: Request, limit: int | None = None) -> None:
    """Apply rate limit based on user identity or IP."""
    # Identify the caller
    user_id = getattr(request.state, "user_id", None)
    if user_id:
        key = None
    else:
        forwarded = request.headers.get("X-Forwarded-For")
        key = f"ip:{forwarded or request.client.host}"

    effective_limit = limit or settings.RATE_LIMIT_PER_MINUTE
    await check_rate_limit(key, effective_limit)


async def x_rate_limit_middleware__mutmut_10(request: Request, limit: int | None = None) -> None:
    """Apply rate limit based on user identity or IP."""
    # Identify the caller
    user_id = getattr(request.state, "user_id", None)
    if user_id:
        key = f"user:{user_id}"
    else:
        forwarded = None
        key = f"ip:{forwarded or request.client.host}"

    effective_limit = limit or settings.RATE_LIMIT_PER_MINUTE
    await check_rate_limit(key, effective_limit)


async def x_rate_limit_middleware__mutmut_11(request: Request, limit: int | None = None) -> None:
    """Apply rate limit based on user identity or IP."""
    # Identify the caller
    user_id = getattr(request.state, "user_id", None)
    if user_id:
        key = f"user:{user_id}"
    else:
        forwarded = request.headers.get(None)
        key = f"ip:{forwarded or request.client.host}"

    effective_limit = limit or settings.RATE_LIMIT_PER_MINUTE
    await check_rate_limit(key, effective_limit)


async def x_rate_limit_middleware__mutmut_12(request: Request, limit: int | None = None) -> None:
    """Apply rate limit based on user identity or IP."""
    # Identify the caller
    user_id = getattr(request.state, "user_id", None)
    if user_id:
        key = f"user:{user_id}"
    else:
        forwarded = request.headers.get("XXX-Forwarded-ForXX")
        key = f"ip:{forwarded or request.client.host}"

    effective_limit = limit or settings.RATE_LIMIT_PER_MINUTE
    await check_rate_limit(key, effective_limit)


async def x_rate_limit_middleware__mutmut_13(request: Request, limit: int | None = None) -> None:
    """Apply rate limit based on user identity or IP."""
    # Identify the caller
    user_id = getattr(request.state, "user_id", None)
    if user_id:
        key = f"user:{user_id}"
    else:
        forwarded = request.headers.get("x-forwarded-for")
        key = f"ip:{forwarded or request.client.host}"

    effective_limit = limit or settings.RATE_LIMIT_PER_MINUTE
    await check_rate_limit(key, effective_limit)


async def x_rate_limit_middleware__mutmut_14(request: Request, limit: int | None = None) -> None:
    """Apply rate limit based on user identity or IP."""
    # Identify the caller
    user_id = getattr(request.state, "user_id", None)
    if user_id:
        key = f"user:{user_id}"
    else:
        forwarded = request.headers.get("X-FORWARDED-FOR")
        key = f"ip:{forwarded or request.client.host}"

    effective_limit = limit or settings.RATE_LIMIT_PER_MINUTE
    await check_rate_limit(key, effective_limit)


async def x_rate_limit_middleware__mutmut_15(request: Request, limit: int | None = None) -> None:
    """Apply rate limit based on user identity or IP."""
    # Identify the caller
    user_id = getattr(request.state, "user_id", None)
    if user_id:
        key = f"user:{user_id}"
    else:
        forwarded = request.headers.get("X-Forwarded-For")
        key = None

    effective_limit = limit or settings.RATE_LIMIT_PER_MINUTE
    await check_rate_limit(key, effective_limit)


async def x_rate_limit_middleware__mutmut_16(request: Request, limit: int | None = None) -> None:
    """Apply rate limit based on user identity or IP."""
    # Identify the caller
    user_id = getattr(request.state, "user_id", None)
    if user_id:
        key = f"user:{user_id}"
    else:
        forwarded = request.headers.get("X-Forwarded-For")
        key = f"ip:{forwarded and request.client.host}"

    effective_limit = limit or settings.RATE_LIMIT_PER_MINUTE
    await check_rate_limit(key, effective_limit)


async def x_rate_limit_middleware__mutmut_17(request: Request, limit: int | None = None) -> None:
    """Apply rate limit based on user identity or IP."""
    # Identify the caller
    user_id = getattr(request.state, "user_id", None)
    if user_id:
        key = f"user:{user_id}"
    else:
        forwarded = request.headers.get("X-Forwarded-For")
        key = f"ip:{forwarded or request.client.host}"

    effective_limit = None
    await check_rate_limit(key, effective_limit)


async def x_rate_limit_middleware__mutmut_18(request: Request, limit: int | None = None) -> None:
    """Apply rate limit based on user identity or IP."""
    # Identify the caller
    user_id = getattr(request.state, "user_id", None)
    if user_id:
        key = f"user:{user_id}"
    else:
        forwarded = request.headers.get("X-Forwarded-For")
        key = f"ip:{forwarded or request.client.host}"

    effective_limit = limit and settings.RATE_LIMIT_PER_MINUTE
    await check_rate_limit(key, effective_limit)


async def x_rate_limit_middleware__mutmut_19(request: Request, limit: int | None = None) -> None:
    """Apply rate limit based on user identity or IP."""
    # Identify the caller
    user_id = getattr(request.state, "user_id", None)
    if user_id:
        key = f"user:{user_id}"
    else:
        forwarded = request.headers.get("X-Forwarded-For")
        key = f"ip:{forwarded or request.client.host}"

    effective_limit = limit or settings.RATE_LIMIT_PER_MINUTE
    await check_rate_limit(None, effective_limit)


async def x_rate_limit_middleware__mutmut_20(request: Request, limit: int | None = None) -> None:
    """Apply rate limit based on user identity or IP."""
    # Identify the caller
    user_id = getattr(request.state, "user_id", None)
    if user_id:
        key = f"user:{user_id}"
    else:
        forwarded = request.headers.get("X-Forwarded-For")
        key = f"ip:{forwarded or request.client.host}"

    effective_limit = limit or settings.RATE_LIMIT_PER_MINUTE
    await check_rate_limit(key, None)


async def x_rate_limit_middleware__mutmut_21(request: Request, limit: int | None = None) -> None:
    """Apply rate limit based on user identity or IP."""
    # Identify the caller
    user_id = getattr(request.state, "user_id", None)
    if user_id:
        key = f"user:{user_id}"
    else:
        forwarded = request.headers.get("X-Forwarded-For")
        key = f"ip:{forwarded or request.client.host}"

    effective_limit = limit or settings.RATE_LIMIT_PER_MINUTE
    await check_rate_limit(effective_limit)


async def x_rate_limit_middleware__mutmut_22(request: Request, limit: int | None = None) -> None:
    """Apply rate limit based on user identity or IP."""
    # Identify the caller
    user_id = getattr(request.state, "user_id", None)
    if user_id:
        key = f"user:{user_id}"
    else:
        forwarded = request.headers.get("X-Forwarded-For")
        key = f"ip:{forwarded or request.client.host}"

    effective_limit = limit or settings.RATE_LIMIT_PER_MINUTE
    await check_rate_limit(key, )

x_rate_limit_middleware__mutmut_mutants : ClassVar[MutantDict] = { # type: ignore
'x_rate_limit_middleware__mutmut_1': x_rate_limit_middleware__mutmut_1, 
    'x_rate_limit_middleware__mutmut_2': x_rate_limit_middleware__mutmut_2, 
    'x_rate_limit_middleware__mutmut_3': x_rate_limit_middleware__mutmut_3, 
    'x_rate_limit_middleware__mutmut_4': x_rate_limit_middleware__mutmut_4, 
    'x_rate_limit_middleware__mutmut_5': x_rate_limit_middleware__mutmut_5, 
    'x_rate_limit_middleware__mutmut_6': x_rate_limit_middleware__mutmut_6, 
    'x_rate_limit_middleware__mutmut_7': x_rate_limit_middleware__mutmut_7, 
    'x_rate_limit_middleware__mutmut_8': x_rate_limit_middleware__mutmut_8, 
    'x_rate_limit_middleware__mutmut_9': x_rate_limit_middleware__mutmut_9, 
    'x_rate_limit_middleware__mutmut_10': x_rate_limit_middleware__mutmut_10, 
    'x_rate_limit_middleware__mutmut_11': x_rate_limit_middleware__mutmut_11, 
    'x_rate_limit_middleware__mutmut_12': x_rate_limit_middleware__mutmut_12, 
    'x_rate_limit_middleware__mutmut_13': x_rate_limit_middleware__mutmut_13, 
    'x_rate_limit_middleware__mutmut_14': x_rate_limit_middleware__mutmut_14, 
    'x_rate_limit_middleware__mutmut_15': x_rate_limit_middleware__mutmut_15, 
    'x_rate_limit_middleware__mutmut_16': x_rate_limit_middleware__mutmut_16, 
    'x_rate_limit_middleware__mutmut_17': x_rate_limit_middleware__mutmut_17, 
    'x_rate_limit_middleware__mutmut_18': x_rate_limit_middleware__mutmut_18, 
    'x_rate_limit_middleware__mutmut_19': x_rate_limit_middleware__mutmut_19, 
    'x_rate_limit_middleware__mutmut_20': x_rate_limit_middleware__mutmut_20, 
    'x_rate_limit_middleware__mutmut_21': x_rate_limit_middleware__mutmut_21, 
    'x_rate_limit_middleware__mutmut_22': x_rate_limit_middleware__mutmut_22
}
x_rate_limit_middleware__mutmut_orig.__name__ = 'x_rate_limit_middleware'


async def auth_rate_limit(request: Request) -> None:
    args = [request]# type: ignore
    kwargs = {}# type: ignore
    return await _mutmut_trampoline(x_auth_rate_limit__mutmut_orig, x_auth_rate_limit__mutmut_mutants, args, kwargs, None)


async def x_auth_rate_limit__mutmut_orig(request: Request) -> None:
    """Stricter rate limit for auth endpoints — 10 req/min."""
    forwarded = request.headers.get("X-Forwarded-For")
    ip = forwarded or request.client.host
    await check_rate_limit(f"auth:{ip}", settings.AUTH_RATE_LIMIT_PER_MINUTE)


async def x_auth_rate_limit__mutmut_1(request: Request) -> None:
    """Stricter rate limit for auth endpoints — 10 req/min."""
    forwarded = None
    ip = forwarded or request.client.host
    await check_rate_limit(f"auth:{ip}", settings.AUTH_RATE_LIMIT_PER_MINUTE)


async def x_auth_rate_limit__mutmut_2(request: Request) -> None:
    """Stricter rate limit for auth endpoints — 10 req/min."""
    forwarded = request.headers.get(None)
    ip = forwarded or request.client.host
    await check_rate_limit(f"auth:{ip}", settings.AUTH_RATE_LIMIT_PER_MINUTE)


async def x_auth_rate_limit__mutmut_3(request: Request) -> None:
    """Stricter rate limit for auth endpoints — 10 req/min."""
    forwarded = request.headers.get("XXX-Forwarded-ForXX")
    ip = forwarded or request.client.host
    await check_rate_limit(f"auth:{ip}", settings.AUTH_RATE_LIMIT_PER_MINUTE)


async def x_auth_rate_limit__mutmut_4(request: Request) -> None:
    """Stricter rate limit for auth endpoints — 10 req/min."""
    forwarded = request.headers.get("x-forwarded-for")
    ip = forwarded or request.client.host
    await check_rate_limit(f"auth:{ip}", settings.AUTH_RATE_LIMIT_PER_MINUTE)


async def x_auth_rate_limit__mutmut_5(request: Request) -> None:
    """Stricter rate limit for auth endpoints — 10 req/min."""
    forwarded = request.headers.get("X-FORWARDED-FOR")
    ip = forwarded or request.client.host
    await check_rate_limit(f"auth:{ip}", settings.AUTH_RATE_LIMIT_PER_MINUTE)


async def x_auth_rate_limit__mutmut_6(request: Request) -> None:
    """Stricter rate limit for auth endpoints — 10 req/min."""
    forwarded = request.headers.get("X-Forwarded-For")
    ip = None
    await check_rate_limit(f"auth:{ip}", settings.AUTH_RATE_LIMIT_PER_MINUTE)


async def x_auth_rate_limit__mutmut_7(request: Request) -> None:
    """Stricter rate limit for auth endpoints — 10 req/min."""
    forwarded = request.headers.get("X-Forwarded-For")
    ip = forwarded and request.client.host
    await check_rate_limit(f"auth:{ip}", settings.AUTH_RATE_LIMIT_PER_MINUTE)


async def x_auth_rate_limit__mutmut_8(request: Request) -> None:
    """Stricter rate limit for auth endpoints — 10 req/min."""
    forwarded = request.headers.get("X-Forwarded-For")
    ip = forwarded or request.client.host
    await check_rate_limit(None, settings.AUTH_RATE_LIMIT_PER_MINUTE)


async def x_auth_rate_limit__mutmut_9(request: Request) -> None:
    """Stricter rate limit for auth endpoints — 10 req/min."""
    forwarded = request.headers.get("X-Forwarded-For")
    ip = forwarded or request.client.host
    await check_rate_limit(f"auth:{ip}", None)


async def x_auth_rate_limit__mutmut_10(request: Request) -> None:
    """Stricter rate limit for auth endpoints — 10 req/min."""
    forwarded = request.headers.get("X-Forwarded-For")
    ip = forwarded or request.client.host
    await check_rate_limit(settings.AUTH_RATE_LIMIT_PER_MINUTE)


async def x_auth_rate_limit__mutmut_11(request: Request) -> None:
    """Stricter rate limit for auth endpoints — 10 req/min."""
    forwarded = request.headers.get("X-Forwarded-For")
    ip = forwarded or request.client.host
    await check_rate_limit(f"auth:{ip}", )

x_auth_rate_limit__mutmut_mutants : ClassVar[MutantDict] = { # type: ignore
'x_auth_rate_limit__mutmut_1': x_auth_rate_limit__mutmut_1, 
    'x_auth_rate_limit__mutmut_2': x_auth_rate_limit__mutmut_2, 
    'x_auth_rate_limit__mutmut_3': x_auth_rate_limit__mutmut_3, 
    'x_auth_rate_limit__mutmut_4': x_auth_rate_limit__mutmut_4, 
    'x_auth_rate_limit__mutmut_5': x_auth_rate_limit__mutmut_5, 
    'x_auth_rate_limit__mutmut_6': x_auth_rate_limit__mutmut_6, 
    'x_auth_rate_limit__mutmut_7': x_auth_rate_limit__mutmut_7, 
    'x_auth_rate_limit__mutmut_8': x_auth_rate_limit__mutmut_8, 
    'x_auth_rate_limit__mutmut_9': x_auth_rate_limit__mutmut_9, 
    'x_auth_rate_limit__mutmut_10': x_auth_rate_limit__mutmut_10, 
    'x_auth_rate_limit__mutmut_11': x_auth_rate_limit__mutmut_11
}
x_auth_rate_limit__mutmut_orig.__name__ = 'x_auth_rate_limit'
