"""
Walk-Forward Validation Engine
PRD Section 8 | Literature Review Section 6

CRITICAL: Standard k-fold cross-validation is INVALID for time series.
Walk-forward validation:
  - Train on [t-N, t], test on [t+1, t+M]
  - Expanding window: each fold adds more training data
  - No future data ever touches training

PRD Section 8.1:
  - XGBoost: 36-month train / 3-month test
  - LSTM: 48-month train / 6-month test
  - Minimum walk-forward folds: 8 for statistical significance

Performance Gates (PRD Section 8.2):
  - Sharpe ratio > 1.0
  - Maximum drawdown < 25%
  - Win rate > 52%
  - Bootstrap p-value < 0.05 vs buy-and-hold
  - ALL gates must pass or model is NOT deployed
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional

import numpy as np
import pandas as pd

from backend.core.logging_config import get_logger

logger = get_logger(__name__)

# ═══════════════════════════════════════════════════════════════
# Walk-Forward Configuration
# ═══════════════════════════════════════════════════════════════

@dataclass
class WalkForwardConfig:
    """Configuration for walk-forward validation."""
    train_months: int = 36          # XGBoost default (LSTM: 48)
    test_months: int = 3            # XGBoost default (LSTM: 6)
    min_folds: int = 8              # PRD: minimum 8 folds for significance
    expanding_window: bool = True   # Expanding (not rolling) window


@dataclass
class FoldResult:
    """Results from a single walk-forward fold."""
    fold_id: int
    train_start: datetime
    train_end: datetime
    test_start: datetime
    test_end: datetime
    train_samples: int
    test_samples: int
    accuracy: float
    precision: float
    recall: float
    f1: float
    sharpe_ratio: float
    max_drawdown: float
    win_rate: float
    total_return: float
    predictions: Optional[np.ndarray] = field(default=None, repr=False)
    actuals: Optional[np.ndarray] = field(default=None, repr=False)


@dataclass
class WalkForwardResult:
    """Aggregated walk-forward validation results."""
    folds: list[FoldResult]
    mean_sharpe: float
    mean_max_dd: float
    mean_win_rate: float
    mean_accuracy: float
    bootstrap_p_value: float
    passes_deployment_gates: bool
    gate_failures: list[str]


# ═══════════════════════════════════════════════════════════════
# Walk-Forward Engine
# ═══════════════════════════════════════════════════════════════

class WalkForwardEngine:
    """
    Walk-forward validation with expanding window.
    Literature Review Section 6.2: "Any backtest without walk-forward is fiction."
    """

    def __init__(self, config: WalkForwardConfig | None = None):
        self.config = config or WalkForwardConfig()

    def generate_folds(self, data: pd.DataFrame, date_column: str = "date") -> list[dict]:
        """
        Generate walk-forward fold indices.

        Each fold:
          - Train: [start, start + train_months]
          - Test: [train_end + 1 day, train_end + test_months]
          - Next fold: Expanding — train window grows

        Returns list of dicts with train/test date ranges.
        """
        dates = pd.to_datetime(data[date_column])
        min_date = dates.min()
        max_date = dates.max()

        folds = []
        fold_id = 0
        train_start = min_date

        while True:
            if self.config.expanding_window:
                # Expanding: always start from the beginning
                fold_train_start = min_date
            else:
                fold_train_start = train_start

            train_end = fold_train_start + pd.DateOffset(months=self.config.train_months + fold_id * self.config.test_months)
            test_start = train_end + pd.Timedelta(days=1)
            test_end = test_start + pd.DateOffset(months=self.config.test_months) - pd.Timedelta(days=1)

            # Stop if test period extends beyond data
            if test_end > max_date:
                break

            folds.append({
                "fold_id": fold_id,
                "train_start": fold_train_start,
                "train_end": train_end,
                "test_start": test_start,
                "test_end": test_end,
            })

            fold_id += 1

        if len(folds) < self.config.min_folds:
            logger.warning(
                "insufficient_folds",
                generated=len(folds),
                minimum=self.config.min_folds,
            )

        logger.info("folds_generated", n_folds=len(folds))
        return folds

    def compute_fold_metrics(
        self,
        predictions: np.ndarray,
        actuals: np.ndarray,
        returns: np.ndarray,
        fold_info: dict,
    ) -> FoldResult:
        """
        Compute performance metrics for a single fold.

        Args:
            predictions: Model probability predictions (0-1)
            actuals: Actual binary targets (0 or 1)
            returns: Actual log returns for the test period
            fold_info: Dict with fold dates and ID
        """
        # Binary predictions at 0.5 threshold
        preds_binary = (predictions > 0.5).astype(int)

        # Classification metrics
        tp = np.sum((preds_binary == 1) & (actuals == 1))
        fp = np.sum((preds_binary == 1) & (actuals == 0))
        fn = np.sum((preds_binary == 0) & (actuals == 1))
        tn = np.sum((preds_binary == 0) & (actuals == 0))

        accuracy = (tp + tn) / (tp + fp + fn + tn) if (tp + fp + fn + tn) > 0 else 0
        precision = tp / (tp + fp) if (tp + fp) > 0 else 0
        recall = tp / (tp + fn) if (tp + fn) > 0 else 0
        f1 = 2 * precision * recall / (precision + recall) if (precision + recall) > 0 else 0

        # ── Trading metrics ───────────────────────────────────
        # Strategy: Go long when predicted > 0.5, else flat (0% return)
        strategy_returns = np.where(preds_binary == 1, returns, 0)

        # Sharpe ratio (annualized, assuming ~252 trading days)
        daily_returns = strategy_returns
        if len(daily_returns) > 1 and np.std(daily_returns) > 0:
            sharpe = (np.mean(daily_returns) / np.std(daily_returns)) * np.sqrt(252)
        else:
            sharpe = 0.0

        # Maximum drawdown
        cumulative = np.cumsum(daily_returns)
        running_max = np.maximum.accumulate(cumulative)
        drawdowns = cumulative - running_max
        max_dd = float(np.min(drawdowns)) if len(drawdowns) > 0 else 0.0

        # Win rate (of trades taken)
        trades_taken = preds_binary == 1
        if np.sum(trades_taken) > 0:
            win_rate = np.mean(returns[trades_taken] > 0)
        else:
            win_rate = 0.0

        total_return = float(np.sum(strategy_returns))

        return FoldResult(
            fold_id=fold_info["fold_id"],
            train_start=fold_info["train_start"],
            train_end=fold_info["train_end"],
            test_start=fold_info["test_start"],
            test_end=fold_info["test_end"],
            train_samples=fold_info.get("train_samples", 0),
            test_samples=len(predictions),
            accuracy=round(accuracy, 4),
            precision=round(precision, 4),
            recall=round(recall, 4),
            f1=round(f1, 4),
            sharpe_ratio=round(sharpe, 4),
            max_drawdown=round(max_dd, 4),
            win_rate=round(win_rate, 4),
            total_return=round(total_return, 4),
            predictions=predictions,
            actuals=actuals,
        )

    def aggregate_results(self, fold_results: list[FoldResult]) -> WalkForwardResult:
        """
        Aggregate results across all folds and check deployment gates.

        PRD Section 8.2 Deployment Gates:
          - Sharpe ratio > 1.0
          - Maximum drawdown < 25%
          - Win rate > 52%
          - Bootstrap p-value < 0.05
        """
        if not fold_results:
            return WalkForwardResult(
                folds=[],
                mean_sharpe=0.0,
                mean_max_dd=0.0,
                mean_win_rate=0.0,
                mean_accuracy=0.0,
                bootstrap_p_value=1.0,
                passes_deployment_gates=False,
                gate_failures=["No folds to evaluate"],
            )

        mean_sharpe = np.mean([f.sharpe_ratio for f in fold_results])
        mean_max_dd = np.mean([f.max_drawdown for f in fold_results])
        mean_win_rate = np.mean([f.win_rate for f in fold_results])
        mean_accuracy = np.mean([f.accuracy for f in fold_results])

        # ── Bootstrap p-value vs buy-and-hold ─────────────────
        p_value = self._bootstrap_test(fold_results)

        # ── Check deployment gates ────────────────────────────
        gate_failures = []

        if mean_sharpe < 1.0:
            gate_failures.append(f"Sharpe ratio {mean_sharpe:.2f} < 1.0")
        if abs(mean_max_dd) > 0.25:
            gate_failures.append(f"Max drawdown {abs(mean_max_dd):.2%} > 25%")
        if mean_win_rate < 0.52:
            gate_failures.append(f"Win rate {mean_win_rate:.2%} < 52%")
        if p_value >= 0.05:
            gate_failures.append(f"Bootstrap p-value {p_value:.4f} ≥ 0.05")

        passes = len(gate_failures) == 0

        result = WalkForwardResult(
            folds=fold_results,
            mean_sharpe=round(mean_sharpe, 4),
            mean_max_dd=round(mean_max_dd, 4),
            mean_win_rate=round(mean_win_rate, 4),
            mean_accuracy=round(mean_accuracy, 4),
            bootstrap_p_value=round(p_value, 4),
            passes_deployment_gates=passes,
            gate_failures=gate_failures,
        )

        if passes:
            logger.info("deployment_gates_passed", sharpe=mean_sharpe, win_rate=mean_win_rate)
        else:
            logger.warning("deployment_gates_failed", failures=gate_failures)

        return result

    def _bootstrap_test(self, fold_results: list[FoldResult], n_bootstrap: int = 10_000) -> float:
        """
        Bootstrap test: Is strategy return significantly better than buy-and-hold?

        Method:
          1. Collect all test predictions and actual returns across folds
          2. Random bootstrap sampling of daily returns
          3. Compute strategy return vs buy-and-hold for each sample
          4. p-value = fraction of bootstraps where strategy <= buy-and-hold
        """
        all_preds = []
        all_returns = []

        for fold in fold_results:
            if fold.predictions is not None and fold.actuals is not None:
                all_preds.extend(fold.predictions)
                all_returns.extend(fold.actuals)  # These are actual returns

        if len(all_preds) < 30:
            return 1.0  # Insufficient data

        all_preds = np.array(all_preds)
        all_returns = np.array(all_returns)

        # Actual strategy excess return
        strategy_signals = (all_preds > 0.5).astype(float)
        strategy_return = np.sum(strategy_signals * all_returns)
        bh_return = np.sum(all_returns)
        actual_excess = strategy_return - bh_return

        # Bootstrap
        np.random.seed(42)
        n = len(all_preds)
        count_worse = 0

        for _ in range(n_bootstrap):
            idx = np.random.choice(n, size=n, replace=True)
            boot_preds = all_preds[idx]
            boot_returns = all_returns[idx]

            boot_signals = (boot_preds > 0.5).astype(float)
            boot_strategy = np.sum(boot_signals * boot_returns)
            boot_bh = np.sum(boot_returns)
            boot_excess = boot_strategy - boot_bh

            if boot_excess <= 0:
                count_worse += 1

        return count_worse / n_bootstrap
