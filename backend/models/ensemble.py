"""
Ensemble Meta-Model — combines XGBoost, LSTM, and GARCH-MC outputs.
PRD Section 6.4

Phase 1: Fixed weights (not enough training data for learned meta-model):
  - XGBoost/LightGBM 5-day signal:  50% (PRIMARY, literature-backed)
  - LSTM 20-day signal:              30% (SECONDARY, regularized by XGB)
  - GARCH-MC confidence:             20% (Risk filter)

Phase 3 upgrade: RL agent (Stable-Baselines3 PPO) optimizes weights.
  - RL will NOT generate buy/sell signals — only optimize position sizing.
  - This separation avoids the sparse reward problem (Lit Review Section 7).
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Optional

import numpy as np

from backend.core.logging_config import get_logger
from backend.core.schemas import Direction, Horizon, MarketRegime, SignalBreakdown

logger = get_logger(__name__)

# PRD Section 6.4: Fixed ensemble weights
WEIGHT_XGBOOST = 0.50
WEIGHT_LSTM = 0.30
WEIGHT_GARCH = 0.20


class EnsembleModel:
    """
    Combines outputs from XGBoost, LSTM, and GARCH-MC into a final
    recommendation score (0-100) with human-readable reasoning.
    """

    def generate_recommendation(
        self,
        symbol: str,
        market_cap_bucket: str,
        xgboost_prob: float,
        lstm_prob: Optional[float],
        garch_result: Optional[dict],
        features: dict,
        regime: MarketRegime,
    ) -> dict:
        """
        Generate a single stock recommendation.

        Args:
            symbol: Stock symbol
            market_cap_bucket: 'large', 'mid', 'small'
            xgboost_prob: P(return > 0) from XGBoost ensemble (0-1)
            lstm_prob: P(return > 0) from LSTM (0-1), may be None in Phase 1
            garch_result: GARCH-MC simulation results dict
            features: Latest feature values from features_daily
            regime: Current market regime

        Returns:
            Dict with score, direction, confidence, reasoning
        """
        # ── Compute weighted ensemble score ───────────────────
        components = []

        # XGBoost (always available in Phase 1)
        xgb_score = xgboost_prob * 100
        components.append(("xgboost", xgb_score, WEIGHT_XGBOOST))

        # LSTM (may not be available in Phase 1)
        if lstm_prob is not None:
            lstm_score = lstm_prob * 100
            components.append(("lstm", lstm_score, WEIGHT_LSTM))
            effective_lstm_weight = WEIGHT_LSTM
        else:
            lstm_score = None
            # Redistribute LSTM weight to XGBoost
            effective_lstm_weight = 0
            components.append(("xgboost_extra", xgb_score, WEIGHT_LSTM))

        # GARCH-MC confidence (probability of positive return)
        if garch_result and "prob_positive_20d" in garch_result:
            garch_conf = garch_result["prob_positive_20d"] * 100
            components.append(("garch", garch_conf, WEIGHT_GARCH))
        elif garch_result and "prob_positive_5d" in garch_result:
            garch_conf = garch_result["prob_positive_5d"] * 100
            components.append(("garch", garch_conf, WEIGHT_GARCH))
        else:
            garch_conf = None
            # Redistribute to XGBoost
            components.append(("xgboost_extra2", xgb_score, WEIGHT_GARCH))

        # Weighted combination
        total_score = sum(score * weight for _, score, weight in components)
        total_score = max(0, min(100, total_score))  # Clamp to 0-100

        # ── Determine direction ───────────────────────────────
        # PRD Section 15.1: Only 'long' or 'neutral'. No short recommendations.
        if total_score >= 55:
            direction = Direction.LONG
        else:
            direction = Direction.NEUTRAL

        # ── Apply D/E exclusion filter ────────────────────────
        # Literature Review Section 9.3: Hard exclusion
        de_ratio = features.get("de_ratio")
        if de_ratio is not None:
            if regime == MarketRegime.BULL and de_ratio > 2.0:
                direction = Direction.NEUTRAL
                total_score = min(total_score, 30)  # Cap score
            elif regime != MarketRegime.BULL and de_ratio > 1.0:
                direction = Direction.NEUTRAL
                total_score = min(total_score, 30)

        # ── Compute confidence percentage ─────────────────────
        # Confidence is from GARCH-MC if available, else from XGBoost probability
        if garch_conf is not None:
            confidence_pct = garch_conf
        else:
            confidence_pct = xgboost_prob * 100

        # ── Generate human-readable reasoning ─────────────────
        key_drivers = []
        risk_factors = []

        # RSI analysis
        rsi = features.get("rsi_14")
        if rsi is not None:
            if rsi < 30:
                key_drivers.append(f"RSI oversold ({rsi:.1f}) — mean reversion opportunity")
            elif rsi > 70:
                risk_factors.append(f"RSI overbought ({rsi:.1f}) — potential pullback")

        # MACD analysis (only meaningful when ADX > 25)
        macd = features.get("macd_signal")
        adx = features.get("adx_value")
        if macd is not None and adx is not None and adx > 25:
            if macd > 0:
                key_drivers.append(f"MACD bullish in trending market (ADX: {adx:.1f})")
            else:
                risk_factors.append(f"MACD bearish in trending market (ADX: {adx:.1f})")
        elif adx is not None and adx <= 25:
            risk_factors.append(f"Sideways market (ADX: {adx:.1f}) — MACD unreliable")

        # Bollinger Bandwidth (volatility)
        bb_bw = features.get("bb_bandwidth")
        if bb_bw is not None and bb_bw < 0.05:
            key_drivers.append(f"Volatility squeeze (BB width: {bb_bw:.3f}) — breakout imminent")

        # Regime
        ma200 = features.get("ma200_regime")
        if ma200:
            key_drivers.append("Bull regime — price above 200-day MA")
        else:
            risk_factors.append("Bear/volatile regime — price below 200-day MA")

        # Fundamentals
        fcf = features.get("fcf_yield")
        if fcf is not None and fcf > 0.05:
            key_drivers.append(f"Strong FCF yield ({fcf:.1%})")
        pe_z = features.get("pe_zscore")
        if pe_z is not None and pe_z < -1:
            key_drivers.append(f"Undervalued vs sector (P/E z-score: {pe_z:.2f})")
        elif pe_z is not None and pe_z > 1.5:
            risk_factors.append(f"Expensive vs sector (P/E z-score: {pe_z:.2f})")

        if de_ratio is not None and de_ratio > 1.5:
            risk_factors.append(f"High leverage (D/E: {de_ratio:.2f})")

        # Sentiment
        sent_24h = features.get("sentiment_24h")
        if sent_24h is not None and abs(sent_24h) > 0.3:
            if sent_24h > 0:
                key_drivers.append(f"Positive sentiment ({sent_24h:.2f})")
            else:
                risk_factors.append(f"Negative sentiment ({sent_24h:.2f})")

        # Volume
        vol_z = features.get("volume_z_3m")
        if vol_z is not None and vol_z > 2:
            key_drivers.append(f"Elevated volume (z-score: {vol_z:.2f})")

        reasoning = SignalBreakdown(
            xgboost_signal=round(xgboost_prob, 4),
            lstm_signal=round(lstm_prob, 4) if lstm_prob is not None else None,
            garch_confidence=round(garch_conf / 100, 4) if garch_conf is not None else None,
            regime=regime,
            key_drivers=key_drivers or ["No strong directional signals"],
            risk_factors=risk_factors or ["No significant risk factors identified"],
        )

        return {
            "symbol": symbol,
            "score": round(total_score, 2),
            "horizon": Horizon.SHORT,
            "direction": direction,
            "confidence_pct": round(confidence_pct, 2),
            "reasoning": reasoning,
            "market_cap_bucket": market_cap_bucket,
        }

    def generate_daily_recommendations(
        self,
        stocks: list[dict],
        regime: MarketRegime,
        model_version: str,
    ) -> list[dict]:
        """
        Generate recommendations for all stocks in the universe.
        Called daily at 6:30pm IST (PRD Section 9.3).

        Args:
            stocks: List of dicts with symbol, predictions, features, market_cap_bucket
            regime: Current market regime
            model_version: MLflow run ID for auditability

        Returns:
            List of recommendation dicts, sorted by score descending.
        """
        recommendations = []

        for stock in stocks:
            try:
                rec = self.generate_recommendation(
                    symbol=stock["symbol"],
                    market_cap_bucket=stock["market_cap_bucket"],
                    xgboost_prob=stock["xgboost_prob"],
                    lstm_prob=stock.get("lstm_prob"),
                    garch_result=stock.get("garch_result"),
                    features=stock["features"],
                    regime=regime,
                )
                rec["model_version"] = model_version
                rec["generated_at"] = datetime.now(timezone.utc)
                recommendations.append(rec)
            except Exception as e:
                logger.error("recommendation_failed", symbol=stock.get("symbol"), error=str(e))

        # Sort by score descending
        recommendations.sort(key=lambda r: r["score"], reverse=True)

        logger.info(
            "daily_recommendations_generated",
            total=len(recommendations),
            long_signals=sum(1 for r in recommendations if r["direction"] == Direction.LONG),
            neutral_signals=sum(1 for r in recommendations if r["direction"] == Direction.NEUTRAL),
        )

        return recommendations
