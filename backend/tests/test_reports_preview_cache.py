from pathlib import Path
import sys


sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.routers import reports


def test_preview_cache_key_changes_when_mapping_changes():
    source_hash = "abc"
    metric_type = "ECONOMIA"
    effective_config = {"metricType": metric_type, "mappingInputs": {}, "override": {"percent": "pct_b"}}
    mapping_a = {"monetary": "base", "percent": "pct_a", "category": None, "date": None, "score": None}
    mapping_b = {"monetary": "base", "percent": "pct_b", "category": None, "date": None, "score": None}

    key_a = reports._preview_cache_key(source_hash, metric_type, effective_config, mapping_a)
    key_b = reports._preview_cache_key(source_hash, metric_type, effective_config, mapping_b)

    assert key_a != key_b


def test_preview_cache_lookup_uses_effective_config_prefix():
    reports._PREVIEW_CACHE.clear()
    source_hash = "hash-1"
    metric_type = "ECONOMIA"
    config_a = {"metricType": metric_type, "mappingInputs": {}, "override": {"percent": "pct_a"}}
    config_b = {"metricType": metric_type, "mappingInputs": {}, "override": {"percent": "pct_b"}}
    mapping_a = {"monetary": "base", "percent": "pct_a", "category": None, "date": None, "score": None}
    mapping_b = {"monetary": "base", "percent": "pct_b", "category": None, "date": None, "score": None}
    key_a = reports._preview_cache_key(source_hash, metric_type, config_a, mapping_a)
    key_b = reports._preview_cache_key(source_hash, metric_type, config_b, mapping_b)
    reports._preview_cache_store(key_a, {"mapping": mapping_a, "validation": {"errors": [], "warnings": []}})
    reports._preview_cache_store(key_b, {"mapping": mapping_b, "validation": {"errors": [], "warnings": []}})

    prefix_a = f"{source_hash}:{metric_type}:{reports._stable_digest(config_a)}:"
    cached_a = reports._preview_cache_lookup(cache_key_prefix=prefix_a)

    assert cached_a is not None
    assert cached_a["mapping"]["percent"] == "pct_a"


def test_preview_effective_config_includes_selected_sheet_identity():
    config_a = {
        "saving": {"metricType": "TOTAL"},
        "selectedSheetName": "Resumo",
        "selectedSheetIndex": 0,
        "selectedSheetHash": "sheet_a",
    }
    config_b = {
        "saving": {"metricType": "TOTAL"},
        "selectedSheetName": "Dados",
        "selectedSheetIndex": 1,
        "selectedSheetHash": "sheet_b",
    }

    effective_a = reports._preview_effective_config(config_a)
    effective_b = reports._preview_effective_config(config_b)

    assert effective_a["sheet"] == {
        "selectedSheetName": "Resumo",
        "selectedSheetIndex": 0,
        "selectedSheetHash": "sheet_a",
    }
    assert effective_b["sheet"]["selectedSheetHash"] == "sheet_b"
    assert reports._stable_digest(effective_a) != reports._stable_digest(effective_b)
