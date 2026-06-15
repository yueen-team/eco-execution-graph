import json
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "pipeline"))

from upstream_visibility import build_visibility_summary, write_visibility_outputs  # noqa: E402


def write_json(path: Path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


class UpstreamVisibilitySummaryTest(unittest.TestCase):
    def test_builds_summary_from_upstream_import_and_utilization_report(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            base = Path(temp_dir)
            import_path = base / "eco-kb-import.json"
            utilization_path = base / "upstream-utilization-report.json"
            output_path = base / "public" / "upstream-visibility.json"
            report_json_path = base / "reports" / "upstream-visibility-dashboard.json"
            report_md_path = base / "reports" / "upstream-visibility-dashboard.md"
            write_json(
                import_path,
                {
                    "graph": {
                        "nodes": [
                            {
                                "node_id": "scenario:demo",
                                "node_type": "process_scenario",
                                "name": "合成演示场景",
                                "tier": "shared",
                                "review_status": "APPROVED_BASELINE",
                                "source_ref": "src:demo",
                            },
                            {
                                "node_id": "issue:demo",
                                "node_type": "issue_type",
                                "name": "合成问题类型",
                                "tier": "shared",
                                "review_status": "CANDIDATE",
                                "source_ref": "src:demo",
                            },
                        ],
                        "edges": [{"edge_id": "edge:demo", "edge_type": "manifests_as", "tier": "shared"}],
                        "sources": [
                            {
                                "source_id": "src:demo",
                                "source_type": "approved_baseline",
                                "origin_repo": "coco830/eco-semantic-knowledge-base",
                                "origin_commit": "a" * 40,
                            }
                        ],
                    },
                    "assets": [
                        {
                            "asset": "approved_show_if_rules",
                            "status": "imported",
                            "rows": 2,
                            "path": "E:/synthetic/approved_show_if_rules_v1_0.csv",
                            "source_commit": "a" * 40,
                        }
                    ],
                },
            )
            write_json(
                utilization_path,
                {
                    "status": "pass",
                    "nodes_by_origin": {"coco830/eco-semantic-knowledge-base": 2},
                    "edges_by_origin": {"coco830/eco-semantic-knowledge-base": 1},
                    "cards": 0,
                    "p1_seed_role": "compatibility_sample_only",
                },
            )

            summary = build_visibility_summary(import_path, utilization_path)
            write_visibility_outputs(summary, output_path, report_json_path, report_md_path)
            text = json.dumps(summary, ensure_ascii=False)

            self.assertTrue(output_path.exists())
            self.assertEqual(summary["status"], "pass")
            self.assertEqual(summary["repo"]["提交"], "a" * 40)
            self.assertEqual({item["label"]: item["value"] for item in summary["visible_metrics"]}["上游骨架节点"], 2)
            self.assertIn("不对外表达为法律认定", " ".join(summary["role_boundary"]))
            self.assertNotIn("SecretId", text)
            self.assertNotIn("本法全文", text)
            self.assertNotIn("local_path", text)
            self.assertNotIn("E:/synthetic", text)
            self.assertNotIn("P1 seed", text)
            self.assertNotIn("CANDIDATE", text)


if __name__ == "__main__":
    unittest.main()
