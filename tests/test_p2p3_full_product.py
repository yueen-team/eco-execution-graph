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
        self.assertEqual(report["tokenhub_probe"]["status"], "pass")
        self.assertEqual(report["generation_path"], "direct_rag_retrieve_plus_tokenhub_deepseek")
        self.assertNotIn("ws_token_probe", report)
        self.assertGreaterEqual(report["citation_count"], 5)
        self.assertGreaterEqual(report["counts"].get("resolved", 0), 5)
        self.assertTrue(all(item["cache_policy"] == "metadata_only" for item in report["p1_core_resolution"]))
        self.assertTrue(all(item["report_usage_policy"] == "rag_metadata_only" for item in report["p1_core_resolution"]))
        required_fields = {
            "provider",
            "rag_doc_ref",
            "node_id",
            "node_type",
            "law_name",
            "article_no",
            "tech_spec_no",
            "citation_title",
            "citation_locator",
            "source_hash",
            "resolved_at",
            "raw_cached",
            "cache_policy",
            "retrieval_probe",
            "report_usage_policy",
        }
        self.assertTrue(all(required_fields.issubset(item) for item in report["p1_core_resolution"]))
        self.assertTrue(all(item["raw_cached"] is False for item in report["results"]))
        self.assertTrue(all(item["excerpt"] == "" for item in report["results"]))
        self.assertEqual(len(report["source_level_items"]), report["locator_counts"].get("source_level", 0))

    def test_cards_and_governance_reports_are_ready(self):
        cards = read_json("reports/execution-card-index.json")
        leak = read_json("reports/private-leak-check-full.json")
        regulatory = read_json("reports/regulatory-consistency-check-full.json")

        self.assertEqual(cards["status"], "pass")
        self.assertGreaterEqual(cards["total_cards"], 50)
        self.assertGreaterEqual(cards["hazardous_showcase_cards"], 10)
        self.assertGreaterEqual(cards["hazardous_total_cards"], 30)
        self.assertEqual(cards["hazardous_candidate_coverage_status"], "pass")
        self.assertEqual(cards["hazardous_uncovered_candidate_count"], 0)
        self.assertEqual(cards["phase_one_director_cards"], 5)
        self.assertGreaterEqual(cards["phase_two_hazardous_slices"], 25)
        self.assertEqual(cards["eto_v4_independent_cards"], 14)
        self.assertEqual(cards["eto_v4_template_cards"], 3)
        self.assertEqual(cards["eto_v4_merged_cards"], 14)
        self.assertEqual(leak["status"], "pass")
        self.assertEqual(regulatory["status"], "pass")

    def test_demo_honesty_gates_do_not_show_unproven_reports(self):
        final = read_json("reports/P2P3-rag-upstream-full-productization-final.json")
        pitfall = read_json("reports/yunnan-pitfall-map-full.json")
        monthly = read_json("reports/monthly-report-comparison-full.json")
        lineage = read_json("reports/lineage-contract-readiness.json")

        self.assertEqual(final["zhang_director_ready"], "conditional")
        self.assertNotIn("pitfall map full", final["safe_to_show"])
        self.assertNotIn("monthly comparison full", final["safe_to_show"])
        self.assertIn("pitfall map full", final["not_safe_to_show_yet"])
        self.assertIn("monthly comparison full", final["not_safe_to_show_yet"])
        self.assertEqual(pitfall["status"], "blocked")
        self.assertEqual(pitfall["rows"], [])
        self.assertEqual(monthly["status"], "blocked")
        self.assertEqual(monthly["comparison_basis"], "synthetic_baseline_demo")
        self.assertTrue(all(item["plain_ai"] is None for item in monthly["comparisons"]))
        self.assertEqual(lineage["status"], "partial")
        self.assertEqual(lineage["contract_status"], "pass")
        self.assertEqual(lineage["government_lineage_real_import"], "blocked")
        self.assertEqual(final["lineage_contract"]["edge_preview_count"], 6)
        self.assertNotIn("per-citation locator mapping hardening", final["not_done"])

    def test_shared_cards_are_whitelisted_not_shallow_copies(self):
        cards = read_json("data/candidates/cards/full_shared_cards.json")
        allowed = {
            "card_id",
            "title",
            "root_issue_type",
            "dimension",
            "field_manifestations",
            "related_obligations",
            "law_refs",
            "tech_spec_refs",
            "rag_citation_status",
            "evidence_summary",
            "rectification_summary",
            "report_expression_summary",
            "pitfalls",
            "graph_slice_refs",
            "source_trace",
            "tier_policy",
            "render_views",
            "quality_score",
            "legal_basis_status",
            "show_or_not_for_director_demo",
            "review_status",
            "eto_review_conclusion",
            "eto_display_group",
            "eto_display_priority",
            "eto_ingest_status",
            "eto_ingest_action",
            "eto_ingest_type",
            "eto_conclusion_source",
            "director_demo_order",
            "director_demo_backup_order",
            "merge_with",
            "secondary_merge_refs",
            "external_expression",
            "hazardous_slice_scope",
            "hazardous_slice_stage",
            "hazardous_slice_role",
            "hazardous_slice_order",
            "hazardous_slice_display_policy",
            "internal_capability_placeholders",
        }

        self.assertTrue(cards)
        for card in cards:
            self.assertLessEqual(set(card), allowed)
            self.assertEqual(card["render_views"], {"internal_full": False, "shared_export": True})

    def test_eto_review_backfills_director_demo_sequence(self):
        sequence = read_json("reports/director-demo-card-sequence.json")
        showcase = read_json("reports/showcase-card-pack.json")
        catalog = read_json("reports/hazardous-waste-slice-catalog.json")

        self.assertEqual(sequence["status"], "pass")
        self.assertEqual([item["card_id"] for item in sequence["cards"]], [
            "card:full:0003",
            "card:full:0011",
            "card:full:0001",
            "card:full:0005",
            "card:full:0012",
        ])
        self.assertEqual(sequence["phase_one"]["count"], 5)
        self.assertGreaterEqual(sequence["phase_two"]["count"], 30)
        self.assertEqual(sequence["phase_two"]["catalog"], "reports/hazardous-waste-slice-catalog.json")
        self.assertEqual(sequence["phase_two"]["eto_v4_independent_cards"], 14)
        self.assertEqual(sequence["phase_two"]["eto_v4_template_cards"], 3)
        self.assertEqual(sequence["phase_two"]["eto_v4_merged_cards"], 14)
        self.assertEqual(len([card for card in showcase if card.get("eto_display_group") == "主任演示卡"]), 5)
        self.assertEqual(len([card for card in showcase if card.get("eto_display_group") == "主任追问展开卡"]), 9)
        self.assertEqual(catalog["status"], "pass")
        self.assertEqual(catalog["total_hazardous_slices"], sequence["phase_two"]["count"])
        self.assertFalse(catalog["uncovered_hazardous_candidate_ids"])
        self.assertEqual(catalog["role_counts"]["主任开场精品"], 5)
        self.assertEqual(catalog["role_counts"]["主任追问展开卡"], 9)
        self.assertEqual(catalog["role_counts"]["内部场景模板"], 3)
        self.assertEqual(catalog["role_counts"]["合并采纳子项"], 14)
        self.assertEqual(catalog["eto_ingest_action_counts"]["独立入库"], 14)
        self.assertEqual(catalog["eto_ingest_action_counts"]["模板入库"], 3)
        self.assertEqual(catalog["eto_ingest_action_counts"]["合并入库"], 14)
        self.assertEqual(len(sequence["do_not_show"]), 14)
        self.assertTrue(all(item["display_policy"] != "首轮单独讲" for item in catalog["slices"] if item["role"] == "合并采纳子项"))

    def test_render_manifest_records_real_screenshots(self):
        manifest = read_json("reports/render-proof-p2p3/manifest.json")

        self.assertEqual(manifest["status"], "pass")
        self.assertGreaterEqual(len(manifest["screenshots"]), 4)
        self.assertTrue(all(item["exists"] and item["bytes"] > 0 and item["sha256"] for item in manifest["screenshots"]))


if __name__ == "__main__":
    unittest.main()
