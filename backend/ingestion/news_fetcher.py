"""
News fetcher for sentiment pipeline — PRD Section 5.1
Sources: NewsAPI, GNews (free tiers)
Literature Review Section 6: Aggregate over 24h and 72h windows, not real-time.

Output: Raw headlines per symbol per day → fed into FinBERT sentiment model.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Optional

import httpx

from backend.core.config import get_settings
from backend.core.logging_config import get_logger

settings = get_settings()
logger = get_logger(__name__)


class NewsFetcher:
    """
    Fetch financial news headlines for sentiment analysis.
    Phase 2 component — headlines are batch-processed daily at 8am IST.
    """

    def __init__(self):
        self.newsapi_key = settings.NEWSAPI_KEY
        self.gnews_key = settings.GNEWS_API_KEY

    async def fetch_headlines_newsapi(
        self,
        query: str,
        from_date: Optional[str] = None,
        language: str = "en",
        page_size: int = 20,
    ) -> list[dict]:
        """
        Fetch from NewsAPI (free tier: 100 req/day).
        Returns list of {title, source, published_at, url}.
        """
        if not self.newsapi_key:
            logger.warning("newsapi_key_not_set")
            return []

        if from_date is None:
            from_date = (datetime.now(timezone.utc) - timedelta(days=1)).strftime("%Y-%m-%d")

        url = "https://newsapi.org/v2/everything"
        params = {
            "q": query,
            "from": from_date,
            "language": language,
            "sortBy": "relevancy",
            "pageSize": page_size,
            "apiKey": self.newsapi_key,
        }

        try:
            async with httpx.AsyncClient(timeout=30) as client:
                resp = await client.get(url, params=params)
                resp.raise_for_status()
                data = resp.json()

            articles = data.get("articles", [])
            results = [
                {
                    "title": a.get("title", ""),
                    "description": a.get("description", ""),
                    "source": a.get("source", {}).get("name", ""),
                    "published_at": a.get("publishedAt", ""),
                    "url": a.get("url", ""),
                }
                for a in articles
                if a.get("title")
            ]

            logger.info("newsapi_fetched", query=query, results=len(results))
            return results

        except Exception as e:
            logger.error("newsapi_fetch_failed", query=query, error=str(e))
            return []

    async def fetch_headlines_gnews(
        self,
        query: str,
        language: str = "en",
        country: str = "in",
        max_results: int = 10,
    ) -> list[dict]:
        """
        Fetch from GNews (free tier: 100 req/day).
        Focused on Indian news sources.
        """
        if not self.gnews_key:
            logger.warning("gnews_key_not_set")
            return []

        url = "https://gnews.io/api/v4/search"
        params = {
            "q": query,
            "lang": language,
            "country": country,
            "max": max_results,
            "apikey": self.gnews_key,
        }

        try:
            async with httpx.AsyncClient(timeout=30) as client:
                resp = await client.get(url, params=params)
                resp.raise_for_status()
                data = resp.json()

            articles = data.get("articles", [])
            results = [
                {
                    "title": a.get("title", ""),
                    "description": a.get("description", ""),
                    "source": a.get("source", {}).get("name", ""),
                    "published_at": a.get("publishedAt", ""),
                    "url": a.get("url", ""),
                }
                for a in articles
                if a.get("title")
            ]

            logger.info("gnews_fetched", query=query, results=len(results))
            return results

        except Exception as e:
            logger.error("gnews_fetch_failed", query=query, error=str(e))
            return []

    async def fetch_for_symbol(self, symbol: str, company_name: str = "") -> list[dict]:
        """
        Fetch headlines for a specific stock symbol.
        Queries: "SYMBOL NSE" + company name for coverage.
        """
        query = f"{symbol} NSE stock"
        if company_name:
            query = f"{company_name} OR {symbol} NSE"

        # Try both sources, deduplicate by title
        newsapi_results = await self.fetch_headlines_newsapi(query)
        gnews_results = await self.fetch_headlines_gnews(query)

        # Deduplicate
        seen_titles = set()
        combined = []
        for article in newsapi_results + gnews_results:
            title_lower = article["title"].lower().strip()
            if title_lower not in seen_titles:
                seen_titles.add(title_lower)
                combined.append(article)

        logger.info("headlines_combined", symbol=symbol, total=len(combined))
        return combined
