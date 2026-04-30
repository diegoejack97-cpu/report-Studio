from pathlib import Path
import math
import sys

import pytest


sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.metrics_engine import (  # noqa: E402
    MetricsValidationError,
    build_metric_dataset,
    build_metric_report_data,
    normalize_percent,
    parse_number,
    resolve_source_hash,
)


def _assert_all_numbers_finite(value):
    if isinstance(value, dict):
        for item in value.values():
            _assert_all_numbers_finite(item)
    elif isinstance(value, list):
        for item in value:
            _assert_all_numbers_finite(item)
    elif isinstance(value, float):
        assert math.isfinite(value)
    elif isinstance(value, int):
        assert math.isfinite(float(value))


def _base_config(metric_type="ECONOMIA", **saving_overrides):
    config = {
        "saving": {
            "metricType": metric_type,
            "baseCol": "0",
            "percentCol": "1",
            "valueCol": "0",
            "initialCol": "0",
            "finalCol": "1",
            "categoryCol": "0",
            "label": "Saving Total",
            **saving_overrides,
        },
        "charts": {
            "g1": {"on": True, "title": "Categoria", "type": "pie"},
            "g2": {"on": True, "title": "Distribuição", "type": "bar"},
            "g3": {"on": True, "title": "Linha do Tempo", "type": "line"},
            "g4": {"on": True, "title": "Top Itens", "type": "hbar"},
        },
    }
    if metric_type == "TOTAL":
        config["saving"]["valueCol"] = "0"
    if metric_type == "VARIACAO":
        config["saving"]["initialCol"] = "0"
        config["saving"]["finalCol"] = "1"
    if metric_type == "TAXA":
        config["saving"]["categoryCol"] = "0"
    return config


def _economia_data():
    return {
        "cols": [
            {"name": "Base", "type": "monetary"},
            {"name": "Pct", "type": "percent"},
            {"name": "Categoria", "type": "text"},
            {"name": "Mes", "type": "date"},
        ],
        "rows": [
            {"cells": ["1000", "10%", "A", "01/2026"]},
            {"cells": ["500", "20%", "B", "02/2026"]},
            {"cells": ["abc", "20%", "C", "03/2026"]},
            {"cells": [None, "", "", ""]},
        ],
    }


def test_parse_number_formats():
    assert parse_number("1.234,56") == 1234.56
    assert parse_number("1.000.000,00") == 1000000.0
    assert parse_number("1234.56") == 1234.56
    assert parse_number("R$ 1.234,56") == 1234.56
    assert parse_number("26%", is_percent=True) == 0.26
    assert parse_number("0.26", is_percent=True) == 0.26
    assert normalize_percent(26) == 0.26
    assert normalize_percent(0.26) == 0.26


def test_parse_number_edge_cases():
    assert parse_number(None) is None
    assert parse_number("") is None
    assert parse_number("abc") is None
    assert parse_number("  ") is None
    assert parse_number("1.000.000") is None
    assert parse_number("abc123") is None


def test_economia_metric_uses_base_times_percent():
    data = {
        "cols": [
            {"name": "Base", "type": "monetary"},
            {"name": "Pct", "type": "percent"},
        ],
        "rows": [
            {"cells": ["1000", "10%"]},
        ],
    }
    config = _base_config("ECONOMIA", baseCol="0", percentCol="1")

    result = build_metric_dataset(data, config)

    assert result["mapping"]["monetary"] == "Base"
    assert result["mapping"]["percent"] == "Pct"
    assert result["dataset"][0]["metric_value"] == 100.0
    assert result["charts"]
    assert result["analysis"]["columns"]["Base"]["kind"] == "monetary"
    assert result["analysis"]["columns"]["Pct"]["kind"] == "percent"
    _assert_all_numbers_finite(result)


def test_total_metric_sums_values():
    data = {
        "cols": [
            {"name": "Valor", "type": "monetary"},
        ],
        "rows": [
            {"cells": ["1000"]},
            {"cells": ["2500,50"]},
            {"cells": ["500"]},
        ],
    }
    config = _base_config("TOTAL", valueCol="0")

    result = build_metric_dataset(data, config)

    assert sum(row["metric_value"] for row in result["dataset"]) == 4000.5
    _assert_all_numbers_finite(result)


def test_variacao_handles_division_by_zero():
    data = {
        "cols": [
            {"name": "Inicial", "type": "monetary"},
            {"name": "Final", "type": "monetary"},
        ],
        "rows": [
            {"cells": ["0", "50"]},
            {"cells": ["100", "150"]},
        ],
    }
    config = _base_config("VARIACAO", initialCol="0", finalCol="1")

    result = build_metric_dataset(data, config)

    metric_total = sum(row["metric_value"] for row in result["dataset"])
    assert math.isfinite(metric_total)
    assert metric_total == 50.0
    _assert_all_numbers_finite(result)


def test_taxa_and_volume_metrics():
    taxa_data = {
        "cols": [
            {"name": "Categoria", "type": "category"},
        ],
        "rows": [
            {"cells": ["A"]},
            {"cells": ["A"]},
            {"cells": ["B"]},
        ],
    }
    taxa_config = _base_config("TAXA", categoryCol="0")
    taxa_result = build_metric_dataset(taxa_data, taxa_config)

    assert sum(row["metric_value"] for row in taxa_result["dataset"]) == 100.0
    assert taxa_result["mapping"]["category"] == "Categoria"

    volume_data = {
        "cols": [
            {"name": "Categoria", "type": "text"},
        ],
        "rows": [
            {"cells": ["A"]},
            {"cells": ["B"]},
            {"cells": ["C"]},
        ],
    }
    volume_config = _base_config("VOLUME")
    volume_config["saving"] = {"metricType": "VOLUME", "label": "Volume"}
    volume_result = build_metric_dataset(volume_data, volume_config)

    assert sum(row["metric_value"] for row in volume_result["dataset"]) == 3.0
    _assert_all_numbers_finite(volume_result)


@pytest.mark.parametrize(
    "data, config, expected_field",
    [
        (
            {
                "cols": [
                    {"name": "A", "type": "monetary"},
                    {"name": "B", "type": "percent"},
                ],
                "rows": [{"cells": ["1", "2"]}],
            },
            {"saving": {"metricType": "TOTAL", "valueCol": "9"}},
            "valueCol",
        ),
        (
            {
                "cols": [
                    {"name": "Texto", "type": "text"},
                    {"name": "Valor", "type": "monetary"},
                ],
                "rows": [{"cells": ["abc", "100"]}],
            },
            {"saving": {"metricType": "TOTAL", "valueCol": "0"}},
            "valueCol",
        ),
        (
            {
                "cols": [
                    {"name": "A", "type": "monetary"},
                    {"name": "B", "type": "percent"},
                ],
                "rows": [{"cells": ["1", "2"]}],
            },
            {"saving": {"metricType": "ECONOMIA", "baseCol": "0"}},
            "saving",
        ),
        (
            {
                "cols": [
                    {"name": "A", "type": "monetary"},
                    {"name": "B", "type": "monetary"},
                ],
                "rows": [{"cells": ["1", "2"]}],
            },
            {"saving": {"metricType": "VARIACAO", "initialCol": "0"}},
            "saving",
        ),
        (
            {
                "cols": [
                    {"name": "A", "type": "text"},
                    {"name": "B", "type": "text"},
                ],
                "rows": [{"cells": ["1", "2"]}],
            },
            {"saving": {"metricType": "TAXA"}},
            "categoryCol",
        ),
    ],
)
def test_invalid_config_raises_validation_error(data, config, expected_field):
    with pytest.raises(MetricsValidationError) as exc_info:
        build_metric_dataset(data, config)

    assert exc_info.value.field == expected_field


def test_invalid_column_type_raises_validation_error():
    data = {
        "cols": [
            {"name": "Texto", "type": "text"},
            {"name": "Valor", "type": "monetary"},
        ],
        "rows": [{"cells": ["abc", "100"]}],
    }
    config = {
        "saving": {
            "metricType": "TOTAL",
            "valueCol": "0",
        }
    }

    with pytest.raises(MetricsValidationError) as exc_info:
        build_metric_dataset(data, config)

    assert exc_info.value.field == "valueCol"


def test_number_columns_are_rejected_for_typed_metric_fields():
    data = {
        "cols": [
            {"name": "Base", "type": "number"},
            {"name": "Pct", "type": "number"},
        ],
        "rows": [
            {"cells": ["1000", "10%"]},
        ],
    }
    config = _base_config("ECONOMIA", baseCol="0", percentCol="1")

    with pytest.raises(MetricsValidationError) as exc_info:
        build_metric_dataset(data, config)

    assert exc_info.value.field == "baseCol"
    assert exc_info.value.expected == "monetary"


def test_missing_aggregation_for_chart_raises_structured_error():
    data = {
        "cols": [
            {"name": "Base", "type": "monetary"},
            {"name": "Pct", "type": "percent"},
        ],
        "rows": [{"cells": ["1000", "10%"]}],
    }
    config = {
        "saving": {
            "metricType": "ECONOMIA",
            "baseCol": "0",
            "percentCol": "1",
        },
        "charts": {
            "g1": {"on": True, "title": "Inválido", "type": "pie", "source": "missing_source"},
        },
    }

    with pytest.raises(MetricsValidationError) as exc_info:
        build_metric_dataset(data, config)

    assert exc_info.value.code == "missing_aggregation"


def test_mixed_and_missing_values_do_not_create_nan_or_infinity():
    result = build_metric_dataset(_economia_data(), _base_config("ECONOMIA", baseCol="0", percentCol="1"))

    assert sum(row["metric_value"] for row in result["dataset"]) == 200.0
    _assert_all_numbers_finite(result)


def test_economia_percent_values_are_normalized_to_fraction():
    data = {
        "cols": [
            {"name": "Base", "type": "monetary"},
            {"name": "Pct", "type": "percent"},
        ],
        "rows": [
            {"cells": ["1000", "37"]},
            {"cells": ["1000", "0.37"]},
        ],
    }
    config = _base_config("ECONOMIA", baseCol="0", percentCol="1")

    result = build_metric_dataset(data, config)
    artifact = build_metric_report_data(data, config)

    assert sum(row["metric_value"] for row in result["dataset"]) == 740.0
    assert all(math.isclose(row["percent_value"], 0.37) for row in result["dataset"])
    assert all(math.isclose(row["metric_value"], 370.0) for row in result["dataset"])
    assert all("aux_value" not in row for row in result["dataset"])
    assert all("saving (%)" not in row for row in result["dataset"])
    assert artifact["schemaVersion"] == 1
    assert artifact["sourceHash"] == resolve_source_hash(data, config)


def test_metric_report_data_contains_persisted_metadata():
    data = {
        "cols": [
            {"name": "valor_pago", "type": "monetary"},
            {"name": "saving_percent", "type": "percent"},
            {"name": "fornecedor", "type": "text"},
        ],
        "rows": [
            {"cells": ["1000", "15", "A"]},
            {"cells": ["500", "0.2", "B"]},
        ],
    }
    config = _base_config("ECONOMIA", baseCol="0", percentCol="1", categoryCol="2")

    artifact = build_metric_report_data(data, config)

    assert artifact["schemaVersion"] == 1
    assert artifact["sourceHash"] == resolve_source_hash(data, config)
    assert artifact["mapping"] == {
        "monetary": "valor_pago",
        "percent": "saving_percent",
        "category": "fornecedor",
        "date": None,
        "score": None,
    }
    assert artifact["analysis"]["columns"]["saving_percent"]["kind"] == "percent"
    assert "Possível inconsistência de unidade percentual" in artifact["analysis"]["columns"]["saving_percent"]["warnings"]


def test_auto_mapping_takes_precedence_over_manual_config():
    data = {
        "cols": [
            {"name": "valor_pago", "type": "monetary"},
            {"name": "saving_percent", "type": "percent"},
            {"name": "percent_manual", "type": "percent"},
        ],
        "rows": [
            {"cells": ["1000", "15", "99"]},
        ],
    }
    config = {
        "saving": {
            "metricType": "ECONOMIA",
            "baseCol": "0",
            "percentCol": "2",
        }
    }

    result = build_metric_dataset(data, config)

    assert result["mapping"]["monetary"] == "valor_pago"
    assert result["mapping"]["percent"] == "saving_percent"
    assert result["dataset"][0]["percent_value"] == 0.15


def test_low_confidence_classification_emits_warning():
    data = {
        "cols": [
            {"name": "descricao", "type": "text"},
        ],
        "rows": [
            {"cells": ["A"]},
            {"cells": ["B"]},
        ],
    }
    config = {"saving": {"metricType": "VOLUME"}}

    result = build_metric_dataset(data, config)

    assert any(
        "Baixa confiança na classificação da coluna 'descricao'" in warning
        for warning in result["validation"]["warnings"]
    )
    assert any(
        "Baixa confiança na classificação da coluna 'descricao'" in warning
        for warning in result["analysis"]["columns"]["descricao"]["warnings"]
    )


def test_score_is_not_classified_as_percent():
    data = {
        "cols": [
            {"name": "score_risco", "type": "number"},
            {"name": "valor_pago", "type": "monetary"},
        ],
        "rows": [
            {"cells": ["82", "1000"]},
            {"cells": ["91", "1500"]},
        ],
    }
    config = {"saving": {"metricType": "TOTAL"}}

    result = build_metric_dataset(data, config)

    assert result["analysis"]["columns"]["score_risco"]["kind"] == "score"
    assert result["mapping"]["percent"] is None


def test_report_data_helper_validates_persisted_payload():
    from app.routers.reports import _report_data_ready_for_export  # noqa: PLC0415

    assert _report_data_ready_for_export({"schemaVersion": 1, "sourceHash": "abc"})
    assert not _report_data_ready_for_export({"schemaVersion": 1})
    assert not _report_data_ready_for_export(None)
