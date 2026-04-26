import logging
from datetime import datetime
from typing import Any, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy import select
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.background import run_async_task
from app.core.database import get_db
from app.core.auth import get_current_user
from app.middleware.plan_limit import check_plan_limit, reset_report_usage_if_needed
from app.models.user import User
from app.models.report import Report
from app.services.email_events import (
    send_limit_reached_email,
    send_processing_error_email,
    send_report_ready_email,
)
from app.services.metrics_engine import build_metric_dataset, MetricsValidationError

router = APIRouter()
logger = logging.getLogger(__name__)


class ReportCreate(BaseModel):
    title: str = "Novo Relatório"
    description: str = ""
    config: dict = {}
    row_count: int = 0
    col_count: int = 0


class ReportUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    config: Optional[dict] = None
    row_count: Optional[int] = None
    col_count: Optional[int] = None


class ReportOut(BaseModel):
    id: int
    title: str
    description: str
    row_count: int
    col_count: int
    export_count: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class ReportDetail(ReportOut):
    config: dict
    report_data: dict | None = None


def _build_report_data(config: dict | None) -> dict:
    try:
        return build_metric_dataset(config or {}, config or {})
    except MetricsValidationError as exc:
        raise HTTPException(status_code=422, detail=exc.as_detail()) from exc


def _serialize_report(report: Report, report_data: dict | None = None) -> dict[str, Any]:
    return {
        "id": report.id,
        "title": report.title,
        "description": report.description,
        "row_count": report.row_count,
        "col_count": report.col_count,
        "export_count": report.export_count,
        "created_at": report.created_at,
        "updated_at": report.updated_at,
        "config": report.config or {},
        "report_data": report_data,
    }


@router.get("/", response_model=list[ReportOut])
async def list_reports(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Report)
        .where(Report.user_id == current_user.id)
        .order_by(Report.updated_at.desc())
        .limit(200)
    )
    return result.scalars().all()


@router.post("/", response_model=ReportDetail, status_code=201)
async def create_report(
    data: ReportCreate,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        reset_report_usage_if_needed(current_user)
        report_data = _build_report_data(data.config)

        report = Report(
            user_id=current_user.id,
            title=data.title,
            description=data.description,
            config=data.config,
            row_count=data.row_count,
            col_count=data.col_count,
        )
        db.add(report)
        await db.flush()
        await db.refresh(report)
        return _serialize_report(report, report_data)
    except HTTPException as exc:
        if exc.status_code == 402:
            background_tasks.add_task(run_async_task, send_limit_reached_email(current_user))
        raise
    except MetricsValidationError as exc:
        raise HTTPException(status_code=422, detail=exc.as_detail()) from exc
    except Exception as exc:
        logger.exception("Erro ao criar relatorio para user_id=%s.", current_user.id)
        background_tasks.add_task(
            run_async_task,
            send_processing_error_email(current_user, str(exc)),
        )
        raise


@router.get("/{report_id}", response_model=ReportDetail)
async def get_report(
    report_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    report = await _get_own_report(report_id, current_user.id, db)
    report_data = _build_report_data(report.config)
    return _serialize_report(report, report_data)


@router.put("/{report_id}", response_model=ReportDetail)
async def update_report(
    report_id: int,
    data: ReportUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    report = await _get_own_report(report_id, current_user.id, db)
    config_to_process = data.config if data.config is not None else report.config
    report_data = _build_report_data(config_to_process)
    if data.title is not None:      report.title = data.title
    if data.description is not None: report.description = data.description
    if data.config is not None:     report.config = data.config
    if data.row_count is not None:  report.row_count = data.row_count
    if data.col_count is not None:  report.col_count = data.col_count
    await db.flush()
    await db.refresh(report)
    return _serialize_report(report, report_data)


@router.post("/preview")
async def preview_report(
    payload: dict,
    current_user: User = Depends(get_current_user),
):
    try:
        source = payload.get("data") if isinstance(payload, dict) and isinstance(payload.get("data"), dict) else payload
        config = payload.get("config") if isinstance(payload, dict) and isinstance(payload.get("config"), dict) else payload
        report_data = build_metric_dataset(source, config)
        return report_data
    except MetricsValidationError as exc:
        raise HTTPException(status_code=422, detail=exc.as_detail()) from exc


@router.delete("/{report_id}", status_code=204)
async def delete_report(
    report_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    report = await _get_own_report(report_id, current_user.id, db)
    await db.delete(report)


@router.post("/{report_id}/export")
async def export_report(
    report_id: int,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        report = await _get_own_report(report_id, current_user.id, db)
        report_data = _build_report_data(report.config)
        reset_report_usage_if_needed(current_user)
        check_plan_limit(current_user)
        report.export_count += 1
        current_user.reports_used += 1
        current_user.reports_this_month += 1
        current_user.reports_total += 1
        await db.flush()
        background_tasks.add_task(run_async_task, send_report_ready_email(current_user, report.title))
        return {
            "report_id": report.id,
            "title": report.title,
            "config": report.config,
            "report_data": report_data,
        }
    except HTTPException as exc:
        if exc.status_code == 402:
            background_tasks.add_task(run_async_task, send_limit_reached_email(current_user))
        raise
    except MetricsValidationError as exc:
        raise HTTPException(status_code=422, detail=exc.as_detail()) from exc
    except Exception as exc:
        logger.exception(
            "Erro ao exportar relatorio report_id=%s para user_id=%s.",
            report_id,
            current_user.id,
        )
        background_tasks.add_task(
            run_async_task,
            send_processing_error_email(current_user, str(exc)),
        )
        raise


async def _get_own_report(report_id: int, user_id: int, db: AsyncSession) -> Report:
    result = await db.execute(
        select(Report).where(Report.id == report_id, Report.user_id == user_id)
    )
    report = result.scalar_one_or_none()
    if not report:
        raise HTTPException(status_code=404, detail="Relatório não encontrado")
    return report
