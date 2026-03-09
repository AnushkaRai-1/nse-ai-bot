#!/usr/bin/env python3
"""
Nifty 500 full backfill script.
Fetches 15yr OHLCV for all 500 stocks, skipping those already ingested.
Run from project root: python -m backend.scripts.run_backfill

Estimated time: ~20-30 min (500 stocks × ~2-3s each)
Expected output: ~1.85M rows in ohlcv_daily
"""

import json
import sys
import time
from datetime import datetime
from pathlib import Path

# Ensure project root is on path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

from sqlalchemy import text

from backend.core.database import SyncSessionLocal
from backend.ingestion.yfinance_fetcher import YFinanceFetcher, fetch_nifty500_symbols


def get_already_ingested(db) -> set[str]:
    """Return set of symbols that already have >= 1000 rows (considered complete)."""
    result = db.execute(
        text("SELECT symbol, COUNT(*) as cnt FROM ohlcv_daily GROUP BY symbol HAVING COUNT(*) >= 1000")
    )
    return {r[0] for r in result.fetchall()}


def main():
    start_time = time.time()
    print(f"\n{'='*60}")
    print(f" NIFTY 500 BACKFILL — {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"{'='*60}\n")

    # Load universe
    symbols = fetch_nifty500_symbols()
    print(f"Universe: {len(symbols)} stocks")

    # Check what's already done
    db = SyncSessionLocal()
    already_done = get_already_ingested(db)
    db.close()

    remaining = [s for s in symbols if s not in already_done]
    print(f"Already ingested: {len(already_done)} stocks")
    print(f"Remaining: {len(remaining)} stocks")
    print(f"Estimated time: ~{len(remaining) * 3 // 60} minutes\n")

    if not remaining:
        print("✅ All stocks already ingested!")
        return

    # Run backfill for remaining stocks
    db = SyncSessionLocal()
    fetcher = YFinanceFetcher(db)
    results = fetcher.backfill_universe(symbols=remaining, period="15y", batch_size=25)
    db.close()

    elapsed = time.time() - start_time
    mins = int(elapsed // 60)
    secs = int(elapsed % 60)

    print(f"\n{'='*60}")
    print(f" BACKFILL COMPLETE")
    print(f"{'='*60}")
    print(f" Success: {results['success']}/{results['total']}")
    print(f" Failed:  {results['failed']}/{results['total']}")
    print(f" Time:    {mins}m {secs}s")
    print(f"{'='*60}\n")

    # Save results summary
    summary_path = Path(__file__).parent.parent / "data" / "backfill_results.json"
    summary = {
        "timestamp": datetime.now().isoformat(),
        "success": results["success"],
        "failed": results["failed"],
        "total": results["total"],
        "elapsed_seconds": round(elapsed, 1),
        "failed_symbols": [
            sym for sym, info in results["symbols"].items()
            if info["status"] != "ok"
        ],
    }
    summary_path.parent.mkdir(parents=True, exist_ok=True)
    with open(summary_path, "w") as f:
        json.dump(summary, f, indent=2)
    print(f"Results saved to {summary_path}")


if __name__ == "__main__":
    main()
