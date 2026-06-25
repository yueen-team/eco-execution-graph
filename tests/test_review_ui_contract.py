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
        for status in ["待审核", "已通过(待聚合)", "已进入聚合候选", "退回补充", "不入图", "样本不足"]:
            self.assertIn(status, visible_surface)
        for column in ["历史原始信源", "机器补填建议", "ETO 审核决定"]:
            self.assertIn(column, visible_surface)

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

    def test_review_workspace_uses_graph_api_base_and_requires_internal_session_when_packaged(self):
        review_js = (ROOT / "graph-ui/src/review.js").read_text(encoding="utf-8")
        main_js = (ROOT / "graph-ui/src/main.js").read_text(encoding="utf-8")

        self.assertIn("VITE_GRAPH_API_BASE", review_js)
        self.assertIn("https://www.yueen.cc/container-eco-execution-graph", review_js)
        self.assertIn("normalizeApiBase", review_js)
        self.assertIn('apiPath("/auth/session")', review_js)
        self.assertIn("requireReviewSession && !session", review_js)
        self.assertIn("allowReviewWorkspace", main_js)
        self.assertIn("review_workspace", main_js)
        self.assertIn("review_requires_session", main_js)
        self.assertIn("review_api_base", main_js)

    def test_internal_static_package_keeps_shared_data_and_enables_review_shell_only(self):
        script = (ROOT / "scripts/prepare_cloudbase_static_internal.ps1").read_text(encoding="utf-8")
        docs = (ROOT / "docs/deploy/cloudbase-static-readonly.md").read_text(encoding="utf-8")

        self.assertIn("dist-cloudbase-static-internal", script)
        self.assertIn("/eco-execution-graph-internal/", script)
        self.assertIn("review_workspace = $true", script)
        self.assertIn("review_requires_session = $true", script)
        self.assertIn("readonly_shared = $true", script)
        self.assertIn("Remove-Item $reviewData", script)
        self.assertIn("shared_product_v1/graph.json", script)
        self.assertIn("shared_product_v1/cards.shared.json", script)
        self.assertIn("private graph marker in JSON data", script)
        self.assertIn("ECO_GRAPH_APP_BASE_URL=https://www.yueen.cc/eco-execution-graph-internal/", docs)

    def test_review_ui_uses_two_step_submit_with_inline_feedback(self):
        review_js = (ROOT / "graph-ui/src/review.js").read_text(encoding="utf-8")

        # 两步制:先选结论再提交,误触"不入图"不会直接落库
        self.assertIn("提交审核结论", review_js)
        # 合并目标必须来自图谱已有问题类型(datalist 候选)
        self.assertIn("issueTypeOptions", review_js)
        self.assertIn("合并目标问题类型", review_js)
        # 错误与结果用内联通知呈现,禁止阻塞式 alert
        self.assertNotIn("window.alert", review_js)
        self.assertIn("review-notice", review_js)
        self.assertIn("review-three-column", review_js)

    def test_graph_surface_maps_english_enums_to_chinese(self):
        state_js = (ROOT / "graph-ui/src/state.js").read_text(encoding="utf-8")
        panel_js = (ROOT / "graph-ui/src/panel.js").read_text(encoding="utf-8")
        graph_js = (ROOT / "graph-ui/src/graph.js").read_text(encoding="utf-8")
        demo_js = (ROOT / "graph-ui/src/demo.js").read_text(encoding="utf-8")

        # 审核状态/置信来源/法条依据的英文枚举必须有中文映射,且被各渲染面消费
        for label in ["已审核基线", "候选待审", "人工已审", "整改验证通过", "ETO 已确认"]:
            self.assertIn(label, state_js)
        for surface in (panel_js, graph_js):
            self.assertIn("reviewStatusLabel", surface)
            self.assertIn("confidenceReasonLabel", surface)
        self.assertIn("reviewStatusLabel", demo_js)
        # 不允许把原始枚举直接拼进徽章(允许在注释或映射表中出现)
        self.assertNotIn("esc(card?.review_status ||", demo_js)
        self.assertNotIn("badge(node.review_status", panel_js)
        self.assertNotIn("badge(edge.review_status", panel_js)

    def test_review_demo_data_uses_chinese_keys_for_eto_surface(self):
        data = json.loads((ROOT / "graph-ui/public/review-data/field-event-review-demo.json").read_text(encoding="utf-8"))
        required = {"审核编号", "来源阶段", "建议问题类型", "现场问题摘要", "当前审核状态", "是否允许进入聚合", "技术追溯"}
        forbidden_key_pattern = re.compile(r"event_type|business_key|payload_json|CANDIDATE|PENDING")

        self.assertTrue(data["items"])
        for item in data["items"]:
            self.assertTrue(required.issubset(item))
            self.assertFalse(any(forbidden_key_pattern.search(key) for key in item))

        historical = data["items"][0]
        self.assertEqual(historical["信源标签"], ["历史回档", "机器补填"])
        self.assertIn("字段补齐状态", historical)
        self.assertIn("必补字段", historical["字段补齐状态"])
        self.assertIn("可候选字段", historical["字段补齐状态"])
        self.assertIn("不强行补字段", historical["字段补齐状态"])
        self.assertIn("机器补填说明", historical)
        self.assertIn("整改历史摘要", historical)


if __name__ == "__main__":
    unittest.main()
