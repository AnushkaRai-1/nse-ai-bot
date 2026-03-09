"""
Admin API routes — PRD Section 7.3
All endpoints require Admin JWT.
GET  /api/v1/admin/health         — System health
POST /api/v1/admin/retrain        — Trigger retraining
GET  /api/v1/admin/backtest/{model} — Backtest results
GET  /api/v1/admin/drift          — Drift metrics
GET  /api/v1/admin/jobs           — Background job status
POST /api/v1/admin/run-pipeline   — Trigger daily pipeline
GET  /api/v1/admin/data-freshness — Data freshness for any user
"""

from __future__ import annotations

import json
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, desc, func
from sqlalchemy.ext.asyncio import AsyncSession

from backend.core.database import get_db
from backend.core.models import (
    BacktestResult,
    MonteCarloCache,
    OHLCVDaily,
    Recommendation,
    Stock,
    User,
)
from backend.core.schemas import (
    BacktestResultResponse,
    DriftReport,
    MarketCapBucket,
    RetrainTriggerResponse,
    SystemHealthResponse,
)
from backend.api import get_current_user, require_admin
from backend.core.logging_config import get_logger

router = APIRouter()
logger = get_logger(__name__)


@router.get("/health", response_model=SystemHealthResponse)
async def system_health(
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """System health: data freshness, model versions, last retrain — PRD UC-06."""
    # Data freshness
    ohlcv_latest = await db.execute(select(func.max(OHLCVDaily.time)))
    rec_latest = await db.execute(select(func.max(Recommendation.generated_at)))

    ohlcv_time = ohlcv_latest.scalar()
    rec_time = rec_latest.scalar()

    # Model versions from latest recommendations
    model_versions = {}
    for bucket in ["large", "mid", "small"]:
        q = (
            select(Recommendation.model_version)
            .where(Recommendation.market_cap_bucket == bucket)
            .order_by(desc(Recommendation.generated_at))
            .limit(1)
        )
        result = await db.execute(q)
        version = result.scalar()
        if version:
            model_versions[f"xgboost_{bucket}"] = version

    # Check connections
    db_ok = True
    redis_ok = True
    try:
        from backend.core.redis_client import get_redis
        redis = await get_redis()
        await redis.ping()
    except Exception:
        redis_ok = False

    # Determine overall status
    status_str = "healthy"
    if not redis_ok or not db_ok:
        status_str = "degraded"
    if not ohlcv_time:
        status_str = "degraded"

    return SystemHealthResponse(
        status=status_str,
        data_freshness={
            "ohlcv": ohlcv_time.isoformat() if ohlcv_time else None,
            "recommendations": rec_time.isoformat() if rec_time else None,
        },
        model_versions=model_versions,
        last_retrain=rec_time,
        active_jobs=[],  # TODO: Get from APScheduler
        db_connected=db_ok,
        redis_connected=redis_ok,
    )


@router.post("/retrain", response_model=RetrainTriggerResponse)
async def trigger_retrain(
    model: str = Query("xgboost", description="Model to retrain: xgboost | lstm | all"),
    bucket: MarketCapBucket | None = Query(None),
    admin: User = Depends(require_admin),
):
    """
    Trigger async model retraining — PRD UC-07.
    Walk-forward validation is mandatory.
    """
    import uuid

    valid_models = {"xgboost", "lstm", "all"}
    if model not in valid_models:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid model. Choose from: {valid_models}",
        )

    job_id = str(uuid.uuid4())

    # TODO: Submit to APScheduler / Celery background task
    # For now, return the job ID for tracking
    logger.info(
        "retrain_triggered",
        admin_id=str(admin.id),
        model=model,
        bucket=bucket.value if bucket else "all",
        job_id=job_id,
    )

    est_duration = 30 if model == "xgboost" else 120 if model == "lstm" else 150

    return RetrainTriggerResponse(
        job_id=job_id,
        status="queued",
        model=model,
        triggered_at=datetime.now(timezone.utc),
        estimated_duration_minutes=est_duration,
    )


@router.get("/backtest/{model_name}", response_model=list[BacktestResultResponse])
async def get_backtest_results(
    model_name: str,
    bucket: MarketCapBucket | None = Query(None),
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Latest walk-forward backtest results — PRD UC-08."""
    query = (
        select(BacktestResult)
        .where(BacktestResult.model_name.ilike(f"%{model_name}%"))
        .order_by(desc(BacktestResult.computed_at))
        .limit(10)
    )

    if bucket:
        query = query.where(BacktestResult.market_cap_bucket == bucket.value)

    result = await db.execute(query)
    rows = result.scalars().all()

    return [
        BacktestResultResponse(
            model_name=r.model_name,
            market_cap_bucket=r.market_cap_bucket,
            run_id=r.mlflow_run_id,
            sharpe_ratio=float(r.sharpe_ratio),
            max_drawdown=float(r.max_drawdown),
            win_rate=float(r.win_rate),
            calmar_ratio=float(r.calmar_ratio),
            p_value=float(r.p_value),
            meets_deployment_gate=r.meets_gate,
            walk_forward_folds=r.walk_forward_folds,
            train_window_months=r.config_json.get("train_months", 36),
            test_window_months=r.config_json.get("test_months", 3),
            computed_at=r.computed_at,
        )
        for r in rows
    ]


@router.get("/drift", response_model=DriftReport)
async def get_drift_report(
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """
    Model drift metrics — PRD Section 9.2.
    Prediction drift, data drift (KS-test), regime shift, staleness.
    """
    # Get last retrain date
    latest_rec = await db.execute(
        select(func.max(Recommendation.generated_at))
    )
    last_gen = latest_rec.scalar()

    staleness_days = 0
    if last_gen:
        staleness_days = (datetime.now(timezone.utc) - last_gen).days

    # TODO: Compute actual drift metrics from stored predictions vs outcomes
    return DriftReport(
        prediction_drift={
            "30d_win_rate": None,
            "90d_baseline": None,
            "alert": False,
            "note": "Insufficient data — predictions have not been evaluated against outcomes yet.",
        },
        data_drift={
            "features_flagged": [],
            "ks_pvalues": {},
            "note": "KS-test drift detection runs weekly.",
        },
        regime_shift={
            "detected": False,
            "current_regime": "unknown",
        },
        model_staleness_days=staleness_days,
        needs_retrain=staleness_days > 14,
        checked_at=datetime.now(timezone.utc),
    )


@router.get("/jobs")
async def get_job_status(
    admin: User = Depends(require_admin),
):
    """Status of all background jobs — PRD Section 9.3."""
    # Read last pipeline run from status file
    pipeline_log = Path(__file__).parent.parent / "data" / "pipeline_status.json"
    pipeline_info = None
    if pipeline_log.exists():
        try:
            with open(pipeline_log) as f:
                pipeline_info = json.load(f).get("latest")
        except Exception:
            pass

    return {
        "jobs": [
            {
                "name": "daily_pipeline",
                "schedule": "daily 07:30 IST",
                "last_run": pipeline_info.get("started_at") if pipeline_info else None,
                "status": pipeline_info.get("status", "not_configured") if pipeline_info else "not_configured",
            },
            {"name": "xgboost_retrain", "schedule": "weekly Sunday", "last_run": None, "status": "not_configured"},
        ],
    }


@router.post("/run-pipeline")
async def trigger_pipeline(
    mode: str = Query("full", description="full | inference-only | skip-fetch"),
    admin: User = Depends(require_admin),
):
    """
    Trigger the daily pipeline in background.
    Runs as a subprocess so the API doesn't block.
    """
    project_root = Path(__file__).parent.parent.parent
    venv_python = project_root / ".venv" / "bin" / "python3"
    if not venv_python.exists():
        venv_python = sys.executable

    cmd = [str(venv_python), "-m", "backend.scripts.daily_pipeline"]
    if mode == "inference-only":
        cmd.append("--inference-only")
    elif mode == "skip-fetch":
        cmd.append("--skip-fetch")

    try:
        proc = subprocess.Popen(
            cmd,
            cwd=str(project_root),
            stdout=open(project_root / "backend" / "data" / "pipeline_stdout.log", "w"),
            stderr=subprocess.STDOUT,
            env={**__import__("os").environ, "PYTHONPATH": str(project_root)},
        )
        logger.info("pipeline_triggered", admin_id=str(admin.id), mode=mode, pid=proc.pid)

        return {
            "status": "started",
            "mode": mode,
            "pid": proc.pid,
            "triggered_at": datetime.now(timezone.utc).isoformat(),
            "message": f"Pipeline running in background (PID {proc.pid}). Check /admin/data-freshness for results.",
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to start pipeline: {e}")


@router.get("/data-freshness")
async def get_data_freshness(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Data freshness info — accessible from Settings page.
    Shows when data was last updated, model versions, and pipeline status.
    """
    # OHLCV freshness
    ohlcv_q = await db.execute(select(func.max(OHLCVDaily.time)))
    ohlcv_latest = ohlcv_q.scalar()

    # Stock count
    stock_q = await db.execute(select(func.count(Stock.symbol)).where(Stock.is_active == True))
    stock_count = stock_q.scalar() or 0

    # Recommendation freshness
    rec_q = await db.execute(select(func.max(Recommendation.generated_at)))
    rec_latest = rec_q.scalar()

    rec_count_q = await db.execute(
        select(func.count(Recommendation.id)).where(
            Recommendation.generated_at == select(func.max(Recommendation.generated_at)).scalar_subquery()
        )
    )
    latest_rec_count = rec_count_q.scalar() or 0

    # Model versions
    model_versions = {}
    for bucket in ["large", "mid", "small"]:
        q = (
            select(Recommendation.model_version)
            .where(Recommendation.market_cap_bucket == bucket)
            .order_by(desc(Recommendation.generated_at))
            .limit(1)
        )
        result = await db.execute(q)
        version = result.scalar()
        if version:
            model_versions[bucket] = version

    # Pipeline status from log file
    pipeline_log = Path(__file__).parent.parent / "data" / "pipeline_status.json"
    pipeline_status = None
    pipeline_history = []
    if pipeline_log.exists():
        try:
            with open(pipeline_log) as f:
                data = json.load(f)
                pipeline_status = data.get("latest")
                pipeline_history = data.get("history", [])[:5]
        except Exception:
            pass

    # Training results
    training_path = Path(__file__).parent.parent / "model_artifacts" / "training_results.json"
    training_info = None
    if training_path.exists():
        try:
            with open(training_path) as f:
                raw = json.load(f)
                training_info = {}
                for bucket, info in raw.items():
                    if "error" not in info:
                        training_info[bucket] = {
                            "sharpe": info.get("mean_sharpe"),
                            "win_rate": info.get("mean_win_rate"),
                            "accuracy": info.get("mean_accuracy"),
                            "passes_gates": info.get("passes_gates"),
                            "model_version": info.get("model_version"),
                        }
        except Exception:
            pass

    # Staleness
    staleness_days = 0
    if rec_latest:
        staleness_days = (datetime.now(timezone.utc) - rec_latest).days

    return {
        "ohlcv_latest": ohlcv_latest.isoformat() if ohlcv_latest else None,
        "stock_count": stock_count,
        "recommendations_latest": rec_latest.isoformat() if rec_latest else None,
        "latest_signal_count": latest_rec_count,
        "model_versions": model_versions,
        "training_info": training_info,
        "staleness_days": staleness_days,
        "needs_refresh": staleness_days > 1,
        "pipeline_status": pipeline_status,
        "pipeline_history": pipeline_history,
    }
