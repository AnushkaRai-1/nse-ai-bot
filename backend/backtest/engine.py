"""
Backtesting Engine — vectorbt wrapper with stress tests
PRD Section 8 | Literature Review Section 6

Two types of backtesting:
  1. Walk-forward (handled by walk_forward.py) — for training validation
  2. Full historical backtest — for reporting and stress testing

Stress test scenarios (PRD Section 8.3):
  - COVID crash (Feb-Apr 2020): Max drawdown must be < 30%
  - IL&FS crisis (Sep-Nov 2018): Should have reduced exposure
  - Demonetisation (Nov 2016-Feb 2017): Test regime detection accuracy

Metrics (PRD Section 8.2):
  - Sharpe ratio (annualized)
  - Calmar ratio (annualized return / max drawdown)
  - Maximum drawdown
  - Win rate
  - Bootstrap p-value vs buy-and-hold
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Optional

import numpy as np
import pandas as pd

from backend.core.logging_config import get_logger

logger = get_logger(__name__)


@dataclass
class BacktestResult:
    """Complete backtest results."""
    strategy_name: str
    start_date: datetime
    end_date: datetime
    total_return: float
    annualized_return: float
    sharpe_ratio: float
    calmar_ratio: float
    max_drawdown: float
    max_drawdown_date: datetime | None
    win_rate: float
    total_trades: int
    avg_holding_days: float
    benchmark_return: float  # Buy-and-hold
    excess_return: float
    bootstrap_p_value: float


# ═══════════════════════════════════════════════════════════════
# Stress Test Scenarios
# ═══════════════════════════════════════════════════════════════

STRESS_SCENARIOS = {
    "covid_crash": {
        "name": "COVID-19 Crash",
        "start": "2020-02-01",
        "end": "2020-04-30",
        "description": "Global pandemic sell-off. Nifty fell ~38%.",
        "max_acceptable_dd": 0.30,
    },
    "ilfs_crisis": {
        "name": "IL&FS Liquidity Crisis",
        "start": "2018-09-01",
        "end": "2018-11-30",
        "description": "Shadow banking crisis. Nifty fell ~11%, NBFC stocks crashed.",
        "max_acceptable_dd": 0.20,
    },
    "demonetisation": {
        "name": "Demonetisation",
        "start": "2016-11-08",
        "end": "2017-02-28",
        "description": "86% of currency withdrawn. Short-term disruption.",
        "max_acceptable_dd": 0.15,
    },
    "budget_2020": {
        "name": "Budget 2020 Sell-off",
        "start": "2020-01-15",
        "end": "2020-02-15",
        "description": "Pre-COVID budget disappointment.",
        "max_acceptable_dd": 0.12,
    },
}


class BacktestEngine:
    """
    Full historical backtesting engine with stress tests.
    Uses vectorbt for efficient vectorized computation.
    """

    def run_backtest(
        self,
        prices: pd.DataFrame,
        signals: pd.Series,
        initial_capital: float = 1_000_000,
        commission_pct: float = 0.001,  # 0.1% (STT + brokerage)
    ) -> BacktestResult:
        """
        Run a full backtest using vectorbt.

        Args:
            prices: DataFrame with 'close' column, DatetimeIndex
            signals: Series of signals (1 = long, 0 = flat), same index as prices
            initial_capital: Starting capital in INR
            commission_pct: Round-trip commission percentage
        """
        try:
            import vectorbt as vbt

            # Create portfolio using vectorbt
            entries = signals.diff().fillna(0) > 0  # Buy signals
            exits = signals.diff().fillna(0) < 0     # Sell signals

            pf = vbt.Portfolio.from_signals(
                prices["close"],
                entries=entries,
                exits=exits,
                init_cash=initial_capital,
                fees=commission_pct,
                freq="D",
            )

            total_return = float(pf.total_return())
            sharpe = float(pf.sharpe_ratio())
            max_dd = float(pf.max_drawdown())
            calmar = float(total_return / abs(max_dd)) if max_dd != 0 else 0
            trades = pf.trades.records_readable

            # Benchmark: buy and hold
            bh_return = float((prices["close"].iloc[-1] / prices["close"].iloc[0]) - 1)

        except ImportError:
            # Fallback: manual backtest if vectorbt not available
            logger.warning("vectorbt_not_available, using manual backtest")
            return self._manual_backtest(prices, signals, initial_capital, commission_pct)

        # Bootstrap p-value
        p_value = self._bootstrap_p_value(prices["close"], signals)

        # Trading days
        n_days = (prices.index[-1] - prices.index[0]).days
        years = n_days / 365.25
        ann_return = (1 + total_return) ** (1 / years) - 1 if years > 0 else 0

        # Win rate
        if len(trades) > 0:
            win_rate = float(trades["PnL"].gt(0).mean())
            avg_holding = float(trades["Duration"].dt.days.mean()) if "Duration" in trades.columns else 0
        else:
            win_rate = 0.0
            avg_holding = 0.0

        return BacktestResult(
            strategy_name="ML_Ensemble",
            start_date=prices.index[0].to_pydatetime(),
            end_date=prices.index[-1].to_pydatetime(),
            total_return=round(total_return, 4),
            annualized_return=round(ann_return, 4),
            sharpe_ratio=round(sharpe, 4),
            calmar_ratio=round(calmar, 4),
            max_drawdown=round(max_dd, 4),
            max_drawdown_date=None,
            win_rate=round(win_rate, 4),
            total_trades=len(trades) if len(trades) > 0 else 0,
            avg_holding_days=round(avg_holding, 1),
            benchmark_return=round(bh_return, 4),
            excess_return=round(total_return - bh_return, 4),
            bootstrap_p_value=round(p_value, 4),
        )

    def _manual_backtest(
        self,
        prices: pd.DataFrame,
        signals: pd.Series,
        initial_capital: float,
        commission_pct: float,
    ) -> BacktestResult:
        """Manual backtest fallback (no vectorbt dependency)."""
        close = prices["close"].values
        sigs = signals.values

        # Daily returns
        daily_returns = np.diff(close) / close[:-1]
        strategy_returns = sigs[1:] * daily_returns  # Signal applied to next day return
        strategy_returns -= np.abs(np.diff(sigs)) * commission_pct  # Commission on trades

        # Metrics
        cumulative = np.cumprod(1 + strategy_returns)
        total_return = float(cumulative[-1] - 1) if len(cumulative) > 0 else 0

        # Sharpe
        if np.std(strategy_returns) > 0:
            sharpe = float(np.mean(strategy_returns) / np.std(strategy_returns) * np.sqrt(252))
        else:
            sharpe = 0.0

        # Max drawdown
        running_max = np.maximum.accumulate(cumulative)
        drawdowns = (cumulative - running_max) / running_max
        max_dd = float(np.min(drawdowns)) if len(drawdowns) > 0 else 0

        # Calmar
        n_days = len(strategy_returns)
        years = n_days / 252
        ann_return = (1 + total_return) ** (1 / years) - 1 if years > 0 else 0
        calmar = ann_return / abs(max_dd) if max_dd != 0 else 0

        # Win rate (of days when signal = 1)
        long_days = sigs[1:] == 1
        if np.sum(long_days) > 0:
            win_rate = float(np.mean(daily_returns[long_days] > 0))
        else:
            win_rate = 0.0

        # Benchmark
        bh_return = float((close[-1] / close[0]) - 1)

        p_value = self._bootstrap_p_value(prices["close"], signals)

        return BacktestResult(
            strategy_name="ML_Ensemble_Manual",
            start_date=prices.index[0].to_pydatetime(),
            end_date=prices.index[-1].to_pydatetime(),
            total_return=round(total_return, 4),
            annualized_return=round(ann_return, 4),
            sharpe_ratio=round(sharpe, 4),
            calmar_ratio=round(calmar, 4),
            max_drawdown=round(max_dd, 4),
            max_drawdown_date=None,
            win_rate=round(win_rate, 4),
            total_trades=int(np.sum(np.abs(np.diff(sigs)) > 0)),
            avg_holding_days=0.0,
            benchmark_return=round(bh_return, 4),
            excess_return=round(total_return - bh_return, 4),
            bootstrap_p_value=round(p_value, 4),
        )

    def _bootstrap_p_value(
        self,
        prices: pd.Series,
        signals: pd.Series,
        n_bootstrap: int = 10_000,
    ) -> float:
        """Bootstrap test: strategy vs buy-and-hold."""
        daily_returns = prices.pct_change().dropna().values
        sigs = signals.iloc[1:].values

        if len(daily_returns) != len(sigs):
            min_len = min(len(daily_returns), len(sigs))
            daily_returns = daily_returns[:min_len]
            sigs = sigs[:min_len]

        strategy_return = np.sum(sigs * daily_returns)
        bh_return = np.sum(daily_returns)
        actual_excess = strategy_return - bh_return

        np.random.seed(42)
        n = len(daily_returns)
        count_worse = 0

        for _ in range(n_bootstrap):
            idx = np.random.choice(n, size=n, replace=True)
            boot_strat = np.sum(sigs[idx] * daily_returns[idx])
            boot_bh = np.sum(daily_returns[idx])
            if boot_strat - boot_bh <= 0:
                count_worse += 1

        return count_worse / n_bootstrap

    def run_stress_tests(
        self,
        prices: pd.DataFrame,
        signals: pd.Series,
    ) -> dict[str, dict]:
        """
        Run all stress test scenarios.
        PRD Section 8.3: Each scenario has a max acceptable drawdown.
        """
        results = {}

        for scenario_id, scenario in STRESS_SCENARIOS.items():
            start = pd.Timestamp(scenario["start"])
            end = pd.Timestamp(scenario["end"])

            # Filter to scenario period
            mask = (prices.index >= start) & (prices.index <= end)
            if mask.sum() < 5:
                results[scenario_id] = {"error": "Insufficient data for this period"}
                continue

            scenario_prices = prices[mask]
            scenario_signals = signals[mask]

            # Run backtest on scenario period
            bt_result = self.run_backtest(scenario_prices, scenario_signals)

            passed = abs(bt_result.max_drawdown) <= scenario["max_acceptable_dd"]

            results[scenario_id] = {
                "name": scenario["name"],
                "description": scenario["description"],
                "period": f"{scenario['start']} to {scenario['end']}",
                "max_drawdown": bt_result.max_drawdown,
                "max_acceptable_dd": scenario["max_acceptable_dd"],
                "total_return": bt_result.total_return,
                "benchmark_return": bt_result.benchmark_return,
                "passed": passed,
            }

            logger.info(
                "stress_test_result",
                scenario=scenario_id,
                max_dd=bt_result.max_drawdown,
                acceptable=scenario["max_acceptable_dd"],
                passed=passed,
            )

        return results
