import copy
import json
import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "pipeline"))

from p2p3_common import SUPPORTED_LINEAGE_EDGE_TYPES, lineage_contract, validate_lineage_exchange  # noqa: E402


def read_fixture():
    return json.loads((ROOT / "data/candidates/government_lineage_contract_fixture.json").read_text(encoding="utf-8"))


class LineageContractTest(unittest.TestCase):
    def test_fixture_covers_supported_lineage_relations(self):
        result = validate_lineage_exchange(read_fixture())

        self.assertEqual(result["contract_status"], "pass")
        self.assertEqual(set(result["relation_counts"]), set(SUPPORTED_LINEAGE_EDGE_TYPES))
        self.assertTrue(all(result["relation_counts"][edge_type] == 1 for edge_type in SUPPORTED_LINEAGE_EDGE_TYPES))

    def test_contract_fixture_does_not_claim_real_government_import(self):
        report = lineage_contract()

        self.assertEqual(report["status"], "partial")
        self.assertEqual(report["government_lineage_real_import"], "blocked")
        self.assertEqual(report["dataset_status"], "contract_fixture")
        self.assertIn("contract fixture passed", report["honesty_note"])

    def test_conflicts_with_requires_manual_review(self):
        result = validate_lineage_exchange(read_fixture())

        self.assertEqual(
            result["human_review_required"],
            [{"lineage_id": "lineage:fixture:conflicts-with-001", "reason": "conflicts_with 不自动迁移引用"}],
        )
        conflict_edge = next(edge for edge in result["edge_preview"] if edge["edge_type"] == "conflicts_with")
        self.assertEqual(conflict_edge["attrs"]["migration_policy"], "manual_review_required")

    def test_raw_law_text_fields_are_rejected(self):
        exchange = read_fixture()
        exchange["records"][0]["full_text"] = "这里不应出现法规全文"

        result = validate_lineage_exchange(exchange)

        self.assertEqual(result["contract_status"], "fail")
        self.assertTrue(any("forbidden raw text fields" in error for error in result["errors"]))

    def test_government_confirmed_dataset_can_be_ready(self):
        exchange = copy.deepcopy(read_fixture())
        exchange["dataset_status"] = "government_confirmed"
        exchange["authority"] = "government-confirmed-fixture"
        for record in exchange["records"]:
            record["status"] = "government_confirmed"
            record["review_status"] = "HUMAN_REVIEWED"

        result = validate_lineage_exchange(exchange)

        self.assertEqual(result["contract_status"], "pass")
        self.assertEqual(result["government_lineage_real_import"], "ready")
        confirmed_edge = result["edge_preview"][0]
        self.assertEqual(confirmed_edge["confidence_reason"], ["GOVERNMENT_CONFIRMED"])
        self.assertEqual(confirmed_edge["reviewer_role"], "GOVERNMENT")


if __name__ == "__main__":
    unittest.main()
