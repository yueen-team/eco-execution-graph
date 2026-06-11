import json
import re
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def read_json(path: str):
    return json.loads((ROOT / path).read_text(encoding="utf-8"))


class P2P3FullProductTest(unittest.TestCase):
    def test_upstream_lock_uses_real_repositories(self):
        lock = read_json("data/upstream/upstream-lock.json")
        repos = {item["name"]: item for item in lock["repos"]}

        self.assertEqual(lock["status"], "pass")
        self.assertRegex(repos["coco830/eco-semantic-knowledge-base"]["commit"], r"^[0-9a-f]{40}$")
        self.assertRegex(repos["coco830/semantic-profile-lab"]["commit"], r"^[0-9a-f]{40}$")

    def test_full_graph_is_not_p1_seed_primary_source(self):
        graph = read_json("data/upstream/full-graph-source.json")
        nodes = graph["nodes"]
        p1_nodes = [node for node in nodes if node.get("source_role") == "compatibility_sample"]
        eco_nodes = [node for node in nodes if node.get("origin_repo") == "coco830/eco-semantic-knowledge-base"]

        self.assertGreaterEqual(len(nodes), 500)
        self.assertGreater(len(eco_nodes), len(p1_nodes) * 6)
        self.assertLess(len(p1_nodes) / len(nodes), 0.2)
        self.assertTrue(all(node.get("origin_asset") == "data/candidates/graph_seed_p1_hazardous_waste.json" for node in p1_nodes))

    def test_shared_package_has_no_private_or_full_text(self):
        graph = read_json("data/exports/shared_product_v1/graph.json")
        text = json.dumps(graph, ensure_ascii=False)

        self.assertTrue(all(node["tier"] == "shared" for node in graph["nodes"]))
        self.assertTrue(all(edge["tier"] == "shared" for edge in graph["edges"]))
        self.assertNotRegex(text, r'"tier"\s*:\s*"private"')
        self.assertNotRegex(text, r"本法全文|全文如下|第一条.{20,}第二条")

    def test_rag_metadata_keeps_resolved_citations_metadata_only(self):
        report = read_json("reports/rag-citation-resolution-report.json")

        self.assertEqual(report["rag_real_smoke"], "pass")
        self.assertEqual(report["rag_retrieve_probe"]["status"], "pass")
        self.assertGreaterEqual(report["citation_count"], 5)
        self.assertGreaterEqual(report["counts"].get("resolved", 0), 5)
        self.assertTrue(all(item["cache_policy"] == "metadata_only" for item in report["p1_core_resolution"]))
        self.assertTrue(all(item["report_usage_policy"] == "rag_metadata_only" for item in report["p1_core_resolution"]))

    def test_cards_and_governance_reports_are_ready(self):
        cards = read_json("reports/execution-card-index.json")
        leak = read_json("reports/private-leak-check-full.json")
        regulatory = read_json("reports/regulatory-consistency-check-full.json")

        self.assertEqual(cards["status"], "pass")
        self.assertGreaterEqual(cards["total_cards"], 50)
        self.assertGreaterEqual(cards["hazardous_showcase_cards"], 10)
        self.assertEqual(leak["status"], "pass")
        self.assertEqual(regulatory["status"], "pass")

    def test_render_manifest_records_real_screenshots(self):
        manifest = read_json("reports/render-proof-p2p3/manifest.json")

        self.assertEqual(manifest["status"], "pass")
        self.assertGreaterEqual(len(manifest["screenshots"]), 4)
        self.assertTrue(all(item["exists"] and item["bytes"] > 0 and item["sha256"] for item in manifest["screenshots"]))


if __name__ == "__main__":
    unittest.main()
