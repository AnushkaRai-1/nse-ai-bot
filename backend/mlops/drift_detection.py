"""
Drift Detection — monitors model and data quality over time
PRD Section 9.2 | Literature Review Section 8

Two types of drift:
  1. Data drift: Input feature distributions shift (e.g., market regime change)
  2. Prediction drift: Model confidence/accuracy degrades over time

Detection methods:
  - KS-test (Kolmogorov-Smirnov) on feature distributions
  - Rolling accuracy over 30-day windows
  - Prediction distribution comparison (current vs training)

Auto-retrain triggers (PRD Section 9.2):
  - Rolling 30-day accuracy drops below 50%
  - KS-test p-value < 0.01 on any critical feature
  - More than 5% of features show significant drift
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

import numpy as np
import pandas as pd
from scipy import stats

from backend.core.logging_config import get_logger

logger = get_logger(__name__)

# Critical features — drift in these triggers immediate retrain
CRITICAL_FEATURES = [
    "rsi_14",
    "adx_value",
    "bb_bandwidth",
    "volume_z_3m",
    "sentiment_24h",
]

# Thresholds
ACCURACY_THRESHOLD = 0.50       # Below this = retrain
KS_PVALUE_THRESHOLD = 0.01     # Below this = significant drift
DRIFT_FEATURE_PCT = 0.05       # 5% of features drifting = retrain
STALENESS_HOURS = 36            # Data older than this = stale


class DriftDetector:
    """Monitor model and data quality for production deployment."""

    def check_prediction_drift(
        self,
        recent_predictions: pd.Series,
        recent_actuals: pd.Series,
        window_days: int = 30,
    ) -> dict:
        """
        Monitor rolling accuracy.
        PRD Section 9.2: Alert when 30-day accuracy < 50%.
        """
        if len(recent_predictions) == 0 or len(recent_actuals) == 0:
            return {
                "status": "insufficient_data",
                "rolling_accuracy": None,
                "needs_retrain": False,
            }

        # Binary predictions
        preds_binary = (recent_predictions > 0.5).astype(int)
        accuracy = float(np.mean(preds_binary == recent_actuals))

        needs_retrain = accuracy < ACCURACY_THRESHOLD

        result = {
            "status": "degraded" if needs_retrain else "healthy",
            "rolling_accuracy": round(accuracy, 4),
            "window_days": window_days,
            "n_predictions": len(recent_predictions),
            "needs_retrain": needs_retrain,
            "threshold": ACCURACY_THRESHOLD,
        }

        if needs_retrain:
            logger.warning("prediction_drift_detected", **result)
        else:
            logger.info("prediction_drift_check", **result)

        return result

    def check_data_drift(
        self,
        reference_data: pd.DataFrame,
        current_data: pd.DataFrame,
        feature_columns: list[str],
    ) -> dict:
        """
        KS-test for data drift on feature distributions.
        Compares training distribution vs recent production data.

        Returns per-feature drift results and overall drift summary.
        """
        drift_results = {}
        drifted_features = []

        for col in feature_columns:
            if col not in reference_data.columns or col not in current_data.columns:
                continue

            ref = reference_data[col].dropna()
            cur = current_data[col].dropna()

            if len(ref) < 30 or len(cur) < 30:
                drift_results[col] = {"status": "insufficient_data", "ks_pvalue": None}
                continue

            ks_stat, ks_pvalue = stats.ks_2samp(ref, cur)

            is_drifted = ks_pvalue < KS_PVALUE_THRESHOLD
            is_critical = col in CRITICAL_FEATURES

            drift_results[col] = {
                "ks_statistic": round(float(ks_stat), 4),
                "ks_pvalue": round(float(ks_pvalue), 6),
                "is_drifted": is_drifted,
                "is_critical": is_critical,
            }

            if is_drifted:
                drifted_features.append(col)

        # Overall drift assessment
        drift_pct = len(drifted_features) / len(feature_columns) if feature_columns else 0
        critical_drift = any(
            drift_results.get(f, {}).get("is_drifted", False)
            for f in CRITICAL_FEATURES
        )

        needs_retrain = drift_pct > DRIFT_FEATURE_PCT or critical_drift

        summary = {
            "status": "drifted" if needs_retrain else "stable",
            "total_features_checked": len(feature_columns),
            "drifted_features": drifted_features,
            "drift_percentage": round(drift_pct, 4),
            "critical_drift": critical_drift,
            "needs_retrain": needs_retrain,
            "per_feature": drift_results,
        }

        if needs_retrain:
            logger.warning("data_drift_detected", drifted=drifted_features, pct=drift_pct)
        else:
            logger.info("data_drift_check_passed", drift_pct=drift_pct)

        return summary

    def check_data_staleness(
        self,
        last_ohlcv_timestamp: Optional[datetime] = None,
        last_feature_timestamp: Optional[datetime] = None,
        last_prediction_timestamp: Optional[datetime] = None,
    ) -> dict:
        """
        Check if data pipelines are running on schedule.
        PRD Section 9.3: OHLCV at 6:00pm, features at 6:15pm, predictions at 6:30pm IST.
        """
        now = datetime.now(timezone.utc)
        staleness = {}

        if last_ohlcv_timestamp:
            hours_old = (now - last_ohlcv_timestamp).total_seconds() / 3600
            staleness["ohlcv"] = {
                "last_updated": last_ohlcv_timestamp.isoformat(),
                "hours_old": round(hours_old, 1),
                "is_stale": hours_old > STALENESS_HOURS,
            }

        if last_feature_timestamp:
            hours_old = (now - last_feature_timestamp).total_seconds() / 3600
            staleness["features"] = {
                "last_updated": last_feature_timestamp.isoformat(),
                "hours_old": round(hours_old, 1),
                "is_stale": hours_old > STALENESS_HOURS,
            }

        if last_prediction_timestamp:
            hours_old = (now - last_prediction_timestamp).total_seconds() / 3600
            staleness["predictions"] = {
                "last_updated": last_prediction_timestamp.isoformat(),
                "hours_old": round(hours_old, 1),
                "is_stale": hours_old > STALENESS_HOURS,
            }

        any_stale = any(v.get("is_stale", False) for v in staleness.values())

        return {
            "status": "stale" if any_stale else "fresh",
            "checks": staleness,
            "staleness_threshold_hours": STALENESS_HOURS,
        }

    def full_drift_report(
        self,
        reference_data: pd.DataFrame,
        current_data: pd.DataFrame,
        recent_predictions: pd.Series,
        recent_actuals: pd.Series,
        feature_columns: list[str],
        last_ohlcv_timestamp: Optional[datetime] = None,
        last_feature_timestamp: Optional[datetime] = None,
        last_prediction_timestamp: Optional[datetime] = None,
    ) -> dict:
        """Generate a comprehensive drift report."""
        prediction_drift = self.check_prediction_drift(recent_predictions, recent_actuals)
        data_drift = self.check_data_drift(reference_data, current_data, feature_columns)
        staleness = self.check_data_staleness(
            last_ohlcv_timestamp, last_feature_timestamp, last_prediction_timestamp
        )

        needs_retrain = (
            prediction_drift.get("needs_retrain", False)
            or data_drift.get("needs_retrain", False)
        )

        return {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "overall_status": "needs_retrain" if needs_retrain else "healthy",
            "needs_retrain": needs_retrain,
            "prediction_drift": prediction_drift,
            "data_drift": data_drift,
            "data_staleness": staleness,
        }
