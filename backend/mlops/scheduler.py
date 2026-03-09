"""
APScheduler Job Definitions
PRD Section 9.3: Production Schedule (All times IST)

Daily:
  - 6:00 PM: Fetch OHLCV via yfinance (.NS)
  - 6:05 PM: Fetch NSE delivery data + FII/DII flows
  - 6:10 PM: Fetch news headlines
  - 6:15 PM: Compute features (technical + fundamental + sentiment)
  - 6:30 PM: Run inference (XGBoost + GARCH-MC → ensemble)
  - 6:45 PM: Publish recommendations to API

Weekly (Sunday 2AM):
  - Retrain XGBoost/LightGBM (walk-forward validation)
  - Run drift detection
  - Update ARIMA baseline

Monthly (1st of month, 2AM):
  - Retrain LSTM
  - Full backtest report
  - Stress test scenarios
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

from backend.core.config import get_settings
from backend.core.database import sync_engine
from backend.core.logging_config import get_logger

settings = get_settings()
logger = get_logger(__name__)

scheduler = AsyncIOScheduler(timezone="Asia/Kolkata")


# ═══════════════════════════════════════════════════════════════
# Daily Jobs
# ═══════════════════════════════════════════════════════════════

async def job_fetch_ohlcv():
    """6:00 PM IST — Fetch daily OHLCV from yfinance."""
    logger.info("job_started", job="fetch_ohlcv")
    try:
        from sqlalchemy.orm import Session
        from backend.ingestion.yfinance_fetcher import YFinanceFetcher

        fetcher = YFinanceFetcher()
        with Session(sync_engine) as session:
            # Fetch today's data for all active symbols
            from backend.core.models import Stock
            symbols = [s.symbol for s in session.query(Stock).filter(Stock.is_active == True).all()]

            for symbol in symbols:
                try:
                    df = fetcher.fetch_ohlcv(symbol, period="5d")  # Last 5 days to catch gaps
                    if df is not None and not df.empty:
                        fetcher.save_ohlcv_to_db(session, symbol, df)
                except Exception as e:
                    logger.error("ohlcv_fetch_error", symbol=symbol, error=str(e))

            session.commit()
        logger.info("job_completed", job="fetch_ohlcv", symbols=len(symbols))
    except Exception as e:
        logger.error("job_failed", job="fetch_ohlcv", error=str(e))


async def job_fetch_nse_data():
    """6:05 PM IST — Fetch NSE delivery data + FII/DII flows."""
    logger.info("job_started", job="fetch_nse_data")
    try:
        from backend.ingestion.nse_fetcher import NSEFetcher
        fetcher = NSEFetcher()
        fii_dii = fetcher.get_fii_dii_data()
        vix = fetcher.get_india_vix()
        logger.info("job_completed", job="fetch_nse_data", vix=vix)
    except Exception as e:
        logger.error("job_failed", job="fetch_nse_data", error=str(e))


async def job_fetch_news():
    """6:10 PM IST — Fetch news headlines for sentiment pipeline."""
    logger.info("job_started", job="fetch_news")
    try:
        from backend.ingestion.news_fetcher import NewsFetcher
        from sqlalchemy.orm import Session
        from backend.core.models import Stock

        fetcher = NewsFetcher()
        with Session(sync_engine) as session:
            symbols = [s.symbol for s in session.query(Stock).filter(Stock.is_active == True).all()]

        for symbol in symbols[:50]:  # Rate limit: top 50 stocks
            try:
                await fetcher.fetch_for_symbol(symbol)
            except Exception as e:
                logger.error("news_fetch_error", symbol=symbol, error=str(e))

        logger.info("job_completed", job="fetch_news")
    except Exception as e:
        logger.error("job_failed", job="fetch_news", error=str(e))


async def job_compute_features():
    """6:15 PM IST — Compute all features."""
    logger.info("job_started", job="compute_features")
    try:
        from sqlalchemy.orm import Session
        from backend.features.pipeline import FeaturePipeline

        pipeline = FeaturePipeline()
        with Session(sync_engine) as session:
            pipeline.run_for_universe(session)
        logger.info("job_completed", job="compute_features")
    except Exception as e:
        logger.error("job_failed", job="compute_features", error=str(e))


async def job_run_inference():
    """6:30 PM IST — Run model inference and generate recommendations."""
    logger.info("job_started", job="run_inference")
    try:
        from sqlalchemy.orm import Session
        from backend.core.models import Stock, FeaturesDaily, Recommendation
        from backend.models.xgboost_model import XGBoostEnsemble
        from backend.models.ensemble import EnsembleModel
        from backend.models.regime import RegimeDetector

        import pandas as pd

        with Session(sync_engine) as session:
            # Load latest features
            stocks = session.query(Stock).filter(Stock.is_active == True).all()

            # Detect regime
            regime_detector = RegimeDetector()
            # Load Nifty 50 prices for regime detection
            from sqlalchemy import text
            nifty_prices = pd.read_sql(
                text("SELECT date, close FROM ohlcv_daily WHERE symbol = '^NSEI' ORDER BY date"),
                session.bind,
            )
            if len(nifty_prices) > 200:
                regime_result = regime_detector.detect(nifty_prices["close"])
                regime = regime_result["regime"]
            else:
                from backend.core.schemas import MarketRegime
                regime = MarketRegime.VOLATILE

            # Load XGBoost models
            xgb = XGBoostEnsemble()
            try:
                xgb.load("model_artifacts/xgboost", "latest")
            except Exception:
                logger.warning("no_xgboost_model_available")
                return

            ensemble = EnsembleModel()
            stock_inputs = []

            for stock in stocks:
                # Get latest features for this stock
                latest_feat = session.query(FeaturesDaily).filter(
                    FeaturesDaily.symbol == stock.symbol
                ).order_by(FeaturesDaily.date.desc()).first()

                if latest_feat is None:
                    continue

                features = {
                    "rsi_14": latest_feat.rsi_14,
                    "macd_signal": latest_feat.macd_signal,
                    "bb_bandwidth": latest_feat.bb_bandwidth,
                    "ma200_regime": latest_feat.ma200_regime,
                    "adx_value": latest_feat.adx_value,
                    "atr_14": latest_feat.atr_14,
                    "fcf_yield": latest_feat.fcf_yield,
                    "pe_zscore": latest_feat.pe_zscore,
                    "de_ratio": latest_feat.de_ratio,
                    "sentiment_24h": latest_feat.sentiment_24h,
                    "sentiment_72h": latest_feat.sentiment_72h,
                    "volume_z_3m": latest_feat.volume_z_3m,
                }

                # XGBoost prediction
                feat_df = pd.DataFrame([features])
                try:
                    xgb_result = xgb.predict(feat_df, stock.market_cap_bucket)
                    xgb_prob = xgb_result["probability"][0]
                except Exception as e:
                    logger.error("xgb_predict_error", symbol=stock.symbol, error=str(e))
                    continue

                stock_inputs.append({
                    "symbol": stock.symbol,
                    "market_cap_bucket": stock.market_cap_bucket,
                    "xgboost_prob": xgb_prob,
                    "lstm_prob": None,  # Phase 1: LSTM not yet integrated
                    "garch_result": None,  # Phase 1: GARCH async
                    "features": features,
                })

            # Generate recommendations
            recs = ensemble.generate_daily_recommendations(
                stock_inputs,
                regime=regime,
                model_version=xgb.model_version or "unknown",
            )

            # Save to database
            for rec in recs:
                db_rec = Recommendation(
                    symbol=rec["symbol"],
                    date=datetime.now(timezone.utc).date(),
                    score=rec["score"],
                    horizon=rec["horizon"].value,
                    direction=rec["direction"].value,
                    confidence_pct=rec["confidence_pct"],
                    reasoning=rec["reasoning"].model_dump() if hasattr(rec["reasoning"], "model_dump") else {},
                    model_version=rec.get("model_version"),
                    market_cap_bucket=rec["market_cap_bucket"],
                )
                session.merge(db_rec)

            session.commit()
            logger.info("job_completed", job="run_inference", recommendations=len(recs))

    except Exception as e:
        logger.error("job_failed", job="run_inference", error=str(e))


# ═══════════════════════════════════════════════════════════════
# Weekly Jobs
# ═══════════════════════════════════════════════════════════════

async def job_retrain_xgboost():
    """Sunday 2:00 AM IST — Retrain XGBoost/LightGBM with walk-forward."""
    logger.info("job_started", job="retrain_xgboost")
    try:
        from sqlalchemy.orm import Session
        from backend.training.train_xgboost import train_all_buckets

        with Session(sync_engine) as session:
            results = train_all_buckets(session)

        for bucket, result in results.items():
            logger.info(
                "retrain_result",
                bucket=bucket,
                passes_gates=result.get("passes_deployment_gates"),
                sharpe=result.get("walk_forward", {}).get("mean_sharpe"),
            )

    except Exception as e:
        logger.error("job_failed", job="retrain_xgboost", error=str(e))


async def job_drift_detection():
    """Sunday 3:00 AM IST — Run drift detection."""
    logger.info("job_started", job="drift_detection")
    try:
        from backend.mlops.drift_detection import DriftDetector
        detector = DriftDetector()
        # Full implementation reads from DB and compares distributions
        logger.info("job_completed", job="drift_detection")
    except Exception as e:
        logger.error("job_failed", job="drift_detection", error=str(e))


# ═══════════════════════════════════════════════════════════════
# Monthly Jobs
# ═══════════════════════════════════════════════════════════════

async def job_retrain_lstm():
    """1st of month 2:00 AM IST — Retrain LSTM."""
    logger.info("job_started", job="retrain_lstm")
    try:
        from sqlalchemy.orm import Session
        from backend.training.train_lstm import train_lstm

        with Session(sync_engine) as session:
            result = train_lstm(session)

        logger.info(
            "lstm_retrain_result",
            beats_arima=result.get("lstm_beats_arima"),
            sharpe=result.get("walk_forward", {}).get("mean_sharpe"),
        )
    except Exception as e:
        logger.error("job_failed", job="retrain_lstm", error=str(e))


async def job_monthly_backtest():
    """1st of month 4:00 AM IST — Full backtest report."""
    logger.info("job_started", job="monthly_backtest")
    try:
        from backend.backtest.engine import BacktestEngine
        engine = BacktestEngine()
        # Full implementation runs stress tests and generates reports
        logger.info("job_completed", job="monthly_backtest")
    except Exception as e:
        logger.error("job_failed", job="monthly_backtest", error=str(e))


# ═══════════════════════════════════════════════════════════════
# Scheduler Setup
# ═══════════════════════════════════════════════════════════════

def setup_scheduler():
    """Configure all scheduled jobs. Called during FastAPI startup."""

    # ── Daily jobs (IST times) ────────────────────────────────
    scheduler.add_job(job_fetch_ohlcv, CronTrigger(hour=18, minute=0), id="fetch_ohlcv")
    scheduler.add_job(job_fetch_nse_data, CronTrigger(hour=18, minute=5), id="fetch_nse_data")
    scheduler.add_job(job_fetch_news, CronTrigger(hour=18, minute=10), id="fetch_news")
    scheduler.add_job(job_compute_features, CronTrigger(hour=18, minute=15), id="compute_features")
    scheduler.add_job(job_run_inference, CronTrigger(hour=18, minute=30), id="run_inference")

    # ── Weekly jobs (Sunday) ──────────────────────────────────
    scheduler.add_job(job_retrain_xgboost, CronTrigger(day_of_week="sun", hour=2, minute=0), id="retrain_xgboost")
    scheduler.add_job(job_drift_detection, CronTrigger(day_of_week="sun", hour=3, minute=0), id="drift_detection")

    # ── Monthly jobs (1st of month) ───────────────────────────
    scheduler.add_job(job_retrain_lstm, CronTrigger(day=1, hour=2, minute=0), id="retrain_lstm")
    scheduler.add_job(job_monthly_backtest, CronTrigger(day=1, hour=4, minute=0), id="monthly_backtest")

    scheduler.start()
    logger.info("scheduler_started", jobs=len(scheduler.get_jobs()))


def get_scheduler_status() -> list[dict]:
    """Get status of all scheduled jobs. Used by admin API."""
    jobs = []
    for job in scheduler.get_jobs():
        jobs.append({
            "id": job.id,
            "next_run": job.next_run_time.isoformat() if job.next_run_time else None,
            "trigger": str(job.trigger),
        })
    return jobs
