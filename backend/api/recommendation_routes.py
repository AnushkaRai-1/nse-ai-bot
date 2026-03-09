"""
Recommendation & Market Data API routes — PRD Section 7.2
GET /api/v1/recommendations           — Daily top recommendations
GET /api/v1/recommendations/{symbol}  — Full detail for one stock
GET /api/v1/market/regime             — Current Bull/Bear/Volatile
GET /api/v1/stocks/{symbol}/signals   — Raw signal values
GET /api/v1/stocks/{symbol}/montecarlo — GARCH-MC probability intervals
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, desc, func, and_
from sqlalchemy.ext.asyncio import AsyncSession

from backend.core.database import get_db
from backend.core.models import (
    FeaturesDaily,
    MonteCarloCache,
    Recommendation,
    Stock,
)
from backend.core.schemas import (
    Direction,
    Horizon,
    MarketCapBucket,
    MarketRegime,
    MonteCarloResponse,
    RecommendationListResponse,
    RecommendationResponse,
    RegimeResponse,
    SignalBreakdown,
    StockSignalResponse,
)
from backend.api import get_current_user
from backend.core.models import User

router = APIRouter()


@router.get("/recommendations", response_model=RecommendationListResponse)
async def get_recommendations(
    bucket: Optional[MarketCapBucket] = Query(None, description="Filter by market cap"),
    limit: int = Query(10, ge=1, le=50),
    horizon: Optional[Horizon] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Daily top stock recommendations.
    PRD UC-01: View daily stock recommendations with reasoning.
    PRD UC-02: Filter by market cap bucket.
    """
    # Get latest generation timestamp
    latest_time_q = select(func.max(Recommendation.generated_at))
    latest_result = await db.execute(latest_time_q)
    latest_time = latest_result.scalar()

    if not latest_time:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No recommendations available yet. Model may not have run.",
        )

    # Build query for latest recommendations
    query = (
        select(Recommendation, Stock)
        .join(Stock, Recommendation.symbol == Stock.symbol)
        .where(
            Recommendation.generated_at >= latest_time.replace(hour=0, minute=0, second=0)
        )
        .order_by(desc(Recommendation.score))
        .limit(limit)
    )

    if bucket:
        query = query.where(Recommendation.market_cap_bucket == bucket.value)
    if horizon:
        query = query.where(Recommendation.horizon == horizon.value)

    result = await db.execute(query)
    rows = result.all()

    recommendations = []
    for rec, stock in rows:
        recommendations.append(
            RecommendationResponse(
                id=rec.id,
                generated_at=rec.generated_at,
                symbol=rec.symbol,
                company_name=stock.company_name,
                market_cap_bucket=rec.market_cap_bucket,
                sector=stock.sector,
                score=float(rec.score),
                horizon=rec.horizon,
                direction=rec.direction,
                confidence_pct=float(rec.confidence_pct),
                reasoning=rec.reasoning_json,
                model_version=rec.model_version,
            )
        )

    # Get current regime
    regime = await _get_current_regime(db)

    return RecommendationListResponse(
        recommendations=recommendations,
        generated_at=latest_time,
        regime=regime,
        total_count=len(recommendations),
    )


@router.get("/recommendations/{symbol}", response_model=RecommendationResponse)
async def get_recommendation_detail(
    symbol: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Full recommendation detail for one stock — PRD UC-03."""
    symbol = symbol.upper()

    query = (
        select(Recommendation, Stock)
        .join(Stock, Recommendation.symbol == Stock.symbol)
        .where(Recommendation.symbol == symbol)
        .order_by(desc(Recommendation.generated_at))
        .limit(1)
    )

    result = await db.execute(query)
    row = result.first()

    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No recommendation found for {symbol}",
        )

    rec, stock = row
    return RecommendationResponse(
        id=rec.id,
        generated_at=rec.generated_at,
        symbol=rec.symbol,
        company_name=stock.company_name,
        market_cap_bucket=rec.market_cap_bucket,
        sector=stock.sector,
        score=float(rec.score),
        horizon=rec.horizon,
        direction=rec.direction,
        confidence_pct=float(rec.confidence_pct),
        reasoning=rec.reasoning_json,
        model_version=rec.model_version,
    )


@router.get("/market/regime", response_model=RegimeResponse)
async def get_market_regime(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Current market regime classification — PRD UC-05."""
    regime = await _get_current_regime(db)

    # Get Nifty 50 vs 200-day MA for context
    nifty_features = await db.execute(
        select(FeaturesDaily)
        .where(FeaturesDaily.symbol == "NIFTY50")
        .order_by(desc(FeaturesDaily.time))
        .limit(1)
    )
    nifty = nifty_features.scalar_one_or_none()

    return RegimeResponse(
        regime=regime,
        confidence=0.85,  # TODO: Compute from regime model
        nifty50_vs_200dma=float(nifty.ma200_regime) if nifty else 0.0,
        india_vix=None,  # TODO: Fetch India VIX
        reasoning=f"Market classified as {regime.value} based on 200-day MA regime and volatility analysis.",
        as_of=datetime.now(timezone.utc),
    )


@router.get("/stocks/{symbol}/signals", response_model=StockSignalResponse)
async def get_stock_signals(
    symbol: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Raw technical + fundamental + sentiment signal values — PRD UC-03."""
    symbol = symbol.upper()

    query = (
        select(FeaturesDaily)
        .where(FeaturesDaily.symbol == symbol)
        .order_by(desc(FeaturesDaily.time))
        .limit(1)
    )
    result = await db.execute(query)
    features = result.scalar_one_or_none()

    if not features:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No signal data for {symbol}. Features may not have been computed yet.",
        )

    regime = await _get_current_regime(db)

    return StockSignalResponse(
        symbol=symbol,
        as_of=features.time,
        technical={
            "rsi_14": _to_float(features.rsi_14),
            "macd_signal": _to_float(features.macd_signal),
            "adx_value": _to_float(features.adx_value),
            "bb_bandwidth": _to_float(features.bb_bandwidth),
            "ma200_regime": features.ma200_regime,
            "atr_14": _to_float(features.atr_14),
        },
        fundamental={
            "fcf_yield": _to_float(features.fcf_yield),
            "pe_zscore": _to_float(features.pe_zscore),
            "de_ratio": _to_float(features.de_ratio),
        },
        sentiment={
            "sentiment_24h": _to_float(features.sentiment_24h),
            "sentiment_72h": _to_float(features.sentiment_72h),
        },
        regime=regime,
    )


@router.get("/stocks/{symbol}/montecarlo", response_model=MonteCarloResponse)
async def get_monte_carlo(
    symbol: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    GARCH(1,1)-filtered Monte Carlo probability intervals.
    PRD Section 6.3: May return 202 if still computing. Results cached 24h.
    """
    symbol = symbol.upper()

    # Check cache (24h)
    query = (
        select(MonteCarloCache)
        .where(
            MonteCarloCache.symbol == symbol,
            MonteCarloCache.computed_at >= func.now() - __import__("datetime").timedelta(hours=24),
        )
        .order_by(desc(MonteCarloCache.computed_at))
        .limit(1)
    )
    result = await db.execute(query)
    cached = result.scalar_one_or_none()

    if not cached:
        # TODO: Trigger async GARCH-MC computation job
        raise HTTPException(
            status_code=status.HTTP_202_ACCEPTED,
            detail=f"Monte Carlo simulation for {symbol} is being computed. Check back in a few minutes.",
        )

    return MonteCarloResponse(
        symbol=symbol,
        horizon_days=cached.horizon_days,
        prob_positive_5d=float(cached.prob_positive_5d),
        prob_positive_20d=float(cached.prob_positive_20d),
        var_5pct=float(cached.var_5pct),
        expected_return_median=float(cached.expected_return_median),
        ci_lower_95=float(cached.ci_lower_95),
        ci_upper_95=float(cached.ci_upper_95),
        paths_run=cached.paths_run,
        garch_filtered=True,
        computed_at=cached.computed_at,
        cached=True,
    )


# ── Helpers ───────────────────────────────────────────────────

def _to_float(val) -> float | None:
    return float(val) if val is not None else None


async def _get_current_regime(db: AsyncSession) -> MarketRegime:
    """
    Determine market regime from latest Nifty 50 features.
    Literature Review: 200-day MA as regime classifier (Bull/Bear).
    """
    query = (
        select(FeaturesDaily)
        .where(FeaturesDaily.symbol == "NIFTY50")
        .order_by(desc(FeaturesDaily.time))
        .limit(1)
    )
    result = await db.execute(query)
    features = result.scalar_one_or_none()

    if not features:
        return MarketRegime.VOLATILE  # Default if no data

    if features.ma200_regime:  # Price above 200-day MA
        return MarketRegime.BULL
    else:
        # Check volatility to distinguish Bear vs Volatile
        if features.bb_bandwidth and float(features.bb_bandwidth) > 0.15:
            return MarketRegime.VOLATILE
        return MarketRegime.BEAR
