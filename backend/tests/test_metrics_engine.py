from pathlib import Path
import math
import sys

import pytest


sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.metrics_engine import (  # noqa: E402
    MetricsValidationError,
    build_metric_dataset,
    parse_number,
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
    assert parse_number("1234.56") == 1234.56
    assert parse_number("R$ 1.234,56") == 1234.56
    assert parse_number("26%", is_percent=True) == 0.26
    assert parse_number("0.26", is_percent=True) == 0.26


def test_parse_number_edge_cases():
    assert parse_number(None) is None
    assert parse_number("") is None
    assert parse_number("abc") is None
    assert parse_number("  ") is None


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

    assert result["metric"]["value"] == 100.0
    assert result["charts"]
    assert result["charts"][0]["labels"] == result["dataset"]["aggregations"]["by_category"]["labels"]
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

    assert result["metric"]["value"] == 4000.5
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

    assert math.isfinite(result["metric"]["value"])
    assert result["metric"]["value"] == 50.0
    _assert_all_numbers_finite(result)


def test_taxa_and_volume_metrics():
    taxa_data = {
        "cols": [
            {"name": "Categoria", "type": "text"},
        ],
        "rows": [
            {"cells": ["A"]},
            {"cells": ["A"]},
            {"cells": ["B"]},
        ],
    }
    taxa_config = _base_config("TAXA", categoryCol="0")
    taxa_result = build_metric_dataset(taxa_data, taxa_config)

    assert taxa_result["metric"]["value"] == 100.0
    assert taxa_result["charts"][0]["labels"] == taxa_result["dataset"]["aggregations"]["by_category"]["labels"]

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

    assert volume_result["metric"]["value"] == 3.0
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

    assert result["metric"]["value"] == 200.0
    assert result["dataset"]["validation"]["skipped_rows"] == 2
    _assert_all_numbers_finite(result)
