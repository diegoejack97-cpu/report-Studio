from __future__ import annotations

from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import datetime, timezone
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


def parse_number(value: Any, *, is_percent: bool = False) -> float | None:
    if value is None or isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        parsed = float(value)
        if is_percent and abs(parsed) > 1:
            return parsed / 100
        return parsed

    text = _strip_numeric_tokens(str(value).strip())
    if not text:
        return None

    if "," in text and "." in text:
        if text.rfind(",") > text.rfind("."):
            text = text.replace(".", "").replace(",", ".")
        else:
            text = text.replace(",", "")
    elif "," in text:
        if re.search(r",\d{1,2}$", text):
            text = text.replace(".", "").replace(",", ".")
        else:
            text = text.replace(",", "")
    elif text.count(".") > 1:
        text = text.replace(".", "")

    try:
        parsed = float(text)
    except ValueError:
        return None

    if is_percent and abs(parsed) > 1:
        return parsed / 100
    return parsed


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
    if received == expected:
        return

    # The frontend still labels uploaded numeric columns as "number".
    # Treat that legacy value as compatible with numeric metric fields.
    if received == "number" and expected in {"monetary", "percent"}:
        return

    if received != expected:
        raise MetricsValidationError(
            f"A coluna selecionada para {field} não é compatível com a métrica.",
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
    if limit is not None:
        entries = entries[:limit]
    return {
        "labels": [key for key, _ in entries],
        "data": [round(float(value), 2) for _, value in entries],
    }


def _build_distribution(values: list[float]) -> dict[str, list[Any]]:
    clean = [value for value in values if isinstance(value, (int, float)) and math.isfinite(value)]
    if not clean:
        return {"labels": [], "data": []}
    if len(clean) == 1:
        return {"labels": ["Único"], "data": [1]}

    minimum = min(clean)
    maximum = max(clean)
    if minimum == maximum:
        return {"labels": [f"{minimum:.2f}"], "data": [len(clean)]}

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

    return {"labels": labels, "data": buckets}


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
    default_sources = {
        0: "by_category",
        1: "distribution",
        2: "by_date",
        3: "top_items",
    }
    return default_sources.get(index, "")


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


def _build_detail_items(metric_type: str, metric_rows: list[dict[str, Any]], fields: dict[str, int], columns: list[dict[str, Any]]) -> list[dict[str, Any]]:
    if metric_type == "ECONOMIA":
        if fields.get("base", -1) >= 0 and fields.get("percent", -1) >= 0:
            base_name = columns[fields["base"]]["name"]
            percent_name = columns[fields["percent"]]["name"]
            base_total = round(_sum(float(row.get(base_name) or 0) for row in metric_rows), 2)
            percent_avg = round(_mean([float(row.get("saving (%)") or 0) for row in metric_rows]), 2)
            return [
                {"kind": "currency", "label": columns[fields["base"]]["name"], "value": base_total},
                {"kind": "percent", "label": columns[fields["percent"]]["name"], "value": percent_avg, "accent": True},
            ]
        if fields.get("initial", -1) >= 0 and fields.get("final", -1) >= 0:
            initial_name = columns[fields["initial"]]["name"]
            final_name = columns[fields["final"]]["name"]
            initial_total = round(_sum(float(row.get(initial_name) or 0) for row in metric_rows), 2)
            final_total = round(_sum(float(row.get(final_name) or 0) for row in metric_rows), 2)
            return [
                {"kind": "currency", "label": columns[fields["initial"]]["name"], "value": initial_total},
                {"kind": "currency", "label": columns[fields["final"]]["name"], "value": final_total, "accent": True},
            ]
    if metric_type == "TOTAL":
        return [{"kind": "currency", "label": columns[fields["value"]]["name"], "value": round(_sum(float(row.get(columns[fields["value"]]["name"]) or 0) for row in metric_rows), 2)}]
    if metric_type == "VARIACAO":
        initial_name = columns[fields["initial"]]["name"]
        final_name = columns[fields["final"]]["name"]
        initial_total = round(_sum(float(row.get(initial_name) or 0) for row in metric_rows), 2)
        final_total = round(_sum(float(row.get(final_name) or 0) for row in metric_rows), 2)
        return [
            {"kind": "currency", "label": initial_name, "value": initial_total},
            {"kind": "currency", "label": final_name, "value": final_total, "accent": True},
        ]
    if metric_type == "TAXA":
        return [{"kind": "percent", "label": METRIC_META[metric_type]["label"], "value": round(_sum(float(row.get("metric_value") or 0) for row in metric_rows), 2)}]
    return [{"kind": "number", "label": METRIC_META[metric_type]["label"], "value": round(_sum(float(row.get("metric_value") or 0) for row in metric_rows), 2)}]


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


def _validate_metric_config(metric_type: str, fields: dict[str, int], columns: list[dict[str, Any]]) -> None:
    if metric_type == "ECONOMIA":
        if fields.get("base", -1) >= 0 and fields.get("percent", -1) >= 0:
            _validate_column_type("Base Monetária", columns[fields["base"]], "monetary")
            _validate_column_type("Percentual", columns[fields["percent"]], "percent")
            return
        if fields.get("initial", -1) >= 0 and fields.get("final", -1) >= 0:
            _validate_column_type("Valor inicial", columns[fields["initial"]], "monetary")
            _validate_column_type("Valor final", columns[fields["final"]], "monetary")
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
        _validate_column_type("Coluna monetária", columns[value_idx], "monetary")
        return
    if metric_type == "VARIACAO":
        if fields.get("initial", -1) < 0 or fields.get("final", -1) < 0:
            raise MetricsValidationError(
                "A métrica VARIAÇÃO precisa de coluna inicial e final.",
                field="saving",
                expected="initial+final",
            )
        _validate_column_type("Coluna inicial", columns[fields["initial"]], "monetary")
        _validate_column_type("Coluna final", columns[fields["final"]], "monetary")
        return
    if metric_type == "TAXA":
        if fields.get("category", -1) < 0:
            raise MetricsValidationError(
                "A métrica TAXA precisa de uma coluna de categoria.",
                field="categoryCol",
                expected="category",
            )


def build_metric_dataset(data: Any, config: dict[str, Any] | None) -> dict[str, Any]:
    rows, cols, payload_config = _resolve_payload(data, config)
    metric_type = normalize_metric_type((payload_config.get("saving") or {}).get("metricType") if isinstance(payload_config.get("saving"), dict) else payload_config.get("metricType"))
    columns = _normalize_columns(cols)
    fields = _metric_field_config(payload_config, columns, metric_type)
    _validate_metric_config(metric_type, fields, columns)

    named_rows = [_build_named_row(row, columns, index) for index, row in enumerate(rows)]

    category_idx = _resolve_column_index((payload_config.get("saving") or {}).get("categoryCol") if isinstance(payload_config.get("saving"), dict) else payload_config.get("categoryCol"), columns)
    entity_idx = _resolve_column_index((payload_config.get("saving") or {}).get("entityCol") if isinstance(payload_config.get("saving"), dict) else payload_config.get("entityCol"), columns)
    date_idx = _resolve_column_index((payload_config.get("saving") or {}).get("dateCol") if isinstance(payload_config.get("saving"), dict) else payload_config.get("dateCol"), columns)

    metric_rows: list[dict[str, Any]] = []
    skipped_rows = 0

    for row in named_rows:
        category_value = str(row.get(columns[category_idx]["name"]) or "(sem categoria)") if category_idx >= 0 else "(sem categoria)"
        entity_value = str(row.get(columns[entity_idx]["name"]) or category_value) if entity_idx >= 0 else category_value
        date_value = row.get(columns[date_idx]["name"]) if date_idx >= 0 else None
        date_bucket = _parse_date_bucket(date_value)

        metric_value: float | None = None
        aux_value: float | None = None
        formula = ""

        if metric_type == "ECONOMIA":
            if fields.get("base", -1) >= 0 and fields.get("percent", -1) >= 0:
                base_value = parse_number(row.get(columns[fields["base"]]["name"]))
                percent_value = parse_number(row.get(columns[fields["percent"]]["name"]), is_percent=True)
                if base_value is None or percent_value is None:
                    skipped_rows += 1
                    continue
                metric_value = base_value * percent_value
                aux_value = percent_value
                formula = "percent_x_base"
                row["saving (%)"] = percent_value * 100 if abs(percent_value) <= 1 else percent_value
            else:
                initial_value = parse_number(row.get(columns[fields["initial"]]["name"]))
                final_value = parse_number(row.get(columns[fields["final"]]["name"]))
                if initial_value is None or final_value is None:
                    skipped_rows += 1
                    continue
                metric_value = initial_value - final_value
                aux_value = final_value
                formula = "original_minus_final"
        elif metric_type == "TOTAL":
            value = parse_number(row.get(columns[fields["value"]]["name"]))
            if value is None:
                skipped_rows += 1
                continue
            metric_value = value
            aux_value = value
            formula = "sum"
        elif metric_type == "VARIACAO":
            initial_value = parse_number(row.get(columns[fields["initial"]]["name"]))
            final_value = parse_number(row.get(columns[fields["final"]]["name"]))
            if initial_value is None or final_value is None:
                skipped_rows += 1
                continue
            metric_value = ((final_value - initial_value) / initial_value) * 100 if initial_value else 0.0
            if not math.isfinite(metric_value):
                metric_value = 0.0
            aux_value = final_value - initial_value
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
                "aux_value": aux_value,
                "formula": formula,
            }
        )

    if metric_type == "TAXA":
        counts = Counter(row["category"] for row in metric_rows)
        total = sum(counts.values()) or 1
        for row in metric_rows:
            row["metric_value"] = round((counts[row["category"]] / total) * 100, 2)

    metric_total = round(_sum(row["metric_value"] for row in metric_rows), 2)
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

    metric_label = str(((payload_config.get("saving") or {}) if isinstance(payload_config.get("saving"), dict) else payload_config).get("label") or METRIC_META[metric_type]["label"])
    metric = {
        "type": metric_type,
        "value": metric_total,
        "label": metric_label,
        "color": METRIC_META[metric_type]["color"],
    }

    dataset = {
        "rows": metric_rows,
        "aggregations": {
            "by_category": by_category,
            "by_date": by_date,
            "top_items": top_items,
            "distribution": distribution,
        },
        "summary": {
            "group_index": summary_group_index,
            "labels": [row["label"] for row in summary_rows],
            "rows": summary_rows,
            "totals": {
                "count": len(metric_rows),
                "value": metric_total,
            },
        },
        "kpis": _compute_kpis(payload_config, metric_rows, columns),
        "detail_items": _build_detail_items(metric_type, metric_rows, fields, columns),
        "validation": {
            "skipped_rows": skipped_rows,
        },
    }

    charts = _build_charts(payload_config, dataset)

    insights_input = [row for row in metric_rows]
    try:
        insights_result = generate_insights(insights_input)
        insights = insights_result.get("insights", [])
    except Exception:
        insights = []

    return {
        "metric": metric,
        "dataset": dataset,
        "charts": charts,
        "insights": insights,
    }
