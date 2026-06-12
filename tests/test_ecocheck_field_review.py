import json
import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "pipeline"))

from ecocheck_aggregation import build_aggregate_rows, validate_no_aggregate_leak  # noqa: E402


def review_item(company: str, status: str = "已进入聚合候选", allow: bool = True, issue_ref: str = "issue:hw:label-incomplete", merge_target: str = ""):
    return {
        "审核编号": f"review:{company}",
        "事件编号": f"synthetic:{company}",
        "来源阶段": "整改验收通过",
        "企业内部标识": company,
        "企业名称快照": f"合成企业{company}",
        "区域": "昆明市",
        "行业": "汽车维修",
        "环保维度": "危险废物管理",
        "问题类型引用": issue_ref,
        "合并目标问题类型": merge_target,
        "建议问题类型": "危废标签内容不完整",
        "整改结果": "已通过",
        "法条规范候选": [{"引用编号": "law:swl:art77", "名称": "固体废物污染环境防治法 第七十七条"}],
        "当前审核状态": status,
        "是否允许进入聚合": allow,
        "审核时间": "2026-06-12T10:00:00+08:00",
    }


class EcoCheckFieldReviewAggregationTest(unittest.TestCase):
    def test_unreviewed_or_internal_only_items_do_not_enter_aggregate(self):
        result = build_aggregate_rows([
            review_item("001", "待审核", False),
            review_item("002", "仅保留内部案例", False),
            review_item("003", "不入图", False),
        ], "pitfall-map:test")

        self.assertEqual(result["status"], "blocked")
        self.assertEqual(result["rows"], [])
        self.assertEqual(result["sample_limited"], [])

    def test_approved_items_below_five_enter_sample_limited_pool_only(self):
        result = build_aggregate_rows([review_item("001"), review_item("002")], "pitfall-map:test")

        self.assertEqual(result["status"], "blocked")
        self.assertEqual(result["rows"], [])
        self.assertEqual(result["sample_limited"][0]["reason"], "样本不足,不展示")

    def test_five_approved_companies_generate_safe_aggregate_row(self):
        result = build_aggregate_rows([review_item(str(i)) for i in range(5)], "pitfall-map:test")
        text = json.dumps(result["rows"], ensure_ascii=False)

        self.assertEqual(result["status"], "pass")
        self.assertEqual(result["rows"][0]["sample_size"], 5)
        self.assertNotIn("企业名称快照", text)
        self.assertNotIn("合成企业", text)
        self.assertEqual(validate_no_aggregate_leak(result), [])

    def test_directly_approved_items_enter_aggregate(self):
        result = build_aggregate_rows([review_item(str(i), "已通过") for i in range(5)], "pitfall-map:test")

        self.assertEqual(result["status"], "pass")
        self.assertEqual(result["rows"][0]["sample_size"], 5)

    def test_merge_target_issue_type_is_used_for_grouping(self):
        result = build_aggregate_rows([
            review_item(str(i), "已进入聚合候选", issue_ref=f"issue:temporary:{i}", merge_target="issue:hw:label-incomplete")
            for i in range(5)
        ], "pitfall-map:test")

        self.assertEqual(result["status"], "pass")
        self.assertEqual(result["rows"][0]["issue_type_ref"], "issue:hw:label-incomplete")


if __name__ == "__main__":
    unittest.main()
