"""
NSE Direct data fetcher — PRD Section 5.1
Uses nsepython for:
  - Corporate actions (splits, bonuses, dividends)
  - Circuit breaker limits per stock
  - FII/DII daily flow data
  - Index constituents (live Nifty 50/500 membership)
  - Delivery volume data

Universe: Nifty 500 (expanded from Nifty 50).
Literature Review Section 2: NSE has distinct microstructure.
"""

from __future__ import annotations

from typing import Optional

import pandas as pd

from backend.core.logging_config import get_logger

logger = get_logger(__name__)


class NSEFetcher:
    """
    Fetch NSE-specific data not available via yfinance.
    Requires nsepython: pip install nsepython
    """

    def __init__(self):
        self._nse = None

    @property
    def nse(self):
        """Lazy import — nsepython has heavy init."""
        if self._nse is None:
            try:
                import nsepython
                self._nse = nsepython
                logger.info("nsepython_loaded")
            except ImportError:
                logger.warning("nsepython_not_installed")
                self._nse = None
        return self._nse

    def get_nifty50_constituents(self) -> list[str]:
        """Fetch current Nifty 50 constituent list from NSE."""
        if not self.nse:
            logger.warning("nsepython_unavailable", fallback="hardcoded_list")
            from backend.ingestion.yfinance_fetcher import NIFTY_50_SYMBOLS
            return NIFTY_50_SYMBOLS

        try:
            data = self.nse.nse_get_index_list("NIFTY 50")
            logger.info("nifty50_constituents_fetched", count=len(data))
            return data
        except Exception as e:
            logger.error("nifty50_fetch_failed", error=str(e))
            from backend.ingestion.yfinance_fetcher import NIFTY_50_SYMBOLS
            return NIFTY_50_SYMBOLS

    def get_nifty500_constituents(self) -> list[str]:
        """
        Fetch current Nifty 500 constituent list.
        Primary: NSE CSV endpoint (no nsepython needed).
        Fallback: cached JSON file.
        """
        from backend.ingestion.yfinance_fetcher import fetch_nifty500_symbols
        return fetch_nifty500_symbols(force_refresh=True)

    def get_fii_dii_data(self, date_str: Optional[str] = None) -> dict:
        """
        Fetch FII/DII daily flow data.
        Literature Review Section 2.4: FII/DII flows disproportionately move large caps.
        """
        if not self.nse:
            return {"error": "nsepython not available"}

        try:
            data = self.nse.fii_dii()
            logger.info("fii_dii_fetched")
            return data
        except Exception as e:
            logger.error("fii_dii_fetch_failed", error=str(e))
            return {"error": str(e)}

    def get_circuit_limits(self, symbol: str) -> dict:
        """
        Fetch circuit breaker / price band limits for a stock.
        Literature Review Section 2.1: NSE circuit breakers at 10%, 15%, 20%.
        These create hard truncation in return distributions.
        """
        if not self.nse:
            return {
                "symbol": symbol,
                "upper_circuit": None,
                "lower_circuit": None,
                "note": "nsepython not available — using default 20% bands",
            }

        try:
            quote = self.nse.nse_quote(symbol)
            return {
                "symbol": symbol,
                "upper_circuit": quote.get("priceInfo", {}).get("upperCP"),
                "lower_circuit": quote.get("priceInfo", {}).get("lowerCP"),
                "price_band": quote.get("priceInfo", {}).get("priceBand"),
            }
        except Exception as e:
            logger.error("circuit_limit_fetch_failed", symbol=symbol, error=str(e))
            return {"symbol": symbol, "error": str(e)}

    def get_delivery_data(self, symbol: str) -> dict:
        """
        Fetch delivery volume data (traded vs delivered).
        High delivery % indicates genuine buying interest vs. intraday speculation.
        Useful as additional feature for volume signal quality.
        """
        if not self.nse:
            return {"symbol": symbol, "delivery_pct": None}

        try:
            data = self.nse.nse_quote(symbol)
            sec_info = data.get("securityWiseDP", {})
            return {
                "symbol": symbol,
                "delivery_qty": sec_info.get("deliveryQuantity"),
                "traded_qty": sec_info.get("tradedQuantity"),
                "delivery_pct": sec_info.get("deliveryToTradedQuantity"),
            }
        except Exception as e:
            logger.error("delivery_data_failed", symbol=symbol, error=str(e))
            return {"symbol": symbol, "error": str(e)}

    def get_india_vix(self) -> float | None:
        """
        Fetch India VIX (volatility index).
        Literature Review: Used for regime detection alongside 200-day MA.
        """
        if not self.nse:
            return None

        try:
            vix_data = self.nse.nse_get_index_quote("INDIA VIX")
            return vix_data.get("last", None)
        except Exception as e:
            logger.error("india_vix_fetch_failed", error=str(e))
            return None
