from pathlib import Path
import sys
import unittest


sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.routers.reports import _build_tabular_data_from_config, _enrich_report_config_with_insights


class ReportsInsightsIntegrationTestCase(unittest.TestCase):
    def test_build_tabular_data_from_config_maps_cols_and_rows(self):
        config = {
            "cols": [
                {"name": "Saving (%)"},
                {"name": "Conformidade"},
            ],
            "rows": [
                {"cells": [11.76, "Não"]},
                {"cells": [5.54, "Sim"]},
            ],
        }

        result = _build_tabular_data_from_config(config)

        self.assertEqual(
            result,
            [
                {"Saving (%)": 11.76, "Conformidade": "Não"},
                {"Saving (%)": 5.54, "Conformidade": "Sim"},
            ],
        )

    def test_build_tabular_data_from_config_calculates_saving_from_config(self):
        config = {
            "cols": [
                {"name": "Fornecedor"},
                {"name": "Valor Base"},
                {"name": "Saving (%)"},
            ],
            "rows": [
                {"cells": ["Alpha", "1000", "10"]},
                {"cells": ["Beta", "2500,50", "4,2"]},
            ],
            "saving": {
                "savingBaseCol": "1",
                "savingPercentCol": "2",
            },
        }

        result = _build_tabular_data_from_config(config)

        self.assertEqual(result[0]["saving_calculado"], 100.0)
        self.assertAlmostEqual(result[1]["saving_calculado"], 105.021, places=3)

    def test_enrich_report_config_with_insights_adds_payload(self):
        config = {
            "cols": [{"name": "Saving (%)"}],
            "rows": [{"cells": [5.0]}, {"cells": [6.0]}, {"cells": [4.0]}],
        }

        result = _enrich_report_config_with_insights(config)

        self.assertIn("insights", result)
        self.assertIn("insightsMeta", result)
        self.assertEqual(result["insightsMeta"]["record_count"], 3)
        self.assertTrue(any(item["titulo"] == "Saving médio abaixo do benchmark" for item in result["insights"]))


if __name__ == "__main__":
    unittest.main()
