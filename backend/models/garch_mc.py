"""
GARCH(1,1) Monte Carlo — Probabilistic risk model
PRD Section 6.3 | Literature Review Section 5

CRITICAL: Standard GBM Monte Carlo is INVALID for NSE.
  - GBM assumes constant volatility → NSE has volatility clustering (GARCH effects)
  - GBM assumes normal returns → NSE has fat tails (kurtosis 4-8) and negative skew
  - Circuit breakers (10%, 15%, 20%) create hard truncation

Implementation:
  1. Fit GARCH(1,1) to 252-day rolling returns per stock
  2. Extract conditional volatility
  3. Run 10,000 MC paths using GARCH-conditional sigma
  4. Apply circuit breaker truncation at ±20% daily
  5. Compute: P(return > 0), VaR, confidence intervals

PRD: 10,000 paths (not 100,000) — GARCH filtering makes this statistically equivalent.
PRD: Async background task, NOT blocking API response.
Library: arch (PyPI, 1,800+ stars)
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

import numpy as np
import pandas as pd

from backend.core.logging_config import get_logger

logger = get_logger(__name__)

# NSE circuit breaker limits (Literature Review Section 2.1)
DAILY_CIRCUIT_LIMIT = 0.20  # ±20% max daily move


class GARCHMonteCarlo:
    """
    GARCH(1,1)-filtered Monte Carlo simulation for NSE stocks.

    Literature Review Section 5.3:
    - GARCH(1,1) captures time-varying volatility (volatility clustering)
    - 10,000 paths with GARCH ≈ 100,000 paths with flat volatility
    - Must apply circuit breaker truncation
    """

    def __init__(self, n_paths: int = 10_000, random_seed: int = 42):
        self.n_paths = n_paths
        self.random_seed = random_seed

    def fit_garch(self, returns: pd.Series) -> dict:
        """
        Fit GARCH(1,1) to historical return series.
        Returns fitted parameters: omega, alpha, beta, and conditional volatility.
        """
        from arch import arch_model

        # GARCH(1,1) on percentage returns
        returns_pct = returns * 100  # arch library expects percentage returns
        returns_clean = returns_pct.dropna()

        if len(returns_clean) < 100:
            logger.warning("insufficient_data_for_garch", n_obs=len(returns_clean))
            return {"error": "Insufficient data (need 100+ observations)"}

        try:
            model = arch_model(
                returns_clean,
                vol="Garch",
                p=1,
                q=1,
                mean="Constant",
                dist="t",  # Student-t for fat tails (NSE kurtosis 4-8)
            )
            result = model.fit(disp="off", show_warning=False)

            params = {
                "omega": float(result.params.get("omega", 0)),
                "alpha": float(result.params.get("alpha[1]", 0)),
                "beta": float(result.params.get("beta[1]", 0)),
                "mu": float(result.params.get("mu", 0)),
                "nu": float(result.params.get("nu", 5)),  # Degrees of freedom for t-dist
                "last_variance": float(result.conditional_volatility.iloc[-1] ** 2),
                "last_residual": float(returns_clean.iloc[-1] - result.params.get("mu", 0)),
                "aic": float(result.aic),
                "bic": float(result.bic),
            }

            logger.info("garch_fitted", **{k: round(v, 6) for k, v in params.items()})
            return params

        except Exception as e:
            logger.error("garch_fit_failed", error=str(e))
            return {"error": str(e)}

    def simulate(
        self,
        current_price: float,
        garch_params: dict,
        horizon_days: int = 20,
    ) -> dict:
        """
        Run GARCH-filtered Monte Carlo simulation.

        Process:
          1. Use GARCH(1,1) conditional variance to generate future volatility
          2. Sample innovations from Student-t distribution (fat tails)
          3. Apply circuit breaker truncation at ±20% daily
          4. Compute probability intervals

        Literature Review Section 5.2:
          - Using GARCH-conditional sigma, not historical flat sigma
          - Student-t innovations capture fat tails
          - Circuit breaker truncation handles hard bounds
        """
        if "error" in garch_params:
            return {"error": garch_params["error"]}

        np.random.seed(self.random_seed)

        omega = garch_params["omega"]
        alpha = garch_params["alpha"]
        beta = garch_params["beta"]
        mu = garch_params["mu"] / 100  # Convert back from percentage
        nu = garch_params.get("nu", 5)
        last_variance = garch_params["last_variance"] / (100 ** 2)  # Convert from pct
        last_residual = garch_params["last_residual"] / 100

        # Initialize simulation arrays
        prices = np.zeros((self.n_paths, horizon_days + 1))
        prices[:, 0] = current_price

        # GARCH(1,1) variance evolution:
        # σ²_t = ω + α * ε²_{t-1} + β * σ²_{t-1}
        variances = np.full(self.n_paths, last_variance)
        prev_residuals = np.full(self.n_paths, last_residual)

        for t in range(1, horizon_days + 1):
            # Update GARCH variance
            variances = (
                omega / (100 ** 2)
                + alpha * (prev_residuals ** 2)
                + beta * variances
            )
            variances = np.maximum(variances, 1e-10)  # Floor at near-zero

            # Sample innovations from Student-t distribution
            innovations = np.random.standard_t(df=nu, size=self.n_paths)

            # Generate returns
            sigma = np.sqrt(variances)
            returns = mu + sigma * innovations

            # ── Circuit breaker truncation (Literature Review Section 2.1) ──
            # NSE enforces ±20% daily price bands
            returns = np.clip(returns, -DAILY_CIRCUIT_LIMIT, DAILY_CIRCUIT_LIMIT)

            # Update prices
            prices[:, t] = prices[:, t - 1] * (1 + returns)

            # Store for next GARCH iteration
            prev_residuals = returns - mu

        # ── Compute statistics ────────────────────────────────────
        final_prices = prices[:, -1]
        total_returns = (final_prices - current_price) / current_price

        # 5-day statistics (if horizon >= 5)
        if horizon_days >= 5:
            prices_5d = prices[:, 5]
            returns_5d = (prices_5d - current_price) / current_price
            prob_positive_5d = float(np.mean(returns_5d > 0))
        else:
            prob_positive_5d = None

        # Full horizon statistics
        prob_positive = float(np.mean(total_returns > 0))
        var_5pct = float(np.percentile(total_returns, 5))  # 5th percentile (VaR proxy)
        median_return = float(np.median(total_returns))
        ci_lower_95 = float(np.percentile(total_returns, 2.5))
        ci_upper_95 = float(np.percentile(total_returns, 97.5))

        result = {
            "symbol": None,  # Set by caller
            "current_price": current_price,
            "horizon_days": horizon_days,
            "prob_positive_5d": prob_positive_5d,
            "prob_positive_20d": prob_positive if horizon_days >= 20 else None,
            "var_5pct": var_5pct,
            "expected_return_median": median_return,
            "ci_lower_95": ci_lower_95,
            "ci_upper_95": ci_upper_95,
            "paths_run": self.n_paths,
            "garch_filtered": True,
            "circuit_breaker_applied": True,
            "mean_final_price": float(np.mean(final_prices)),
            "std_final_price": float(np.std(final_prices)),
        }

        logger.info(
            "mc_simulation_complete",
            horizon=horizon_days,
            prob_positive=round(prob_positive, 4),
            var_5pct=round(var_5pct, 4),
            median_return=round(median_return, 4),
        )

        return result

    def run_for_stock(
        self,
        symbol: str,
        price_history: pd.Series,
        current_price: float,
        horizons: list[int] | None = None,
    ) -> dict:
        """
        Full pipeline: fit GARCH + run MC for a single stock.

        Args:
            symbol: Stock symbol
            price_history: Series of adjusted close prices (at least 252 days)
            current_price: Current stock price
            horizons: List of forecast horizons in days [5, 20]
        """
        if horizons is None:
            horizons = [5, 20]

        # Compute log returns
        returns = np.log(price_history / price_history.shift(1)).dropna()

        if len(returns) < 252:
            logger.warning("insufficient_history", symbol=symbol, n_returns=len(returns))

        # Fit GARCH(1,1)
        garch_params = self.fit_garch(returns)
        if "error" in garch_params:
            return {"symbol": symbol, "error": garch_params["error"]}

        # Run simulations for each horizon
        results = {"symbol": symbol, "garch_params": garch_params, "simulations": {}}

        for h in horizons:
            sim = self.simulate(current_price, garch_params, horizon_days=h)
            sim["symbol"] = symbol
            results["simulations"][f"{h}d"] = sim

        return results
