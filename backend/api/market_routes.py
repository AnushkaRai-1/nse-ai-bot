"""
Market Data API routes — serves OHLCV, quotes, stock lists, historical data.
These endpoints supply data the frontend needs that recommendation_routes doesn't cover.

GET /api/v1/market/quote/{symbol}       — Latest OHLCV row as a quote
GET /api/v1/market/quotes/batch         — Batch quotes for multiple symbols
GET /api/v1/market/historical/{symbol}  — Historical OHLCV for charting
GET /api/v1/market/stocks               — Full stock list with latest features
GET /api/v1/market/screener             — Stock screener with filters
GET /api/v1/market/sectors              — Sector performance summary
GET /api/v1/market/overview             — Market breadth, top gainers/losers
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, desc, func, and_, case, text
from sqlalchemy.ext.asyncio import AsyncSession

from backend.core.database import get_db
from backend.core.models import FeaturesDaily, OHLCVDaily, Recommendation, Stock, User
from backend.api import get_current_user
from backend.core.logging_config import get_logger

router = APIRouter()
logger = get_logger(__name__)


def _to_float(val) -> float | None:
    return float(val) if val is not None else None


# ── Quote: latest OHLCV row for a symbol ──────────────────────
@router.get("/quote/{symbol}")
async def get_quote(
    symbol: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Latest daily quote for a symbol from OHLCV data."""
    symbol = symbol.upper()

    query = (
        select(OHLCVDaily)
        .where(OHLCVDaily.symbol == symbol)
        .order_by(desc(OHLCVDaily.time))
        .limit(2)  # Need previous close for change calculation
    )
    result = await db.execute(query)
    rows = result.scalars().all()

    if not rows:
        raise HTTPException(status_code=404, detail=f"No data for {symbol}")

    latest = rows[0]
    prev_close = float(rows[1].close) if len(rows) > 1 else float(latest.open)
    price = float(latest.close)
    change = price - prev_close
    change_pct = (change / prev_close * 100) if prev_close else 0

    return {
        "symbol": symbol,
        "price": price,
        "change": round(change, 2),
        "changePercent": round(change_pct, 2),
        "volume": latest.volume,
        "timestamp": latest.time.isoformat(),
        "high": _to_float(latest.high),
        "low": _to_float(latest.low),
        "open": _to_float(latest.open),
        "previousClose": prev_close,
    }


# ── Batch Quotes ──────────────────────────────────────────────
@router.post("/quotes/batch")
async def get_batch_quotes(
    body: dict,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Batch quotes for multiple symbols."""
    symbols = [s.upper() for s in body.get("symbols", [])]
    if not symbols:
        return {"quotes": {}, "count": 0}

    # For each symbol, get last 2 rows to compute change
    quotes = {}
    for sym in symbols[:50]:  # Cap at 50
        query = (
            select(OHLCVDaily)
            .where(OHLCVDaily.symbol == sym)
            .order_by(desc(OHLCVDaily.time))
            .limit(2)
        )
        result = await db.execute(query)
        rows = result.scalars().all()
        if rows:
            latest = rows[0]
            prev_close = float(rows[1].close) if len(rows) > 1 else float(latest.open)
            price = float(latest.close)
            change = price - prev_close
            quotes[sym] = {
                "symbol": sym,
                "price": price,
                "change": round(change, 2),
                "changePercent": round((change / prev_close * 100) if prev_close else 0, 2),
                "volume": latest.volume,
                "timestamp": latest.time.isoformat(),
                "high": _to_float(latest.high),
                "low": _to_float(latest.low),
                "open": _to_float(latest.open),
                "previousClose": prev_close,
            }

    return {"quotes": quotes, "count": len(quotes)}


# ── Historical OHLCV for charting ─────────────────────────────
@router.get("/historical/{symbol}")
async def get_historical(
    symbol: str,
    days: int = Query(90, ge=1, le=3650),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Historical daily OHLCV for charting."""
    symbol = symbol.upper()

    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    query = (
        select(OHLCVDaily)
        .where(and_(OHLCVDaily.symbol == symbol, OHLCVDaily.time >= cutoff))
        .order_by(OHLCVDaily.time)
    )
    result = await db.execute(query)
    rows = result.scalars().all()

    if not rows:
        raise HTTPException(status_code=404, detail=f"No historical data for {symbol}")

    data = []
    for r in rows:
        data.append({
            "date": r.time.strftime("%Y-%m-%d"),
            "open": _to_float(r.open),
            "high": _to_float(r.high),
            "low": _to_float(r.low),
            "close": _to_float(r.close),
            "volume": r.volume,
        })

    return {"symbol": symbol, "days": days, "data": data, "count": len(data)}


# ── Stock List (all stocks with latest signals) ──────────────
@router.get("/stocks")
async def get_stocks(
    bucket: Optional[str] = Query(None),
    sector: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    limit: int = Query(500, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Full stock list with latest OHLCV and features for screener."""
    # Get all active stocks
    stock_q = select(Stock).where(Stock.is_active == True).order_by(Stock.symbol)
    if bucket:
        stock_q = stock_q.where(Stock.market_cap_bucket == bucket)
    if sector:
        stock_q = stock_q.where(Stock.sector.ilike(f"%{sector}%"))
    if search:
        pattern = f"%{search}%"
        stock_q = stock_q.where(
            Stock.symbol.ilike(pattern) | Stock.company_name.ilike(pattern)
        )
    stock_q = stock_q.limit(limit)

    stock_result = await db.execute(stock_q)
    stocks = stock_result.scalars().all()

    results = []
    for stock in stocks:
        # Get latest OHLCV (last 2 for change calc)
        ohlcv_q = (
            select(OHLCVDaily)
            .where(OHLCVDaily.symbol == stock.symbol)
            .order_by(desc(OHLCVDaily.time))
            .limit(2)
        )
        ohlcv_result = await db.execute(ohlcv_q)
        ohlcv_rows = ohlcv_result.scalars().all()

        price = 0.0
        change = 0.0
        change_pct = 0.0
        volume = 0
        if ohlcv_rows:
            price = float(ohlcv_rows[0].close)
            prev = float(ohlcv_rows[1].close) if len(ohlcv_rows) > 1 else float(ohlcv_rows[0].open)
            change = round(price - prev, 2)
            change_pct = round((change / prev * 100) if prev else 0, 2)
            volume = ohlcv_rows[0].volume

        # Get latest features
        feat_q = (
            select(FeaturesDaily)
            .where(FeaturesDaily.symbol == stock.symbol)
            .order_by(desc(FeaturesDaily.time))
            .limit(1)
        )
        feat_result = await db.execute(feat_q)
        feat = feat_result.scalar_one_or_none()

        # Get latest recommendation
        rec_q = (
            select(Recommendation)
            .where(Recommendation.symbol == stock.symbol)
            .order_by(desc(Recommendation.generated_at))
            .limit(1)
        )
        rec_result = await db.execute(rec_q)
        rec = rec_result.scalar_one_or_none()

        results.append({
            "symbol": stock.symbol,
            "name": stock.company_name,
            "sector": stock.sector,
            "marketCap": stock.market_cap_bucket,
            "price": price,
            "change": change,
            "changePercent": change_pct,
            "volume": volume,
            "rsi": _to_float(feat.rsi_14) if feat else None,
            "macd": _to_float(feat.macd_signal) if feat else None,
            "adx": _to_float(feat.adx_value) if feat else None,
            "atr": _to_float(feat.atr_14) if feat else None,
            "bbWidth": _to_float(feat.bb_bandwidth) if feat else None,
            "ma200Regime": feat.ma200_regime if feat else None,
            "volumeZ": _to_float(feat.volume_z_3m) if feat else None,
            "pe": _to_float(feat.pe_zscore) if feat else None,
            "fcfYield": _to_float(feat.fcf_yield) if feat else None,
            "deRatio": _to_float(feat.de_ratio) if feat else None,
            "sentiment24h": _to_float(feat.sentiment_24h) if feat else None,
            "aiScore": float(rec.score) if rec else None,
            "aiDirection": rec.direction if rec else None,
            "confidence": float(rec.confidence_pct) if rec else None,
        })

    return {"stocks": results, "count": len(results)}


# ── Screener (filtered stock list) ────────────────────────────
@router.get("/screener")
async def screener(
    bucket: Optional[str] = Query(None),
    sector: Optional[str] = Query(None),
    direction: Optional[str] = Query(None),
    min_score: float = Query(0, ge=0, le=100),
    min_rsi: Optional[float] = Query(None),
    max_rsi: Optional[float] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Filtered stock screener with AI signals."""
    # Start with recommendations joined to stocks and features
    query = (
        select(Recommendation, Stock, FeaturesDaily)
        .join(Stock, Recommendation.symbol == Stock.symbol)
        .outerjoin(
            FeaturesDaily,
            and_(
                Recommendation.symbol == FeaturesDaily.symbol,
            ),
        )
        .where(Recommendation.score >= min_score)
        .order_by(desc(Recommendation.score))
        .limit(limit)
    )

    if bucket:
        query = query.where(Recommendation.market_cap_bucket == bucket)
    if direction:
        query = query.where(Recommendation.direction == direction)
    if sector:
        query = query.where(Stock.sector.ilike(f"%{sector}%"))

    result = await db.execute(query)
    rows = result.all()

    # Deduplicate by symbol (keep highest score)
    seen = set()
    results = []
    for rec, stock, feat in rows:
        if rec.symbol in seen:
            continue
        seen.add(rec.symbol)

        if min_rsi is not None and feat and feat.rsi_14 and float(feat.rsi_14) < min_rsi:
            continue
        if max_rsi is not None and feat and feat.rsi_14 and float(feat.rsi_14) > max_rsi:
            continue

        results.append({
            "symbol": rec.symbol,
            "name": stock.company_name,
            "sector": stock.sector,
            "marketCap": stock.market_cap_bucket,
            "score": float(rec.score),
            "direction": rec.direction,
            "confidence": float(rec.confidence_pct),
            "rsi": _to_float(feat.rsi_14) if feat else None,
            "macd": _to_float(feat.macd_signal) if feat else None,
            "adx": _to_float(feat.adx_value) if feat else None,
            "bbWidth": _to_float(feat.bb_bandwidth) if feat else None,
            "sentiment": _to_float(feat.sentiment_24h) if feat else None,
        })

    return {"results": results, "count": len(results)}


# ── Sector Performance ────────────────────────────────────────
@router.get("/sectors")
async def get_sector_performance(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Average daily change by sector (from latest OHLCV)."""
    # Get latest date
    latest_q = select(func.max(OHLCVDaily.time))
    latest_result = await db.execute(latest_q)
    latest_date = latest_result.scalar()

    if not latest_date:
        return {"sectors": [], "as_of": None}

    # Previous trading day
    prev_q = (
        select(func.max(OHLCVDaily.time))
        .where(OHLCVDaily.time < latest_date)
    )
    prev_result = await db.execute(prev_q)
    prev_date = prev_result.scalar()

    if not prev_date:
        return {"sectors": [], "as_of": latest_date.isoformat()}

    # Compute avg change per sector
    query = text("""
        SELECT s.sector,
               COUNT(DISTINCT o1.symbol) as stock_count,
               ROUND(AVG((o1.close - o2.close) / NULLIF(o2.close, 0) * 100)::numeric, 2) as avg_change
        FROM ohlcv_daily o1
        JOIN ohlcv_daily o2 ON o1.symbol = o2.symbol AND o2.time = :prev_date
        JOIN stocks s ON o1.symbol = s.symbol
        WHERE o1.time = :latest_date AND s.is_active = TRUE
        GROUP BY s.sector
        ORDER BY avg_change DESC
    """)
    result = await db.execute(query, {"latest_date": latest_date, "prev_date": prev_date})
    rows = result.all()

    sectors = [
        {"sector": r[0], "stockCount": r[1], "avgChange": float(r[2]) if r[2] else 0}
        for r in rows
    ]

    return {"sectors": sectors, "as_of": latest_date.isoformat()}


# ── Market Overview (breadth, gainers, losers) ────────────────
@router.get("/overview")
async def get_market_overview(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Market breadth, top gainers, top losers from latest OHLCV."""
    # Get latest date
    latest_q = select(func.max(OHLCVDaily.time))
    latest_result = await db.execute(latest_q)
    latest_date = latest_result.scalar()

    if not latest_date:
        return {"advances": 0, "declines": 0, "unchanged": 0, "gainers": [], "losers": [], "as_of": None}

    prev_q = select(func.max(OHLCVDaily.time)).where(OHLCVDaily.time < latest_date)
    prev_result = await db.execute(prev_q)
    prev_date = prev_result.scalar()

    if not prev_date:
        return {"advances": 0, "declines": 0, "unchanged": 0, "gainers": [], "losers": [], "as_of": latest_date.isoformat()}

    # Compute changes for all stocks
    change_query = text("""
        SELECT o1.symbol, s.company_name, s.sector,
               o1.close as price,
               ROUND(((o1.close - o2.close) / NULLIF(o2.close, 0) * 100)::numeric, 2) as change_pct,
               o1.volume
        FROM ohlcv_daily o1
        JOIN ohlcv_daily o2 ON o1.symbol = o2.symbol AND o2.time = :prev_date
        JOIN stocks s ON o1.symbol = s.symbol
        WHERE o1.time = :latest_date AND s.is_active = TRUE
        ORDER BY change_pct DESC
    """)
    result = await db.execute(change_query, {"latest_date": latest_date, "prev_date": prev_date})
    all_stocks = result.all()

    advances = sum(1 for s in all_stocks if s[4] and float(s[4]) > 0)
    declines = sum(1 for s in all_stocks if s[4] and float(s[4]) < 0)
    unchanged = len(all_stocks) - advances - declines

    def stock_row(s):
        return {
            "symbol": s[0], "name": s[1], "sector": s[2],
            "price": float(s[3]), "changePercent": float(s[4]) if s[4] else 0,
            "volume": s[5],
        }

    gainers = [stock_row(s) for s in all_stocks[:10]]
    losers = [stock_row(s) for s in reversed(all_stocks[-10:])]

    return {
        "advances": advances,
        "declines": declines,
        "unchanged": unchanged,
        "totalStocks": len(all_stocks),
        "gainers": gainers,
        "losers": losers,
        "as_of": latest_date.isoformat(),
    }
