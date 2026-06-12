import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "pipeline"))

from rag_resolve import build_citation_resolution_record, sanitize_retrieve_record


def node(node_type="law_article", attrs=None):
    return {
        "node_id": "law:demo:art77" if node_type == "law_article" else "spec:demo:gb18597",
        "node_type": node_type,
        "name": "固体废物污染环境防治法 第七十七条" if node_type == "law_article" else "GB 18597 危险废物贮存污染控制标准",
        "source_ref": "src:test",
        "attrs": attrs or {},
    }


class RagCitationResolutionTest(unittest.TestCase):
    def test_article_no_becomes_locator(self):
        record = {
            "Title": "固体废物污染环境防治法",
            "Metadata": {"ArticleNo": "第七十七条", "LawName": "固体废物污染环境防治法"},
        }

        item = build_citation_resolution_record(node(), rag_record=record, retrieve_status="pass", resolved_at="2026-06-12")

        self.assertEqual(item["article_no"], "第七十七条")
        self.assertEqual(item["citation_locator"], "第七十七条")
        self.assertEqual(item["cache_policy"], "metadata_only")

    def test_tech_spec_no_becomes_locator(self):
        record = {
            "Title": "危险废物贮存污染控制标准",
            "Metadata": {"StandardNo": "GB 18597-2023"},
        }

        item = build_citation_resolution_record(node("tech_spec"), rag_record=record, retrieve_status="pass", resolved_at="2026-06-12")

        self.assertEqual(item["tech_spec_no"], "GB 18597-2023")
        self.assertEqual(item["citation_locator"], "GB 18597-2023")

    def test_page_and_section_metadata_are_preserved_in_locator(self):
        record = {
            "Title": "危险废物识别标志设置技术规范",
            "Metadata": {
                "StandardNo": "HJ 1276-2022",
                "Section": "标签设置要求",
                "ChunkPageNumbers": [8, 9],
            },
        }

        item = build_citation_resolution_record(node("tech_spec"), rag_record=record, retrieve_status="pass", resolved_at="2026-06-12")

        self.assertEqual(item["citation_locator"], "HJ 1276-2022；标签设置要求；第8-9页")
        self.assertEqual(item["locator_level"], "spec_or_section_page")

    def test_missing_locator_degrades_to_source_level_with_reason(self):
        record = {"Title": "某资料", "Metadata": {"ResultSource": "doc"}}

        item = build_citation_resolution_record(
            node("tech_spec", attrs={"rag_doc_ref": "tencent-lke://doc/only"}),
            rag_record=record,
            retrieve_status="pass",
            resolved_at="2026-06-12",
        )

        self.assertEqual(item["citation_locator"], "source-level")
        self.assertEqual(item["source_level_reason"], "missing_article_spec_page_section_metadata")

    def test_raw_text_is_never_cached(self):
        record = {
            "Title": "固体废物污染环境防治法",
            "Content": "这里模拟 RAG 原文正文,不能进入报告缓存或图谱节点。",
            "Metadata": {"ArticleNo": "第七十八条"},
        }

        sanitized = sanitize_retrieve_record(record, "328640")
        item = build_citation_resolution_record(node(), rag_record=sanitized, retrieve_status="pass", resolved_at="2026-06-12")

        self.assertNotIn("Content", sanitized)
        self.assertEqual(item["excerpt"], "")
        self.assertFalse(item["raw_cached"])
        self.assertEqual(item["cache_policy"], "metadata_only")


if __name__ == "__main__":
    unittest.main()
