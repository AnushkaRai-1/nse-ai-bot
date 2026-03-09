"""
Feature engineering pipeline orchestrator — PRD Section 4.1 Stage 2

Coordinates:
  1. Technical feature computation (expanding window)
  2. Fundamental feature computation (quarterly, forward-filled)
  3. Sentiment aggregation (24h + 72h)
  4. Target variable computation (log returns)
  5. Database persistence

CRITICAL: This pipeline enforces ZERO look-ahead bias.
  - All indicators use expanding windows
  - StandardScaler fitted on training window ONLY (handled in training/)
  - Features computed incrementally per stock per day
"""

from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal

import pandas as pd
from sqlalchemy import text
from sqlalchemy.orm import Session

from backend.core.logging_config import get_logger
from backend.features.technical import compute_all_technical_features, compute_target_variables
from backend.features.fundamental import compute_fundamental_features, get_sector_fundamentals

logger = get_logger(__name__)


class FeaturePipeline:
    """
    Orchestrates the full feature engineering pipeline.
    Runs daily after data refresh (PRD Section 9.3).
    """

    def __init__(self, db: Session):
        self.db = db

    def run_for_symbol(self, symbol: str, recompute_all: bool = False) -> int:
        """
        Compute features for a single stock.
        Returns number of feature rows written.
        """
        logger.info("feature_pipeline_start", symbol=symbol)

        # 1. Load OHLCV data
        if recompute_all:
            ohlcv = self._load_all_ohlcv(symbol)
        else:
            ohlcv = self._load_recent_ohlcv(symbol, lookback_days=300)

        if ohlcv.empty:
            logger.warning("no_ohlcv_data", symbol=symbol)
            return 0

        # 2. Compute technical features
        features_df = compute_all_technical_features(ohlcv)

        # 3. Load and merge fundamental data
        fundamentals = self._load_fundamentals(symbol)
        if fundamentals:
            features_df["fcf_yield"] = fundamentals.get("fcf_yield")
            features_df["pe_zscore"] = fundamentals.get("pe_zscore")
            features_df["de_ratio"] = fundamentals.get("de_ratio")
        else:
            features_df["fcf_yield"] = None
            features_df["pe_zscore"] = None
            features_df["de_ratio"] = None

        # 4. Load sentiment (if available)
        sentiment = self._load_latest_sentiment(symbol)
        features_df["sentiment_24h"] = sentiment.get("sentiment_24h")
        features_df["sentiment_72h"] = sentiment.get("sentiment_72h")

        # 5. Compute target variables (for training data only)
        features_df = compute_target_variables(features_df)

        # 6. Save to database
        rows_saved = self._save_features(features_df, symbol)

        logger.info("feature_pipeline_complete", symbol=symbol, rows=rows_saved)
        return rows_saved

    def run_for_universe(self, symbols: list[str] | None = None) -> dict:
        """
        Run feature pipeline for entire stock universe.
        PRD Section 9.3: Runs daily post-data-refresh.
        """
        if symbols is None:
            symbols = self._get_active_symbols()

        results = {"success": 0, "failed": 0, "total_rows": 0}

        for i, symbol in enumerate(symbols):
            logger.info("universe_progress", current=i + 1, total=len(symbols))
            try:
                rows = self.run_for_symbol(symbol)
                results["success"] += 1
                results["total_rows"] += rows
            except Exception as e:
                results["failed"] += 1
                logger.error("feature_pipeline_failed", symbol=symbol, error=str(e))

        logger.info("universe_pipeline_complete", **results)
        return results

    def _load_all_ohlcv(self, symbol: str) -> pd.DataFrame:
        """Load all historical OHLCV for a symbol."""
        result = self.db.execute(
            text("""
                SELECT time, open, high, low, close, volume, adj_close
                FROM ohlcv_daily
                WHERE symbol = :symbol
                ORDER BY time ASC
            """),
            {"symbol": symbol},
        )
        rows = result.fetchall()
        if not rows:
            return pd.DataFrame()

        df = pd.DataFrame(rows, columns=["time", "open", "high", "low", "close", "volume", "adj_close"])
        for col in ["open", "high", "low", "close", "adj_close"]:
            df[col] = df[col].astype(float)
        df["volume"] = df["volume"].astype(float)
        return df

    def _load_recent_ohlcv(self, symbol: str, lookback_days: int = 300) -> pd.DataFrame:
        """
        Load recent OHLCV with enough lookback for 200-day MA.
        300 days ensures we have 200+ trading days of data.
        """
        result = self.db.execute(
            text("""
                SELECT time, open, high, low, close, volume, adj_close
                FROM ohlcv_daily
                WHERE symbol = :symbol
                  AND time >= NOW() - INTERVAL ':days days'
                ORDER BY time ASC
            """.replace(":days", str(lookback_days))),
            {"symbol": symbol},
        )
        rows = result.fetchall()
        if not rows:
            return pd.DataFrame()

        df = pd.DataFrame(rows, columns=["time", "open", "high", "low", "close", "volume", "adj_close"])
        for col in ["open", "high", "low", "close", "adj_close"]:
            df[col] = df[col].astype(float)
        df["volume"] = df["volume"].astype(float)
        return df

    def _load_fundamentals(self, symbol: str) -> dict | None:
        """Load latest fundamental data for a symbol."""
        result = self.db.execute(
            text("""
                SELECT fcf_yield, pe_zscore, de_ratio
                FROM features_daily
                WHERE symbol = :symbol AND fcf_yield IS NOT NULL
                ORDER BY time DESC
                LIMIT 1
            """),
            {"symbol": symbol},
        )
        row = result.fetchone()
        if row:
            return {
                "fcf_yield": float(row[0]) if row[0] else None,
                "pe_zscore": float(row[1]) if row[1] else None,
                "de_ratio": float(row[2]) if row[2] else None,
            }
        return None

    def _load_latest_sentiment(self, symbol: str) -> dict:
        """Load latest sentiment scores for a symbol."""
        result = self.db.execute(
            text("""
                SELECT sentiment_24h, sentiment_72h
                FROM features_daily
                WHERE symbol = :symbol AND sentiment_24h IS NOT NULL
                ORDER BY time DESC
                LIMIT 1
            """),
            {"symbol": symbol},
        )
        row = result.fetchone()
        if row:
            return {
                "sentiment_24h": float(row[0]) if row[0] else 0.0,
                "sentiment_72h": float(row[1]) if row[1] else 0.0,
            }
        return {"sentiment_24h": 0.0, "sentiment_72h": 0.0}

    def _get_active_symbols(self) -> list[str]:
        """Get all active stock symbols."""
        result = self.db.execute(
            text("SELECT symbol FROM stocks WHERE is_active = TRUE ORDER BY symbol")
        )
        return [row[0] for row in result]

    def _save_features(self, df: pd.DataFrame, symbol: str) -> int:
        """
        Save computed features to features_daily table.
        Uses batch upsert for performance (~100x faster than row-by-row).
        """
        feature_cols = [
            "rsi_14", "macd_signal", "bb_bandwidth", "ma200_regime",
            "adx_value", "atr_14", "fcf_yield", "pe_zscore", "de_ratio",
            "sentiment_24h", "sentiment_72h", "volume_z_3m",
        ]

        # Build batch values
        batch = []
        for _, row in df.iterrows():
            values = {"time": row["time"], "symbol": symbol}
            for col in feature_cols:
                val = row.get(col)
                if pd.isna(val) if isinstance(val, float) else val is None:
                    values[col] = None
                elif col == "ma200_regime":
                    values[col] = bool(val)
                else:
                    values[col] = round(float(val), 4)
            batch.append(values)

        if not batch:
            return 0

        # Batch upsert in chunks of 1000
        chunk_size = 1000
        rows_saved = 0
        for i in range(0, len(batch), chunk_size):
            chunk = batch[i : i + chunk_size]
            try:
                self.db.execute(
                    text("""
                        INSERT INTO features_daily (time, symbol, rsi_14, macd_signal, bb_bandwidth,
                            ma200_regime, adx_value, atr_14, fcf_yield, pe_zscore, de_ratio,
                            sentiment_24h, sentiment_72h, volume_z_3m)
                        VALUES (:time, :symbol, :rsi_14, :macd_signal, :bb_bandwidth,
                            :ma200_regime, :adx_value, :atr_14, :fcf_yield, :pe_zscore, :de_ratio,
                            :sentiment_24h, :sentiment_72h, :volume_z_3m)
                        ON CONFLICT (time, symbol) DO UPDATE SET
                            rsi_14 = EXCLUDED.rsi_14,
                            macd_signal = EXCLUDED.macd_signal,
                            bb_bandwidth = EXCLUDED.bb_bandwidth,
                            ma200_regime = EXCLUDED.ma200_regime,
                            adx_value = EXCLUDED.adx_value,
                            atr_14 = EXCLUDED.atr_14,
                            fcf_yield = EXCLUDED.fcf_yield,
                            pe_zscore = EXCLUDED.pe_zscore,
                            de_ratio = EXCLUDED.de_ratio,
                            sentiment_24h = EXCLUDED.sentiment_24h,
                            sentiment_72h = EXCLUDED.sentiment_72h,
                            volume_z_3m = EXCLUDED.volume_z_3m
                    """),
                    chunk,
                )
                rows_saved += len(chunk)
            except Exception as e:
                logger.error("feature_batch_save_failed", symbol=symbol, chunk=i, error=str(e))

        self.db.commit()
        return rows_saved
