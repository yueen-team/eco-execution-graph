import json
import re
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class ReviewUiContractTest(unittest.TestCase):
    def test_review_page_contains_required_chinese_actions_and_statuses(self):
        html = (ROOT / "graph-ui/index.html").read_text(encoding="utf-8")
        review_js = (ROOT / "graph-ui/src/review.js").read_text(encoding="utf-8")
        visible_surface = html + "\n" + review_js

        for text in ["现场经验入图审核台", "通过，进入聚合候选", "仅保留内部案例", "退回补充", "合并到已有问题类型", "不入图"]:
            self.assertIn(text, visible_surface)
        for status in ["待审核", "已通过", "退回补充", "不入图", "样本不足"]:
            self.assertIn(status, visible_surface)

    def test_review_visible_surface_does_not_show_technical_field_names(self):
        review_js = (ROOT / "graph-ui/src/review.js").read_text(encoding="utf-8")
        html = (ROOT / "graph-ui/index.html").read_text(encoding="utf-8")
        visible_surface = html + "\n" + review_js

        for marker in ["event_type", "business_key", "payload_json", "CANDIDATE", "PENDING"]:
            self.assertNotIn(marker, visible_surface)

    def test_review_ui_submits_decision_to_backend_before_local_fallback(self):
        review_js = (ROOT / "graph-ui/src/review.js").read_text(encoding="utf-8")

        self.assertIn("/decision", review_js)
        self.assertIn("submitReviewDecision", review_js)
        self.assertIn("演示模式", review_js)

    def test_review_demo_data_uses_chinese_keys_for_eto_surface(self):
        data = json.loads((ROOT / "graph-ui/public/review-data/field-event-review-demo.json").read_text(encoding="utf-8"))
        required = {"审核编号", "来源阶段", "建议问题类型", "现场问题摘要", "当前审核状态", "是否允许进入聚合", "技术追溯"}
        forbidden_key_pattern = re.compile(r"event_type|business_key|payload_json|CANDIDATE|PENDING")

        self.assertTrue(data["items"])
        for item in data["items"]:
            self.assertTrue(required.issubset(item))
            self.assertFalse(any(forbidden_key_pattern.search(key) for key in item))


if __name__ == "__main__":
    unittest.main()
