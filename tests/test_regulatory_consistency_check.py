import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "pipeline"))

from regulatory_consistency_check import check_report_conclusion


def synthetic_graph():
    return {
        "nodes": [
            {
                "node_id": "issue:label",
                "node_type": "issue_type",
                "name": "标签信息不完整",
                "tier": "shared",
                "source_ref": "src:eto",
            },
            {
                "node_id": "issue:advice-only",
                "node_type": "issue_type",
                "name": "现场管理建议类问题",
                "tier": "shared",
                "source_ref": "src:eto",
                "legal_basis_status": "no_legal_basis",
            },
            {
                "node_id": "evidence:photo",
                "node_type": "evidence_category",
                "name": "现场照片",
                "tier": "shared",
                "source_ref": "src:eto",
            },
            {
                "node_id": "obl:label",
                "node_type": "law_obligation",
                "name": "危险废物标签管理要求",
                "tier": "shared",
                "source_ref": "src:law",
            },
            {
                "node_id": "law:swl:art77",
                "node_type": "law_article",
                "name": "固体废物污染环境防治法 第七十七条",
                "tier": "shared",
                "source_ref": "src:law",
                "attrs": {
                    "law_name": "固体废物污染环境防治法",
                    "article_no": "第七十七条",
                    "effective_status": "现行有效",
                    "rag_doc_ref": "tencent-lke://law/swl/art77",
                },
            },
            {
                "node_id": "law:old:art1",
                "node_type": "law_article",
                "name": "旧办法 第一条",
                "tier": "shared",
                "source_ref": "src:law",
                "attrs": {
                    "law_name": "旧办法",
                    "article_no": "第一条",
                    "effective_status": "已废止",
                    "rag_doc_ref": "tencent-lke://law/old/art1",
                },
            },
        ],
        "edges": [
            {
                "edge_id": "edge:regulated:label",
                "from": "issue:label",
                "to": "obl:label",
                "edge_type": "regulated_by",
                "tier": "shared",
                "source_ref": "src:law",
                "legal_basis_status": "internal_reviewed",
                "report_usage_policy": "参考相关要求",
            },
            {
                "edge_id": "edge:obligation:label",
                "from": "obl:label",
                "to": "law:swl:art77",
                "edge_type": "obligation_of",
                "tier": "shared",
                "source_ref": "src:law",
                "legal_basis_status": "internal_reviewed",
                "report_usage_policy": "参考相关要求",
            },
            {
                "edge_id": "edge:evidence:label",
                "from": "issue:label",
                "to": "evidence:photo",
                "edge_type": "evidenced_by",
                "tier": "shared",
                "source_ref": "src:eto",
            },
            {
                "edge_id": "edge:candidate:label",
                "from": "issue:label",
                "to": "law:swl:art77",
                "edge_type": "regulated_by",
                "tier": "shared",
                "source_ref": "src:law",
                "legal_basis_status": "candidate",
                "report_usage_policy": "内部提示",
            },
            {
                "edge_id": "edge:old-law",
                "from": "issue:label",
                "to": "law:old:art1",
                "edge_type": "regulated_by",
                "tier": "shared",
                "source_ref": "src:law",
                "legal_basis_status": "official_confirmed",
                "report_usage_policy": "依据",
            },
            {
                "edge_id": "edge:gov-mismatch",
                "from": "issue:label",
                "to": "law:swl:art77",
                "edge_type": "regulated_by",
                "tier": "shared",
                "source_ref": "src:law",
                "legal_basis_status": "official_confirmed",
                "report_usage_policy": "依据",
                "government_position_status": "mismatch",
            },
        ],
        "sources": [
            {"source_id": "src:law", "tier": "shared"},
            {"source_id": "src:eto", "tier": "shared"},
        ],
    }


class RegulatoryConsistencyCheckTest(unittest.TestCase):
    def codes(self, result):
        return {finding["code"] for finding in result["findings"]}

    def test_flags_missing_law_reference(self):
        result = check_report_conclusion(
            "依据《不存在法》第一百条,企业存在违法风险。",
            {"node_ids": ["issue:label"], "edge_ids": ["edge:regulated:label"], "source_ids": ["src:law"]},
            synthetic_graph(),
            audience="enterprise",
        )

        self.assertEqual(result["status"], "blocked")
        self.assertIn("missing_law_reference", self.codes(result))

    def test_flags_candidate_basis_when_written_as_violation(self):
        result = check_report_conclusion(
            "企业违反固体废物污染环境防治法第七十七条。",
            {"node_ids": ["issue:label"], "edge_ids": ["edge:candidate:label"], "source_ids": ["src:law"]},
            synthetic_graph(),
            audience="government_demo",
        )

        self.assertEqual(result["status"], "blocked")
        self.assertIn("candidate_or_disputed_basis", self.codes(result))

    def test_flags_management_advice_miscast_as_law(self):
        result = check_report_conclusion(
            "企业违法,应当立即处罚。",
            {"node_ids": ["issue:advice-only"], "edge_ids": [], "source_ids": ["src:eto"]},
            synthetic_graph(),
            audience="enterprise",
        )

        self.assertEqual(result["status"], "blocked")
        self.assertIn("management_advice_miscast_as_law", self.codes(result))

    def test_missing_evidence_chain_requires_downgrade(self):
        result = check_report_conclusion(
            "企业必须完成危废标签整改。",
            {"node_ids": ["issue:label"], "edge_ids": [], "source_ids": []},
            synthetic_graph(),
            audience="enterprise",
        )

        self.assertEqual(result["status"], "blocked")
        self.assertIn("missing_evidence_chain", self.codes(result))

    def test_safe_downgrade_with_evidence_passes(self):
        result = check_report_conclusion(
            "标签信息存在管理风险,建议核查现场照片、台账记录,并参考相关要求完善。",
            {
                "node_ids": ["issue:label"],
                "edge_ids": ["edge:regulated:label", "edge:evidence:label"],
                "source_ids": ["src:law", "src:eto"],
            },
            synthetic_graph(),
            audience="enterprise",
        )

        self.assertEqual(result["status"], "pass")

    def test_flags_overcommit_retired_law_and_government_mismatch(self):
        graph = synthetic_graph()
        retired = check_report_conclusion(
            "依据《旧办法》第一条,该企业完全合法且无任何风险。",
            {"node_ids": ["issue:label"], "edge_ids": ["edge:old-law"], "source_ids": ["src:law"]},
            graph,
            audience="government_demo",
        )
        mismatch = check_report_conclusion(
            "依据固体废物污染环境防治法第七十七条形成结论。",
            {"node_ids": ["issue:label"], "edge_ids": ["edge:gov-mismatch"], "source_ids": ["src:law"]},
            graph,
            audience="government_demo",
        )

        self.assertIn("overcommitted_language", self.codes(retired))
        self.assertIn("law_status_risk", self.codes(retired))
        self.assertIn("government_position_mismatch", self.codes(mismatch))


if __name__ == "__main__":
    unittest.main()
