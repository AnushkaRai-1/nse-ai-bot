"""
Database connections — async SQLAlchemy for FastAPI, sync for ML training scripts.
PRD Section 5.2: PostgreSQL 16 + TimescaleDB for time-series.
PRD Section 11: SQLAlchemy 2.0 + asyncpg, no raw SQL.
"""

from __future__ import annotations

from collections.abc import AsyncGenerator
from typing import Any

from sqlalchemy import create_engine, MetaData
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from backend.core.config import get_settings

settings = get_settings()

# ── Naming convention for constraints (Alembic-friendly) ─────
convention: dict[str, str] = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}

# ── Async engine (for FastAPI request handling) ──────────────
async_engine = create_async_engine(
    settings.DATABASE_URL,
    echo=settings.DEBUG,
    pool_size=20,
    max_overflow=10,
    pool_pre_ping=True,
)

AsyncSessionLocal = async_sessionmaker(
    async_engine,
    class_=AsyncSession,
    expire_on_commit=False,
)

# ── Sync engine (for ML training scripts, data backfill) ─────
sync_engine = create_engine(
    settings.DATABASE_URL_SYNC,
    echo=settings.DEBUG,
    pool_size=10,
    pool_pre_ping=True,
)

SyncSessionLocal = sessionmaker(bind=sync_engine)


# ── Base model ────────────────────────────────────────────────
class Base(DeclarativeBase):
    metadata = MetaData(naming_convention=convention)


# ── Dependency injection for FastAPI ──────────────────────────
async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


def get_sync_db() -> Session:
    """For training scripts and backfill — not async."""
    session = SyncSessionLocal()
    try:
        return session
    except Exception:
        session.rollback()
        raise
