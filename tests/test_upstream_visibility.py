import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def read_json(path: str):
    return json.loads((ROOT / path).read_text(encoding="utf-8"))


class UpstreamVisibilityTest(unittest.TestCase):
    def test_visibility_summary_is_chinese_and_source_backed(self):
        data = read_json("graph-ui/public/demo-data/upstream-visibility.json")

        self.assertEqual(data["status"], "pass")
        self.assertEqual(data["repo"]["名称"], "coco830/eco-semantic-knowledge-base")
        self.assertRegex(data["repo"]["提交"], r"^[0-9a-f]{40}$")
        metrics = {item["label"]: item["value"] for item in data["visible_metrics"]}
        self.assertGreaterEqual(metrics["上游骨架节点"], 400)
        self.assertGreaterEqual(metrics["上游骨架关联"], 900)
        self.assertGreaterEqual(metrics["接入资产"], 4)
        self.assertTrue(all("资产名称" in item and "记录数量" in item for item in data["asset_rows"]))

    def test_visibility_summary_has_no_private_leak_markers(self):
        text = json.dumps(read_json("graph-ui/public/demo-data/upstream-visibility.json"), ensure_ascii=False)

        forbidden = [
            "SecretId",
            "SecretKey",
            "API_KEY",
            "raw RAG response",
            "evidence_judgment_standard",
            "rectification_template",
            "report_expression",
            "issue_instance",
            "pitfall_instance",
            "本法全文",
            "全文如下",
            "local_path",
            "本地路径",
            "E:\\",
            "C:\\",
            "P1 seed",
            "approved baseline",
            "CANDIDATE",
        ]
        for item in forbidden:
            self.assertNotIn(item, text)

    def test_ui_has_upstream_skeleton_entry(self):
        html = (ROOT / "graph-ui/app.html").read_text(encoding="utf-8")
        main_js = (ROOT / "graph-ui/src/main.js").read_text(encoding="utf-8")
        demo_js = (ROOT / "graph-ui/src/demo.js").read_text(encoding="utf-8")

        self.assertIn("上游骨架", html)
        self.assertIn("upstream-visibility.json", main_js)
        self.assertIn('params.get("upstream") === "1"', main_js)
        self.assertIn("renderUpstreamPanel", demo_js)
        self.assertIn("公开标准给骨架", demo_js)


if __name__ == "__main__":
    unittest.main()
