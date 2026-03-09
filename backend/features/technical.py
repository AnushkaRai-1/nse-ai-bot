"""
Technical feature engineering — Literature Review Section 3
ALL computations use expanding windows (ZERO look-ahead bias).

Signals implemented:
  - RSI(14)          → Expanding window. Weight more for mid-cap. (Section 3.1)
  - MACD(12,26,9)    → Raw histogram stored always. Model learns ADX interaction. (Section 3.2)
  - Bollinger Bands  → Bandwidth as volatility filter ONLY. (Section 3.3)
  - 200-day MA       → Regime classifier (Bull/Bear), NOT trade signal. (Section 3.4)
  - ADX              → Used to gate MACD. Trend strength measure.
  - ATR(14)          → Volatility measure for position sizing.
  - Volume Z-score   → 3-month rolling. NOT the raw 500% spike (lit review killed that).

PRD Section 15.2: Look-ahead bias prevention checklist:
  ✓ All indicators computed incrementally
  ✓ No future data leakage
  ✓ Expanding window from period start, not full dataset
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from backend.core.logging_config import get_logger

logger = get_logger(__name__)


def compute_all_technical_features(ohlcv: pd.DataFrame) -> pd.DataFrame:
    """
    Compute all technical features for a single stock's OHLCV data.
    Input: DataFrame with columns [time, open, high, low, close, volume, adj_close]
           sorted by time ascending.
    Output: DataFrame with all technical feature columns added.

    CRITICAL: All computations are EXPANDING WINDOW — no look-ahead bias.
    """
    df = ohlcv.copy()
    df = df.sort_values("time").reset_index(drop=True)

    if len(df) < 200:
        logger.warning("insufficient_data", rows=len(df), min_required=200)

    # Use adj_close for indicator computation (corporate-action adjusted)
    close = df["adj_close"].astype(float)
    high = df["high"].astype(float)
    low = df["low"].astype(float)
    volume = df["volume"].astype(float)

    # ── RSI(14) — Expanding window ────────────────────────────
    df["rsi_14"] = _compute_rsi(close, period=14)

    # ── ADX — needed for MACD gating ─────────────────────────
    df["adx_value"] = _compute_adx(high, low, close, period=14)

    # ── MACD(12, 26, 9) ─────────────────────────────────────
    # Literature Review Section 3.2: MACD most effective when ADX > 25,
    # but we store the raw value ALWAYS and let the ML model learn the
    # ADX×MACD interaction via the separate adx_value feature.
    # Gating to NULL here was destroying 55% of training data.
    df["macd_signal"] = _compute_macd(close)

    # ── Bollinger Bandwidth — Volatility filter ONLY ──────────
    # Literature Review Section 3.3: Direction is unpredictable from bands alone
    df["bb_bandwidth"] = _compute_bollinger_bandwidth(close, period=20)

    # ── 200-day MA Regime — Bull/Bear classifier ──────────────
    # Literature Review Section 3.4: Use as regime indicator, NOT trade signal
    ma200 = close.rolling(window=200, min_periods=200).mean()
    df["ma200_regime"] = close > ma200

    # ── ATR(14) — Volatility for position sizing ──────────────
    df["atr_14"] = _compute_atr(high, low, close, period=14)

    # ── Volume Z-score (3-month rolling) ──────────────────────
    # Literature Review Section 2.2: Volume z-score, NOT raw spike detection
    vol_mean = volume.rolling(window=63, min_periods=20).mean()  # ~3 months trading days
    vol_std = volume.rolling(window=63, min_periods=20).std()
    df["volume_z_3m"] = np.where(
        vol_std > 0,
        (volume - vol_mean) / vol_std,
        0.0,
    )

    return df


def _compute_rsi(close: pd.Series, period: int = 14) -> pd.Series:
    """
    RSI = 100 - [100 / (1 + RS)]
    RS = Average Gain / Average Loss over N periods.
    Uses Wilder's smoothing (exponential moving average).

    Literature Review Section 3.1:
    - Statistically significant 5-day forward returns (p < 0.05) at extremes
    - Win rate 54-58% on mid-caps
    - Near-zero alpha on large-caps
    """
    delta = close.diff()
    gain = delta.clip(lower=0)
    loss = (-delta).clip(lower=0)

    # Wilder's smoothing (EMA with alpha = 1/period)
    avg_gain = gain.ewm(alpha=1 / period, min_periods=period, adjust=False).mean()
    avg_loss = loss.ewm(alpha=1 / period, min_periods=period, adjust=False).mean()

    rs = avg_gain / avg_loss.replace(0, np.nan)
    rsi = 100 - (100 / (1 + rs))

    return rsi


def _compute_adx(high: pd.Series, low: pd.Series, close: pd.Series, period: int = 14) -> pd.Series:
    """
    Average Directional Index — measures trend strength.
    ADX > 25 = trending market (MACD is valid)
    ADX <= 25 = sideways market (MACD should be ignored)
    """
    # True Range
    tr1 = high - low
    tr2 = (high - close.shift(1)).abs()
    tr3 = (low - close.shift(1)).abs()
    tr = pd.concat([tr1, tr2, tr3], axis=1).max(axis=1)

    # Directional Movement
    up_move = high - high.shift(1)
    down_move = low.shift(1) - low

    plus_dm = np.where((up_move > down_move) & (up_move > 0), up_move, 0.0)
    minus_dm = np.where((down_move > up_move) & (down_move > 0), down_move, 0.0)

    plus_dm = pd.Series(plus_dm, index=high.index)
    minus_dm = pd.Series(minus_dm, index=high.index)

    # Wilder's smoothing
    atr = tr.ewm(alpha=1 / period, min_periods=period, adjust=False).mean()
    plus_di = 100 * (plus_dm.ewm(alpha=1 / period, min_periods=period, adjust=False).mean() / atr)
    minus_di = 100 * (minus_dm.ewm(alpha=1 / period, min_periods=period, adjust=False).mean() / atr)

    # ADX
    dx = 100 * ((plus_di - minus_di).abs() / (plus_di + minus_di).replace(0, np.nan))
    adx = dx.ewm(alpha=1 / period, min_periods=period, adjust=False).mean()

    return adx


def _compute_macd(close: pd.Series) -> pd.Series:
    """
    MACD Line = EMA(12) - EMA(26)
    Signal Line = EMA(9) of MACD Line
    Histogram = MACD Line - Signal Line

    Literature Review Section 3.2:
    - Positive excess returns ONLY in trending markets (ADX > 25)
    - Combined with volume confirmation
    - Returns indistinguishable from random in sideways markets
    - Must use walk-forward (no EMA recalculation on full dataset)
    """
    ema12 = close.ewm(span=12, min_periods=12, adjust=False).mean()
    ema26 = close.ewm(span=26, min_periods=26, adjust=False).mean()
    macd_line = ema12 - ema26
    signal_line = macd_line.ewm(span=9, min_periods=9, adjust=False).mean()
    histogram = macd_line - signal_line

    # Return the histogram (most commonly used as the signal)
    return histogram


def _compute_bollinger_bandwidth(close: pd.Series, period: int = 20) -> pd.Series:
    """
    Bandwidth = (Upper Band - Lower Band) / Middle Band
    Middle Band = SMA(20)
    Upper Band = SMA(20) + 2 * StdDev(20)
    Lower Band = SMA(20) - 2 * StdDev(20)

    Literature Review Section 3.3:
    - Bandwidth reliably precedes breakout moves
    - Direction is unpredictable from bands alone
    - Use as VOLATILITY FILTER only, not buy/sell signal
    """
    sma = close.rolling(window=period, min_periods=period).mean()
    std = close.rolling(window=period, min_periods=period).std()

    upper = sma + 2 * std
    lower = sma - 2 * std

    bandwidth = np.where(sma > 0, (upper - lower) / sma, np.nan)
    return pd.Series(bandwidth, index=close.index)


def _compute_atr(high: pd.Series, low: pd.Series, close: pd.Series, period: int = 14) -> pd.Series:
    """
    Average True Range — volatility measure.
    Used for position sizing and stop-loss placement.
    """
    tr1 = high - low
    tr2 = (high - close.shift(1)).abs()
    tr3 = (low - close.shift(1)).abs()
    tr = pd.concat([tr1, tr2, tr3], axis=1).max(axis=1)
    atr = tr.ewm(alpha=1 / period, min_periods=period, adjust=False).mean()
    return atr


def compute_target_variables(df: pd.DataFrame) -> pd.DataFrame:
    """
    Compute target variables for ML models.
    PRD Section 6.1: Binary — log_return_5d > 0
    PRD Section 6.2: Binary — log_return_20d > 0

    Literature Review Section 4.1: Predict LOG RETURNS, not absolute prices.
    Non-stationarity invalidates the model if predicting raw price.
    """
    close = df["adj_close"].astype(float)

    # Log returns (not raw returns — handles compounding correctly)
    df["log_return_5d"] = np.log(close.shift(-5) / close)
    df["log_return_20d"] = np.log(close.shift(-20) / close)

    # Binary targets for classification
    df["target_5d"] = (df["log_return_5d"] > 0).astype(int)
    df["target_20d"] = (df["log_return_20d"] > 0).astype(int)

    return df
