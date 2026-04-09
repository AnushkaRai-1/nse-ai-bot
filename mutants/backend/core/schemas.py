"""
Pydantic schemas — request/response models for all API endpoints.
PRD Section 7: All query parameters validated via Pydantic models.
PRD Section 5.2: Matches database schema exactly.
"""

from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal
from enum import Enum

from pydantic import BaseModel, EmailStr, Field, field_validator


# ═══════════════════════════════════════════════════════════════
# Enums (mirror database ENUM types)
# ═══════════════════════════════════════════════════════════════

class MarketCapBucket(str, Enum):
    LARGE = "large"
    MID = "mid"
    SMALL = "small"


class Horizon(str, Enum):
    SHORT = "short"    # 1-5 days
    MEDIUM = "medium"  # 15-30 days


class Direction(str, Enum):
    """PRD Section 15.1: No short recommendations. Only Long and Neutral."""
    LONG = "long"
    NEUTRAL = "neutral"


class MarketRegime(str, Enum):
    BULL = "bull"
    BEAR = "bear"
    VOLATILE = "volatile"


class UserRole(str, Enum):
    USER = "user"
    ADMIN = "admin"


# ═══════════════════════════════════════════════════════════════
# Auth Schemas
# ═══════════════════════════════════════════════════════════════

class UserRegister(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=8, max_length=128)
    name: str = Field(..., min_length=1, max_length=200)

    @field_validator("password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        if not any(c.isupper() for c in v):
            raise ValueError("Password must contain at least one uppercase letter")
        if not any(c.isdigit() for c in v):
            raise ValueError("Password must contain at least one digit")
        return v


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int  # seconds


class UserResponse(BaseModel):
    id: uuid.UUID
    email: str
    name: str
    role: UserRole
    created_at: datetime

    class Config:
        from_attributes = True


# ═══════════════════════════════════════════════════════════════
# Stock Schemas
# ═══════════════════════════════════════════════════════════════

class StockBase(BaseModel):
    symbol: str
    company_name: str
    market_cap_bucket: MarketCapBucket
    sector: str
    is_active: bool = True


class StockResponse(StockBase):
    listed_date: date | None = None

    class Config:
        from_attributes = True


# ═══════════════════════════════════════════════════════════════
# OHLCV Schema
# ═══════════════════════════════════════════════════════════════

class OHLCVDaily(BaseModel):
    """PRD Section 5.2: No FLOAT — financial precision required (NUMERIC)."""
    time: datetime
    symbol: str
    open: Decimal
    high: Decimal
    low: Decimal
    close: Decimal
    volume: int
    adj_close: Decimal
    data_source: str = "yfinance"


# ═══════════════════════════════════════════════════════════════
# Feature Schemas
# ═══════════════════════════════════════════════════════════════

class FeaturesDaily(BaseModel):
    """
    PRD Section 5.2 features_daily table.
    All computed with expanding-window (ZERO look-ahead bias).
    """
    time: datetime
    symbol: str

    # Technical — Literature Review Section 3
    rsi_14: float | None = None         # Expanding window, no look-ahead
    macd_signal: float | None = None    # NULL when ADX <= 25 (PRD: ADX-gated)
    bb_bandwidth: float | None = None   # Volatility proxy
    ma200_regime: bool | None = None    # True = price above 200-day MA (Bull)
    adx_value: float | None = None      # Used for MACD gating
    atr_14: float | None = None         # Average True Range

    # Fundamental — Literature Review Section 9
    fcf_yield: float | None = None      # Quarterly, forward-filled
    pe_zscore: float | None = None      # Z-score vs sector (not absolute P/E)
    de_ratio: float | None = None       # Debt-to-equity

    # Sentiment — Literature Review Section 6
    sentiment_24h: float | None = None  # FinBERT score [-1, +1]
    sentiment_72h: float | None = None  # 3-day rolling average

    # Volume
    volume_z_3m: float | None = None    # Z-score vs 3-month rolling mean


# ═══════════════════════════════════════════════════════════════
# Recommendation Schemas
# ═══════════════════════════════════════════════════════════════

class SignalBreakdown(BaseModel):
    """Human-readable reasoning for a recommendation."""
    xgboost_signal: float          # 0-1 probability from XGBoost
    lstm_signal: float | None = None  # 0-1 probability from LSTM (Phase 2)
    garch_confidence: float | None = None  # P(return > 0) from GARCH-MC (Phase 2)
    regime: MarketRegime | None = None  # Market regime at signal time
    key_drivers: list[str] = []    # e.g. ["RSI oversold (28)", "Strong FCF yield (8.2%)"]
    risk_factors: list[str] = []   # e.g. ["High D/E ratio (2.3)", "Bear regime"]


class RecommendationResponse(BaseModel):
    id: uuid.UUID
    generated_at: datetime
    symbol: str
    company_name: str
    market_cap_bucket: MarketCapBucket
    sector: str
    score: float = Field(..., ge=0, le=100, description="0-100 composite score")
    horizon: Horizon
    direction: Direction
    confidence_pct: float = Field(..., ge=0, le=100)
    reasoning: SignalBreakdown
    model_version: str  # MLflow run ID

    class Config:
        from_attributes = True


class RecommendationListResponse(BaseModel):
    recommendations: list[RecommendationResponse]
    generated_at: datetime
    regime: MarketRegime | None = None
    total_count: int
    # PRD Section 15.1: Mandatory disclaimer
    disclaimer: str = (
        "This is not SEBI-registered investment advice. "
        "Past performance does not guarantee future results."
    )


# ═══════════════════════════════════════════════════════════════
# Market Regime Schema
# ═══════════════════════════════════════════════════════════════

class RegimeResponse(BaseModel):
    regime: MarketRegime
    confidence: float
    nifty50_vs_200dma: float  # % above/below 200-day MA
    india_vix: float | None
    reasoning: str
    as_of: datetime


# ═══════════════════════════════════════════════════════════════
# Signal Detail Schema
# ═══════════════════════════════════════════════════════════════

class StockSignalResponse(BaseModel):
    symbol: str
    as_of: datetime
    technical: dict  # RSI, MACD, BB, MA200, ADX, ATR
    fundamental: dict  # FCF yield, P/E z-score, D/E
    sentiment: dict  # 24h score, 72h score
    regime: MarketRegime


# ═══════════════════════════════════════════════════════════════
# Monte Carlo Schema
# ═══════════════════════════════════════════════════════════════

class MonteCarloResponse(BaseModel):
    """PRD Section 6.3: GARCH(1,1)-filtered MC, 10,000 paths."""
    symbol: str
    horizon_days: int
    prob_positive_5d: float
    prob_positive_20d: float
    var_5pct: float            # 5th percentile drawdown (VaR proxy)
    expected_return_median: float
    ci_lower_95: float         # 95% confidence interval lower bound
    ci_upper_95: float         # 95% confidence interval upper bound
    paths_run: int = 10_000
    garch_filtered: bool = True  # Always True — standard GBM is invalid for NSE
    computed_at: datetime
    cached: bool = False


# ═══════════════════════════════════════════════════════════════
# Admin Schemas
# ═══════════════════════════════════════════════════════════════

class SystemHealthResponse(BaseModel):
    status: str  # "healthy" | "degraded" | "down"
    data_freshness: dict  # {"ohlcv": "2024-01-15T16:30:00", "features": "..."}
    model_versions: dict  # {"xgboost_large": "run_abc123", ...}
    last_retrain: datetime | None
    active_jobs: list[str]
    db_connected: bool
    redis_connected: bool


class BacktestResultResponse(BaseModel):
    model_name: str
    market_cap_bucket: MarketCapBucket
    run_id: str
    # PRD Section 8.2: Performance gates
    sharpe_ratio: float
    max_drawdown: float
    win_rate: float
    calmar_ratio: float
    p_value: float  # Bootstrap resampling
    meets_deployment_gate: bool
    walk_forward_folds: int
    train_window_months: int
    test_window_months: int
    computed_at: datetime


class DriftReport(BaseModel):
    """PRD Section 9.2: Drift detection."""
    prediction_drift: dict  # {"30d_win_rate": 0.53, "90d_baseline": 0.55, "alert": False}
    data_drift: dict        # {"features_flagged": ["rsi_14"], "ks_pvalues": {...}}
    regime_shift: dict      # {"detected": False, "current_regime": "bull"}
    model_staleness_days: int
    needs_retrain: bool
    checked_at: datetime


class RetrainTriggerResponse(BaseModel):
    job_id: str
    status: str  # "queued" | "running" | "completed" | "failed"
    model: str
    triggered_at: datetime
    estimated_duration_minutes: int
