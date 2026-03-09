"""
Market Regime Detection — Bull / Bear / Volatile
Literature Review Section 3.4: 200-day MA as regime classifier

Methods:
  1. 200-day MA crossover: Price above = Bull, below = Bear
  2. India VIX: VIX > 25 = Volatile (overrides MA signal)
  3. ADX threshold: Market-wide ADX for trend confirmation

PRD Section 7.2: GET /api/v1/market/regime

Architecture Implication (Literature Review Section 2):
  The system must NOT use a single unified model across all market caps.
  Regime affects signal weights differently per cap bucket.
"""

from __future__ import annotations

from typing import Optional

import numpy as np
import pandas as pd

from backend.core.logging_config import get_logger
from backend.core.schemas import MarketRegime

logger = get_logger(__name__)

# Thresholds from literature
VIX_VOLATILE_THRESHOLD = 25.0    # India VIX above this = volatile
VIX_BEAR_THRESHOLD = 30.0       # Extreme fear
MA200_LOOKBACK = 200             # Trading days


class RegimeDetector:
    """
    Classifies the current market regime as Bull, Bear, or Volatile.

    Literature Review Section 3.4:
      - 200-day MA produces positive excess returns as a regime classifier
      - Works better as regime classifier than as a trade trigger
      - Consistent with 8-12% annual excess returns for Golden Cross signals
    """

    def detect(
        self,
        nifty50_prices: pd.Series,
        india_vix: Optional[float] = None,
        nifty50_adx: Optional[float] = None,
    ) -> dict:
        """
        Determine current market regime.

        Args:
            nifty50_prices: Nifty 50 closing prices (at least 200 days)
            india_vix: Current India VIX value
            nifty50_adx: Current ADX for Nifty 50

        Returns:
            Dict with regime, confidence, and reasoning
        """
        if len(nifty50_prices) < MA200_LOOKBACK:
            return {
                "regime": MarketRegime.VOLATILE,
                "confidence": 0.5,
                "reasoning": f"Insufficient data ({len(nifty50_prices)} days, need {MA200_LOOKBACK})",
                "nifty50_vs_200dma": 0.0,
                "india_vix": india_vix,
            }

        current_price = float(nifty50_prices.iloc[-1])
        ma200 = float(nifty50_prices.rolling(MA200_LOOKBACK).mean().iloc[-1])
        pct_above_ma = (current_price - ma200) / ma200

        # ── Primary: 200-day MA regime ────────────────────────
        if current_price > ma200:
            base_regime = MarketRegime.BULL
            base_confidence = min(0.5 + abs(pct_above_ma) * 2, 0.95)
        else:
            base_regime = MarketRegime.BEAR
            base_confidence = min(0.5 + abs(pct_above_ma) * 2, 0.95)

        # ── Override: India VIX ───────────────────────────────
        # High VIX overrides to Volatile regardless of MA position
        regime = base_regime
        confidence = base_confidence
        reasoning_parts = []

        if india_vix is not None:
            if india_vix > VIX_BEAR_THRESHOLD:
                regime = MarketRegime.VOLATILE
                confidence = 0.9
                reasoning_parts.append(f"India VIX extremely elevated ({india_vix:.1f} > {VIX_BEAR_THRESHOLD})")
            elif india_vix > VIX_VOLATILE_THRESHOLD:
                if base_regime == MarketRegime.BEAR:
                    regime = MarketRegime.VOLATILE
                    confidence = 0.8
                reasoning_parts.append(f"India VIX elevated ({india_vix:.1f} > {VIX_VOLATILE_THRESHOLD})")
            else:
                reasoning_parts.append(f"India VIX normal ({india_vix:.1f})")

        # ── MA context ────────────────────────────────────────
        if pct_above_ma > 0:
            reasoning_parts.append(
                f"Nifty 50 is {pct_above_ma:.1%} above 200-day MA ({ma200:.0f}) — bullish structure"
            )
        else:
            reasoning_parts.append(
                f"Nifty 50 is {abs(pct_above_ma):.1%} below 200-day MA ({ma200:.0f}) — bearish structure"
            )

        # ── ADX confirmation ──────────────────────────────────
        if nifty50_adx is not None:
            if nifty50_adx > 25:
                reasoning_parts.append(f"Strong trend (ADX: {nifty50_adx:.1f} > 25)")
            else:
                reasoning_parts.append(f"Weak trend / sideways (ADX: {nifty50_adx:.1f} ≤ 25)")
                # Low ADX reduces confidence
                confidence *= 0.85

        result = {
            "regime": regime,
            "confidence": round(confidence, 4),
            "reasoning": ". ".join(reasoning_parts),
            "nifty50_vs_200dma": round(pct_above_ma, 4),
            "india_vix": india_vix,
            "nifty50_adx": nifty50_adx,
        }

        logger.info("regime_detected", regime=regime.value, confidence=result["confidence"])
        return result

    def get_cap_specific_weights(
        self,
        regime: MarketRegime,
        market_cap_bucket: str,
    ) -> dict:
        """
        Adjust signal weights based on regime and market-cap bucket.

        Literature Review Section 2.4:
          - FII/DII dominance makes NLP sentiment weaker for large caps
          - RSI is stronger for mid-caps
          - Volume z-score is more meaningful for small caps

        Literature Review Section 3.1:
          - RSI alpha near-zero on large-caps, Sharpe 0.6-0.8 on mid-caps
        """
        # Base weights from PRD Section 6.4
        weights = {
            "xgboost": 0.50,
            "lstm": 0.30,
            "garch": 0.20,
        }

        # ── Market cap adjustments ────────────────────────────
        if market_cap_bucket == "large":
            # Large cap: FII/DII driven, less sentiment alpha
            # RSI less effective, fundamentals more important
            weights["xgboost"] = 0.55
            weights["lstm"] = 0.30
            weights["garch"] = 0.15

        elif market_cap_bucket == "mid":
            # Mid cap: RSI most effective, sentiment has more alpha
            weights["xgboost"] = 0.50
            weights["lstm"] = 0.30
            weights["garch"] = 0.20

        elif market_cap_bucket == "small":
            # Small cap: Higher risk, GARCH more important for risk management
            # Literature Review Section 2.2: Volume breakout needs fundamental gate
            weights["xgboost"] = 0.45
            weights["lstm"] = 0.25
            weights["garch"] = 0.30

        # ── Regime adjustments ────────────────────────────────
        if regime == MarketRegime.VOLATILE:
            # In volatile markets, increase risk model weight
            weights["garch"] += 0.10
            weights["xgboost"] -= 0.05
            weights["lstm"] -= 0.05

        elif regime == MarketRegime.BEAR:
            # In bear markets, increase risk awareness
            weights["garch"] += 0.05
            weights["lstm"] -= 0.05

        # Normalize to sum to 1.0
        total = sum(weights.values())
        weights = {k: round(v / total, 4) for k, v in weights.items()}

        return weights
