import json
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "pipeline"))

from knowledge_governance import (  # noqa: E402
    build_candidates_payload,
    build_publication_bundle,
    build_publications_payload,
    build_registry_payload,
)


def write_json(path: Path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


class KnowledgeGovernanceTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.base = Path(self.temp.name)
        self.rag_report = self.base / "reports" / "rag.json"
        self.graph = self.base / "graph.json"
        write_json(self.rag_report, self.rag_fixture())
        write_json(self.graph, self.graph_fixture())

    def tearDown(self):
        self.temp.cleanup()

    def rag_fixture(self):
        return {
            "source_level_items": [
                {
                    "node_id": "law:solid-waste:art77",
                    "citation_title": "中华人民共和国固体废物污染环境防治法 第七十七条",
                    "reason": "missing_article_spec_page_section_metadata",
                }
            ],
            "results": [
                {
                    "status": "resolved",
                    "provider": "tencent_lke_rag",
                    "rag_doc_ref": "tencent-lke://law/solid-waste/art77",
                    "node_id": "law:solid-waste:art77",
                    "node_type": "law_article",
                    "law_name": "中华人民共和国固体废物污染环境防治法",
                    "article_no": "第七十七条",
                    "tech_spec_no": None,
                    "citation_title": "中华人民共和国固体废物污染环境防治法 第七十七条",
                    "citation_locator": "source-level",
                    "locator_level": "missing_article_spec_page_section_metadata",
                    "source_level_reason": "missing_article_spec_page_section_metadata",
                    "excerpt": "",
                    "source_hash": "hash-law-77",
                    "resolved_at": "2026-06-15",
                    "raw_cached": False,
                    "cache_policy": "metadata_only",
                    "retrieval_probe": "RetrieveKnowledge",
                    "report_usage_policy": "rag_metadata_only",
                    "Content": "RAG full text that must never be copied to governance outputs",
                },
                {
                    "status": "resolved",
                    "provider": "tencent_lke_rag",
                    "rag_doc_ref": "tencent-lke://law/solid-waste/art78",
                    "node_id": "law:solid-waste:art78",
                    "node_type": "law_article",
                    "law_name": "中华人民共和国固体废物污染环境防治法",
                    "article_no": "第七十八条",
                    "tech_spec_no": None,
                    "citation_title": "中华人民共和国固体废物污染环境防治法 第七十八条",
                    "citation_locator": "第七十八条",
                    "locator_level": "article",
                    "source_hash": "hash-law-78",
                    "resolved_at": "2026-06-15",
                    "raw_cached": False,
                    "cache_policy": "metadata_only",
                    "retrieval_probe": "RetrieveKnowledge",
                    "report_usage_policy": "rag_metadata_only",
                },
                {
                    "status": "resolved",
                    "provider": "tencent_lke_rag",
                    "rag_doc_ref": "tencent-lke://spec/gb18597/current",
                    "node_id": "spec:gb18597:current",
                    "node_type": "tech_spec",
                    "law_name": "危险废物贮存污染控制标准(GB 18597-2023代替GB 18597-2001)",
                    "article_no": None,
                    "tech_spec_no": "GB 18597-2023",
                    "citation_title": "危险废物贮存污染控制标准(GB 18597-2023代替GB 18597-2001)",
                    "citation_locator": "GB 18597-2023",
                    "locator_level": "spec_or_section",
                    "source_hash": "hash-gb-current",
                    "resolved_at": "2026-06-15",
                    "raw_cached": False,
                    "cache_policy": "metadata_only",
                    "retrieval_probe": "RetrieveKnowledge",
                    "report_usage_policy": "rag_metadata_only",
                },
                {
                    "status": "resolved",
                    "provider": "tencent_lke_rag",
                    "rag_doc_ref": "tencent-lke://spec/gb18597/old",
                    "node_id": "spec:gb18597:old",
                    "node_type": "tech_spec",
                    "law_name": "危险废物贮存污染控制标准(GB 18597-2001)",
                    "article_no": None,
                    "tech_spec_no": "GB 18597-2001",
                    "citation_title": "危险废物贮存污染控制标准(GB 18597-2001)",
                    "citation_locator": "GB 18597-2001",
                    "locator_level": "spec_or_section",
                    "source_hash": "hash-gb-old",
                    "resolved_at": "2026-06-15",
                    "raw_cached": False,
                    "cache_policy": "metadata_only",
                    "retrieval_probe": "RetrieveKnowledge",
                    "report_usage_policy": "rag_metadata_only",
                },
            ],
        }

    def graph_fixture(self):
        return {
            "nodes": [
                {
                    "node_id": "law:solid-waste:art77",
                    "node_type": "law_article",
                    "name": "中华人民共和国固体废物污染环境防治法 第七十七条",
                    "tier": "shared",
                    "review_status": "APPROVED_BASELINE",
                    "attrs": {"effective_status": "现行有效"},
                },
                {
                    "node_id": "law:solid-waste:art78",
                    "node_type": "law_article",
                    "name": "中华人民共和国固体废物污染环境防治法 第七十八条",
                    "tier": "shared",
                    "review_status": "APPROVED_BASELINE",
                    "attrs": {"effective_status": "现行有效"},
                },
                {
                    "node_id": "spec:gb18597:current",
                    "node_type": "tech_spec",
                    "name": "危险废物贮存污染控制标准(GB 18597-2023代替GB 18597-2001)",
                    "tier": "shared",
                    "review_status": "APPROVED_BASELINE",
                    "attrs": {"effective_status": "现行有效"},
                },
                {
                    "node_id": "spec:gb18597:old",
                    "node_type": "tech_spec",
                    "name": "危险废物贮存污染控制标准(GB 18597-2001)",
                    "tier": "shared",
                    "review_status": "APPROVED_BASELINE",
                    "attrs": {"effective_status": "已废止"},
                },
                {
                    "node_id": "issue:hw:label",
                    "node_type": "issue_type",
                    "name": "危废标签内容不完整",
                    "tier": "shared",
                    "review_status": "APPROVED_BASELINE",
                },
            ],
            "edges": [],
            "sources": [],
        }

    def test_registry_dedupes_law_articles_without_copying_rag_content(self):
        registry = build_registry_payload(self.rag_report, self.graph)
        text = json.dumps(registry, ensure_ascii=False)

        self.assertNotIn("Content", text)
        self.assertNotIn("RAG full text", text)

        law_docs = [doc for doc in registry["documents"] if doc["doc_type"] == "law"]
        self.assertEqual(len(law_docs), 1)
        self.assertEqual(len(law_docs[0]["source_refs"]), 2)
        self.assertEqual(law_docs[0]["review_status"], "approved")

    def test_source_level_locator_becomes_candidate_without_re_reviewing_approved_graph(self):
        registry = build_registry_payload(self.rag_report, self.graph)
        registry_path = self.base / "registry.json"
        write_json(registry_path, registry)

        candidates = build_candidates_payload(registry_path, self.rag_report, self.graph)
        by_type = {item["candidate_type"] for item in candidates["candidates"]}

        self.assertIn("locator_patch", by_type)
        self.assertNotIn("graph_expert_candidate", by_type)
        self.assertTrue(all(item["review_status"] == "candidate" for item in candidates["candidates"]))

    def test_deprecated_documents_are_blocked_from_public_bundles(self):
        registry = build_registry_payload(self.rag_report, self.graph)
        old_doc = next(doc for doc in registry["documents"] if doc.get("standard_no") == "GB 18597-2001")
        self.assertEqual(old_doc["effective_status"], "deprecated")

        bundle = build_publication_bundle("ecocheck", registry, {"candidates": []})
        item_doc_ids = {item["doc_id"] for item in bundle["items"]}
        blocked_refs = {item["target_ref"] for item in bundle["blocked_items"]}

        self.assertNotIn(old_doc["doc_id"], item_doc_ids)
        self.assertIn(old_doc["doc_id"], blocked_refs)

    def test_source_level_documents_are_blocked_from_public_bundles(self):
        registry = build_registry_payload(self.rag_report, self.graph)
        law_doc = next(doc for doc in registry["documents"] if doc["doc_type"] == "law")

        bundle = build_publication_bundle("ecocheck", registry, {"candidates": []})
        item_doc_ids = {item["doc_id"] for item in bundle["items"]}
        blocked_refs = {item["target_ref"] for item in bundle["blocked_items"]}

        self.assertNotIn(law_doc["doc_id"], item_doc_ids)
        self.assertIn(law_doc["doc_id"], blocked_refs)

    def test_publication_items_are_traceable_and_reviewed(self):
        registry = build_registry_payload(self.rag_report, self.graph)
        registry_path = self.base / "registry.json"
        candidates_path = self.base / "candidates.json"
        write_json(registry_path, registry)
        write_json(candidates_path, {"candidates": []})

        payload = build_publications_payload(registry_path, candidates_path)
        expert_bundle = payload["bundles"]["expert_agent"]
        self.assertIn("ecocheck", payload["bundles"])
        self.assertIn("ecodoc", payload["bundles"])
        self.assertNotIn("health_report_ai", payload["bundles"])

        self.assertEqual(expert_bundle["redline_scan_status"], "pass")
        self.assertEqual(expert_bundle["approval_basis"], "ETO_APPROVED_IN_GRAPH")
        self.assertFalse(expert_bundle["human_review_required"])
        self.assertIn(expert_bundle["machine_gate_status"], {"pass", "partial", "blocked"})
        self.assertGreater(len(expert_bundle["items"]), 0)
        for item in expert_bundle["items"]:
            self.assertIn(item["review_status"], {"approved", "human_reviewed"})
            self.assertEqual(item["cache_policy"], "metadata_only")
            self.assertFalse(item["raw_cached"])
            self.assertNotEqual(item["citation_locator"], "source-level")
            self.assertIn("trace", item)
            self.assertIn("source_ref", item)
            self.assertIn("legal_basis_status", item)
            self.assertIn("rag_doc_ref", item)


if __name__ == "__main__":
    unittest.main()
