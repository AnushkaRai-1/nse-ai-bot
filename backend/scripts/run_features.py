#!/usr/bin/env python3
"""
Feature engineering runner — compute all technical features for Nifty 500.
Run from project root: python -m backend.scripts.run_features

Processes all stocks in the ohlcv_daily table, computes technical indicators,
and stores results in features_daily hypertable.
"""

import json
import sys
import time
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

from sqlalchemy import text

from backend.core.database import SyncSessionLocal
from backend.features.pipeline import FeaturePipeline


def main():
    start_time = time.time()
    print(f"\n{'='*60}")
    print(f" FEATURE ENGINEERING — {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"{'='*60}\n")

    db = SyncSessionLocal()

    # Get all symbols with OHLCV data
    result = db.execute(text(
        "SELECT DISTINCT symbol FROM ohlcv_daily ORDER BY symbol"
    ))
    symbols = [r[0] for r in result.fetchall()]
    print(f"Stocks to process: {len(symbols)}")

    # Check what's already computed
    result = db.execute(text(
        "SELECT symbol, COUNT(*) FROM features_daily GROUP BY symbol"
    ))
    already_done = {r[0]: r[1] for r in result.fetchall()}
    print(f"Already have features for: {len(already_done)} stocks")

    pipeline = FeaturePipeline(db)
    results = {"success": 0, "failed": 0, "total_rows": 0, "errors": []}

    for i, symbol in enumerate(symbols):
        pct = round((i / len(symbols)) * 100, 1)

        # Skip if already computed (>1000 rows means likely complete)
        if symbol in already_done and already_done[symbol] > 1000:
            results["success"] += 1
            results["total_rows"] += already_done[symbol]
            if (i + 1) % 50 == 0:
                print(f"  [{i+1}/{len(symbols)}] {pct}% — skipping {symbol} (already done)")
            continue

        try:
            rows = pipeline.run_for_symbol(symbol, recompute_all=True)
            results["success"] += 1
            results["total_rows"] += rows
            if (i + 1) % 10 == 0:
                elapsed = time.time() - start_time
                rate = (i + 1) / elapsed if elapsed > 0 else 0
                eta_min = int((len(symbols) - i - 1) / rate / 60) if rate > 0 else 0
                print(f"  [{i+1}/{len(symbols)}] {pct}% — {symbol}: {rows} rows  (ETA: ~{eta_min}m)")
        except Exception as e:
            results["failed"] += 1
            results["errors"].append({"symbol": symbol, "error": str(e)})
            print(f"  [{i+1}/{len(symbols)}] ❌ {symbol}: {e}")

    db.close()

    elapsed = time.time() - start_time
    mins = int(elapsed // 60)
    secs = int(elapsed % 60)

    print(f"\n{'='*60}")
    print(f" FEATURE ENGINEERING COMPLETE")
    print(f"{'='*60}")
    print(f" Success: {results['success']}/{len(symbols)}")
    print(f" Failed:  {results['failed']}/{len(symbols)}")
    print(f" Total feature rows: {results['total_rows']:,}")
    print(f" Time:    {mins}m {secs}s")
    print(f"{'='*60}\n")

    # Save results
    summary_path = Path(__file__).parent.parent / "data" / "features_results.json"
    summary = {
        "timestamp": datetime.now().isoformat(),
        "success": results["success"],
        "failed": results["failed"],
        "total_rows": results["total_rows"],
        "elapsed_seconds": round(elapsed, 1),
        "errors": results["errors"][:20],  # cap error list
    }
    summary_path.parent.mkdir(parents=True, exist_ok=True)
    with open(summary_path, "w") as f:
        json.dump(summary, f, indent=2)
    print(f"Results saved to {summary_path}")


if __name__ == "__main__":
    main()
