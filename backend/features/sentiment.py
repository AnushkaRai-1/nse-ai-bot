"""
Sentiment feature engineering — Literature Review Section 6
Uses ProsusAI/finbert from HuggingFace.

Key constraints from lit review:
  - FinBERT outperforms lexicon-based by 12-18% accuracy
  - Sentiment has stronger predictive power for mid/small cap
  - Aggregate over 24h and 72h windows (not real-time) to reduce noise
  - Plan for fine-tuning on NSE-specific text (500-1000 labeled headlines)

PRD Section 5.2: sentiment_24h and sentiment_72h columns in features_daily.
"""

from __future__ import annotations

from collections import deque
from datetime import datetime, timedelta

import numpy as np

from backend.core.logging_config import get_logger

logger = get_logger(__name__)


class SentimentAnalyzer:
    """
    FinBERT-based sentiment scoring for financial news.
    Lazy-loads the model to avoid heavy memory usage during API serving.
    """

    def __init__(self):
        self._pipeline = None
        self._model_name = "ProsusAI/finbert"

    @property
    def pipeline(self):
        """Lazy load — FinBERT is ~500MB, only load when needed."""
        if self._pipeline is None:
            try:
                from transformers import pipeline as hf_pipeline

                logger.info("loading_finbert", model=self._model_name)
                self._pipeline = hf_pipeline(
                    "sentiment-analysis",
                    model=self._model_name,
                    tokenizer=self._model_name,
                    truncation=True,
                    max_length=512,
                )
                logger.info("finbert_loaded")
            except Exception as e:
                logger.error("finbert_load_failed", error=str(e))
                self._pipeline = None
        return self._pipeline

    def score_headline(self, text: str) -> float:
        """
        Score a single headline. Returns float in [-1, +1].
        FinBERT outputs: positive, negative, neutral with confidence scores.
        Map to [-1, +1]: positive = +conf, negative = -conf, neutral = 0.
        """
        if not self.pipeline:
            return 0.0

        try:
            result = self.pipeline(text)[0]
            label = result["label"].lower()
            score = result["score"]

            if label == "positive":
                return score
            elif label == "negative":
                return -score
            else:  # neutral
                return 0.0
        except Exception as e:
            logger.error("sentiment_score_failed", text=text[:50], error=str(e))
            return 0.0

    def score_headlines_batch(self, headlines: list[str]) -> list[float]:
        """Score multiple headlines in a batch (more efficient)."""
        if not self.pipeline or not headlines:
            return [0.0] * len(headlines)

        try:
            results = self.pipeline(headlines, batch_size=16)
            scores = []
            for r in results:
                label = r["label"].lower()
                conf = r["score"]
                if label == "positive":
                    scores.append(conf)
                elif label == "negative":
                    scores.append(-conf)
                else:
                    scores.append(0.0)
            return scores
        except Exception as e:
            logger.error("batch_sentiment_failed", error=str(e), count=len(headlines))
            return [0.0] * len(headlines)

    def compute_daily_sentiment(
        self,
        headlines: list[dict],
    ) -> dict:
        """
        Compute 24h aggregate sentiment for a stock.

        Args:
            headlines: List of dicts with 'title' and optionally 'description'

        Returns:
            {sentiment_24h: float, headline_count: int, scores: list[float]}

        Literature Review Section 6.2:
        - Aggregate over 24h window to reduce noise
        - Weight by source reliability (future enhancement)
        """
        if not headlines:
            return {"sentiment_24h": 0.0, "headline_count": 0, "scores": []}

        texts = []
        for h in headlines:
            title = h.get("title", "")
            desc = h.get("description", "")
            # Combine title + description for better context
            text = f"{title}. {desc}" if desc else title
            texts.append(text)

        scores = self.score_headlines_batch(texts)

        # Aggregate: mean of non-zero scores (neutral headlines shouldn't dilute)
        non_zero = [s for s in scores if abs(s) > 0.1]
        sentiment_24h = float(np.mean(non_zero)) if non_zero else 0.0

        return {
            "sentiment_24h": round(sentiment_24h, 4),
            "headline_count": len(headlines),
            "scores": scores,
        }


def compute_sentiment_72h(
    daily_sentiments: list[float],
) -> float:
    """
    3-day rolling average sentiment.
    Literature Review: 72h aggregate reduces noise further.

    Args:
        daily_sentiments: Last 3 days of sentiment_24h values (newest first)
    """
    if not daily_sentiments:
        return 0.0

    valid = [s for s in daily_sentiments[:3] if s is not None]
    if not valid:
        return 0.0

    return round(float(np.mean(valid)), 4)
