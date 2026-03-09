"""
XGBoost/LightGBM Ensemble — PRIMARY short-horizon model
PRD Section 6.1 | Literature Review Section 4.2

Architecture:
  - LightGBM (faster, handles missing values natively) + XGBoost (ensemble diversity)
  - THREE separate models: large-cap, mid-cap, small-cap
  - Target: Binary classification — log_return_5d > 0
  - Features: All from features_daily (technical + fundamental + sentiment)
  - Validation: Walk-forward ONLY. Sharpe > 1.0 gate.
  - Tuning: Optuna (Bayesian, 200 trials per market-cap model)

Literature Review backing:
  - Fischer & Krauss (2018): Random Forest outperformed LSTM on daily rebalancing
  - Huang et al. (2019): XGBoost Sharpe 1.2-1.8 on Asian equities
  - Tree-based models handle mixed features natively, less prone to overfitting
"""

from __future__ import annotations

import json
import pickle
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import numpy as np
import pandas as pd

from backend.core.config import get_settings
from backend.core.logging_config import get_logger

settings = get_settings()
logger = get_logger(__name__)

# Feature columns used by XGBoost/LightGBM (matches features_daily table)
FEATURE_COLUMNS = [
    "rsi_14",
    "macd_signal",       # NULL when ADX <= 25 (LightGBM handles missing natively)
    "bb_bandwidth",
    "ma200_regime",      # Boolean → 0/1
    "adx_value",
    "atr_14",
    "fcf_yield",
    "pe_zscore",
    "de_ratio",
    "sentiment_24h",
    "sentiment_72h",
    "volume_z_3m",
]

TARGET_COL = "target_5d"  # Binary: log_return_5d > 0


class XGBoostEnsemble:
    """
    Ensemble of LightGBM + XGBoost for short-horizon directional prediction.
    Maintains three separate model pairs (one per market-cap bucket).
    """

    def __init__(self):
        self.models: dict[str, dict] = {}  # {bucket: {"lgbm": model, "xgb": model}}
        self.model_version: str | None = None

    def train(
        self,
        X_train: pd.DataFrame,
        y_train: pd.Series,
        market_cap_bucket: str,
        X_val: Optional[pd.DataFrame] = None,
        y_val: Optional[pd.Series] = None,
        params: Optional[dict] = None,
    ) -> dict:
        """
        Train LightGBM + XGBoost ensemble for a specific market-cap bucket.
        Returns training metrics.

        PRD Section 6.1:
          - n_estimators: 200-2000
          - max_depth: 3-8
          - learning_rate: 0.01-0.1
          - subsample: 0.6-1.0
        """
        import lightgbm as lgb
        import xgboost as xgb

        # Default hyperparameters (overridden by Optuna in training/train_xgboost.py)
        lgbm_params = {
            "objective": "binary",
            "metric": "binary_logloss",
            "n_estimators": 500,
            "max_depth": 6,
            "learning_rate": 0.05,
            "subsample": 0.8,
            "colsample_bytree": 0.8,
            "min_child_samples": 20,
            "reg_alpha": 0.1,
            "reg_lambda": 1.0,
            "random_state": 42,
            "verbose": -1,
            "n_jobs": -1,
        }

        xgb_params = {
            "objective": "binary:logistic",
            "eval_metric": "logloss",
            "n_estimators": 500,
            "max_depth": 6,
            "learning_rate": 0.05,
            "subsample": 0.8,
            "colsample_bytree": 0.8,
            "min_child_weight": 5,
            "reg_alpha": 0.1,
            "reg_lambda": 1.0,
            "random_state": 42,
            "n_jobs": -1,
            "verbosity": 0,
        }

        if params:
            if "lgbm" in params:
                lgbm_params.update(params["lgbm"])
            if "xgb" in params:
                xgb_params.update(params["xgb"])

        # Prepare features
        X = X_train[FEATURE_COLUMNS].copy()
        X["ma200_regime"] = X["ma200_regime"].astype(float)

        # Train LightGBM
        logger.info("training_lgbm", bucket=market_cap_bucket, samples=len(X))
        lgbm_model = lgb.LGBMClassifier(**lgbm_params)

        eval_set = None
        if X_val is not None and y_val is not None:
            X_v = X_val[FEATURE_COLUMNS].copy()
            X_v["ma200_regime"] = X_v["ma200_regime"].astype(float)
            eval_set = [(X_v, y_val)]

        lgbm_model.fit(
            X, y_train,
            eval_set=eval_set,
            callbacks=[lgb.early_stopping(50, verbose=False)] if eval_set else None,
        )

        # Train XGBoost
        logger.info("training_xgb", bucket=market_cap_bucket, samples=len(X))
        xgb_model = xgb.XGBClassifier(**xgb_params)
        xgb_model.fit(
            X, y_train,
            eval_set=eval_set if eval_set else None,
            verbose=False,
        )

        # Store models
        self.models[market_cap_bucket] = {
            "lgbm": lgbm_model,
            "xgb": xgb_model,
        }

        # Compute training metrics
        lgbm_probs = lgbm_model.predict_proba(X)[:, 1]
        xgb_probs = xgb_model.predict_proba(X)[:, 1]
        ensemble_probs = 0.5 * lgbm_probs + 0.5 * xgb_probs
        ensemble_preds = (ensemble_probs > 0.5).astype(int)

        train_accuracy = float(np.mean(ensemble_preds == y_train))

        # Feature importance (LightGBM)
        importance = dict(zip(FEATURE_COLUMNS, lgbm_model.feature_importances_.tolist()))

        metrics = {
            "bucket": market_cap_bucket,
            "train_accuracy": round(train_accuracy, 4),
            "train_samples": len(X),
            "feature_importance": importance,
            "lgbm_best_iteration": lgbm_model.best_iteration_ if hasattr(lgbm_model, "best_iteration_") else lgbm_params["n_estimators"],
        }

        logger.info("training_complete", **metrics)
        return metrics

    def predict(self, X: pd.DataFrame, market_cap_bucket: str) -> dict:
        """
        Predict using the ensemble for a market-cap bucket.
        Returns probability of positive 5-day return.

        PRD Section 6.4: XGBoost/LightGBM weight = 50% of final ensemble.
        """
        if market_cap_bucket not in self.models:
            raise ValueError(f"No model trained for bucket: {market_cap_bucket}")

        models = self.models[market_cap_bucket]
        X_feat = X[FEATURE_COLUMNS].copy()
        X_feat["ma200_regime"] = X_feat["ma200_regime"].astype(float)

        # Get probabilities from both models
        lgbm_probs = models["lgbm"].predict_proba(X_feat)[:, 1]
        xgb_probs = models["xgb"].predict_proba(X_feat)[:, 1]

        # Average (equal weight within the XGB ensemble)
        ensemble_probs = 0.5 * lgbm_probs + 0.5 * xgb_probs

        return {
            "probability": ensemble_probs.tolist(),
            "lgbm_prob": lgbm_probs.tolist(),
            "xgb_prob": xgb_probs.tolist(),
            "direction": ["long" if p > 0.5 else "neutral" for p in ensemble_probs],
        }

    def get_feature_importance(self, market_cap_bucket: str) -> dict:
        """Get feature importance from the LightGBM model."""
        if market_cap_bucket not in self.models:
            return {}
        lgbm = self.models[market_cap_bucket]["lgbm"]
        return dict(zip(FEATURE_COLUMNS, lgbm.feature_importances_.tolist()))

    def save(self, directory: str, version: str) -> str:
        """Save all models to disk."""
        path = Path(directory) / version
        path.mkdir(parents=True, exist_ok=True)

        for bucket, models in self.models.items():
            pickle.dump(models["lgbm"], open(path / f"lgbm_{bucket}.pkl", "wb"))
            pickle.dump(models["xgb"], open(path / f"xgb_{bucket}.pkl", "wb"))

        self.model_version = version
        logger.info("models_saved", path=str(path), version=version)
        return str(path)

    def load(self, directory: str, version: str) -> None:
        """Load models from disk."""
        path = Path(directory) / version

        for bucket in ["large", "mid", "small"]:
            lgbm_path = path / f"lgbm_{bucket}.pkl"
            xgb_path = path / f"xgb_{bucket}.pkl"

            if lgbm_path.exists() and xgb_path.exists():
                self.models[bucket] = {
                    "lgbm": pickle.load(open(lgbm_path, "rb")),
                    "xgb": pickle.load(open(xgb_path, "rb")),
                }
                logger.info("model_loaded", bucket=bucket, version=version)

        self.model_version = version
