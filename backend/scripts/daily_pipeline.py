#!/usr/bin/env python3
"""
Daily Pipeline — the heartbeat of the platform.
Runs once daily at 7:30 AM IST (before market open at 9:15).

Steps:
  1. Health check (Docker, DB, Redis)
  2. Fetch yesterday's OHLCV for all 500 stocks (yfinance, ~3 min)
  3. Recompute features for updated stocks (~8 min)
  4. Run XGBoost inference with fresh features → new recommendations (~1 min)
  5. Detect current market regime
  6. Log results + update staleness metadata

Run manually:   python -m backend.scripts.daily_pipeline
Run with flag:  python -m backend.scripts.daily_pipeline --skip-fetch  (features + inference only)
"""

from __future__ import annotations

import argparse
import json
import pickle
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd
from sqlalchemy import text

# Ensure project root is on path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

from backend.core.database import SyncSessionLocal
from backend.core.logging_config import get_logger
from backend.features.pipeline import FeaturePipeline
from backend.ingestion.yfinance_fetcher import YFinanceFetcher, fetch_nifty500_symbols
from backend.models.xgboost_model import FEATURE_COLUMNS, XGBoostEnsemble

logger = get_logger(__name__)

import functools
print = functools.partial(print, flush=True)

MODEL_DIR = Path(__file__).parent.parent / "model_artifacts"
PIPELINE_LOG = Path(__file__).parent.parent / "data" / "pipeline_status.json"


# ── Step 0: Health checks ────────────────────────────────────

def check_health() -> dict:
    """Verify all infrastructure is reachable."""
    status = {"db": False, "redis": False, "models": False}

    # Database
    try:
        db = SyncSessionLocal()
        db.execute(text("SELECT 1"))
        db.close()
        status["db"] = True
    except Exception as e:
        print(f"  ❌ Database: {e}")

    # Redis
    try:
        import redis
        r = redis.Redis(host="localhost", port=6379, socket_timeout=3)
        r.ping()
        status["redis"] = True
    except Exception as e:
        print(f"  ⚠️ Redis: {e} (non-critical, continuing)")
        status["redis"] = False  # Non-blocking

    # Model artifacts
    latest_version = get_latest_model_version()
    if latest_version:
        status["models"] = True
        status["model_version"] = latest_version
    else:
        print(f"  ❌ No model artifacts found in {MODEL_DIR / 'xgboost'}")

    return status


def get_latest_model_version() -> str | None:
    """Find the most recent model version directory."""
    model_dir = MODEL_DIR / "xgboost"
    if not model_dir.exists():
        return None
    versions = sorted(
        [d.name for d in model_dir.iterdir() if d.is_dir() and not d.name.startswith(".")],
        reverse=True,
    )
    return versions[0] if versions else None


# ── Step 1: Fetch latest OHLCV ───────────────────────────────

def fetch_ohlcv(db) -> dict:
    """Fetch recent OHLCV for all stocks. Only fetches last 10 days to get new data."""
    print("\n  📥 Fetching latest OHLCV data...")
    t0 = time.time()

    symbols = fetch_nifty500_symbols()
    fetcher = YFinanceFetcher(db)

    success = 0
    failed = 0
    errors = []

    for i, sym in enumerate(symbols):
        try:
            rows = fetcher.fetch_and_store(sym, period="10d")
            success += 1
            if (i + 1) % 50 == 0:
                elapsed = time.time() - t0
                rate = (i + 1) / elapsed if elapsed > 0 else 0
                eta = int((len(symbols) - i - 1) / rate) if rate > 0 else 0
                print(f"    [{i+1}/{len(symbols)}] {sym}: {rows} rows (ETA: ~{eta}s)")
        except Exception as e:
            failed += 1
            errors.append({"symbol": sym, "error": str(e)[:100]})
            if failed <= 5:
                print(f"    ⚠️ {sym}: {e}")

    elapsed = time.time() - t0
    print(f"  ✅ OHLCV: {success}/{len(symbols)} stocks updated in {elapsed:.0f}s ({failed} failed)")

    return {"success": success, "failed": failed, "total": len(symbols),
            "elapsed_s": round(elapsed, 1), "errors": errors[:10]}


# ── Step 2: Recompute features ───────────────────────────────

def update_features(db) -> dict:
    """Recompute features for all stocks that have new OHLCV data."""
    print("\n  🔧 Recomputing features...")
    t0 = time.time()

    # Get all symbols with OHLCV data
    result = db.execute(text("SELECT DISTINCT symbol FROM ohlcv_daily ORDER BY symbol"))
    symbols = [r[0] for r in result.fetchall()]

    # Get latest feature date per symbol to detect staleness
    result = db.execute(text(
        "SELECT symbol, MAX(time) FROM features_daily GROUP BY symbol"
    ))
    feat_latest = {r[0]: r[1] for r in result.fetchall()}

    result = db.execute(text(
        "SELECT symbol, MAX(time) FROM ohlcv_daily GROUP BY symbol"
    ))
    ohlcv_latest = {r[0]: r[1] for r in result.fetchall()}

    # Only recompute for stocks where OHLCV is newer than features
    stale = []
    for sym in symbols:
        ohlcv_date = ohlcv_latest.get(sym)
        feat_date = feat_latest.get(sym)
        if ohlcv_date and (not feat_date or ohlcv_date > feat_date):
            stale.append(sym)

    if not stale:
        print(f"  ✅ Features: All {len(symbols)} stocks up to date, nothing to recompute")
        return {"recomputed": 0, "total": len(symbols), "elapsed_s": 0}

    print(f"  {len(stale)} stocks need feature updates (out of {len(symbols)} total)")

    pipeline = FeaturePipeline(db)
    success = 0
    failed = 0
    total_rows = 0

    for i, sym in enumerate(stale):
        try:
            rows = pipeline.run_for_symbol(sym, recompute_all=False)
            success += 1
            total_rows += rows
            if (i + 1) % 25 == 0:
                elapsed = time.time() - t0
                rate = (i + 1) / elapsed if elapsed > 0 else 0
                eta = int((len(stale) - i - 1) / rate / 60) if rate > 0 else 0
                print(f"    [{i+1}/{len(stale)}] {sym}: {rows} rows (ETA: ~{eta}m)")
        except Exception as e:
            failed += 1
            if failed <= 5:
                print(f"    ⚠️ {sym}: {e}")

    elapsed = time.time() - t0
    print(f"  ✅ Features: {success}/{len(stale)} stocks updated in {elapsed:.0f}s ({total_rows:,} rows)")

    return {"recomputed": success, "failed": failed, "total": len(stale),
            "total_rows": total_rows, "elapsed_s": round(elapsed, 1)}


# ── Step 3: Generate fresh recommendations ───────────────────

def generate_recommendations(db) -> dict:
    """Run XGBoost inference with latest features → store new recommendations."""
    print("\n  🤖 Generating AI recommendations...")
    t0 = time.time()

    latest_version = get_latest_model_version()
    if not latest_version:
        print("  ❌ No model artifacts found. Run training first.")
        return {"error": "No model artifacts", "signals": 0}

    model_path = MODEL_DIR / "xgboost" / latest_version
    print(f"  Using model version: {latest_version}")

    signals_total = 0

    for bucket in ["large", "mid", "small"]:
        lgbm_path = model_path / f"lgbm_{bucket}.pkl"
        xgb_path = model_path / f"xgb_{bucket}.pkl"

        if not lgbm_path.exists() or not xgb_path.exists():
            print(f"    ⚠️ No model for {bucket} cap, skipping")
            continue

        # Load model
        model = XGBoostEnsemble()
        model.models[bucket] = {
            "lgbm": pickle.load(open(lgbm_path, "rb")),
            "xgb": pickle.load(open(xgb_path, "rb")),
        }

        # Get latest features for this bucket
        result = db.execute(text("""
            SELECT f.symbol, f.rsi_14, f.macd_signal, f.bb_bandwidth,
                   f.ma200_regime, f.adx_value, f.atr_14, f.fcf_yield, f.pe_zscore,
                   f.de_ratio, f.sentiment_24h, f.sentiment_72h, f.volume_z_3m,
                   s.company_name, s.sector
            FROM features_daily f
            JOIN stocks s ON f.symbol = s.symbol
            WHERE s.market_cap_bucket = :bucket
              AND s.is_active = TRUE
              AND f.rsi_14 IS NOT NULL
              AND f.time = (
                  SELECT MAX(f2.time) FROM features_daily f2
                  WHERE f2.symbol = f.symbol AND f2.rsi_14 IS NOT NULL
              )
        """), {"bucket": bucket})

        rows = result.fetchall()
        if not rows:
            print(f"    ⚠️ No feature data for {bucket} cap")
            continue

        cols = ["symbol"] + FEATURE_COLUMNS + ["company_name", "sector"]
        df = pd.DataFrame(rows, columns=cols)

        for col in FEATURE_COLUMNS:
            if col == "ma200_regime":
                df[col] = df[col].astype(float)
            else:
                df[col] = pd.to_numeric(df[col], errors="coerce")

        df[FEATURE_COLUMNS] = df[FEATURE_COLUMNS].fillna(0)

        # Predict
        predictions = model.predict(df, bucket)
        probs = predictions["probability"]

        # Build reasoning with key drivers from feature importance
        importance = model.get_feature_importance(bucket)
        top_features = sorted(importance.items(), key=lambda x: x[1], reverse=True)[:5]
        top_feature_names = [f[0] for f in top_features if f[1] > 0]

        count = 0
        for idx, row in df.iterrows():
            prob = probs[idx] if isinstance(probs, list) else probs
            direction = "long" if prob > 0.55 else "short" if prob < 0.45 else "neutral"
            score = round(prob * 100, 2)
            confidence = round(abs(prob - 0.5) * 200, 2)

            # Build per-stock reasoning
            key_drivers = []
            risk_factors = []

            rsi = row.get("rsi_14", 50)
            if rsi > 70:
                risk_factors.append(f"RSI overbought ({rsi:.0f})")
            elif rsi < 30:
                key_drivers.append(f"RSI oversold ({rsi:.0f})")
            else:
                key_drivers.append(f"RSI neutral ({rsi:.0f})")

            adx = row.get("adx_value", 0)
            if adx > 25:
                key_drivers.append(f"Strong trend (ADX {adx:.0f})")
            else:
                risk_factors.append(f"Weak trend (ADX {adx:.0f})")

            macd = row.get("macd_signal", 0)
            if macd and macd > 0:
                key_drivers.append("MACD bullish")
            elif macd and macd < 0:
                risk_factors.append("MACD bearish")

            regime = row.get("ma200_regime", 0)
            if regime == 1:
                key_drivers.append("Above 200-day MA")
            else:
                risk_factors.append("Below 200-day MA")

            vol_z = row.get("volume_z_3m", 0)
            if vol_z and vol_z > 2:
                key_drivers.append(f"Unusual volume (z={vol_z:.1f})")

            reasoning = {
                "xgboost_signal": round(prob, 4),
                "key_drivers": key_drivers[:4],
                "risk_factors": risk_factors[:4],
                "model_features": top_feature_names,
                "sector": row.get("sector", ""),
            }

            try:
                db.execute(text("""
                    INSERT INTO recommendations
                        (symbol, score, horizon, direction, confidence_pct,
                         reasoning_json, model_version, market_cap_bucket)
                    VALUES
                        (:symbol, :score, 'short', :direction, :confidence,
                         :reasoning, :model_version, :bucket)
                """), {
                    "symbol": row["symbol"],
                    "score": score,
                    "direction": direction,
                    "confidence": confidence,
                    "reasoning": json.dumps(reasoning),
                    "model_version": latest_version,
                    "bucket": bucket,
                })
                count += 1
            except Exception as e:
                logger.error("signal_save_failed", symbol=row["symbol"], error=str(e))

        db.commit()
        signals_total += count
        print(f"    {bucket.upper():6s}: {count} signals ({df[df.columns[0]].nunique()} stocks)")

    elapsed = time.time() - t0
    print(f"  ✅ Recommendations: {signals_total} signals generated in {elapsed:.0f}s")

    return {"signals": signals_total, "model_version": latest_version,
            "elapsed_s": round(elapsed, 1)}


# ── Step 4: Detect market regime ──────────────────────────────

def detect_regime(db) -> dict:
    """Detect current market regime from NIFTY 50 proxy data."""
    print("\n  📊 Detecting market regime...")

    try:
        # Use the broadest large-cap stock as NIFTY proxy (RELIANCE or aggregate)
        result = db.execute(text("""
            SELECT time, adj_close FROM ohlcv_daily
            WHERE symbol = 'NIFTY50' OR symbol = 'RELIANCE'
            ORDER BY time DESC LIMIT 250
        """))
        rows = result.fetchall()

        if len(rows) < 200:
            # Fallback: compute market average from large caps
            result = db.execute(text("""
                SELECT o.time, AVG(o.adj_close) as avg_close
                FROM ohlcv_daily o
                JOIN stocks s ON o.symbol = s.symbol
                WHERE s.market_cap_bucket = 'large'
                  AND o.time > NOW() - INTERVAL '400 days'
                GROUP BY o.time
                ORDER BY o.time DESC
                LIMIT 250
            """))
            rows = result.fetchall()

        if len(rows) < 50:
            print("  ⚠️ Insufficient data for regime detection")
            return {"regime": "unknown", "confidence": 0}

        prices = pd.Series([float(r[1]) for r in reversed(rows)])
        ma200 = prices.rolling(200).mean().iloc[-1] if len(prices) >= 200 else prices.mean()
        ma50 = prices.rolling(50).mean().iloc[-1] if len(prices) >= 50 else prices.mean()
        current = prices.iloc[-1]

        # Simple regime classification
        returns_20d = prices.pct_change().tail(20)
        volatility = returns_20d.std() * np.sqrt(252)

        if current > ma200 and current > ma50:
            regime = "bull"
            confidence = min(95, 60 + (current - ma200) / ma200 * 500)
        elif current < ma200 and current < ma50:
            regime = "bear"
            confidence = min(95, 60 + (ma200 - current) / ma200 * 500)
        elif volatility > 0.30:
            regime = "volatile"
            confidence = min(90, 50 + volatility * 100)
        else:
            regime = "sideways"
            confidence = 55

        # Store regime state as a JSON file for API to read
        regime_data = {
            "regime": regime,
            "confidence": round(confidence, 1),
            "volatility": round(volatility * 100, 2),
            "current_vs_ma200": round((current / ma200 - 1) * 100, 2) if ma200 else 0,
            "current_vs_ma50": round((current / ma50 - 1) * 100, 2) if ma50 else 0,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }

        regime_path = MODEL_DIR / "regime_state.json"
        regime_path.parent.mkdir(parents=True, exist_ok=True)
        with open(regime_path, "w") as f:
            json.dump(regime_data, f, indent=2)

        print(f"  ✅ Regime: {regime.upper()} (confidence: {confidence:.0f}%, vol: {volatility*100:.1f}%)")
        return regime_data

    except Exception as e:
        print(f"  ⚠️ Regime detection failed: {e}")
        return {"regime": "unknown", "error": str(e)}


# ── Main orchestrator ─────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Daily pipeline — fetch, compute, predict")
    parser.add_argument("--skip-fetch", action="store_true", help="Skip OHLCV fetch (features + inference only)")
    parser.add_argument("--inference-only", action="store_true", help="Only run inference (skip fetch + features)")
    args = parser.parse_args()

    start_time = time.time()
    run_id = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")

    print(f"\n{'='*65}")
    print(f"  DAILY PIPELINE — {datetime.now().strftime('%Y-%m-%d %H:%M:%S')} (run: {run_id})")
    print(f"{'='*65}")

    # ── Step 0: Health checks
    print("\n  🏥 Health checks...")
    health = check_health()
    if not health["db"]:
        print("  ❌ FATAL: Database unreachable. Aborting pipeline.")
        save_pipeline_status(run_id, "failed", {"error": "Database unreachable"})
        sys.exit(1)
    if not health["models"]:
        print("  ❌ FATAL: No model artifacts. Run training first: python -m backend.scripts.run_training")
        save_pipeline_status(run_id, "failed", {"error": "No model artifacts"})
        sys.exit(1)
    print(f"  ✅ DB: OK | Redis: {'OK' if health['redis'] else 'SKIP'} | Models: {health.get('model_version', 'N/A')}")

    db = SyncSessionLocal()
    results = {"run_id": run_id, "steps": {}}

    try:
        # ── Step 1: Fetch OHLCV
        if not args.skip_fetch and not args.inference_only:
            results["steps"]["fetch"] = fetch_ohlcv(db)
        else:
            print("\n  ⏭️ Skipping OHLCV fetch")
            results["steps"]["fetch"] = {"skipped": True}

        # ── Step 2: Features
        if not args.inference_only:
            results["steps"]["features"] = update_features(db)
        else:
            print("\n  ⏭️ Skipping feature computation")
            results["steps"]["features"] = {"skipped": True}

        # ── Step 3: Recommendations
        results["steps"]["recommendations"] = generate_recommendations(db)

        # ── Step 4: Regime detection
        results["steps"]["regime"] = detect_regime(db)

    except Exception as e:
        print(f"\n  ❌ Pipeline failed: {e}")
        logger.error("pipeline_failed", run_id=run_id, error=str(e))
        results["error"] = str(e)

    finally:
        db.close()

    # ── Summary
    elapsed = time.time() - start_time
    mins = int(elapsed // 60)
    secs = int(elapsed % 60)

    results["elapsed_s"] = round(elapsed, 1)
    results["completed_at"] = datetime.now(timezone.utc).isoformat()

    status = "success" if "error" not in results else "failed"
    save_pipeline_status(run_id, status, results)

    print(f"\n{'='*65}")
    print(f"  PIPELINE {status.upper()}")
    print(f"{'='*65}")

    fetch = results["steps"].get("fetch", {})
    feats = results["steps"].get("features", {})
    recs = results["steps"].get("recommendations", {})
    regime = results["steps"].get("regime", {})

    if not fetch.get("skipped"):
        print(f"  OHLCV:    {fetch.get('success', 0)}/{fetch.get('total', 0)} stocks updated")
    if not feats.get("skipped"):
        print(f"  Features: {feats.get('recomputed', 0)} stocks recomputed ({feats.get('total_rows', 0):,} rows)")
    print(f"  Signals:  {recs.get('signals', 0)} recommendations generated")
    print(f"  Regime:   {regime.get('regime', 'unknown').upper()} (confidence: {regime.get('confidence', 0):.0f}%)")
    print(f"  Time:     {mins}m {secs}s")
    print(f"{'='*65}\n")


def save_pipeline_status(run_id: str, status: str, results: dict):
    """Save pipeline run status for the API to read."""
    PIPELINE_LOG.parent.mkdir(parents=True, exist_ok=True)

    # Load existing history
    history = []
    if PIPELINE_LOG.exists():
        try:
            with open(PIPELINE_LOG) as f:
                data = json.load(f)
                history = data.get("history", [])
        except (json.JSONDecodeError, KeyError):
            history = []

    # Add current run (keep last 30 runs)
    entry = {
        "run_id": run_id,
        "status": status,
        "started_at": datetime.now(timezone.utc).isoformat(),
        "elapsed_s": results.get("elapsed_s", 0),
        "signals": results.get("steps", {}).get("recommendations", {}).get("signals", 0),
        "regime": results.get("steps", {}).get("regime", {}).get("regime", "unknown"),
    }
    history.insert(0, entry)
    history = history[:30]

    output = {
        "latest": entry,
        "history": history,
        "full_results": results,
    }

    with open(PIPELINE_LOG, "w") as f:
        json.dump(output, f, indent=2, default=str)

    print(f"\n  📝 Pipeline status saved to {PIPELINE_LOG}")


if __name__ == "__main__":
    main()
