from pathlib import Path
import sys


sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.routers import reports
from app.services.metrics_engine import build_metric_report_data


def _sample_report_source():
    return {
        "cols": [
            {"name": "Fornecedor", "type": "category"},
            {"name": "Valor Base", "type": "monetary"},
            {"name": "Saving (%)", "type": "percent"},
            {"name": "Data", "type": "date"},
        ],
        "rows": [
            {"cells": ["Alpha", "1000", "10", "2026-01-10"]},
            {"cells": ["Beta", "2500.50", "4.2", "2026-02-15"]},
            {"cells": ["Alpha", "500", "6", "2026-02-28"]},
        ],
    }


def _sample_report_config():
    return {
        "groupCol": "0",
        "saving": {
            "metricType": "ECONOMIA",
            "baseCol": "1",
            "percentCol": "2",
            "categoryCol": "0",
            "dateCol": "3",
            "label": "Saving Total",
        },
        "kpis": [
            {"label": "Fornecedores", "col": "0", "fmt": "countuniq", "icon": "users", "color": "#2563eb"},
        ],
        "charts": {
            "g1": {"on": True, "source": "distribution", "title": "Distribuição", "type": "doughnut"},
            "g2": {"on": True, "source": "by_category", "title": "Por Categoria", "type": "bar"},
            "g3": {"on": True, "source": "by_date", "title": "Evolução", "type": "line"},
            "g4": {"on": True, "source": "top_items", "title": "Top Itens", "type": "hbar"},
        },
    }


def test_build_metric_report_data_returns_current_artifact_shape():
    artifact = build_metric_report_data(_sample_report_source(), _sample_report_config())

    assert artifact["schemaVersion"] == 1
    assert artifact["mapping"]["monetary"] == "Valor Base"
    assert artifact["mapping"]["percent"] == "Saving (%)"
    assert artifact["mapping"]["category"] == "Fornecedor"
    assert artifact["mapping"]["date"] == "Data"

    assert len(artifact["dataset"]) == 3
    assert artifact["dataset"][0]["Fornecedor"] == "Alpha"
    assert artifact["dataset"][0]["metric_value"] == 100.0
    assert round(artifact["dataset"][1]["metric_value"], 3) == 105.021
    assert artifact["dataset"][2]["metric_value"] == 30.0

    assert artifact["metric"]["value"] == 235.02
    assert artifact["metric"]["type"] == "ECONOMIA"
    assert artifact["summary"]["totals"]["count"] == 3
    assert artifact["summary"]["totals"]["value"] == 235.02


def test_build_metric_report_data_generates_kpis_charts_and_insights():
    artifact = build_metric_report_data(_sample_report_source(), _sample_report_config())

    assert len(artifact["kpis"]) == 1
    assert artifact["kpis"][0]["label"] == "Fornecedores"
    assert artifact["kpis"][0]["value"] == 2
    assert artifact["kpis"][0]["display"] == "2"

    assert len(artifact["charts"]) == 4
    assert [chart["source"] for chart in artifact["charts"]] == [
        "distribution",
        "by_category",
        "by_date",
        "top_items",
    ]
    assert [chart["title"] for chart in artifact["charts"]] == [
        "Distribuição de Saving Total",
        "Saving Total por Fornecedor",
        "Evolução Mensal de Saving Total",
        "Top 10 por Fornecedor",
    ]
    assert artifact["charts"][1]["sourceDescription"] == "Colunas: Fornecedor · Valor Base · Saving (%)"

    insight_titles = [item["titulo"] for item in artifact["insights"]]
    assert "Saving médio abaixo do benchmark" in insight_titles


def test_public_preview_response_exposes_current_report_payload():
    artifact = build_metric_report_data(_sample_report_source(), _sample_report_config())

    preview = reports._public_preview_response(artifact)

    assert set(preview.keys()) == {
        "analysis",
        "validation",
        "mapping",
        "dataset",
        "summary",
        "kpis",
        "detail_items",
        "metric",
        "charts",
        "insights",
    }
    assert len(preview["dataset"]) == 3
    assert len(preview["charts"]) == 4
    assert len(preview["kpis"]) == 1
    assert preview["metric"]["type"] == "ECONOMIA"
    assert preview["summary"]["primary_metric"]["label"] == "Saving Total"
