"""
yfinance data fetcher — PRD Section 5.1 (Primary data source)
  - OHLCV with .NS suffix for NSE symbols
  - 15-year history per symbol
  - Fundamentals: P/E, FCF, D/E, revenue
  - Corporate-action adjusted prices (adj_close)
  - No FLOAT for money — convert to Decimal before DB write

Universe: Nifty 500 — dynamically fetched from NSE, with local JSON fallback.
Literature Review: yfinance is free, high reliability, 15yr history.
"""

from __future__ import annotations

import csv
import io
import json
import time
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from pathlib import Path
from typing import Optional

import numpy as np
import pandas as pd
import yfinance as yf
from sqlalchemy import text
from sqlalchemy.orm import Session

from backend.core.logging_config import get_logger

logger = get_logger(__name__)

# ── Path to cached Nifty 500 JSON (updated by fetch_nifty500_symbols) ──
_DATA_DIR = Path(__file__).resolve().parent.parent / "data"
_NIFTY500_JSON = _DATA_DIR / "nifty500_symbols.json"


def fetch_nifty500_symbols(force_refresh: bool = False) -> list[str]:
    """
    Fetch Nifty 500 constituents from NSE's public CSV.
    Falls back to locally cached JSON if NSE is unreachable.
    """
    # Return cached if available and not forcing refresh
    if not force_refresh and _NIFTY500_JSON.exists():
        with open(_NIFTY500_JSON) as f:
            symbols = json.load(f)
        if len(symbols) >= 400:  # sanity check
            logger.info("nifty500_loaded_from_cache", count=len(symbols))
            return symbols

    # Fetch live from NSE
    try:
        import requests
        url = "https://archives.nseindia.com/content/indices/ind_nifty500list.csv"
        headers = {"User-Agent": "Mozilla/5.0"}
        resp = requests.get(url, headers=headers, timeout=20)
        resp.raise_for_status()

        reader = csv.DictReader(io.StringIO(resp.text))
        symbols = sorted([row["Symbol"].strip() for row in reader if "Symbol" in row])

        if len(symbols) >= 400:
            _DATA_DIR.mkdir(parents=True, exist_ok=True)
            with open(_NIFTY500_JSON, "w") as f:
                json.dump(symbols, f, indent=2)
            logger.info("nifty500_fetched_from_nse", count=len(symbols))
            return symbols
    except Exception as e:
        logger.warning("nifty500_nse_fetch_failed", error=str(e))

    # Final fallback: cached JSON
    if _NIFTY500_JSON.exists():
        with open(_NIFTY500_JSON) as f:
            symbols = json.load(f)
        logger.info("nifty500_fallback_to_cache", count=len(symbols))
        return symbols

    # Emergency fallback: Nifty 50 hardcoded
    logger.error("nifty500_all_sources_failed", fallback="nifty50_hardcoded")
    return NIFTY_50_SYMBOLS


# ── Nifty 50 — hardcoded fallback only ──
NIFTY_50_SYMBOLS = [
    "RELIANCE", "TCS", "HDFCBANK", "INFY", "ICICIBANK",
    "HINDUNILVR", "ITC", "SBIN", "BHARTIARTL", "KOTAKBANK",
    "LT", "AXISBANK", "ASIANPAINT", "HCLTECH", "MARUTI",
    "BAJFINANCE", "TITAN", "SUNPHARMA", "TATAMOTORS", "NTPC",
    "WIPRO", "ADANIENT", "POWERGRID", "ULTRACEMCO", "NESTLEIND",
    "JSWSTEEL", "TATASTEEL", "BAJAJFINSV", "TECHM", "ONGC",
    "HDFCLIFE", "DIVISLAB", "GRASIM", "INDUSINDBK", "CIPLA",
    "APOLLOHOSP", "COALINDIA", "EICHERMOT", "BRITANNIA", "DRREDDY",
    "BPCL", "HINDALCO", "HEROMOTOCO", "BAJAJ-AUTO", "SBILIFE",
    "TATACONSUM", "M&M", "ADANIPORTS", "VEDL", "BEL",
]

# ── Market cap classification ──
LARGE_CAP_SYMBOLS = set(NIFTY_50_SYMBOLS)  # top 50 by market cap


def nse_symbol(symbol: str) -> str:
    """Convert NSE symbol to yfinance format (append .NS)."""
    return f"{symbol}.NS"


class YFinanceFetcher:
    """
    Fetch OHLCV data and fundamentals from Yahoo Finance.
    PRD Section 5.1: Primary source, 15yr history, NSE symbols (.NS suffix).
    """

    def __init__(self, db_session: Session):
        self.db = db_session

    def get_market_cap_bucket(self, symbol: str, market_cap_inr: float | None = None) -> str:
        """
        Classify stock by market cap bucket.
        If market_cap_inr is provided, use SEBI thresholds:
          - Large cap: top 100 (≥ ₹20,000 Cr typically)
          - Mid cap: 101-250 (≥ ₹5,000 Cr typically)
          - Small cap: 251+
        Otherwise fall back to Nifty 50 set membership.
        """
        if market_cap_inr is not None:
            if market_cap_inr >= 20_000_00_00_000:   # ₹20,000 Cr
                return "large"
            elif market_cap_inr >= 5_000_00_00_000:  # ₹5,000 Cr
                return "mid"
            return "small"
        # Fallback: Nifty 50 ≈ large cap
        if symbol in LARGE_CAP_SYMBOLS:
            return "large"
        return "mid"  # Nifty 500 non-Nifty-50 are mostly mid/large

    def fetch_ohlcv(
        self,
        symbol: str,
        period: str = "15y",
        start: Optional[str] = None,
        end: Optional[str] = None,
    ) -> pd.DataFrame:
        """
        Fetch OHLCV data for a single NSE symbol.
        Returns DataFrame with columns: Open, High, Low, Close, Volume, Adj Close
        """
        yf_symbol = nse_symbol(symbol)
        logger.info("fetching_ohlcv", symbol=symbol, yf_symbol=yf_symbol, period=period)

        try:
            ticker = yf.Ticker(yf_symbol)
            if start and end:
                df = ticker.history(start=start, end=end, auto_adjust=False)
            else:
                df = ticker.history(period=period, auto_adjust=False)

            if df.empty:
                logger.warning("empty_ohlcv", symbol=symbol)
                return pd.DataFrame()

            # Standardize column names
            df = df.rename(columns={
                "Open": "open",
                "High": "high",
                "Low": "low",
                "Close": "close",
                "Volume": "volume",
                "Adj Close": "adj_close",
            })

            # Keep only needed columns
            cols = ["open", "high", "low", "close", "volume", "adj_close"]
            available = [c for c in cols if c in df.columns]
            df = df[available].copy()

            # If Adj Close is missing, use Close
            if "adj_close" not in df.columns:
                df["adj_close"] = df["close"]

            df["symbol"] = symbol
            df["data_source"] = "yfinance"
            df.index.name = "time"
            df = df.reset_index()

            # Ensure timezone-aware timestamps
            if df["time"].dt.tz is None:
                df["time"] = df["time"].dt.tz_localize("Asia/Kolkata")

            logger.info("ohlcv_fetched", symbol=symbol, rows=len(df))
            return df

        except Exception as e:
            logger.error("ohlcv_fetch_failed", symbol=symbol, error=str(e))
            return pd.DataFrame()

    def fetch_fundamentals(self, symbol: str) -> dict:
        """
        Fetch fundamental data: P/E, FCF, D/E, revenue, market cap.
        PRD Section 5.2: FCF yield, P/E z-score vs sector, D/E ratio.
        """
        yf_symbol = nse_symbol(symbol)
        logger.info("fetching_fundamentals", symbol=symbol)

        try:
            ticker = yf.Ticker(yf_symbol)
            info = ticker.info

            # Extract fundamentals (handle missing gracefully)
            fundamentals = {
                "symbol": symbol,
                "market_cap": info.get("marketCap"),
                "pe_ratio": info.get("trailingPE") or info.get("forwardPE"),
                "pb_ratio": info.get("priceToBook"),
                "dividend_yield": info.get("dividendYield"),
                "debt_to_equity": info.get("debtToEquity"),
                "sector": info.get("sector", "Unknown"),
                "industry": info.get("industry", "Unknown"),
                "company_name": info.get("longName") or info.get("shortName") or symbol,
            }

            # Free Cash Flow — compute yield
            cashflow = ticker.cashflow
            if cashflow is not None and not cashflow.empty:
                fcf_row = cashflow.loc["Free Cash Flow"] if "Free Cash Flow" in cashflow.index else None
                if fcf_row is not None and len(fcf_row) > 0:
                    latest_fcf = fcf_row.iloc[0]
                    mktcap = fundamentals["market_cap"]
                    if mktcap and mktcap > 0:
                        fundamentals["fcf_yield"] = float(latest_fcf) / float(mktcap)
                    else:
                        fundamentals["fcf_yield"] = None
                else:
                    fundamentals["fcf_yield"] = None
            else:
                fundamentals["fcf_yield"] = None

            # Revenue QoQ growth
            financials = ticker.quarterly_financials
            if financials is not None and not financials.empty:
                revenue_row = None
                for label in ["Total Revenue", "Revenue"]:
                    if label in financials.index:
                        revenue_row = financials.loc[label]
                        break
                if revenue_row is not None and len(revenue_row) >= 2:
                    curr, prev = revenue_row.iloc[0], revenue_row.iloc[1]
                    if prev and prev != 0:
                        fundamentals["revenue_qoq_growth"] = float((curr - prev) / abs(prev))
                    else:
                        fundamentals["revenue_qoq_growth"] = None
                else:
                    fundamentals["revenue_qoq_growth"] = None
            else:
                fundamentals["revenue_qoq_growth"] = None

            logger.info("fundamentals_fetched", symbol=symbol)
            return fundamentals

        except Exception as e:
            logger.error("fundamentals_fetch_failed", symbol=symbol, error=str(e))
            return {"symbol": symbol}

    def save_ohlcv_to_db(self, df: pd.DataFrame) -> int:
        """
        Save OHLCV DataFrame to database.
        PRD Section 15.1: No FLOAT — use Decimal for money values.
        Uses upsert (INSERT ON CONFLICT) to handle re-runs safely.
        """
        if df.empty:
            return 0

        rows_saved = 0
        for _, row in df.iterrows():
            try:
                self.db.execute(
                    text("""
                        INSERT INTO ohlcv_daily (time, symbol, open, high, low, close, volume, adj_close, data_source)
                        VALUES (:time, :symbol, :open, :high, :low, :close, :volume, :adj_close, :data_source)
                        ON CONFLICT (time, symbol) DO UPDATE SET
                            open = EXCLUDED.open,
                            high = EXCLUDED.high,
                            low = EXCLUDED.low,
                            close = EXCLUDED.close,
                            volume = EXCLUDED.volume,
                            adj_close = EXCLUDED.adj_close,
                            data_source = EXCLUDED.data_source
                    """),
                    {
                        "time": row["time"],
                        "symbol": row["symbol"],
                        "open": Decimal(str(round(row["open"], 4))),
                        "high": Decimal(str(round(row["high"], 4))),
                        "low": Decimal(str(round(row["low"], 4))),
                        "close": Decimal(str(round(row["close"], 4))),
                        "volume": int(row["volume"]),
                        "adj_close": Decimal(str(round(row["adj_close"], 4))),
                        "data_source": row.get("data_source", "yfinance"),
                    },
                )
                rows_saved += 1
            except Exception as e:
                logger.error("ohlcv_save_failed", symbol=row.get("symbol"), error=str(e))

        self.db.commit()
        logger.info("ohlcv_saved", rows=rows_saved)
        return rows_saved

    def register_stock(self, symbol: str, fundamentals: dict) -> None:
        """Insert or update stock in master registry."""
        market_cap = fundamentals.get("market_cap")
        bucket = self.get_market_cap_bucket(symbol, market_cap_inr=market_cap)
        self.db.execute(
            text("""
                INSERT INTO stocks (symbol, company_name, market_cap_bucket, sector, is_active)
                VALUES (:symbol, :company_name, :bucket, :sector, TRUE)
                ON CONFLICT (symbol) DO UPDATE SET
                    company_name = EXCLUDED.company_name,
                    market_cap_bucket = EXCLUDED.market_cap_bucket,
                    sector = EXCLUDED.sector,
                    updated_at = NOW()
            """),
            {
                "symbol": symbol,
                "company_name": fundamentals.get("company_name", symbol),
                "bucket": bucket,
                "sector": fundamentals.get("sector", "Unknown"),
            },
        )
        self.db.commit()

    def backfill_universe(
        self,
        symbols: list[str] | None = None,
        period: str = "15y",
        batch_size: int = 50,
    ) -> dict:
        """
        Full backfill: register stocks + fetch 15yr OHLCV for entire universe.
        PRD Phase 1 Week 1-2: 15yr OHLCV for Nifty 500 universe.
        """
        if symbols is None:
            symbols = fetch_nifty500_symbols()  # Full Nifty 500

        total = len(symbols)
        logger.info("backfill_starting", universe_size=total)
        results = {"success": 0, "failed": 0, "total": total, "symbols": {}}

        for i, symbol in enumerate(symbols):
            pct = round((i / total) * 100, 1)
            logger.info(
                "backfill_progress",
                current=i + 1,
                total=total,
                pct=pct,
                symbol=symbol,
            )

            try:
                # 1. Fetch fundamentals and register stock
                fundamentals = self.fetch_fundamentals(symbol)
                self.register_stock(symbol, fundamentals)

                # 2. Fetch and save OHLCV
                df = self.fetch_ohlcv(symbol, period=period)
                if not df.empty:
                    rows = self.save_ohlcv_to_db(df)
                    results["success"] += 1
                    results["symbols"][symbol] = {"rows": rows, "status": "ok"}
                else:
                    results["failed"] += 1
                    results["symbols"][symbol] = {"rows": 0, "status": "empty"}
            except Exception as e:
                logger.error("backfill_symbol_failed", symbol=symbol, error=str(e))
                results["failed"] += 1
                results["symbols"][symbol] = {"rows": 0, "status": f"error: {e}"}

            # Rate limit: yfinance recommends ~2 second gaps
            time.sleep(2)

            # Batch checkpoint logging every batch_size stocks
            if (i + 1) % batch_size == 0:
                logger.info(
                    "backfill_checkpoint",
                    processed=i + 1,
                    total=total,
                    success=results["success"],
                    failed=results["failed"],
                )

        logger.info(
            "backfill_complete",
            success=results["success"],
            failed=results["failed"],
        )
        return results
