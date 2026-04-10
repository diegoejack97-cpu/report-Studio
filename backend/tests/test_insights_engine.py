from pathlib import Path
import importlib.util
import sys
import unittest


sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

MODULE_PATH = Path(__file__).resolve().parents[1] / "app" / "services" / "insights_engine.py"
SPEC = importlib.util.spec_from_file_location("insights_engine", MODULE_PATH)
INSIGHTS_ENGINE = importlib.util.module_from_spec(SPEC)
assert SPEC is not None and SPEC.loader is not None
SPEC.loader.exec_module(INSIGHTS_ENGINE)
generate_insights = INSIGHTS_ENGINE.generate_insights


class InsightsEngineTestCase(unittest.TestCase):
    def test_empty_dataset_returns_dataset_alert(self):
        result = generate_insights([])
        self.assertEqual(result["meta"]["record_count"], 0)
        self.assertEqual(len(result["insights"]), 1)
        self.assertEqual(result["insights"][0]["titulo"], "Dataset vazio ou insuficiente")

    def test_low_saving_triggers_rule(self):
        data = [
            {"Saving (%)": 5.0},
            {"Saving (%)": 4.0},
            {"Saving (%)": 6.0},
        ]
        result = generate_insights(data)
        titles = [item["titulo"] for item in result["insights"]]
        self.assertIn("Saving médio abaixo do benchmark", titles)

    def test_healthy_saving_does_not_trigger_rule(self):
        data = [
            {"Saving (%)": 15.0},
            {"Saving (%)": 14.0},
            {"Saving (%)": 16.0},
        ]
        result = generate_insights(data)
        titles = [item["titulo"] for item in result["insights"]]
        self.assertNotIn("Saving médio abaixo do benchmark", titles)

    def test_non_compliance_above_threshold_triggers_rule(self):
        data = [
            {"Conformidade": "Não"},
            {"Conformidade": "nao"},
            {"Conformidade": "Não"},
            {"Conformidade": "Sim"},
            {"Conformidade": "Não"},
        ]
        result = generate_insights(data)
        titles = [item["titulo"] for item in result["insights"]]
        self.assertIn("Não conformidade acima do limite", titles)

    def test_non_compliance_below_threshold_does_not_trigger_rule(self):
        data = [
            {"Conformidade": "Não"},
            {"Conformidade": "Sim"},
            {"Conformidade": "Sim"},
            {"Conformidade": "Sim"},
        ]
        result = generate_insights(data)
        titles = [item["titulo"] for item in result["insights"]]
        self.assertNotIn("Não conformidade acima do limite", titles)

    def test_alias_resolution_is_case_insensitive_for_conformidade(self):
        data = [{"Conformidade": "Não"}, {"Conformidade": "Não"}, {"Conformidade": "Sim"}]
        result = generate_insights(data)
        self.assertTrue(any(item["titulo"] == "Não conformidade acima do limite" for item in result["insights"]))

    def test_alias_resolution_for_saving_percent_with_space(self):
        data = [{"Saving (%)": 8.0}, {"Saving (%)": 9.0}, {"Saving (%)": 7.0}]
        result = generate_insights(data)
        self.assertTrue(any(item["titulo"] == "Saving médio abaixo do benchmark" for item in result["insights"]))

    def test_outlier_financial_rule_triggers(self):
        data = [
            {"valor pago": 100.0},
            {"valor pago": 100.0},
            {"valor pago": 100.0},
            {"valor pago": 1000.0},
        ]
        result = generate_insights(data)
        titles = [item["titulo"] for item in result["insights"]]
        self.assertIn("Outliers financeiros identificados", titles)

    def test_insights_are_sorted_by_severity(self):
        data = [
            {"Saving (%)": 5.0, "categoria": "A", "Conformidade": "Não", "status": "cancelado"},
            {"Saving (%)": 5.0, "categoria": "A", "Conformidade": "Não", "status": "cancelado"},
            {"Saving (%)": 5.0, "categoria": "A", "Conformidade": "Sim", "status": "ativo"},
            {"Saving (%)": 5.0, "categoria": "B", "Conformidade": "Não", "status": "ativo"},
            {"Saving (%)": 5.0, "categoria": "A", "Conformidade": "Não", "status": "ativo"},
        ]
        result = generate_insights(data)
        severities = [item["severidade"] for item in result["insights"]]
        severity_order = {"alta": 0, "media": 1, "baixa": 2}
        numeric_order = [severity_order[value] for value in severities]
        self.assertEqual(numeric_order, sorted(numeric_order))


if __name__ == "__main__":
    unittest.main()
