"""
NSE AI Stock Recommendation System — FastAPI Application
PRD Section 4.1: Stage 4 — Serve + Learn

Entry point: uvicorn backend.main:app --reload
Production:  gunicorn backend.main:app -w 4 -k uvicorn.workers.UvicornWorker
"""

from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from backend.core.config import get_settings
from backend.core.database import async_engine
from backend.core.logging_config import get_logger, setup_logging
from backend.core.redis_client import close_redis, get_redis

settings = get_settings()
logger = get_logger(__name__)


# ── Lifespan: startup/shutdown ────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Startup: verify DB + Redis connections, load models.
    Shutdown: close connections gracefully.
    """
    setup_logging(debug=settings.DEBUG)
    logger.info("starting_app", app_name=settings.APP_NAME)

    # Verify Redis
    try:
        redis = await get_redis()
        await redis.ping()
        logger.info("redis_connected")
    except Exception as e:
        logger.error("redis_connection_failed", error=str(e))

    # Verify DB
    try:
        async with async_engine.connect() as conn:
            await conn.execute(
                __import__("sqlalchemy").text("SELECT 1")
            )
        logger.info("database_connected")
    except Exception as e:
        logger.error("database_connection_failed", error=str(e))

    # Start scheduler (PRD Section 9.3)
    try:
        from backend.mlops.scheduler import setup_scheduler
        setup_scheduler()
        logger.info("scheduler_started")
    except Exception as e:
        logger.warning("scheduler_start_failed", error=str(e))

    yield  # App runs here

    # Shutdown
    logger.info("shutting_down")
    try:
        from backend.mlops.scheduler import scheduler
        scheduler.shutdown(wait=False)
    except Exception:
        pass
    await close_redis()
    await async_engine.dispose()


# ── FastAPI app ───────────────────────────────────────────────
app = FastAPI(
    title=settings.APP_NAME,
    description=(
        "AI-driven NSE stock recommendation platform. "
        "XGBoost/LightGBM ensemble + LSTM + GARCH Monte Carlo. "
        "All predictions are probabilistic and not SEBI-registered investment advice."
    ),
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs" if settings.DEBUG else None,     # No Swagger in production
    redoc_url="/redoc" if settings.DEBUG else None,
)


# ── CORS — PRD Section 7.4: Explicit allowlist, no wildcard in prod ──
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["*"],
)


# ── Security Headers Middleware — PRD Section 10.1 A05 ────────
@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    response.headers["Content-Security-Policy"] = "default-src 'self'"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    # PRD Section 10.1 A05: No stack traces in error responses
    response.headers["Server"] = "nseai"
    return response


# ── Global exception handler — no stack traces to client ──────
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(
        "unhandled_exception",
        path=request.url.path,
        method=request.method,
        error=str(exc),
        exc_info=True,
    )
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"detail": "Internal server error"},
    )


# ── Register routers ─────────────────────────────────────────
from backend.api.auth_routes import router as auth_router
from backend.api.recommendation_routes import router as recommendation_router
from backend.api.admin_routes import router as admin_router
from backend.api.market_routes import router as market_router

app.include_router(auth_router, prefix="/api/v1/auth", tags=["Authentication"])
app.include_router(recommendation_router, prefix="/api/v1", tags=["Recommendations"])
app.include_router(admin_router, prefix="/api/v1/admin", tags=["Admin"])
app.include_router(market_router, prefix="/api/v1/market", tags=["Market Data"])


# ── Root health check ────────────────────────────────────────
@app.get("/", tags=["Health"])
async def root():
    return {
        "service": settings.APP_NAME,
        "version": "1.0.0",
        "status": "running",
        "disclaimer": (
            "This is not SEBI-registered investment advice. "
            "Past performance does not guarantee future results."
        ),
    }
