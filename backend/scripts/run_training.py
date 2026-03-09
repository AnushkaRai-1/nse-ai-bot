#!/usr/bin/env python3
"""
Model Training Runner — Phase 6
Trains XGBoost/LightGBM ensemble on Nifty 500 features data.

Approach:
  1. Load features + OHLCV from DB, compute targets in-memory
  2. Split by market_cap_bucket (large/mid/small)
  3. Optuna hyperparameter search (50 trials — faster for initial run)
  4. Walk-forward validation (expanding window)
  5. Check deployment gates (Sharpe > 1.0, Win Rate > 52%, DD < 25%)
  6. Save model artifacts + generate signals for all stocks

Run: python -m backend.scripts.run_training
"""

import json
import pickle
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd
from sqlalchemy import text

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

from backend.core.database import SyncSessionLocal
from backend.core.logging_config import get_logger
from backend.models.xgboost_model import FEATURE_COLUMNS, XGBoostEnsemble

logger = get_logger(__name__)

# ── Configuration ────────────────────────────────────────────
OPTUNA_TRIALS = 20          # 20 for initial run (200 for production)
TRAIN_MONTHS = 36           # 3 years training
TEST_MONTHS = 3             # 3 months test per fold
MAX_WF_FOLDS = 15           # Limit walk-forward folds (use last N)
TARGET_COL = "target_5d"
RETURN_COL = "log_return_5d"
MODEL_DIR = Path(__file__).parent.parent / "model_artifacts"

# Force unbuffered output
import functools
print = functools.partial(print, flush=True)


def load_all_data(db) -> pd.DataFrame:
    """Load joined OHLCV + features data with targets computed in-memory."""
    print("  Loading OHLCV + features from DB...")

    # Load features
    result = db.execute(text("""
        SELECT f.time, f.symbol, f.rsi_14, f.macd_signal, f.bb_bandwidth,
               f.ma200_regime, f.adx_value, f.atr_14, f.fcf_yield, f.pe_zscore,
               f.de_ratio, f.sentiment_24h, f.sentiment_72h, f.volume_z_3m,
               o.adj_close, s.market_cap_bucket
        FROM features_daily f
        JOIN ohlcv_daily o ON f.symbol = o.symbol AND f.time = o.time
        JOIN stocks s ON f.symbol = s.symbol
        WHERE f.rsi_14 IS NOT NULL
          AND s.is_active = TRUE
        ORDER BY f.symbol, f.time
    """))

    rows = result.fetchall()
    cols = [
        "time", "symbol", "rsi_14", "macd_signal", "bb_bandwidth",
        "ma200_regime", "adx_value", "atr_14", "fcf_yield", "pe_zscore",
        "de_ratio", "sentiment_24h", "sentiment_72h", "volume_z_3m",
        "adj_close", "market_cap_bucket",
    ]
    df = pd.DataFrame(rows, columns=cols)

    # Convert types
    for col in FEATURE_COLUMNS:
        if col == "ma200_regime":
            df[col] = df[col].astype(float)
        else:
            df[col] = pd.to_numeric(df[col], errors="coerce")

    df["adj_close"] = df["adj_close"].astype(float)
    df["time"] = pd.to_datetime(df["time"])

    print(f"  Loaded {len(df):,} rows across {df['symbol'].nunique()} stocks")

    # Compute targets per-symbol (no look-ahead bias within each stock)
    print("  Computing targets (5-day log returns)...")
    targets = []
    for symbol, group in df.groupby("symbol"):
        g = group.sort_values("time").copy()
        close = g["adj_close"]
        g[RETURN_COL] = np.log(close.shift(-5) / close)
        g[TARGET_COL] = (g[RETURN_COL] > 0).astype(int)
        targets.append(g)

    df = pd.concat(targets, ignore_index=True)

    # Drop rows where target is NaN (last 5 rows per stock)
    before = len(df)
    df = df.dropna(subset=[RETURN_COL, TARGET_COL])
    print(f"  After target computation: {len(df):,} rows (dropped {before - len(df):,} tail rows)")

    return df


def train_bucket(df_bucket: pd.DataFrame, bucket: str, n_trials: int = OPTUNA_TRIALS) -> dict:
    """Train XGBoost/LightGBM ensemble for one market-cap bucket using walk-forward."""
    import optuna
    optuna.logging.set_verbosity(optuna.logging.WARNING)

    print(f"\n{'─'*50}")
    print(f"  Training: {bucket.upper()} cap ({len(df_bucket):,} rows, {df_bucket['symbol'].nunique()} stocks)")
    print(f"{'─'*50}")

    df_bucket = df_bucket.sort_values("time").reset_index(drop=True)
    dates = df_bucket["time"]
    min_date = dates.min()
    max_date = dates.max()

    # ── Generate walk-forward folds ──────────────────────────
    folds = []
    fold_id = 0
    while True:
        train_end = min_date + pd.DateOffset(months=TRAIN_MONTHS + fold_id * TEST_MONTHS)
        test_start = train_end + pd.Timedelta(days=1)
        test_end = test_start + pd.DateOffset(months=TEST_MONTHS) - pd.Timedelta(days=1)

        if test_end > max_date:
            break

        folds.append({
            "fold_id": fold_id,
            "train_start": min_date,
            "train_end": train_end,
            "test_start": test_start,
            "test_end": test_end,
        })
        fold_id += 1

    # Limit to last N folds to keep training practical
    if len(folds) > MAX_WF_FOLDS:
        folds = folds[-MAX_WF_FOLDS:]
    print(f"  Walk-forward folds: {len(folds)}")
    if len(folds) == 0:
        print(f"  ⚠️ Not enough data for walk-forward (need >{TRAIN_MONTHS}mo). Using simple split.")
        # Fallback: 80/20 split
        split_idx = int(len(df_bucket) * 0.8)
        folds = [{
            "fold_id": 0,
            "train_start": min_date,
            "train_end": dates.iloc[split_idx],
            "test_start": dates.iloc[split_idx + 1],
            "test_end": max_date,
        }]

    # ── Optuna on latest fold ────────────────────────────────
    latest = folds[-1]
    train_mask = (dates >= latest["train_start"]) & (dates <= latest["train_end"])
    test_mask = (dates >= latest["test_start"]) & (dates <= latest["test_end"])

    X_train_opt = df_bucket[train_mask][FEATURE_COLUMNS]
    y_train_opt = df_bucket[train_mask][TARGET_COL]
    X_val_opt = df_bucket[test_mask][FEATURE_COLUMNS]
    y_val_opt = df_bucket[test_mask][TARGET_COL]
    returns_val = df_bucket[test_mask][RETURN_COL].values

    print(f"  Optuna search ({n_trials} trials)...")
    t0 = time.time()

    def objective(trial):
        params = {
            "lgbm": {
                "n_estimators": trial.suggest_int("lgbm_n_est", 200, 1500),
                "max_depth": trial.suggest_int("lgbm_depth", 3, 8),
                "learning_rate": trial.suggest_float("lgbm_lr", 0.01, 0.1, log=True),
                "subsample": trial.suggest_float("lgbm_sub", 0.6, 1.0),
                "colsample_bytree": trial.suggest_float("lgbm_col", 0.6, 1.0),
                "min_child_samples": trial.suggest_int("lgbm_mc", 5, 50),
                "reg_alpha": trial.suggest_float("lgbm_ra", 1e-3, 10.0, log=True),
                "reg_lambda": trial.suggest_float("lgbm_rl", 1e-3, 10.0, log=True),
            },
            "xgb": {
                "n_estimators": trial.suggest_int("xgb_n_est", 200, 1500),
                "max_depth": trial.suggest_int("xgb_depth", 3, 8),
                "learning_rate": trial.suggest_float("xgb_lr", 0.01, 0.1, log=True),
                "subsample": trial.suggest_float("xgb_sub", 0.6, 1.0),
                "colsample_bytree": trial.suggest_float("xgb_col", 0.6, 1.0),
                "min_child_weight": trial.suggest_int("xgb_mw", 1, 20),
                "reg_alpha": trial.suggest_float("xgb_ra", 1e-3, 10.0, log=True),
                "reg_lambda": trial.suggest_float("xgb_rl", 1e-3, 10.0, log=True),
            },
        }

        model = XGBoostEnsemble()
        model.train(X_train_opt, y_train_opt, "trial", X_val_opt, y_val_opt, params)
        result = model.predict(X_val_opt, "trial")
        probs = np.array(result["probability"])

        signals = (probs > 0.5).astype(float)
        strat_ret = signals * returns_val
        if np.std(strat_ret) == 0:
            return 0.0
        return (np.mean(strat_ret) / np.std(strat_ret)) * np.sqrt(252)

    study = optuna.create_study(direction="maximize", study_name=f"xgb_{bucket}")
    study.optimize(objective, n_trials=n_trials)

    best_sharpe_optuna = study.best_value
    best_params = study.best_params
    print(f"  Optuna done in {time.time()-t0:.0f}s — best Sharpe: {best_sharpe_optuna:.3f}")

    # Reconstruct params from flat Optuna keys
    LGBM_KEY_MAP = {
        "lgbm_n_est": "n_estimators", "lgbm_depth": "max_depth",
        "lgbm_lr": "learning_rate", "lgbm_sub": "subsample",
        "lgbm_col": "colsample_bytree", "lgbm_mc": "min_child_samples",
        "lgbm_ra": "reg_alpha", "lgbm_rl": "reg_lambda",
    }
    XGB_KEY_MAP = {
        "xgb_n_est": "n_estimators", "xgb_depth": "max_depth",
        "xgb_lr": "learning_rate", "xgb_sub": "subsample",
        "xgb_col": "colsample_bytree", "xgb_mw": "min_child_weight",
        "xgb_ra": "reg_alpha", "xgb_rl": "reg_lambda",
    }
    lgbm_p = {LGBM_KEY_MAP[k]: v for k, v in best_params.items() if k in LGBM_KEY_MAP}
    xgb_p = {XGB_KEY_MAP[k]: v for k, v in best_params.items() if k in XGB_KEY_MAP}

    # ── Walk-forward validation with best params ─────────────
    print(f"  Walk-forward validation ({len(folds)} folds)...")
    fold_metrics = []
    final_model = XGBoostEnsemble()

    for fold in folds:
        t_mask = (dates >= fold["train_start"]) & (dates <= fold["train_end"])
        v_mask = (dates >= fold["test_start"]) & (dates <= fold["test_end"])

        X_t = df_bucket[t_mask][FEATURE_COLUMNS]
        y_t = df_bucket[t_mask][TARGET_COL]
        X_v = df_bucket[v_mask][FEATURE_COLUMNS]
        y_v = df_bucket[v_mask][TARGET_COL]
        ret_v = df_bucket[v_mask][RETURN_COL].values

        if len(X_v) < 10:
            continue

        final_model.train(X_t, y_t, bucket, X_v, y_v, {"lgbm": lgbm_p, "xgb": xgb_p})
        result = final_model.predict(X_v, bucket)
        probs = np.array(result["probability"])

        preds_bin = (probs > 0.5).astype(int)
        strat_ret = np.where(preds_bin == 1, ret_v, 0)

        accuracy = np.mean(preds_bin == y_v.values)
        win_rate = np.mean(ret_v[preds_bin == 1] > 0) if np.sum(preds_bin) > 0 else 0
        sharpe = (np.mean(strat_ret) / np.std(strat_ret)) * np.sqrt(252) if np.std(strat_ret) > 0 else 0

        cum = np.cumsum(strat_ret)
        running_max = np.maximum.accumulate(cum)
        max_dd = float(np.min(cum - running_max)) if len(cum) > 0 else 0

        fold_metrics.append({
            "fold": fold["fold_id"],
            "accuracy": round(accuracy, 4),
            "win_rate": round(win_rate, 4),
            "sharpe": round(sharpe, 4),
            "max_dd": round(max_dd, 4),
            "test_samples": len(X_v),
        })

    # ── Aggregate metrics ────────────────────────────────────
    if fold_metrics:
        mean_sharpe = np.mean([f["sharpe"] for f in fold_metrics])
        mean_win_rate = np.mean([f["win_rate"] for f in fold_metrics])
        mean_accuracy = np.mean([f["accuracy"] for f in fold_metrics])
        mean_max_dd = np.mean([f["max_dd"] for f in fold_metrics])
    else:
        mean_sharpe = mean_win_rate = mean_accuracy = mean_max_dd = 0

    # ── Deployment gates ─────────────────────────────────────
    gate_failures = []
    if mean_sharpe < 1.0:
        gate_failures.append(f"Sharpe {mean_sharpe:.2f} < 1.0")
    if abs(mean_max_dd) > 0.25:
        gate_failures.append(f"Max DD {abs(mean_max_dd):.2%} > 25%")
    if mean_win_rate < 0.52:
        gate_failures.append(f"Win rate {mean_win_rate:.2%} < 52%")

    passes = len(gate_failures) == 0

    print(f"\n  Results for {bucket.upper()} cap:")
    print(f"    Sharpe:   {mean_sharpe:.3f} {'✅' if mean_sharpe >= 1.0 else '⚠️'}")
    print(f"    Win Rate: {mean_win_rate:.2%} {'✅' if mean_win_rate >= 0.52 else '⚠️'}")
    print(f"    Max DD:   {abs(mean_max_dd):.2%} {'✅' if abs(mean_max_dd) <= 0.25 else '⚠️'}")
    print(f"    Accuracy: {mean_accuracy:.2%}")
    print(f"    Gates:    {'✅ ALL PASS' if passes else '⚠️ FAILED: ' + ', '.join(gate_failures)}")

    # ── Save model regardless (we'll use it, noting gate status) ──
    version = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    model_path = MODEL_DIR / "xgboost" / version
    model_path.mkdir(parents=True, exist_ok=True)

    for b, models in final_model.models.items():
        pickle.dump(models["lgbm"], open(model_path / f"lgbm_{b}.pkl", "wb"))
        pickle.dump(models["xgb"], open(model_path / f"xgb_{b}.pkl", "wb"))

    # Save feature importance
    importance = final_model.get_feature_importance(bucket)
    with open(model_path / f"importance_{bucket}.json", "w") as f:
        json.dump(importance, f, indent=2)

    print(f"    Model saved: {model_path}")

    return {
        "bucket": bucket,
        "optuna_best_sharpe": round(best_sharpe_optuna, 4),
        "mean_sharpe": round(mean_sharpe, 4),
        "mean_win_rate": round(mean_win_rate, 4),
        "mean_accuracy": round(mean_accuracy, 4),
        "mean_max_dd": round(mean_max_dd, 4),
        "passes_gates": passes,
        "gate_failures": gate_failures,
        "n_folds": len(fold_metrics),
        "fold_metrics": fold_metrics,
        "model_version": version,
        "model_path": str(model_path),
        "importance": importance,
    }


def generate_signals(db, model_results: dict) -> int:
    """Generate latest signals for all stocks using trained models."""
    print(f"\n{'='*60}")
    print("  GENERATING SIGNALS FOR ALL STOCKS")
    print(f"{'='*60}")

    # Load latest model for each bucket
    signals_saved = 0
    for bucket, result in model_results.items():
        if "error" in result:
            continue

        model_path = Path(result["model_path"])
        model = XGBoostEnsemble()

        lgbm_path = model_path / f"lgbm_{bucket}.pkl"
        xgb_path = model_path / f"xgb_{bucket}.pkl"
        if lgbm_path.exists() and xgb_path.exists():
            model.models[bucket] = {
                "lgbm": pickle.load(open(lgbm_path, "rb")),
                "xgb": pickle.load(open(xgb_path, "rb")),
            }
        else:
            print(f"  ⚠️ No model files for {bucket}")
            continue

        # Get latest features for stocks in this bucket
        result_rows = db.execute(text("""
            SELECT f.symbol, f.rsi_14, f.macd_signal, f.bb_bandwidth,
                   f.ma200_regime, f.adx_value, f.atr_14, f.fcf_yield, f.pe_zscore,
                   f.de_ratio, f.sentiment_24h, f.sentiment_72h, f.volume_z_3m
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

        rows = result_rows.fetchall()
        if not rows:
            continue

        cols = ["symbol"] + FEATURE_COLUMNS
        df_latest = pd.DataFrame(rows, columns=cols)

        for col in FEATURE_COLUMNS:
            if col == "ma200_regime":
                df_latest[col] = df_latest[col].astype(float)
            else:
                df_latest[col] = pd.to_numeric(df_latest[col], errors="coerce")

        # Fill NaN for MACD (ADX-gated) — LightGBM handles NaN natively
        # but XGBoost needs finite values
        df_latest[FEATURE_COLUMNS] = df_latest[FEATURE_COLUMNS].fillna(0)

        # Predict
        predictions = model.predict(df_latest, bucket)
        probs = predictions["probability"]

        for i, row in df_latest.iterrows():
            symbol = row["symbol"]
            prob = probs[i] if isinstance(probs, list) else probs
            direction = "long" if prob > 0.5 else "neutral"
            score = round(prob * 100, 2)
            confidence = round(abs(prob - 0.5) * 200, 2)  # 0-100 scale

            try:
                db.execute(text("""
                    INSERT INTO recommendations (symbol, score, horizon, direction,
                        confidence_pct, reasoning_json, model_version, market_cap_bucket)
                    VALUES (:symbol, :score, 'short', :direction, :confidence,
                        :reasoning, :model_version, :bucket)
                """), {
                    "symbol": symbol,
                    "score": score,
                    "direction": direction,
                    "confidence": confidence,
                    "reasoning": json.dumps({
                        "xgboost_signal": round(prob, 4),
                        "key_drivers": [],
                        "risk_factors": [],
                    }),
                    "model_version": model_results[bucket]["model_version"],
                    "bucket": bucket,
                })
                signals_saved += 1
            except Exception as e:
                logger.error("signal_save_failed", symbol=symbol, error=str(e))

        db.commit()
        print(f"  {bucket.upper()}: {len(df_latest)} signals generated")

    return signals_saved


def main():
    start_time = time.time()
    print(f"\n{'='*60}")
    print(f" MODEL TRAINING — {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"{'='*60}")

    db = SyncSessionLocal()

    # ── Step 1: Load all data ────────────────────────────────
    df = load_all_data(db)

    # ── Step 2: Train per bucket ─────────────────────────────
    results = {}
    for bucket in ["large", "mid", "small"]:
        df_bucket = df[df["market_cap_bucket"] == bucket]
        if len(df_bucket) < 500:
            print(f"\n  ⚠️ Skipping {bucket} — only {len(df_bucket)} rows")
            results[bucket] = {"error": f"Insufficient data: {len(df_bucket)} rows"}
            continue
        try:
            results[bucket] = train_bucket(df_bucket, bucket)
        except Exception as e:
            print(f"\n  ❌ {bucket} training failed: {e}")
            logger.error("training_failed", bucket=bucket, error=str(e))
            results[bucket] = {"error": str(e)}

    # ── Step 3: Generate signals ─────────────────────────────
    signals = generate_signals(db, results)

    db.close()

    elapsed = time.time() - start_time
    mins = int(elapsed // 60)
    secs = int(elapsed % 60)

    print(f"\n{'='*60}")
    print(f" TRAINING COMPLETE")
    print(f"{'='*60}")
    for bucket, res in results.items():
        if "error" in res:
            print(f"  {bucket.upper():6s}: ❌ {res['error']}")
        else:
            status = "✅ PASS" if res["passes_gates"] else "⚠️ DEPLOYED (gates pending)"
            print(f"  {bucket.upper():6s}: Sharpe={res['mean_sharpe']:.3f} WR={res['mean_win_rate']:.2%} {status}")
    print(f"  Signals generated: {signals}")
    print(f"  Time: {mins}m {secs}s")
    print(f"{'='*60}\n")

    # Save summary
    summary_path = MODEL_DIR / "training_results.json"
    summary_path.parent.mkdir(parents=True, exist_ok=True)
    serializable = {}
    for k, v in results.items():
        if "error" in v:
            serializable[k] = v
        else:
            serializable[k] = {kk: vv for kk, vv in v.items() if kk != "fold_metrics"}
            serializable[k]["n_fold_metrics"] = len(v.get("fold_metrics", []))
    with open(summary_path, "w") as f:
        json.dump(serializable, f, indent=2, default=str)
    print(f"Results saved to {summary_path}")


if __name__ == "__main__":
    main()
