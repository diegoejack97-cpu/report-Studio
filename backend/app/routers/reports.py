import logging
from datetime import datetime
from collections import OrderedDict
import copy
import hashlib
import json
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
from app.services.metrics_engine import (
    MetricsValidationError,
    build_metric_report_data,
    resolve_source_hash,
)

router = APIRouter()
logger = logging.getLogger(__name__)
PREVIEW_CACHE_LIMIT = 50
_PREVIEW_CACHE: OrderedDict[str, dict[str, Any]] = OrderedDict()


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


def _build_report_data(data: dict | None, config: dict | None = None) -> dict:
    try:
        source = data or {}
        effective_config = config if config is not None else source
        return build_metric_report_data(source, effective_config or {})
    except MetricsValidationError as exc:
        raise HTTPException(status_code=422, detail=exc.as_detail()) from exc


def _public_preview_response(report_data: dict[str, Any]) -> dict[str, Any]:
    return {
        "analysis": report_data.get("analysis") or {"columns": {}},
        "validation": report_data.get("validation") or {"errors": [], "warnings": []},
        "mapping": report_data.get("mapping") or {
            "monetary": None,
            "percent": None,
            "category": None,
            "date": None,
            "score": None,
        },
        "dataset": report_data.get("dataset") or [],
        "summary": report_data.get("summary") or {"group_index": -1, "labels": [], "rows": [], "totals": {}, "primary_metric": None},
        "kpis": report_data.get("kpis") or [],
        "detail_items": report_data.get("detail_items") or [],
        "metric": report_data.get("metric"),
        "charts": report_data.get("charts") or [],
        "insights": report_data.get("insights") or [],
    }


def _stable_digest(payload: Any) -> str:
    serialized = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(serialized.encode("utf-8")).hexdigest()


def _preview_cache_key(source_hash: str, metric_type: str, effective_config: dict[str, Any], mapping: dict[str, Any]) -> str:
    config_digest = _stable_digest(effective_config)
    mapping_digest = _stable_digest(mapping)
    return f"{source_hash}:{metric_type}:{config_digest}:{mapping_digest}"


def _preview_effective_config(config: dict[str, Any] | None) -> dict[str, Any]:
    saving = (config or {}).get("saving")
    saving_cfg = saving if isinstance(saving, dict) else {}
    override_cfg = saving_cfg.get("override") if isinstance(saving_cfg.get("override"), dict) else {}
    workbook_meta = (config or {}).get("workbookMeta")
    workbook_meta = workbook_meta if isinstance(workbook_meta, dict) else {}
    mapping_inputs = {
        key: saving_cfg.get(key)
        for key in (
            "baseCol",
            "savingBaseCol",
            "valueCol",
            "savingCol",
            "percentCol",
            "savingPercentCol",
            "categoryCol",
            "dateCol",
            "initialCol",
            "originalCol",
            "v1Col",
        )
        if saving_cfg.get(key) not in (None, "")
    }
    sheet_inputs = {
        key: value
        for key, value in {
            "selectedSheetName": (config or {}).get("selectedSheetName") or workbook_meta.get("selectedSheetName"),
            "selectedSheetIndex": (config or {}).get("selectedSheetIndex") if (config or {}).get("selectedSheetIndex") is not None else workbook_meta.get("selectedSheetIndex"),
            "selectedSheetHash": (config or {}).get("selectedSheetHash") or workbook_meta.get("selectedSheetHash"),
        }.items()
        if value not in (None, "")
    }
    return {
        "metricType": _extract_metric_type(config),
        "mappingInputs": mapping_inputs,
        "override": override_cfg,
        "sheet": sheet_inputs,
    }


def _preview_cache_lookup(cache_key: str | None = None, cache_key_prefix: str | None = None) -> dict[str, Any] | None:
    if cache_key_prefix:
        for existing_key, existing_value in reversed(_PREVIEW_CACHE.items()):
            if existing_key.startswith(cache_key_prefix) and isinstance(existing_value, dict):
                _PREVIEW_CACHE.move_to_end(existing_key)
                logger.info("preview cache hit: key=%s", existing_key)
                return copy.deepcopy(existing_value)
        logger.info("preview cache miss: key_prefix=%s", cache_key_prefix)
        return None

    if not cache_key:
        return None
    cached = _PREVIEW_CACHE.get(cache_key)
    if not isinstance(cached, dict):
        logger.info("preview cache miss: key=%s", cache_key)
        return None

    _PREVIEW_CACHE.move_to_end(cache_key)
    logger.info("preview cache hit: key=%s", cache_key)
    return copy.deepcopy(cached)


def _preview_cache_store(cache_key: str, report_data: dict[str, Any]) -> None:
    _PREVIEW_CACHE[cache_key] = copy.deepcopy(report_data)
    _PREVIEW_CACHE.move_to_end(cache_key)

    while len(_PREVIEW_CACHE) > PREVIEW_CACHE_LIMIT:
        _PREVIEW_CACHE.popitem(last=False)

    logger.info("preview cache stored: key=%s", cache_key)


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
        "report_data": report_data if report_data is not None else report.report_data,
    }


def _report_data_ready_for_export(report_data: dict | None) -> bool:
    if not isinstance(report_data, dict):
        return False
    if not report_data.get("sourceHash"):
        return False
    if report_data.get("schemaVersion") not in (None, 1):
        return False
    return True


def _extract_metric_type(config: dict | None) -> str:
    saving = (config or {}).get("saving")
    if isinstance(saving, dict) and saving.get("metricType"):
        return str(saving.get("metricType")).upper()
    return str((config or {}).get("metricType") or "ECONOMIA").upper()


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
            report_data=report_data,
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
    return _serialize_report(report, report.report_data)


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
    report.report_data = report_data
    if data.row_count is not None:  report.row_count = data.row_count
    if data.col_count is not None:  report.col_count = data.col_count
    await db.flush()
    await db.refresh(report)
    return _serialize_report(report, report_data)


@router.post("/preview")
async def preview_report(
    payload: dict,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        source = payload.get("data") if isinstance(payload, dict) and isinstance(payload.get("data"), dict) else payload
        config = payload.get("config") if isinstance(payload, dict) and isinstance(payload.get("config"), dict) else payload
        metric_type = _extract_metric_type(config)
        source_hash = resolve_source_hash(source, None)
        effective_config = _preview_effective_config(config)
        config_digest = _stable_digest(effective_config)
        cache_prefix = f"{source_hash}:{metric_type}:{config_digest}:"
        cached_report_data = _preview_cache_lookup(cache_key_prefix=cache_prefix)
        if cached_report_data is None:
            cached_report_data = _build_report_data(source, config)
            final_mapping = cached_report_data.get("mapping") if isinstance(cached_report_data.get("mapping"), dict) else {}
            cache_key = _preview_cache_key(source_hash, metric_type, effective_config, final_mapping)
            _preview_cache_store(cache_key, cached_report_data)
        report_preview = _public_preview_response(cached_report_data)
        report_id = payload.get("reportId") if isinstance(payload, dict) else None
        if report_id is not None:
            report = await _get_own_report(int(report_id), current_user.id, db)
            report.report_data = cached_report_data
            await db.flush()
        return report_preview
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
        report_data = report.report_data
        if not _report_data_ready_for_export(report_data):
            raise HTTPException(
                status_code=409,
                detail="Relatório sem report_data persistido ou inválido. Gere o preview e salve antes de exportar.",
            )
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
