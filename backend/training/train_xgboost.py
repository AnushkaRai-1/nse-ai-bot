"""
XGBoost/LightGBM Training Script
PRD Section 8.1 | Literature Review Section 4.2

Trains 3 separate models (large-cap, mid-cap, small-cap) using:
  - Optuna Bayesian hyperparameter optimization (200 trials)
  - Walk-forward validation (36mo train / 3mo test)
  - MLflow experiment tracking (all params + metrics)

PRD Section 8.2: Model is NOT deployed unless ALL gates pass:
  - Sharpe > 1.0, Max DD < 25%, Win Rate > 52%, p < 0.05

Retraining schedule: Weekly (PRD Section 9.3)
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

import numpy as np
import pandas as pd
from sqlalchemy import text
from sqlalchemy.orm import Session

from backend.core.config import get_settings
from backend.core.logging_config import get_logger
from backend.models.xgboost_model import FEATURE_COLUMNS, TARGET_COL, XGBoostEnsemble
from backend.training.walk_forward import WalkForwardConfig, WalkForwardEngine

settings = get_settings()
logger = get_logger(__name__)

OPTUNA_TRIALS = 200  # PRD Section 8.1
BUCKETS = ["large", "mid", "small"]


def load_training_data(session: Session, market_cap_bucket: str) -> pd.DataFrame:
    """
    Load features_daily for a market-cap bucket from database.
    Joins with stocks table to filter by cap bucket.
    """
    query = text("""
        SELECT f.*, s.market_cap_bucket
        FROM features_daily f
        JOIN stocks s ON f.symbol = s.symbol
        WHERE s.market_cap_bucket = :bucket
          AND s.is_active = TRUE
          AND f.target_5d IS NOT NULL
        ORDER BY f.date ASC
    """)
    df = pd.read_sql(query, session.bind, params={"bucket": market_cap_bucket})
    logger.info("training_data_loaded", bucket=market_cap_bucket, rows=len(df))
    return df


def objective(trial, X_train, y_train, X_val, y_val, returns_val):
    """
    Optuna objective function for hyperparameter optimization.
    Optimizes Sharpe ratio (not accuracy — we care about risk-adjusted returns).

    PRD Section 6.1 search space:
      - n_estimators: 200-2000
      - max_depth: 3-8
      - learning_rate: 0.01-0.1
      - subsample: 0.6-1.0
    """
    import optuna

    params = {
        "lgbm": {
            "n_estimators": trial.suggest_int("lgbm_n_estimators", 200, 2000),
            "max_depth": trial.suggest_int("lgbm_max_depth", 3, 8),
            "learning_rate": trial.suggest_float("lgbm_learning_rate", 0.01, 0.1, log=True),
            "subsample": trial.suggest_float("lgbm_subsample", 0.6, 1.0),
            "colsample_bytree": trial.suggest_float("lgbm_colsample", 0.6, 1.0),
            "min_child_samples": trial.suggest_int("lgbm_min_child", 5, 50),
            "reg_alpha": trial.suggest_float("lgbm_reg_alpha", 1e-3, 10.0, log=True),
            "reg_lambda": trial.suggest_float("lgbm_reg_lambda", 1e-3, 10.0, log=True),
        },
        "xgb": {
            "n_estimators": trial.suggest_int("xgb_n_estimators", 200, 2000),
            "max_depth": trial.suggest_int("xgb_max_depth", 3, 8),
            "learning_rate": trial.suggest_float("xgb_learning_rate", 0.01, 0.1, log=True),
            "subsample": trial.suggest_float("xgb_subsample", 0.6, 1.0),
            "colsample_bytree": trial.suggest_float("xgb_colsample", 0.6, 1.0),
            "min_child_weight": trial.suggest_int("xgb_min_child", 1, 20),
            "reg_alpha": trial.suggest_float("xgb_reg_alpha", 1e-3, 10.0, log=True),
            "reg_lambda": trial.suggest_float("xgb_reg_lambda", 1e-3, 10.0, log=True),
        },
    }

    model = XGBoostEnsemble()
    model.train(X_train, y_train, "trial", X_val, y_val, params)

    # Predict on validation set
    result = model.predict(X_val, "trial")
    probs = np.array(result["probability"])

    # Compute Sharpe on validation (the actual metric we optimize)
    signals = (probs > 0.5).astype(float)
    strategy_returns = signals * returns_val.values

    if np.std(strategy_returns) == 0:
        return 0.0

    sharpe = (np.mean(strategy_returns) / np.std(strategy_returns)) * np.sqrt(252)
    return sharpe


def train_for_bucket(
    session: Session,
    market_cap_bucket: str,
    mlflow_experiment: Optional[str] = None,
) -> dict:
    """
    Full training pipeline for a single market-cap bucket.

    Steps:
      1. Load training data
      2. Run Optuna hyperparameter search (200 trials)
      3. Train final model with best params
      4. Walk-forward validation (8+ folds)
      5. Check deployment gates
      6. Save model if gates pass
      7. Log everything to MLflow

    Returns dict with training metrics, backtest results, deployment status.
    """
    import optuna

    logger.info("training_started", bucket=market_cap_bucket)

    # ── Load data ─────────────────────────────────────────────
    df = load_training_data(session, market_cap_bucket)
    if len(df) < 1000:
        logger.warning("insufficient_training_data", bucket=market_cap_bucket, rows=len(df))
        return {"error": f"Insufficient data for {market_cap_bucket}: {len(df)} rows"}

    # ── Walk-forward folds ────────────────────────────────────
    wf_config = WalkForwardConfig(train_months=36, test_months=3, min_folds=8)
    wf_engine = WalkForwardEngine(wf_config)
    folds = wf_engine.generate_folds(df, date_column="date")

    if len(folds) < wf_config.min_folds:
        logger.warning("insufficient_folds", bucket=market_cap_bucket, folds=len(folds))

    # ── Optuna hyperparameter search ──────────────────────────
    # Use the latest fold's train/val split for Optuna
    latest_fold = folds[-1]
    train_mask = (pd.to_datetime(df["date"]) >= latest_fold["train_start"]) & \
                 (pd.to_datetime(df["date"]) <= latest_fold["train_end"])
    test_mask = (pd.to_datetime(df["date"]) >= latest_fold["test_start"]) & \
                (pd.to_datetime(df["date"]) <= latest_fold["test_end"])

    X_train_opt = df[train_mask]
    y_train_opt = df[train_mask][TARGET_COL]
    X_val_opt = df[test_mask]
    y_val_opt = df[test_mask][TARGET_COL]
    returns_val = df[test_mask]["log_return_5d"]

    logger.info("optuna_search_starting", trials=OPTUNA_TRIALS, bucket=market_cap_bucket)

    study = optuna.create_study(direction="maximize", study_name=f"xgb_{market_cap_bucket}")
    study.optimize(
        lambda trial: objective(trial, X_train_opt, y_train_opt, X_val_opt, y_val_opt, returns_val),
        n_trials=OPTUNA_TRIALS,
        show_progress_bar=True,
    )

    best_params = study.best_params
    best_sharpe = study.best_value
    logger.info("optuna_complete", best_sharpe=best_sharpe, bucket=market_cap_bucket)

    # ── Reconstruct best params into lgbm/xgb format ──────────
    lgbm_params = {k.replace("lgbm_", ""): v for k, v in best_params.items() if k.startswith("lgbm_")}
    xgb_params = {k.replace("xgb_", ""): v for k, v in best_params.items() if k.startswith("xgb_")}

    # ── Walk-Forward Validation with best params ──────────────
    fold_results = []
    final_model = XGBoostEnsemble()

    for fold in folds:
        # Split data
        t_mask = (pd.to_datetime(df["date"]) >= fold["train_start"]) & \
                 (pd.to_datetime(df["date"]) <= fold["train_end"])
        v_mask = (pd.to_datetime(df["date"]) >= fold["test_start"]) & \
                 (pd.to_datetime(df["date"]) <= fold["test_end"])

        X_t = df[t_mask]
        y_t = df[t_mask][TARGET_COL]
        X_v = df[v_mask]
        y_v = df[v_mask][TARGET_COL]

        if len(X_v) == 0:
            continue

        # Train on this fold
        final_model.train(
            X_t, y_t, market_cap_bucket,
            X_v, y_v,
            {"lgbm": lgbm_params, "xgb": xgb_params},
        )

        # Predict
        result = final_model.predict(X_v, market_cap_bucket)
        preds = np.array(result["probability"])

        # Compute fold metrics
        returns = df[v_mask]["log_return_5d"].values
        fold_info = {**fold, "train_samples": len(X_t)}
        fold_result = wf_engine.compute_fold_metrics(preds, y_v.values, returns, fold_info)
        fold_results.append(fold_result)

    # ── Aggregate and check deployment gates ──────────────────
    wf_result = wf_engine.aggregate_results(fold_results)

    # ── MLflow logging ────────────────────────────────────────
    mlflow_run_id = None
    try:
        import mlflow
        mlflow.set_tracking_uri(settings.MLFLOW_TRACKING_URI)
        experiment_name = mlflow_experiment or f"xgboost_{market_cap_bucket}"
        mlflow.set_experiment(experiment_name)

        with mlflow.start_run(run_name=f"xgb_{market_cap_bucket}_{datetime.now(timezone.utc).strftime('%Y%m%d')}") as run:
            mlflow_run_id = run.info.run_id

            # Log params
            mlflow.log_params({f"lgbm_{k}": v for k, v in lgbm_params.items()})
            mlflow.log_params({f"xgb_{k}": v for k, v in xgb_params.items()})
            mlflow.log_param("market_cap_bucket", market_cap_bucket)
            mlflow.log_param("optuna_trials", OPTUNA_TRIALS)

            # Log metrics
            mlflow.log_metrics({
                "mean_sharpe": wf_result.mean_sharpe,
                "mean_max_dd": wf_result.mean_max_dd,
                "mean_win_rate": wf_result.mean_win_rate,
                "mean_accuracy": wf_result.mean_accuracy,
                "bootstrap_p_value": wf_result.bootstrap_p_value,
                "passes_gates": float(wf_result.passes_deployment_gates),
                "n_folds": len(fold_results),
                "optuna_best_sharpe": best_sharpe,
            })

            # Log per-fold metrics
            for fr in fold_results:
                mlflow.log_metrics({
                    f"fold_{fr.fold_id}_sharpe": fr.sharpe_ratio,
                    f"fold_{fr.fold_id}_win_rate": fr.win_rate,
                    f"fold_{fr.fold_id}_accuracy": fr.accuracy,
                })

    except Exception as e:
        logger.error("mlflow_logging_failed", error=str(e))

    # ── Save model if gates pass ──────────────────────────────
    model_path = None
    if wf_result.passes_deployment_gates:
        version = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
        model_path = final_model.save("model_artifacts/xgboost", version)
        logger.info("model_deployed", bucket=market_cap_bucket, version=version, path=model_path)
    else:
        logger.warning(
            "model_not_deployed",
            bucket=market_cap_bucket,
            failures=wf_result.gate_failures,
        )

    return {
        "bucket": market_cap_bucket,
        "optuna_best_sharpe": best_sharpe,
        "optuna_trials": OPTUNA_TRIALS,
        "walk_forward": {
            "n_folds": len(fold_results),
            "mean_sharpe": wf_result.mean_sharpe,
            "mean_max_dd": wf_result.mean_max_dd,
            "mean_win_rate": wf_result.mean_win_rate,
            "mean_accuracy": wf_result.mean_accuracy,
            "bootstrap_p_value": wf_result.bootstrap_p_value,
        },
        "passes_deployment_gates": wf_result.passes_deployment_gates,
        "gate_failures": wf_result.gate_failures,
        "mlflow_run_id": mlflow_run_id,
        "model_path": model_path,
    }


def train_all_buckets(session: Session) -> dict:
    """Train models for all market-cap buckets. Called by scheduler."""
    results = {}
    for bucket in BUCKETS:
        try:
            results[bucket] = train_for_bucket(session, bucket)
        except Exception as e:
            logger.error("bucket_training_failed", bucket=bucket, error=str(e))
            results[bucket] = {"error": str(e)}
    return results
