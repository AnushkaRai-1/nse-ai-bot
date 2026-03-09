"""
LSTM Training Script
PRD Section 8.1 | Literature Review Section 4.1

Trains LSTM model with:
  - Walk-forward validation (48mo train / 6mo test)
  - ARIMA baseline comparison (LSTM must beat ARIMA or ARIMA is used instead)
  - MLflow experiment tracking

Literature Review CRITICAL finding:
  Mehtab & Sen (IIT, 2020): ARIMA BEAT LSTM for 1-day prediction on Nifty 50.
  LSTM only has advantage at 15-30 day horizons with non-price features.
  If LSTM fails to beat ARIMA → fallback to ARIMA predictions.

Retraining schedule: Monthly (PRD Section 9.3)
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
from backend.models.lstm_model import FEATURE_COLUMNS, LSTMModel, SEQUENCE_LENGTH
from backend.training.walk_forward import WalkForwardConfig, WalkForwardEngine

settings = get_settings()
logger = get_logger(__name__)

TARGET_COL = "target_20d"


def load_training_data(session: Session) -> pd.DataFrame:
    """Load all features_daily for LSTM training (all stocks pooled)."""
    query = text("""
        SELECT f.*
        FROM features_daily f
        JOIN stocks s ON f.symbol = s.symbol
        WHERE s.is_active = TRUE
          AND f.target_20d IS NOT NULL
        ORDER BY f.date ASC
    """)
    df = pd.read_sql(query, session.bind)
    logger.info("lstm_training_data_loaded", rows=len(df))
    return df


def arima_baseline(returns: pd.Series, forecast_horizon: int = 20) -> float:
    """
    ARIMA(5,1,0) baseline accuracy.
    Literature Review: This is the bar LSTM must clear.
    Returns win rate of ARIMA predictions.
    """
    from statsmodels.tsa.arima.model import ARIMA

    correct = 0
    total = 0

    # Walk-forward ARIMA: fit on [0..t], predict t+1..t+horizon
    min_obs = 252  # Need at least 1 year for ARIMA

    for t in range(min_obs, len(returns) - forecast_horizon, forecast_horizon):
        try:
            train_data = returns.iloc[:t]
            model = ARIMA(train_data, order=(5, 1, 0))
            fitted = model.fit()
            forecast = fitted.forecast(steps=forecast_horizon)

            # Did ARIMA predict the right direction?
            predicted_direction = 1 if forecast.sum() > 0 else 0
            actual_direction = 1 if returns.iloc[t:t + forecast_horizon].sum() > 0 else 0

            if predicted_direction == actual_direction:
                correct += 1
            total += 1

        except Exception:
            continue

    win_rate = correct / total if total > 0 else 0.5
    logger.info("arima_baseline", win_rate=round(win_rate, 4), total_forecasts=total)
    return win_rate


def train_lstm(
    session: Session,
    mlflow_experiment: Optional[str] = None,
) -> dict:
    """
    Full LSTM training pipeline.

    Steps:
      1. Load all features
      2. Compute ARIMA baseline (the bar to clear)
      3. Walk-forward validation with LSTM (48mo train / 6mo test)
      4. Compare LSTM vs ARIMA
      5. Deploy only if LSTM > ARIMA AND passes gates
    """
    logger.info("lstm_training_started")

    # ── Load data ─────────────────────────────────────────────
    df = load_training_data(session)
    if len(df) < 2000:
        return {"error": f"Insufficient data for LSTM: {len(df)} rows (need 2000+)"}

    # ── ARIMA baseline ────────────────────────────────────────
    # Use Nifty 50 representative stock for baseline
    sample_returns = df.groupby("symbol")["log_return_20d"].apply(lambda x: x.dropna())
    if len(sample_returns) > 0:
        # Take first stock with enough data
        for symbol, returns in df.groupby("symbol"):
            r = returns["log_return_20d"].dropna()
            if len(r) > 500:
                arima_win_rate = arima_baseline(r, forecast_horizon=20)
                break
        else:
            arima_win_rate = 0.50  # Default
    else:
        arima_win_rate = 0.50

    logger.info("arima_baseline_computed", win_rate=arima_win_rate)

    # ── Walk-forward validation ───────────────────────────────
    wf_config = WalkForwardConfig(train_months=48, test_months=6, min_folds=8)
    wf_engine = WalkForwardEngine(wf_config)
    folds = wf_engine.generate_folds(df, date_column="date")

    fold_results = []
    lstm = LSTMModel()

    for fold in folds:
        t_mask = (pd.to_datetime(df["date"]) >= fold["train_start"]) & \
                 (pd.to_datetime(df["date"]) <= fold["train_end"])
        v_mask = (pd.to_datetime(df["date"]) >= fold["test_start"]) & \
                 (pd.to_datetime(df["date"]) <= fold["test_end"])

        X_t = df[t_mask]
        y_t = df[t_mask][TARGET_COL]
        X_v = df[v_mask]
        y_v = df[v_mask][TARGET_COL]

        if len(X_v) < SEQUENCE_LENGTH + 1:
            continue

        # Train LSTM on this fold
        lstm.train(
            X_t, y_t,
            X_v, y_v,
            epochs=100,
            batch_size=64,
            patience=15,
        )

        # Predict
        preds = lstm.predict(X_v)

        # Compute metrics
        returns = df[v_mask]["log_return_20d"].values
        # Trim to match LSTM output length (sequences drop SEQUENCE_LENGTH rows)
        trimmed_returns = returns[SEQUENCE_LENGTH:]
        trimmed_actuals = y_v.values[SEQUENCE_LENGTH:]

        if len(preds) != len(trimmed_returns):
            min_len = min(len(preds), len(trimmed_returns))
            preds = preds[:min_len]
            trimmed_returns = trimmed_returns[:min_len]
            trimmed_actuals = trimmed_actuals[:min_len]

        fold_info = {**fold, "train_samples": len(X_t)}
        fold_result = wf_engine.compute_fold_metrics(preds, trimmed_actuals, trimmed_returns, fold_info)
        fold_results.append(fold_result)

    # ── Aggregate results ─────────────────────────────────────
    wf_result = wf_engine.aggregate_results(fold_results)

    # ── ARIMA comparison gate ─────────────────────────────────
    lstm_beats_arima = wf_result.mean_win_rate > arima_win_rate

    if not lstm_beats_arima:
        wf_result.gate_failures.append(
            f"LSTM win rate ({wf_result.mean_win_rate:.2%}) ≤ ARIMA baseline ({arima_win_rate:.2%})"
        )
        wf_result.passes_deployment_gates = False
        logger.warning("lstm_failed_arima_gate", lstm_wr=wf_result.mean_win_rate, arima_wr=arima_win_rate)

    # ── MLflow logging ────────────────────────────────────────
    mlflow_run_id = None
    try:
        import mlflow
        mlflow.set_tracking_uri(settings.MLFLOW_TRACKING_URI)
        experiment_name = mlflow_experiment or "lstm_model"
        mlflow.set_experiment(experiment_name)

        with mlflow.start_run(run_name=f"lstm_{datetime.now(timezone.utc).strftime('%Y%m%d')}") as run:
            mlflow_run_id = run.info.run_id

            mlflow.log_params({
                "sequence_length": SEQUENCE_LENGTH,
                "hidden_size": 128,
                "num_layers": 2,
                "dropout": 0.25,
                "weight_decay": 1e-4,
            })

            mlflow.log_metrics({
                "mean_sharpe": wf_result.mean_sharpe,
                "mean_win_rate": wf_result.mean_win_rate,
                "mean_accuracy": wf_result.mean_accuracy,
                "bootstrap_p_value": wf_result.bootstrap_p_value,
                "arima_baseline_win_rate": arima_win_rate,
                "lstm_beats_arima": float(lstm_beats_arima),
                "passes_gates": float(wf_result.passes_deployment_gates),
            })

    except Exception as e:
        logger.error("mlflow_logging_failed", error=str(e))

    # ── Save model if all gates pass ──────────────────────────
    model_path = None
    if wf_result.passes_deployment_gates:
        version = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
        model_path = lstm.save("model_artifacts/lstm", version)
        logger.info("lstm_deployed", version=version)
    else:
        logger.warning("lstm_not_deployed", failures=wf_result.gate_failures)

    return {
        "arima_baseline_win_rate": arima_win_rate,
        "lstm_beats_arima": lstm_beats_arima,
        "walk_forward": {
            "n_folds": len(fold_results),
            "mean_sharpe": wf_result.mean_sharpe,
            "mean_win_rate": wf_result.mean_win_rate,
            "mean_accuracy": wf_result.mean_accuracy,
            "bootstrap_p_value": wf_result.bootstrap_p_value,
        },
        "passes_deployment_gates": wf_result.passes_deployment_gates,
        "gate_failures": wf_result.gate_failures,
        "mlflow_run_id": mlflow_run_id,
        "model_path": model_path,
    }
