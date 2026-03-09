"""
SQLAlchemy ORM models — maps to PRD Section 5.2 database schema.
PRD Rule: No FLOAT for money — use Numeric. UUIDs for IDs. TimescaleDB for OHLCV.
"""

from __future__ import annotations

import uuid
from datetime import date, datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    Column,
    Date,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Numeric,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import relationship

from backend.core.database import Base


# ═══════════════════════════════════════════════════════════════
# Users
# ═══════════════════════════════════════════════════════════════

class User(Base):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email = Column(String(255), unique=True, nullable=False, index=True)
    name = Column(String(200), nullable=False)
    password_hash = Column(String(255), nullable=False)
    role = Column(
        Enum("user", "admin", name="user_role", create_type=True),
        default="user",
        nullable=False,
    )
    is_active = Column(Boolean, default=True, nullable=False)
    failed_login_attempts = Column(BigInteger, default=0)
    locked_until = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class RefreshToken(Base):
    """PRD Section 7.4: Refresh token blacklist on logout (server-side in Redis + DB)."""
    __tablename__ = "refresh_tokens"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    token_hash = Column(String(255), nullable=False, unique=True)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    revoked = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


# ═══════════════════════════════════════════════════════════════
# Stocks — Master Symbol Registry
# PRD Section 5.2: is_active=False for delisted (avoids survivorship bias)
# ═══════════════════════════════════════════════════════════════

class Stock(Base):
    __tablename__ = "stocks"

    symbol = Column(String(20), primary_key=True)
    company_name = Column(String(200), nullable=False)
    market_cap_bucket = Column(
        Enum("large", "mid", "small", name="market_cap_bucket", create_type=True),
        nullable=False,
    )
    sector = Column(String(100), nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    listed_date = Column(Date, nullable=True)
    isin = Column(String(20), nullable=True)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


# ═══════════════════════════════════════════════════════════════
# OHLCV Daily — Price History
# PRD Section 5.2: TimescaleDB hypertable. No FLOAT — NUMERIC(12,4).
# ═══════════════════════════════════════════════════════════════

class OHLCVDaily(Base):
    __tablename__ = "ohlcv_daily"

    time = Column(DateTime(timezone=True), primary_key=True, nullable=False)
    symbol = Column(String(20), ForeignKey("stocks.symbol"), primary_key=True, nullable=False)
    open = Column(Numeric(12, 4), nullable=False)
    high = Column(Numeric(12, 4), nullable=False)
    low = Column(Numeric(12, 4), nullable=False)
    close = Column(Numeric(12, 4), nullable=False)
    volume = Column(BigInteger, nullable=False)
    adj_close = Column(Numeric(12, 4), nullable=False)
    data_source = Column(String(50), default="yfinance")

    __table_args__ = (
        Index("idx_ohlcv_symbol_time", "symbol", "time"),
    )


# ═══════════════════════════════════════════════════════════════
# Features Daily — Engineered Feature Matrix
# PRD Section 5.2: One row per stock per day. All expanding-window.
# ═══════════════════════════════════════════════════════════════

class FeaturesDaily(Base):
    __tablename__ = "features_daily"

    time = Column(DateTime(timezone=True), primary_key=True, nullable=False)
    symbol = Column(String(20), ForeignKey("stocks.symbol"), primary_key=True, nullable=False)

    # Technical indicators
    rsi_14 = Column(Numeric(8, 4), nullable=True)
    macd_signal = Column(Numeric(8, 4), nullable=True)  # NULL when ADX <= 25
    bb_bandwidth = Column(Numeric(8, 4), nullable=True)
    ma200_regime = Column(Boolean, nullable=True)  # True = Bull (price > 200-day MA)
    adx_value = Column(Numeric(8, 4), nullable=True)
    atr_14 = Column(Numeric(8, 4), nullable=True)

    # Fundamental
    fcf_yield = Column(Numeric(8, 4), nullable=True)   # Quarterly, forward-filled
    pe_zscore = Column(Numeric(8, 4), nullable=True)    # Z-score vs sector
    de_ratio = Column(Numeric(8, 4), nullable=True)

    # Sentiment
    sentiment_24h = Column(Numeric(5, 4), nullable=True)  # [-1, +1]
    sentiment_72h = Column(Numeric(5, 4), nullable=True)

    # Volume
    volume_z_3m = Column(Numeric(8, 4), nullable=True)  # Z-score vs 3-month rolling mean

    __table_args__ = (
        Index("idx_features_symbol_time", "symbol", "time"),
    )


# ═══════════════════════════════════════════════════════════════
# Recommendations — Model Outputs
# PRD Section 5.2: UUIDs, model_version = MLflow run ID.
# PRD Section 15.1: Direction is 'long' or 'neutral' only (no shorts).
# ═══════════════════════════════════════════════════════════════

class Recommendation(Base):
    __tablename__ = "recommendations"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    generated_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    symbol = Column(String(20), ForeignKey("stocks.symbol"), nullable=False)
    score = Column(Numeric(5, 2), nullable=False)          # 0-100 composite
    horizon = Column(
        Enum("short", "medium", name="horizon_type", create_type=True),
        nullable=False,
    )
    direction = Column(
        Enum("long", "neutral", name="direction_type", create_type=True),
        nullable=False,
    )
    confidence_pct = Column(Numeric(5, 2), nullable=False)
    reasoning_json = Column(JSONB, nullable=False)          # SignalBreakdown
    model_version = Column(String(100), nullable=False)     # MLflow run ID
    market_cap_bucket = Column(
        Enum("large", "mid", "small", name="market_cap_bucket", create_type=False),
        nullable=False,
    )

    __table_args__ = (
        Index("idx_rec_generated", "generated_at"),
        Index("idx_rec_symbol", "symbol"),
        Index("idx_rec_bucket_score", "market_cap_bucket", "score"),
    )


# ═══════════════════════════════════════════════════════════════
# Backtest Results — Walk-Forward Validation Records
# ═══════════════════════════════════════════════════════════════

class BacktestResult(Base):
    __tablename__ = "backtest_results"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    model_name = Column(String(50), nullable=False)  # "xgboost_large", "lstm_mid", etc.
    market_cap_bucket = Column(
        Enum("large", "mid", "small", name="market_cap_bucket", create_type=False),
        nullable=False,
    )
    mlflow_run_id = Column(String(100), nullable=False)
    sharpe_ratio = Column(Numeric(6, 4), nullable=False)
    max_drawdown = Column(Numeric(6, 4), nullable=False)
    win_rate = Column(Numeric(6, 4), nullable=False)
    calmar_ratio = Column(Numeric(6, 4), nullable=False)
    p_value = Column(Numeric(8, 6), nullable=False)
    meets_gate = Column(Boolean, nullable=False)  # PRD Section 8.2 gates
    walk_forward_folds = Column(BigInteger, nullable=False)
    config_json = Column(JSONB, nullable=False)  # Full config for reproducibility
    computed_at = Column(DateTime(timezone=True), server_default=func.now())


# ═══════════════════════════════════════════════════════════════
# Monte Carlo Cache
# ═══════════════════════════════════════════════════════════════

class MonteCarloCache(Base):
    __tablename__ = "montecarlo_cache"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    symbol = Column(String(20), ForeignKey("stocks.symbol"), nullable=False)
    computed_at = Column(DateTime(timezone=True), server_default=func.now())
    horizon_days = Column(BigInteger, nullable=False)
    prob_positive_5d = Column(Numeric(6, 4))
    prob_positive_20d = Column(Numeric(6, 4))
    var_5pct = Column(Numeric(8, 4))
    expected_return_median = Column(Numeric(8, 4))
    ci_lower_95 = Column(Numeric(8, 4))
    ci_upper_95 = Column(Numeric(8, 4))
    paths_run = Column(BigInteger, default=10_000)
    garch_params_json = Column(JSONB)  # omega, alpha, beta for reproducibility

    __table_args__ = (
        Index("idx_mc_symbol_time", "symbol", "computed_at"),
    )
