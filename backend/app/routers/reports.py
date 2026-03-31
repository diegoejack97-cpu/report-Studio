import logging
from datetime import datetime, timezone
from typing import Any, Optional

import aiofiles
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, UploadFile, File
from fastapi.responses import HTMLResponse, FileResponse
from sqlalchemy import select, func
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
import json, os

from app.core.background import run_async_task
from app.core.database import get_db
from app.core.auth import get_current_user
from app.core.config import settings
from app.middleware.plan_limit import check_plan_limit, reset_report_usage_if_needed
from app.models.user import User
from app.models.report import Report
from app.services.email_events import (
    send_limit_reached_email,
    send_processing_error_email,
    send_report_ready_email,
)

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
        return report
    except HTTPException as exc:
        if exc.status_code == 402:
            background_tasks.add_task(run_async_task, send_limit_reached_email(current_user))
        raise
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
    return report


@router.put("/{report_id}", response_model=ReportDetail)
async def update_report(
    report_id: int,
    data: ReportUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    report = await _get_own_report(report_id, current_user.id, db)
    if data.title is not None:      report.title = data.title
    if data.description is not None: report.description = data.description
    if data.config is not None:     report.config = data.config
    if data.row_count is not None:  report.row_count = data.row_count
    if data.col_count is not None:  report.col_count = data.col_count
    await db.flush()
    await db.refresh(report)
    return report


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
        reset_report_usage_if_needed(current_user)
        check_plan_limit(current_user)
        report.export_count += 1
        current_user.reports_used += 1
        current_user.reports_this_month += 1
        current_user.reports_total += 1
        await db.flush()
        background_tasks.add_task(run_async_task, send_report_ready_email(current_user, report.title))
        return {"report_id": report.id, "config": report.config, "title": report.title}
    except HTTPException as exc:
        if exc.status_code == 402:
            background_tasks.add_task(run_async_task, send_limit_reached_email(current_user))
        raise
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
