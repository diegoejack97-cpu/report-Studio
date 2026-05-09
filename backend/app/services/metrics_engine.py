from __future__ import annotations

import hashlib
from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
import json
import math
import re
from typing import Any, Iterable

from app.services.insights_engine import generate_insights


METRIC_META = {
    "ECONOMIA": {"type": "ECONOMIA", "label": "Saving Total", "color": "#16A34A"},
    "TOTAL": {"type": "TOTAL", "label": "Total Financeiro", "color": "#2563EB"},
    "VARIACAO": {"type": "VARIACAO", "label": "Variação", "color": "#F59E0B"},
    "TAXA": {"type": "TAXA", "label": "Taxa", "color": "#7C3AED"},
    "VOLUME": {"type": "VOLUME", "label": "Volume", "color": "#6B7280"},
}

MONTH_LABELS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"]
SCHEMA_VERSION = 1
CLASSIFICATION_SAMPLE_SIZE = 25

METRIC_RULES = {
    "ECONOMIA": {
        "requires": ["monetary", "percent"],
        "formula": "base_value * percent_value",
        "errors": {
            "monetary_missing": "Nenhuma coluna monetária encontrada",
            "percent_missing": "Nenhuma coluna percentual encontrada",
        },
        "warnings": {
            "percent_unit": "Valores percentuais foram normalizados automaticamente de escala 0-100 para 0-1",
        },
    },
    "TOTAL": {
        "requires": ["monetary"],
        "formula": "sum(value)",
        "errors": {
            "monetary_missing": "Nenhuma coluna monetária encontrada",
        },
        "warnings": {},
    },
    "VARIACAO": {
        "requires": ["monetary", "monetary"],
        "formula": "(final_value - initial_value) / initial_value * 100",
        "errors": {
            "monetary_missing": "Nenhuma coluna monetária encontrada",
            "monetary_pair_missing": "Nenhuma segunda coluna monetária encontrada",
        },
        "warnings": {},
    },
    "TAXA": {
        "requires": ["category"],
        "formula": "category_share",
        "errors": {
            "category_missing": "Nenhuma coluna categórica encontrada",
        },
        "warnings": {},
    },
    "VOLUME": {
        "requires": [],
        "formula": "count_rows",
        "errors": {},
        "warnings": {},
    },
}


class MetricsValidationError(ValueError):
    def __init__(self, message: str, *, code: str = "validation_error", field: str | None = None, expected: str | None = None, received: str | None = None):
        super().__init__(message)
        self.code = code
        self.field = field
        self.expected = expected
        self.received = received

    def as_detail(self) -> dict[str, Any]:
        detail: dict[str, Any] = {"code": self.code, "message": str(self)}
        if self.field is not None:
            detail["field"] = self.field
        if self.expected is not None:
            detail["expected"] = self.expected
        if self.received is not None:
            detail["received"] = self.received
        return detail


def normalize_metric_type(value: Any) -> str:
    metric_type = str(value or "ECONOMIA").upper().strip()
    return metric_type if metric_type in METRIC_META else "ECONOMIA"


def _normalize_text(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "").strip().lower())


def _strip_numeric_tokens(text: str) -> str:
    return re.sub(r"[R$€£¥%\s]", "", text)


def normalize_percent(value: float) -> float:
    if value is None:
        return None

    # REGRA DE OURO
    if value > 1:
        return value / 100
    return value


def _parse_decimal_text(text: str) -> float | None:
    cleaned = str(text or "").strip()
    if not cleaned:
        return None

    cleaned = re.sub(r"(?i)(r\$|us\$|brl|usd|eur|gbp|jpy)", "", cleaned)
    cleaned = re.sub(r"[$€£¥%\s\u00a0]", "", cleaned)
    if not cleaned or re.search(r"[^0-9,.\-+]", cleaned):
        return None
    if re.search(r"[+-]", cleaned[1:]):
        return None

    sign = ""
    if cleaned[0] in "+-":
        sign = cleaned[0]
        cleaned = cleaned[1:]
    if not cleaned or not re.search(r"\d", cleaned):
        return None

    if "," in cleaned:
        if cleaned.count(",") > 1:
            return None
        integer_part, decimal_part = cleaned.split(",", 1)
        if "." in decimal_part or not re.fullmatch(r"\d*", decimal_part):
            return None
        if "." in integer_part:
            groups = integer_part.split(".")
            if not groups[0] or len(groups[0]) > 3 or any(len(group) != 3 for group in groups[1:]):
                return None
            integer_part = "".join(groups)
        if not re.fullmatch(r"\d+", integer_part) or not re.fullmatch(r"\d*", decimal_part):
            return None
        normalized = f"{sign}{integer_part}.{decimal_part}" if decimal_part else f"{sign}{integer_part}"
    else:
        if cleaned.count(".") > 1:
            return None
        if not re.fullmatch(r"\d+(\.\d+)?", cleaned):
            return None
        normalized = f"{sign}{cleaned}"

    try:
        parsed = Decimal(normalized)
    except InvalidOperation:
        return None
    numeric = float(parsed)
    return numeric if math.isfinite(numeric) else None


def parse_number(value: Any, *, is_percent: bool = False) -> float | None:
    if value is None or isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        parsed = float(value)
        if not math.isfinite(parsed):
            return None
        return normalize_percent(parsed) if is_percent else parsed

    parsed = _parse_decimal_text(str(value))
    if parsed is None:
        return None

    return normalize_percent(parsed) if is_percent else parsed


def _stable_json(value: Any) -> str:
    return json.dumps(value, sort_keys=True, ensure_ascii=False, separators=(",", ":"))


def _compute_source_hash(rows: list[dict[str, Any]], cols: list[dict[str, Any]]) -> str:
    payload = {"rows": rows, "cols": cols}
    return hashlib.sha256(_stable_json(payload).encode("utf-8")).hexdigest()


def _row_cells(row: Any) -> list[Any]:
    if isinstance(row, dict):
        cells = row.get("cells")
        return cells if isinstance(cells, list) else []
    return row if isinstance(row, list) else []


def _sample_column_values(rows: list[dict[str, Any]], column_index: int, sample_size: int = CLASSIFICATION_SAMPLE_SIZE) -> list[Any]:
    values: list[Any] = []
    for row in rows[:sample_size]:
        cells = _row_cells(row)
        if column_index < len(cells):
            value = cells[column_index]
            if value not in (None, ""):
                values.append(value)
    return values


def _count_matches(values: list[Any], predicate) -> int:
    return sum(1 for value in values if predicate(value))


def _looks_like_percent_name(name: str) -> bool:
    return bool(re.search(r"(?i)(percent|percentual|pct|taxa|desconto|saving|economia|%)", name))


def _looks_like_money_name(name: str) -> bool:
    return bool(re.search(r"(?i)(valor|price|custo|amount|receita|despesa|gasto|money|currency|total|base|pago|negociado)", name))


def _looks_like_explicit_money_name(name: str) -> bool:
    return bool(re.search(r"(?i)(valor|price|custo|amount|receita|despesa|gasto|money|currency|base|pago|negociado)", name))


def _looks_like_identifier_name(name: str) -> bool:
    return bool(
        re.search(
            r"(?i)(contrato|c[oó]digo|codigo|\bid\b|n[uú]mero|numero|processo|protocolo|ap[oó]lice|apolice|cpf|cnpj|matr[ií]cula|matricula|pedido|ordem|\bscd\b|\bssj\b)",
            name,
        )
    )


def _looks_like_date_name(name: str) -> bool:
    return bool(re.search(r"(?i)(data|date|venc|mes|mês|ano|period)", name))


def _looks_like_score_name(name: str) -> bool:
    return bool(re.search(r"(?i)(score|nota|rating|avaliacao|avaliação|performance)", name))


def _looks_like_category_name(name: str) -> bool:
    return bool(re.search(r"(?i)(categoria|category|tipo|fornecedor|empresa|cliente|grupo|setor)", name))


def _parse_numeric_like(value: Any) -> float | None:
    if value is None or isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        numeric = float(value)
        return numeric if math.isfinite(numeric) else None
    text = str(value).strip()
    if not text:
        return None
    return _parse_decimal_text(text)


def _parse_date_like(value: Any) -> bool:
    raw = str(value or "").strip()
    if not raw:
        return False
    if re.match(r"^\d{1,4}[/-]\d{1,2}([/-]\d{1,4})?$", raw):
        return True
    try:
        datetime.fromisoformat(raw.replace("Z", "+00:00"))
        return True
    except Exception:
        return False


def _classify_column(name: str, values: list[Any]) -> dict[str, Any]:
    normalized_name = _normalize_text(name)
    sample_values = [str(v) for v in values[:5]]
    non_empty = [value for value in values if value not in (None, "")]
    string_values = [str(value).strip() for value in non_empty]
    numeric_values = [numeric for numeric in (_parse_numeric_like(value) for value in non_empty) if numeric is not None]
    date_matches = _count_matches(non_empty, _parse_date_like)
    percent_hint = _looks_like_percent_name(normalized_name)
    money_hint = _looks_like_money_name(normalized_name)
    explicit_money_hint = _looks_like_explicit_money_name(normalized_name)
    identifier_hint = _looks_like_identifier_name(normalized_name)
    date_hint = _looks_like_date_name(normalized_name)
    score_hint = _looks_like_score_name(normalized_name)
    category_hint = _looks_like_category_name(normalized_name)
    unique_ratio = 1.0
    if string_values:
        unique_ratio = len({_normalize_text(value) for value in string_values if value}) / len(string_values)

    kind = "text"
    confidence = 0.35
    name_pattern = "none"
    numeric_pattern = "none"
    warnings: list[str] = []

    if date_hint or (date_matches and date_matches / max(len(non_empty), 1) >= 0.6):
        kind = "date"
        confidence = 0.92 if date_hint else 0.78
        name_pattern = "date_keyword"
        numeric_pattern = f"date_match_rate={date_matches / max(len(non_empty), 1):.2f}"
    elif score_hint:
        kind = "score"
        confidence = 0.91
        name_pattern = "score_keyword"
        numeric_pattern = f"numeric_rate={len(numeric_values) / max(len(non_empty), 1):.2f}"
    elif percent_hint:
        kind = "percent"
        confidence = 0.88
        name_pattern = "percent_keyword"
        numeric_pattern = f"numeric_rate={len(numeric_values) / max(len(non_empty), 1):.2f}"
    elif identifier_hint and not explicit_money_hint:
        kind = "identifier"
        confidence = 0.9
        name_pattern = "identifier_keyword"
        numeric_pattern = f"numeric_rate={len(numeric_values) / max(len(non_empty), 1):.2f}"
    elif money_hint or (numeric_values and sum(1 for value in numeric_values if abs(value) >= 1000) / len(numeric_values) >= 0.4):
        kind = "monetary"
        confidence = 0.84 if money_hint else 0.72
        name_pattern = "money_keyword" if money_hint else "numeric_magnitude"
        numeric_pattern = f"high_value_rate={sum(1 for value in numeric_values if abs(value) >= 1000) / max(len(numeric_values), 1):.2f}"
    elif category_hint or (string_values and unique_ratio <= 0.5):
        kind = "category"
        confidence = 0.74 if category_hint else 0.62
        name_pattern = "category_keyword" if category_hint else "low_cardinality"
        numeric_pattern = f"unique_ratio={unique_ratio:.2f}"
    else:
        numeric_rate = len(numeric_values) / max(len(non_empty), 1)
        confidence = 0.45 + min(numeric_rate * 0.2, 0.2)
        name_pattern = "text_fallback"
        numeric_pattern = f"numeric_rate={numeric_rate:.2f}"

    if kind == "percent":
        percent_numbers = [value for value in numeric_values if 1 < value < 100]
        if percent_numbers:
            warnings.append(METRIC_RULES["ECONOMIA"]["warnings"]["percent_unit"])

    if confidence < 0.7:
        warnings.append(f"Baixa confiança na classificação da coluna '{name}'")

    return {
        "kind": kind,
        "confidence": round(min(confidence, 0.99), 2),
        "evidence": {
            "sample_values": sample_values,
            "name_pattern": name_pattern,
            "numeric_pattern": numeric_pattern,
        },
        "warnings": warnings,
    }


def _classify_columns(rows: list[dict[str, Any]], columns: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    analysis: dict[str, dict[str, Any]] = {"columns": {}}
    for column in columns:
        values = _sample_column_values(rows, int(column["index"]))
        analysis["columns"][column["name"]] = _classify_column(column["name"], values)
    return analysis


def _rank_columns_by_kind(analysis: dict[str, dict[str, Any]], kind: str) -> list[str]:
    columns = analysis.get("columns") or {}
    ranked = [
        (name, payload)
        for name, payload in columns.items()
        if payload.get("kind") == kind
    ]
    ranked.sort(key=lambda item: (float(item[1].get("confidence") or 0), len(item[1].get("evidence", {}).get("sample_values") or [])), reverse=True)
    return [name for name, _ in ranked]


def _analysis_by_name(analysis: dict[str, dict[str, Any]], column_name: str) -> dict[str, Any] | None:
    return (analysis.get("columns") or {}).get(column_name)


def _resolve_primary_mapping(metric_type: str, analysis: dict[str, dict[str, Any]], columns: list[dict[str, Any]]) -> dict[str, str | None]:
    ranked_monetary = _rank_columns_by_kind(analysis, "monetary")
    ranked_percent = _rank_columns_by_kind(analysis, "percent")
    ranked_category = _rank_columns_by_kind(analysis, "category")
    ranked_date = _rank_columns_by_kind(analysis, "date")
    ranked_score = _rank_columns_by_kind(analysis, "score")

    mapping = {
        "monetary": ranked_monetary[0] if ranked_monetary else None,
        "percent": ranked_percent[0] if ranked_percent else None,
        "category": ranked_category[0] if ranked_category else None,
        "date": ranked_date[0] if ranked_date else None,
        "score": ranked_score[0] if ranked_score else None,
    }

    if metric_type == "TOTAL":
        mapping["percent"] = None
        mapping["category"] = mapping["category"]
    if metric_type == "VARIACAO":
        mapping["percent"] = None
    if metric_type == "TAXA":
        mapping["monetary"] = None
        mapping["percent"] = None
    if metric_type == "VOLUME":
        mapping["monetary"] = None
        mapping["percent"] = None

    return mapping


def _resolve_effective_mapping(
    auto_mapping: dict[str, str | None],
    columns: list[dict[str, Any]],
    config: dict[str, Any],
    metric_type: str,
) -> dict[str, str | None]:
    saving_cfg = config.get("saving") if isinstance(config.get("saving"), dict) else {}
    effective = dict(auto_mapping)
    override_cfg = saving_cfg.get("override") if isinstance(saving_cfg.get("override"), dict) else {}

    def _fallback_name(field: str, *keys: str) -> str | None:
        for key in keys:
            idx = _resolve_column_index(saving_cfg.get(key), columns)
            if idx >= 0:
                return columns[idx]["name"]
        return None

    fallback_values = {
        "monetary": _fallback_name("monetary", "baseCol", "savingBaseCol", "valueCol", "savingCol"),
        "percent": _fallback_name("percent", "percentCol", "savingPercentCol"),
        "category": _fallback_name("category", "categoryCol"),
        "date": _fallback_name("date", "dateCol"),
        "score": None,
    }

    if metric_type == "VARIACAO":
        fallback_values["monetary"] = fallback_values["monetary"] or _fallback_name("monetary", "initialCol", "originalCol", "v1Col")

    for field, fallback_value in fallback_values.items():
        if effective.get(field) is None and fallback_value is not None:
            effective[field] = fallback_value

    expected_kind_by_field = {
        "monetary": "monetary",
        "percent": "percent",
        "category": "category",
    }
    for field, expected_kind in expected_kind_by_field.items():
        override_column = override_cfg.get(field)
        override_idx = _resolve_column_index(override_column, columns)
        if override_idx < 0:
            continue
        override_type = str(columns[override_idx].get("type") or "").lower()
        compatible = (
            (expected_kind in ("monetary", "percent") and override_type in {"number", expected_kind})
            or (expected_kind == "category" and override_type in {"text", expected_kind})
        )
        if compatible:
            effective[field] = columns[override_idx]["name"]

    return effective


def _build_validation(metric_type: str, analysis: dict[str, dict[str, Any]], mapping: dict[str, str | None]) -> dict[str, list[str]]:
    errors: list[str] = []
    warnings: list[str] = []
    rules = METRIC_RULES.get(metric_type, {})

    if metric_type == "ECONOMIA":
        if not mapping.get("monetary"):
            errors.append(rules["errors"]["monetary_missing"])
        if not mapping.get("percent"):
            errors.append(rules["errors"]["percent_missing"])
    elif metric_type == "TOTAL":
        if not mapping.get("monetary"):
            errors.append(rules["errors"]["monetary_missing"])
    elif metric_type == "VARIACAO":
        ranked_monetary = _rank_columns_by_kind(analysis, "monetary")
        if not ranked_monetary:
            errors.append(rules["errors"]["monetary_missing"])
        elif len(ranked_monetary) < 2:
            errors.append(rules["errors"]["monetary_pair_missing"])
        elif len(ranked_monetary) >= 2:
            warnings.append(f"Colunas monetárias usadas: {ranked_monetary[0]} e {ranked_monetary[1]}")
    elif metric_type == "TAXA":
        if not mapping.get("category"):
            errors.append(rules["errors"]["category_missing"])

    for column_name, payload in (analysis.get("columns") or {}).items():
        if payload.get("kind") == "score" and column_name == mapping.get("percent"):
            errors.append("score não pode ser usado como percentual financeiro")
    deduped_warnings = list(dict.fromkeys(warnings))
    return {"errors": errors, "warnings": deduped_warnings}


def _build_runtime_fields(metric_type: str, columns: list[dict[str, Any]], analysis: dict[str, dict[str, Any]], legacy_fields: dict[str, int], mapping: dict[str, str | None]) -> dict[str, int]:
    name_to_index = {column["name"]: int(column["index"]) for column in columns}
    active_fields: dict[str, int] = {}

    def _pick_index(*names: str, fallback_keys: tuple[str, ...] = ()) -> int:
        for name in names:
            if name and name in name_to_index:
                return name_to_index[name]
        for key in fallback_keys:
            idx = legacy_fields.get(key, -1)
            if idx >= 0:
                return idx
        return -1

    if metric_type == "ECONOMIA":
        active_fields["base"] = _pick_index(
            mapping.get("monetary") or "",
            fallback_keys=("base", "value", "initial"),
        )
        active_fields["percent"] = _pick_index(
            mapping.get("percent") or "",
            fallback_keys=("percent",),
        )
        if active_fields["base"] < 0 and active_fields["percent"] < 0:
            active_fields["initial"] = _pick_index(fallback_keys=("initial",))
            active_fields["final"] = _pick_index(fallback_keys=("final",))
    elif metric_type == "TOTAL":
        active_fields["value"] = _pick_index(
            mapping.get("monetary") or "",
            fallback_keys=("value", "base"),
        )
    elif metric_type == "VARIACAO":
        ranked_monetary = _rank_columns_by_kind(analysis, "monetary")
        active_fields["initial"] = name_to_index.get(ranked_monetary[0], -1) if ranked_monetary else legacy_fields.get("initial", -1)
        active_fields["final"] = name_to_index.get(ranked_monetary[1], -1) if len(ranked_monetary) >= 2 else legacy_fields.get("final", -1)
        if active_fields["initial"] < 0:
            active_fields["initial"] = legacy_fields.get("initial", -1)
        if active_fields["final"] < 0:
            active_fields["final"] = legacy_fields.get("final", -1)
    elif metric_type == "TAXA":
        active_fields["category"] = _pick_index(
            mapping.get("category") or "",
            fallback_keys=("category",),
        )

    return active_fields


def _runtime_fields_valid_for_metric(metric_type: str, fields: dict[str, int]) -> bool:
    if metric_type == "ECONOMIA":
        return (
            (fields.get("base", -1) >= 0 and fields.get("percent", -1) >= 0)
            or (fields.get("initial", -1) >= 0 and fields.get("final", -1) >= 0)
        )
    if metric_type == "TOTAL":
        return fields.get("value", -1) >= 0
    if metric_type == "VARIACAO":
        return fields.get("initial", -1) >= 0 and fields.get("final", -1) >= 0
    if metric_type == "TAXA":
        return fields.get("category", -1) >= 0
    return True


def resolve_source_hash(data: Any, config: dict[str, Any] | None = None) -> str:
    rows, cols, _ = _resolve_payload(data, config)
    columns = _normalize_columns(cols)
    return _compute_source_hash(rows, columns)


def _empty_metric_response(
    analysis: dict[str, Any] | None = None,
    validation: dict[str, list[str]] | None = None,
    mapping: dict[str, str | None] | None = None,
) -> dict[str, Any]:
    return {
        "analysis": analysis or {"columns": {}},
        "validation": validation or {"errors": [], "warnings": []},
        "mapping": mapping or {
            "monetary": None,
            "percent": None,
            "category": None,
            "date": None,
            "score": None,
        },
        "dataset": [],
        "summary": {"group_index": -1, "labels": [], "rows": [], "totals": {}, "primary_metric": None},
        "kpis": [],
        "detail_items": [],
        "metric": None,
        "charts": [],
        "insights": [],
    }


def _public_metric_response(artifact: dict[str, Any]) -> dict[str, Any]:
    return {
        "analysis": artifact.get("analysis") or {"columns": {}},
        "validation": artifact.get("validation") or {"errors": [], "warnings": []},
        "mapping": artifact.get("mapping") or {
            "monetary": None,
            "percent": None,
            "category": None,
            "date": None,
            "score": None,
        },
        "dataset": artifact.get("dataset") or [],
        "summary": artifact.get("summary") or {"group_index": -1, "labels": [], "rows": [], "totals": {}, "primary_metric": None},
        "kpis": artifact.get("kpis") or [],
        "detail_items": artifact.get("detail_items") or [],
        "metric": artifact.get("metric"),
        "charts": artifact.get("charts") or [],
        "insights": artifact.get("insights") or [],
    }


def _finite_float(value: Any, default: float = 0.0) -> float:
    try:
        numeric = float(value)
    except (TypeError, ValueError):
        return float(default)
    if not math.isfinite(numeric):
        return float(default)
    return numeric


def _resolve_payload(data: Any, config: dict[str, Any] | None) -> tuple[list[dict[str, Any]], list[dict[str, Any]], dict[str, Any]]:
    payload_config = dict(config or {})
    if isinstance(data, dict):
        rows = data.get("rows") or payload_config.get("rows") or []
        cols = data.get("cols") or payload_config.get("cols") or []
        if not payload_config:
            payload_config = dict(data)
    else:
        rows = data or []
        cols = payload_config.get("cols") or []

    if not isinstance(rows, list):
        rows = []
    if not isinstance(cols, list):
        cols = []
    return rows, cols, payload_config


def _normalize_columns(cols: list[dict[str, Any]]) -> list[dict[str, Any]]:
    normalized = []
    for index, col in enumerate(cols):
        if isinstance(col, dict):
            normalized.append(
                {
                    "index": index,
                    "name": str(col.get("name") or f"col_{index}"),
                    "type": str(col.get("type") or "text").lower(),
                    "vis": bool(col.get("vis", True)),
                }
            )
        else:
            normalized.append({"index": index, "name": f"col_{index}", "type": "text", "vis": True})
    return normalized


def _resolve_column_index(value: Any, columns: list[dict[str, Any]]) -> int:
    if value is None or value == "":
        return -1

    try:
        idx = int(value)
        if 0 <= idx < len(columns):
            return idx
    except (TypeError, ValueError):
        pass

    normalized_value = _normalize_text(value)
    for column in columns:
        if _normalize_text(column["name"]) == normalized_value:
            return int(column["index"])
    return -1


def _column_meta(config: dict[str, Any], columns: list[dict[str, Any]], *keys: str) -> tuple[int, dict[str, Any] | None]:
    saving_cfg = config.get("saving") if isinstance(config.get("saving"), dict) else {}
    for key in keys:
        idx = _resolve_column_index(saving_cfg.get(key), columns)
        if idx >= 0:
            return idx, columns[idx]
    return -1, None


def _validate_column_type(field: str, column: dict[str, Any] | None, expected: str) -> None:
    if column is None:
        return
    received = str(column.get("type") or "text").lower()
    allowed_aliases = {
        "category": {"text"},
    }
    if received == expected or received in allowed_aliases.get(expected, set()):
        return

    raise MetricsValidationError(
        f"A coluna selecionada para {field} precisa ser do tipo {expected}; recebido {received}.",
        field=field,
        expected=expected,
        received=received,
    )


def _build_named_row(row: Any, columns: list[dict[str, Any]], row_index: int) -> dict[str, Any]:
    cells = row.get("cells") if isinstance(row, dict) else row
    if not isinstance(cells, list):
        cells = []

    named_row: dict[str, Any] = {
        "cells": cells,
        "row_index": row_index,
    }
    for column in columns:
        named_row[column["name"]] = cells[column["index"]] if column["index"] < len(cells) else None
    return named_row


def _parse_date_bucket(value: Any) -> dict[str, Any] | None:
    raw = str(value or "").strip()
    if not raw:
        return None

    match = re.match(r"^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$", raw)
    if match:
        month = int(match.group(2)) - 1
        year = int(match.group(3))
    else:
        match = re.match(r"^(\d{1,2})[/-](\d{4})$", raw)
        if match:
            month = int(match.group(1)) - 1
            year = int(match.group(2))
        else:
            match = re.match(r"^(\d{4})[/-](\d{1,2})", raw)
            if match:
                year = int(match.group(1))
                month = int(match.group(2)) - 1
            else:
                try:
                    parsed = datetime.fromisoformat(raw.replace("Z", "+00:00"))
                except ValueError:
                    try:
                        parsed = datetime.strptime(raw, "%d/%m/%Y")
                    except ValueError:
                        return None
                year = parsed.year
                month = parsed.month - 1

    if month < 0 or month > 11:
        return None
    if year < 1900:
        year = datetime.now().year
    return {"key": f"{year}-{month + 1:02d}", "year": year, "month": month, "label": MONTH_LABELS[month]}


def _sum(values: Iterable[float]) -> float:
    return float(sum(values))


def _mean(values: list[float]) -> float:
    return _sum(values) / len(values) if values else 0.0


def _group_by(items: list[dict[str, Any]], key_fn, value_fn, *, limit: int | None = None, sort_absolute: bool = False) -> dict[str, list[Any]]:
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for item in items:
        key = key_fn(item)
        if key is None or key == "":
          key = "(vazio)"
        grouped[str(key)].append(item)

    entries = []
    for key, grouped_items in grouped.items():
        entries.append((key, value_fn(grouped_items)))

    if sort_absolute:
        entries.sort(key=lambda entry: abs(entry[1]), reverse=True)
    else:
        entries.sort(key=lambda entry: entry[1], reverse=True)
    total_groups = len(entries)
    if limit is not None:
        entries = entries[:limit]
    return {
        "labels": [key for key, _ in entries],
        "data": [round(float(value), 2) for _, value in entries],
        "totalGroups": total_groups,
        "truncated": bool(limit is not None and total_groups > limit),
        "limit": limit,
    }


def _build_distribution(values: list[float]) -> dict[str, list[Any]]:
    clean = [value for value in values if isinstance(value, (int, float)) and math.isfinite(value)]
    if not clean:
        return {"labels": [], "data": [], "totalValues": 0, "bucketCount": 0}
    if len(clean) == 1:
        return {"labels": ["Único"], "data": [1], "totalValues": 1, "bucketCount": 1}

    minimum = min(clean)
    maximum = max(clean)
    if minimum == maximum:
        return {"labels": [f"{minimum:.2f}"], "data": [len(clean)], "totalValues": len(clean), "bucketCount": 1}

    bucket_count = min(8, max(4, int(math.sqrt(len(clean)))))
    step = (maximum - minimum) / bucket_count
    buckets = [0 for _ in range(bucket_count)]

    for value in clean:
        index = int((value - minimum) / step) if step else 0
        if index >= bucket_count:
            index = bucket_count - 1
        buckets[index] += 1

    labels = []
    for index in range(bucket_count):
        start = minimum + (step * index)
        end = maximum if index == bucket_count - 1 else start + step
        labels.append(f"{start:.2f} - {end:.2f}")

    return {"labels": labels, "data": buckets, "totalValues": len(clean), "bucketCount": bucket_count}


def _chart_option_base(*, dark: bool = False) -> dict[str, Any]:
    return {
        "backgroundColor": "transparent",
        "textStyle": {
            "color": "#94a3b8" if dark else "#64748b",
            "fontFamily": "DM Sans, system-ui",
        },
        "tooltip": {
            "trigger": "item",
            "backgroundColor": "#0d1a26" if dark else "#ffffff",
            "borderColor": "rgba(255,255,255,0.12)" if dark else "rgba(0,0,0,0.12)",
            "textStyle": {
                "color": "#d9e2ec" if dark else "#1e293b",
                "fontSize": 12,
            },
        },
        "animation": True,
        "animationDuration": 500,
        "animationEasing": "cubicOut",
    }


def _resolve_chart_source(chart_key: str, chart_cfg: dict[str, Any], index: int) -> str:
    explicit = str(chart_cfg.get("source") or chart_cfg.get("aggregation") or "").strip()
    if explicit:
        return explicit

    default_sources_by_key = {
        "g1": "distribution",
        "g2": "by_category",
        "g3": "by_date",
        "g4": "top_items",
    }
    normalized_key = str(chart_key or "").strip().lower()
    if normalized_key in default_sources_by_key:
        return default_sources_by_key[normalized_key]

    default_sources_by_position = {
        0: "distribution",
        1: "by_category",
        2: "by_date",
        3: "top_items",
    }
    return default_sources_by_position.get(index, "")


def _chart_full_width(chart_cfg: dict[str, Any], index: int) -> bool:
    if "full" in chart_cfg:
        return bool(chart_cfg.get("full"))
    if "fullWidth" in chart_cfg:
        return bool(chart_cfg.get("fullWidth"))
    return index >= 2


def _build_chart_option(chart_type: str, chart: dict[str, Any]) -> dict[str, Any]:
    labels = list(chart.get("labels") or [])
    data = [0 if value is None else _finite_float(value) for value in (chart.get("data") or [])]
    dark = bool(chart.get("_dark"))
    option = _chart_option_base(dark=dark)

    if chart_type in {"pie", "doughnut", "nightingale"}:
        option.update(
            {
                "color": chart.get("palette") or ["#1d4ed8", "#059669", "#d97706", "#dc2626", "#7c3aed", "#0891b2"],
                "legend": {
                    "orient": "vertical",
                    "right": 0,
                    "top": "middle",
                    "textStyle": {
                        "color": "#94a3b8" if dark else "#64748b",
                        "fontSize": 11,
                    },
                },
                "series": [
                    {
                        "type": "pie",
                        "radius": ["45%", "72%"] if chart_type == "doughnut" else ["15%", "72%"] if chart_type == "nightingale" else ["0%", "72%"],
                        "roseType": "radius" if chart_type == "nightingale" else False,
                        "center": ["42%", "50%"],
                        "itemStyle": {
                            "borderColor": "#0d1a26" if dark else "#ffffff",
                            "borderWidth": 2,
                        },
                        "data": [{"name": label, "value": data[index] if index < len(data) else 0} for index, label in enumerate(labels)],
                    }
                ],
            }
        )
        return option

    if chart_type in {"bar", "hbar"}:
        horizontal = chart_type == "hbar" or bool(chart.get("horizontal"))
        option.update(
            {
                "color": chart.get("palette") or ["#1d4ed8", "#059669", "#d97706", "#dc2626", "#7c3aed", "#0891b2"],
                "grid": {
                    "left": "22%" if horizontal else "3%",
                    "right": "4%",
                    "top": "8%",
                    "bottom": "12%",
                    "containLabel": not horizontal,
                },
                "tooltip": {"trigger": "axis"},
                "xAxis": {
                    "type": "value" if horizontal else "category",
                    "axisLabel": {
                        "color": "#94a3b8" if dark else "#64748b",
                    },
                    "splitLine": {
                        "lineStyle": {
                            "color": "rgba(255,255,255,0.05)" if dark else "rgba(0,0,0,0.06)",
                        }
                    } if horizontal else None,
                    "axisLine": {"lineStyle": {"color": "#1c3350" if dark else "#e2e8f0"}},
                    "data": None if horizontal else labels,
                },
                "yAxis": {
                    "type": "category" if horizontal else "value",
                    "axisLabel": {
                        "color": "#94a3b8" if dark else "#64748b",
                    },
                    "splitLine": {
                        "lineStyle": {
                            "color": "rgba(255,255,255,0.05)" if dark else "rgba(0,0,0,0.06)",
                        }
                    } if not horizontal else None,
                    "axisLine": {"lineStyle": {"color": "#1c3350" if dark else "#e2e8f0"}},
                    "data": labels if horizontal else None,
                },
                "series": [
                    {
                        "type": "bar",
                        "data": data,
                        "itemStyle": {
                            "borderRadius": [0, 6, 6, 0] if horizontal else [6, 6, 0, 0],
                        },
                    }
                ],
            }
        )
        return option

    if chart_type in {"line", "area"}:
        series = [
            {
                "type": "line",
                "name": chart.get("name1") or "Valor",
                "data": data,
                "smooth": True,
                "symbol": "circle",
                "symbolSize": 6,
                "areaStyle": {} if chart_type == "area" else None,
            }
        ]
        second = chart.get("d2") or []
        if any(_finite_float(value) != 0.0 for value in second):
            series.append(
                {
                    "type": "line",
                    "name": chart.get("name2") or "Valor 2",
                    "data": [_finite_float(value) for value in second],
                    "smooth": True,
                    "symbol": "circle",
                    "symbolSize": 6,
                    "areaStyle": {} if chart_type == "area" else None,
                }
            )
        option.update(
            {
                "color": chart.get("palette") or ["#1d4ed8", "#059669", "#d97706", "#dc2626"],
                "legend": {
                    "top": 0,
                    "textStyle": {
                        "color": "#94a3b8" if dark else "#64748b",
                        "fontSize": 11,
                    },
                },
                "grid": {"left": "3%", "right": "4%", "top": "16%", "bottom": "12%", "containLabel": True},
                "tooltip": {"trigger": "axis"},
                "xAxis": {
                    "type": "category",
                    "data": labels,
                    "boundaryGap": chart.get("bar") is True,
                    "axisLabel": {"color": "#94a3b8" if dark else "#64748b"},
                    "axisLine": {"lineStyle": {"color": "#1c3350" if dark else "#e2e8f0"}},
                },
                "yAxis": {
                    "type": "value",
                    "axisLabel": {"color": "#94a3b8" if dark else "#64748b"},
                    "splitLine": {
                        "lineStyle": {
                            "color": "rgba(255,255,255,0.05)" if dark else "rgba(0,0,0,0.06)",
                        }
                    },
                    "axisLine": {"lineStyle": {"color": "#1c3350" if dark else "#e2e8f0"}},
                },
                "series": series,
            }
        )
        return option

    if chart_type == "radar":
        indicators = []
        for index, label in enumerate(labels[:8]):
            value = data[index] if index < len(data) else 0
            indicators.append({"name": label, "max": max(_finite_float(value), 1.0) * 1.3})
        option.update(
            {
                "color": chart.get("palette") or ["#1d4ed8", "#059669", "#d97706", "#dc2626"],
                "tooltip": {},
                "radar": {
                    "indicator": indicators,
                    "axisName": {"color": "#94a3b8" if dark else "#64748b", "fontSize": 10},
                },
                "series": [{"type": "radar", "data": [{"value": data[:8], "name": chart.get("title") or "Valor", "areaStyle": {"opacity": 0.25}}]}],
            }
        )
        return option

    if chart_type == "treemap":
        option.update(
            {
                "color": chart.get("palette") or ["#1d4ed8", "#059669", "#d97706", "#dc2626"],
                "tooltip": {},
                "series": [
                    {
                        "type": "treemap",
                        "breadcrumb": {"show": False},
                        "roam": False,
                        "data": [{"name": label, "value": data[index] if index < len(data) else 0} for index, label in enumerate(labels)],
                    }
                ],
            }
        )
        return option

    if chart_type == "funnel":
        option.update(
            {
                "color": chart.get("palette") or ["#1d4ed8", "#059669", "#d97706", "#dc2626"],
                "tooltip": {},
                "series": [
                    {
                        "type": "funnel",
                        "left": "10%",
                        "width": "80%",
                        "top": "5%",
                        "bottom": "5%",
                        "sort": "descending",
                        "data": [{"name": label, "value": data[index] if index < len(data) else 0} for index, label in enumerate(labels)],
                    }
                ],
            }
        )
        return option

    raise MetricsValidationError(
        "A configuração do gráfico possui um tipo incompatível com as agregações disponíveis.",
        field="charts",
        expected="pie, bar, line, area, radar, treemap ou funnel",
        received=chart_type,
        code="invalid_chart_type",
    )


def _build_charts(config: dict[str, Any], dataset: dict[str, Any]) -> list[dict[str, Any]]:
    raw_charts = config.get("charts") or []
    if isinstance(raw_charts, dict):
        chart_items = list(raw_charts.items())
    elif isinstance(raw_charts, list):
        chart_items = [(str(index), item) for index, item in enumerate(raw_charts)]
    else:
        chart_items = []

    aggregations = dataset.get("aggregations") if isinstance(dataset.get("aggregations"), dict) else {}
    results: list[dict[str, Any]] = []

    for index, (chart_key, raw_chart) in enumerate(chart_items):
        if not isinstance(raw_chart, dict):
            continue
        if raw_chart.get("on", True) is False:
            continue

        source_key = _resolve_chart_source(chart_key, raw_chart, index)
        aggregation = aggregations.get(source_key)
        if not isinstance(aggregation, dict):
            raise MetricsValidationError(
                "Um gráfico configurado depende de uma agregação ausente no dataset.",
                field=f"charts.{chart_key}",
                expected=source_key or "aggregation",
                received="missing",
                code="missing_aggregation",
            )

        labels = aggregation.get("labels")
        data = aggregation.get("data")
        if source_key == "by_date" and not isinstance(data, list):
            data = aggregation.get("d1")
        if not isinstance(labels, list) or not isinstance(data, list):
            raise MetricsValidationError(
                "A agregação do gráfico está em formato inválido.",
                field=f"charts.{chart_key}",
                expected="labels/data arrays",
                received="invalid",
                code="invalid_aggregation",
            )

        chart_type = str(raw_chart.get("type") or "pie").strip().lower()
        normalized_type = "bar" if chart_type == "hbar" else chart_type
        chart = {
            "id": str(raw_chart.get("id") or chart_key or f"chart-{index + 1}"),
            "source": source_key,
            "title": str(raw_chart.get("title") or "Gráfico"),
            "type": chart_type,
            "labels": labels,
            "data": data,
            "full": _chart_full_width(raw_chart, index),
            "h": int(raw_chart.get("h") or (300 if index >= 2 else 260)),
            "_dark": bool(raw_chart.get("dark", False)),
        }
        if "d2" in aggregation:
            chart["d2"] = aggregation.get("d2") or []
        if "totalGroups" in aggregation:
            chart["totalGroups"] = aggregation.get("totalGroups")
        if "truncated" in aggregation:
            chart["truncated"] = aggregation.get("truncated")
        if "limit" in aggregation:
            chart["limit"] = aggregation.get("limit")
        if "totalValues" in aggregation:
            chart["totalValues"] = aggregation.get("totalValues")
        if "bucketCount" in aggregation:
            chart["bucketCount"] = aggregation.get("bucketCount")
        if "name1" in raw_chart:
            chart["name1"] = raw_chart.get("name1")
        if "name2" in raw_chart:
            chart["name2"] = raw_chart.get("name2")
        if "bar" in raw_chart:
            chart["bar"] = raw_chart.get("bar")

        chart["option"] = _build_chart_option(normalized_type, chart)
        results.append(chart)

    return results


def _build_summary(rows: list[dict[str, Any]], group_index: int, metric_type: str, value_key: str = "metric_value") -> dict[str, Any]:
    if group_index < 0:
        return {"labels": [], "rows": [], "totals": {}}

    buckets: dict[str, dict[str, Any]] = {}
    for row in rows:
        key = str(row.get("_group_value") or "").strip() or "(vazio)"
        bucket = buckets.setdefault(key, {"label": key, "count": 0, "value": 0.0})
        bucket["count"] += 1
        bucket["value"] += float(row.get(value_key) or 0)

    ordered = sorted(buckets.values(), key=lambda item: item["count"], reverse=True)
    return {
        "labels": [item["label"] for item in ordered],
        "rows": ordered,
        "totals": {
            "count": len(rows),
            "value": round(_sum(float(row.get(value_key) or 0) for row in rows), 2),
            "metric_type": metric_type,
        },
    }


def _format_value(value: float, metric_type: str) -> str:
    if metric_type in {"ECONOMIA", "TOTAL", "VARIACAO"}:
        return f"{value:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
    if metric_type == "TAXA":
        return f"{value:,.2f}%".replace(",", "X").replace(".", ",").replace("X", ".")
    return f"{value:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")


def _primary_metric_display_type(metric_type: str) -> str:
    if metric_type in {"TAXA", "VARIACAO"}:
        return "percentual"
    if metric_type == "VOLUME":
        return "quantidade"
    return "monetario"


def _format_primary_metric_value(value: float | None, metric_type: str) -> str:
    if value is None:
        return "—"
    display_type = _primary_metric_display_type(metric_type)
    if display_type == "monetario":
        return f"R$ {_format_value(value, 'TOTAL')}"
    if display_type == "percentual":
        return _format_value(value, "TAXA")
    return f"{int(round(value)):,}".replace(",", ".")


def _metric_unit(metric_type: str) -> str:
    if metric_type in {"TAXA", "VARIACAO"}:
        return "percent"
    if metric_type == "VOLUME":
        return "number"
    return "currency"


def _build_detail_items(metric_type: str, metric_rows: list[dict[str, Any]], fields: dict[str, int], columns: list[dict[str, Any]]) -> list[dict[str, Any]]:
    def _number(row: dict[str, Any], key: str) -> float:
        value = parse_number(row.get(key))
        return value if value is not None else 0.0

    if metric_type == "ECONOMIA":
        if fields.get("base", -1) >= 0 and fields.get("percent", -1) >= 0:
            base_name = columns[fields["base"]]["name"]
            percent_name = columns[fields["percent"]]["name"]
            base_total = round(_sum(_number(row, base_name) for row in metric_rows), 2)
            percent_avg = round(_mean([float(row.get("percent_value") or 0) for row in metric_rows]) * 100, 2)
            return [
                {"kind": "currency", "label": columns[fields["base"]]["name"], "value": base_total},
                {"kind": "percent", "label": columns[fields["percent"]]["name"], "value": percent_avg, "accent": True},
            ]
        if fields.get("initial", -1) >= 0 and fields.get("final", -1) >= 0:
            initial_name = columns[fields["initial"]]["name"]
            final_name = columns[fields["final"]]["name"]
            initial_total = round(_sum(_number(row, initial_name) for row in metric_rows), 2)
            final_total = round(_sum(_number(row, final_name) for row in metric_rows), 2)
            return [
                {"kind": "currency", "label": columns[fields["initial"]]["name"], "value": initial_total},
                {"kind": "currency", "label": columns[fields["final"]]["name"], "value": final_total, "accent": True},
            ]
    if metric_type == "TOTAL":
        value_name = columns[fields["value"]]["name"]
        return [{"kind": "currency", "label": value_name, "value": round(_sum(_number(row, value_name) for row in metric_rows), 2)}]
    if metric_type == "VARIACAO":
        initial_name = columns[fields["initial"]]["name"]
        final_name = columns[fields["final"]]["name"]
        initial_total = round(_sum(_number(row, initial_name) for row in metric_rows), 2)
        final_total = round(_sum(_number(row, final_name) for row in metric_rows), 2)
        return [
            {"kind": "currency", "label": initial_name, "value": initial_total},
            {"kind": "currency", "label": final_name, "value": final_total, "accent": True},
        ]
    if metric_type == "TAXA":
        return [{"kind": "percent", "label": METRIC_META[metric_type]["label"], "value": round(_sum(float(row.get("metric_value") or 0) for row in metric_rows), 2)}]
    return [{"kind": "number", "label": METRIC_META[metric_type]["label"], "value": round(_sum(float(row.get("metric_value") or 0) for row in metric_rows), 2)}]


def _build_primary_metric(
    metric_type: str,
    metric_total: float | None,
    metric_rows: list[dict[str, Any]],
    fields: dict[str, int],
    columns: list[dict[str, Any]],
    metric_label: str,
) -> dict[str, Any]:
    if metric_total is None:
        return {
            "label": metric_label,
            "value": None,
            "type": _primary_metric_display_type(metric_type),
            "color": METRIC_META[metric_type]["color"],
            "formatted_value": "—",
            "breakdown": None,
        }

    breakdown: dict[str, Any] | None = None
    if metric_type == "ECONOMIA" and fields.get("base", -1) >= 0 and fields.get("percent", -1) >= 0:
        base_name = columns[fields["base"]]["name"]
        base_total = round(_sum(float(row.get(base_name) or 0) for row in metric_rows), 2)
        percent_avg = round(_mean([float(row.get("percent_value") or 0) for row in metric_rows]) * 100, 2)
        breakdown = {
            "base_value": base_total,
            "percent": percent_avg,
            "formula": "valor_pago * saving_percent",
        }
    elif metric_type == "ECONOMIA" and fields.get("initial", -1) >= 0 and fields.get("final", -1) >= 0:
        breakdown = {
            "formula": "valor_inicial - valor_final",
        }
    elif metric_type == "VARIACAO":
        breakdown = {
            "formula": "agregacao_percentual",
        }
    elif metric_type == "TAXA":
        denominador = len(metric_rows)
        breakdown = {
            "base_value": denominador,
            "numerador": denominador,
            "percent": metric_total,
            "formula": "numerador / denominador * 100",
        }
    elif metric_type == "VOLUME":
        breakdown = {
            "formula": "contagem_registros",
        }

    payload: dict[str, Any] = {
        "label": metric_label,
        "value": metric_total,
        "type": _primary_metric_display_type(metric_type),
        "color": METRIC_META[metric_type]["color"],
        "formatted_value": _format_primary_metric_value(metric_total, metric_type),
    }
    if breakdown:
        payload["breakdown"] = breakdown
    return payload


def _compute_kpis(config: dict[str, Any], rows: list[dict[str, Any]], columns: list[dict[str, Any]]) -> list[dict[str, Any]]:
    raw_kpis = config.get("kpis") or []
    if not isinstance(raw_kpis, list):
        return []

    result = []
    for kpi in raw_kpis:
        if not isinstance(kpi, dict):
            continue
        idx = _resolve_column_index(kpi.get("col"), columns)
        fmt = str(kpi.get("fmt") or "count")
        label = str(kpi.get("label") or "KPI")
        icon = str(kpi.get("icon") or "📊")
        color = str(kpi.get("color") or "#3b82f6")

        values = []
        if idx >= 0:
            column_name = columns[idx]["name"]
            for row in rows:
                values.append(row.get(column_name))

        display: str
        numeric_value: float | int
        if fmt == "count":
            numeric_value = len([value for value in values if value not in (None, "")]) if idx >= 0 else len(rows)
            display = f"{numeric_value:,}".replace(",", ".")
        elif fmt == "sum":
            numeric_value = _sum(value for value in (parse_number(value) for value in values) if value is not None)
            display = _format_value(float(numeric_value), "TOTAL")
        elif fmt == "avg":
            numeric_values = [value for value in (parse_number(value) for value in values) if value is not None]
            numeric_value = _mean(numeric_values)
            display = _format_value(float(numeric_value), "TOTAL")
        elif fmt == "max":
            numeric_values = [value for value in (parse_number(value) for value in values) if value is not None]
            numeric_value = max(numeric_values) if numeric_values else 0
            display = _format_value(float(numeric_value), "TOTAL")
        elif fmt == "min":
            numeric_values = [value for value in (parse_number(value) for value in values) if value is not None]
            numeric_value = min(numeric_values) if numeric_values else 0
            display = _format_value(float(numeric_value), "TOTAL")
        elif fmt == "countuniq":
            numeric_value = len({str(value).strip() for value in values if value not in (None, "")})
            display = f"{numeric_value:,}".replace(",", ".")
        elif fmt == "topval":
            counter = Counter(str(value).strip() for value in values if value not in (None, ""))
            top = counter.most_common(1)[0] if counter else None
            numeric_value = float(top[1]) if top else 0
            display = f"{top[0]} ({top[1]})" if top else "—"
        else:
            numeric_value = 0
            display = "—"

        result.append(
            {
                "label": label,
                "icon": icon,
                "color": color,
                "fmt": fmt,
                "col": str(kpi.get("col") or ""),
                "value": numeric_value,
                "display": display,
            }
        )
    return result


def _metric_field_config(config: dict[str, Any], columns: list[dict[str, Any]], metric_type: str) -> dict[str, int]:
    saving_cfg = config.get("saving") if isinstance(config.get("saving"), dict) else {}
    if metric_type == "ECONOMIA":
        base_idx = _resolve_column_index(saving_cfg.get("baseCol") or saving_cfg.get("savingBaseCol"), columns)
        percent_idx = _resolve_column_index(saving_cfg.get("percentCol") or saving_cfg.get("savingPercentCol"), columns)
        initial_idx = _resolve_column_index(saving_cfg.get("initialCol") or saving_cfg.get("originalCol") or saving_cfg.get("v1Col"), columns)
        final_idx = _resolve_column_index(saving_cfg.get("finalCol") or saving_cfg.get("negotiatedCol") or saving_cfg.get("v2Col"), columns)
        value_idx = _resolve_column_index(saving_cfg.get("valueCol") or saving_cfg.get("savingCol"), columns)
        return {
            "base": base_idx,
            "percent": percent_idx,
            "initial": initial_idx,
            "final": final_idx,
            "value": value_idx,
        }
    if metric_type == "TOTAL":
        return {"value": _resolve_column_index(saving_cfg.get("valueCol") or saving_cfg.get("savingCol"), columns)}
    if metric_type == "VARIACAO":
        return {
            "initial": _resolve_column_index(saving_cfg.get("initialCol") or saving_cfg.get("originalCol") or saving_cfg.get("v1Col"), columns),
            "final": _resolve_column_index(saving_cfg.get("finalCol") or saving_cfg.get("negotiatedCol") or saving_cfg.get("v2Col"), columns),
        }
    if metric_type == "TAXA":
        return {"category": _resolve_column_index(saving_cfg.get("categoryCol") or config.get("groupCol"), columns)}
    return {}


def _has_explicit_metric_field(config: dict[str, Any], metric_type: str) -> bool:
    saving_cfg = config.get("saving") if isinstance(config.get("saving"), dict) else {}

    def _has_value(*keys: str) -> bool:
        return any(saving_cfg.get(key) not in (None, "") for key in keys)

    if metric_type == "ECONOMIA":
        return _has_value("baseCol", "savingBaseCol", "percentCol", "savingPercentCol", "initialCol", "originalCol", "v1Col", "finalCol", "negotiatedCol", "v2Col")
    if metric_type == "TOTAL":
        return _has_value("valueCol", "savingCol")
    if metric_type == "VARIACAO":
        return _has_value("initialCol", "originalCol", "v1Col", "finalCol", "negotiatedCol", "v2Col")
    if metric_type == "TAXA":
        return _has_value("categoryCol") or config.get("groupCol") not in (None, "")
    return False


def _validate_metric_config(metric_type: str, fields: dict[str, int], columns: list[dict[str, Any]]) -> None:
    if metric_type == "ECONOMIA":
        if fields.get("base", -1) >= 0 and fields.get("percent", -1) >= 0:
            _validate_column_type("baseCol", columns[fields["base"]], "monetary")
            _validate_column_type("percentCol", columns[fields["percent"]], "percent")
            return
        if fields.get("initial", -1) >= 0 and fields.get("final", -1) >= 0:
            _validate_column_type("initialCol", columns[fields["initial"]], "monetary")
            _validate_column_type("finalCol", columns[fields["final"]], "monetary")
            return
        raise MetricsValidationError(
            "A métrica ECONOMIA precisa de Base+Percentual ou Valor Inicial+Valor Final.",
            field="saving",
            expected="base+percent ou initial+final",
        )
    if metric_type == "TOTAL":
        value_idx = fields.get("value", -1)
        if value_idx < 0:
            raise MetricsValidationError(
                "A métrica TOTAL precisa de uma coluna monetária.",
                field="valueCol",
                expected="monetary",
            )
        _validate_column_type("valueCol", columns[value_idx], "monetary")
        return
    if metric_type == "VARIACAO":
        if fields.get("initial", -1) < 0 or fields.get("final", -1) < 0:
            raise MetricsValidationError(
                "A métrica VARIAÇÃO precisa de coluna inicial e final.",
                field="saving",
                expected="initial+final",
            )
        _validate_column_type("initialCol", columns[fields["initial"]], "monetary")
        _validate_column_type("finalCol", columns[fields["final"]], "monetary")
        return
    if metric_type == "TAXA":
        if fields.get("category", -1) < 0:
            raise MetricsValidationError(
                "A métrica TAXA precisa de uma coluna de categoria.",
                field="categoryCol",
                expected="category",
            )
        _validate_column_type("categoryCol", columns[fields["category"]], "category")


def _build_metric_artifact(data: Any, config: dict[str, Any] | None) -> dict[str, Any]:
    rows, cols, payload_config = _resolve_payload(data, config)
    metric_type = normalize_metric_type((payload_config.get("saving") or {}).get("metricType") if isinstance(payload_config.get("saving"), dict) else payload_config.get("metricType"))
    columns = _normalize_columns(cols)
    source_hash = _compute_source_hash(rows, columns)
    analysis = _classify_columns(rows, columns)
    auto_mapping = _resolve_primary_mapping(metric_type, analysis, columns)
    mapping = _resolve_effective_mapping(auto_mapping, columns, payload_config, metric_type)
    validation = _build_validation(metric_type, analysis, mapping)
    legacy_fields = _metric_field_config(payload_config, columns, metric_type)
    explicit_metric_config = isinstance(payload_config.get("saving"), dict) and (payload_config["saving"].get("metricType") not in (None, ""))
    explicit_metric_fields = _has_explicit_metric_field(payload_config, metric_type)
    fields = _build_runtime_fields(metric_type, columns, analysis, legacy_fields, mapping)

    if validation["errors"] and not any(index >= 0 for index in legacy_fields.values()) and not any(value is not None for value in auto_mapping.values()):
        if explicit_metric_config:
            _validate_metric_config(metric_type, fields, columns)
        artifact = _empty_metric_response(analysis, validation, mapping)
        artifact["schemaVersion"] = SCHEMA_VERSION
        artifact["sourceHash"] = source_hash
        return artifact

    if explicit_metric_fields:
        _validate_metric_config(metric_type, legacy_fields, columns)

    if validation["errors"] and not _runtime_fields_valid_for_metric(metric_type, fields):
        artifact = _empty_metric_response(analysis, validation, mapping)
        artifact["schemaVersion"] = SCHEMA_VERSION
        artifact["sourceHash"] = source_hash
        return artifact

    named_rows = [_build_named_row(row, columns, index) for index, row in enumerate(rows)]

    saving_cfg = payload_config.get("saving") if isinstance(payload_config.get("saving"), dict) else {}
    metric_label = str(saving_cfg.get("label") or METRIC_META[metric_type]["label"])
    category_idx = _resolve_column_index(saving_cfg.get("categoryCol") or mapping.get("category"), columns)
    entity_idx = _resolve_column_index(saving_cfg.get("entityCol") or saving_cfg.get("categoryCol") or mapping.get("category"), columns)
    date_idx = _resolve_column_index(saving_cfg.get("dateCol") or mapping.get("date"), columns)

    metric_rows: list[dict[str, Any]] = []
    skipped_rows = 0
    variacao_base_zero_found = False

    for row in named_rows:
        category_value = str(row.get(columns[category_idx]["name"]) or "(sem categoria)") if category_idx >= 0 else "(sem categoria)"
        entity_value = str(row.get(columns[entity_idx]["name"]) or category_value) if entity_idx >= 0 else category_value
        date_value = row.get(columns[date_idx]["name"]) if date_idx >= 0 else None
        date_bucket = _parse_date_bucket(date_value)

        metric_value: float | None = None
        formula = ""

        if metric_type == "ECONOMIA":
            if fields.get("base", -1) >= 0 and fields.get("percent", -1) >= 0:
                base_value = parse_number(row.get(columns[fields["base"]]["name"]))
                raw_percent_value = parse_number(row.get(columns[fields["percent"]]["name"]))
                percent_value = normalize_percent(raw_percent_value)
                if base_value is None or percent_value is None:
                    skipped_rows += 1
                    continue
                metric_value = base_value * percent_value
                formula = "percent_x_base"
                row["percent_value"] = percent_value
            else:
                initial_value = parse_number(row.get(columns[fields["initial"]]["name"]))
                final_value = parse_number(row.get(columns[fields["final"]]["name"]))
                if initial_value is None or final_value is None:
                    skipped_rows += 1
                    continue
                metric_value = initial_value - final_value
                formula = "original_minus_final"
        elif metric_type == "TOTAL":
            value = parse_number(row.get(columns[fields["value"]]["name"]))
            if value is None:
                skipped_rows += 1
                continue
            metric_value = value
            formula = "sum"
        elif metric_type == "VARIACAO":
            initial_value = parse_number(row.get(columns[fields["initial"]]["name"]))
            final_value = parse_number(row.get(columns[fields["final"]]["name"]))
            if initial_value is None or final_value is None:
                skipped_rows += 1
                continue
            if initial_value == 0:
                variacao_base_zero_found = True
                skipped_rows += 1
                continue
            metric_value = ((final_value - initial_value) / initial_value) * 100
            if not math.isfinite(metric_value):
                metric_value = 0.0
            formula = "variation_rate"
        elif metric_type == "TAXA":
            metric_value = 0.0
            formula = "category_share"
        elif metric_type == "VOLUME":
            metric_value = 1.0
            formula = "count"

        if metric_value is None:
            continue

        if metric_type == "TAXA":
            metric_rows.append(
                {
                    **row,
                    "category": category_value,
                    "entity": entity_value,
                    "dateKey": date_bucket["key"] if date_bucket else "",
                    "dateLabel": f"{date_bucket['label']}/{date_bucket['year']}" if date_bucket else "",
                    "metric_value": metric_value,
                    "formula": formula,
                }
            )
            continue

        metric_rows.append(
            {
                **row,
                "category": category_value,
                "entity": entity_value,
                "dateKey": date_bucket["key"] if date_bucket else "",
                "dateLabel": f"{date_bucket['label']}/{date_bucket['year']}" if date_bucket else "",
                "metric_value": metric_value,
                "formula": formula,
            }
        )

    if metric_type == "ECONOMIA" and fields.get("percent", -1) >= 0:
        percent_column_name = columns[fields["percent"]]["name"]
        percent_values = [parse_number(row.get(percent_column_name)) for row in named_rows]
        if any(value is not None and 1 < value < 100 for value in percent_values):
            unit_warning = METRIC_RULES["ECONOMIA"]["warnings"]["percent_unit"]
            column_warnings = analysis["columns"].get(percent_column_name, {}).get("warnings")
            if isinstance(column_warnings, list) and unit_warning not in column_warnings:
                column_warnings.append(unit_warning)

    for column_payload in (analysis.get("columns") or {}).values():
        column_warnings = column_payload.get("warnings")
        if isinstance(column_warnings, list):
            column_payload["warnings"] = list(dict.fromkeys(column_warnings))
    validation["warnings"] = list(dict.fromkeys(validation.get("warnings") or []))
    if metric_type == "VARIACAO" and variacao_base_zero_found:
        validation["warnings"].append("Não é possível calcular variação com valor base igual a zero")
        validation["warnings"] = list(dict.fromkeys(validation["warnings"]))

    if metric_type == "TAXA":
        total = len(metric_rows) or 1
        for row in metric_rows:
            row["metric_value"] = 100 / total

    metric_total: float | None = round(_sum(row["metric_value"] for row in metric_rows), 2)
    if metric_type == "VARIACAO" and variacao_base_zero_found and not metric_rows:
        metric_total = None
    if metric_type == "TAXA" and not metric_rows:
        metric_total = 0.0
    if metric_type == "TAXA" and metric_rows:
        metric_total = round(_sum(row["metric_value"] for row in metric_rows), 2)
    if metric_type == "VOLUME":
        metric_total = float(len(metric_rows))

    by_category = _group_by(
        metric_rows,
        key_fn=lambda item: item.get("category"),
        value_fn=lambda items: _sum(float(item.get("metric_value") or 0) for item in items),
        limit=12,
    )
    by_date_map: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for item in metric_rows:
        if item.get("dateKey"):
            by_date_map[item["dateKey"]].append(item)
    by_date_entries = sorted(by_date_map.items(), key=lambda entry: entry[0])
    by_date = {
        "labels": [f"{MONTH_LABELS[int(key.split('-')[1]) - 1]}/{key.split('-')[0]}" for key, _ in by_date_entries],
        "d1": [round(_sum(float(item.get("metric_value") or 0) for item in items), 2) for _, items in by_date_entries],
    }
    top_items = _group_by(
        metric_rows,
        key_fn=lambda item: item.get("entity") or item.get("category"),
        value_fn=lambda items: _sum(float(item.get("metric_value") or 0) for item in items),
        limit=10,
    )
    distribution = _build_distribution([float(row.get("metric_value") or 0) for row in metric_rows])

    summary_group_index = _resolve_column_index(payload_config.get("groupCol") or ((payload_config.get("saving") or {}).get("categoryCol") if isinstance(payload_config.get("saving"), dict) else None), columns)
    summary_rows = []
    if summary_group_index >= 0:
        group_name = columns[summary_group_index]["name"]
        summary_buckets: dict[str, dict[str, Any]] = {}
        for row in metric_rows:
            key = str(row.get(group_name) or "").strip() or "(vazio)"
            bucket = summary_buckets.setdefault(key, {"label": key, "count": 0, "value": 0.0})
            bucket["count"] += 1
            bucket["value"] += float(row.get("metric_value") or 0)
        summary_rows = sorted(summary_buckets.values(), key=lambda item: item["count"], reverse=True)

    detail_items = _build_detail_items(metric_type, metric_rows, fields, columns)
    primary_metric = _build_primary_metric(metric_type, metric_total, metric_rows, fields, columns, metric_label)
    summary_payload = {
        "group_index": summary_group_index,
        "labels": [row["label"] for row in summary_rows],
        "rows": summary_rows,
        "totals": {
            "count": len(metric_rows),
            "value": metric_total,
        },
        "primary_metric": primary_metric,
    }

    dataset_context = {
        "rows": metric_rows,
        "aggregations": {
            "by_category": by_category,
            "by_date": by_date,
            "top_items": top_items,
            "distribution": distribution,
        },
        "summary": summary_payload,
        "kpis": _compute_kpis(payload_config, metric_rows, columns),
        "detail_items": detail_items,
        "validation": {
            "skipped_rows": skipped_rows,
        },
    }

    charts = _build_charts(payload_config, dataset_context)

    insights_input = [
        {
            **row,
            **(
                {"saving_percent": round(float(row.get("percent_value") or 0) * 100, 2)}
                if row.get("percent_value") is not None
                else {}
            ),
        }
        for row in metric_rows
    ]
    try:
        insights_result = generate_insights(insights_input)
        insights = insights_result.get("insights", [])
    except Exception:
        insights = []

    artifact = {
        "schemaVersion": SCHEMA_VERSION,
        "sourceHash": source_hash,
        "analysis": analysis,
        "validation": validation,
        "mapping": mapping,
        "dataset": metric_rows,
        "summary": summary_payload,
        "kpis": dataset_context["kpis"],
        "detail_items": detail_items,
        "metric": {
            "type": metric_type,
            "label": metric_label,
            "color": METRIC_META[metric_type]["color"],
            "value": metric_total,
            "unit": _metric_unit(metric_type),
            "formatted_value": primary_metric["formatted_value"],
            "breakdown": primary_metric.get("breakdown"),
        },
        "charts": charts,
        "insights": insights,
    }
    return artifact


def build_metric_report_data(data: Any, config: dict[str, Any] | None) -> dict[str, Any]:
    return _build_metric_artifact(data, config)


def build_metric_dataset(data: Any, config: dict[str, Any] | None) -> dict[str, Any]:
    artifact = _build_metric_artifact(data, config)
    return _public_metric_response(artifact)
