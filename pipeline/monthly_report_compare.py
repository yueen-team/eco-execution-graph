from __future__ import annotations

import sys

from p2p3_common import monthly_full

if "--scope" in sys.argv and "full" in sys.argv:
    import json
    print(json.dumps(monthly_full(), ensure_ascii=False))
    raise SystemExit(0)

import json

from common import REPORTS_DIR, load_internal_graph, read_json, write_json, write_text


def main() -> None:
    graph = load_internal_graph()
    cards = read_json(REPORTS_DIR.parents[0] / "data" / "candidates" / "cards" / "internal_cards.json")
    issue_names = [card["field_manifestations"][0]["description"] for card in cards[:3]]
    old_text = "本月企业危废管理存在标签、台账、暂存管理等问题,建议按要求整改。"
    graph_text = (
        "本月合成企业危废管理问题主要集中在标签完整性、台账连续性和暂存分区一致性。"
        "图谱装配显示,相关问题均可追溯到 issue_type、证据类别、法条瘦节点和整改方向;"
        "对外报告建议使用'参考相关要求'表述,避免在未取得官方确认前直接作确定性法律定性。"
    )
    trace = {
        "node_ids": [card["field_manifestations"][0]["issue_type_ref"] for card in cards[:3]],
        "edge_ids": [edge["edge_id"] for edge in graph["edges"] if edge["edge_type"] in {"regulated_by", "manifests_as"}][:6],
        "source_ids": ["src:demo:eto-review", "src:demo:law-map"],
    }
    result = {
        "synthetic_enterprise": "合成企业A",
        "input_issues": issue_names,
        "baseline_ai_paragraph": old_text,
        "graph_context_paragraph": graph_text,
        "improvements": ["更贴近现场场景", "带 trace 可追溯", "法律依据表达降级明确", "保留证据类别但不泄漏判断标准"],
        "trace": trace,
    }
    write_json(REPORTS_DIR / "monthly-report-comparison-hazardous-waste.json", result)
    write_text(REPORTS_DIR / "monthly-report-comparison-hazardous-waste.md", "\n".join([
        "# P0.5 月报段落对比 · 危废管理",
        "",
        "## 输入",
        f"- 合成企业: {result['synthetic_enterprise']}",
        *[f"- 问题: {item}" for item in issue_names],
        "",
        "## 普通 AI / 通用模板式段落",
        old_text,
        "",
        "## 图谱上下文装配后段落",
        graph_text,
        "",
        "## 差异说明",
        *[f"- {item}" for item in result["improvements"]],
        "",
        "## Trace",
        f"- nodes: {', '.join(trace['node_ids'])}",
        f"- edges: {', '.join(trace['edge_ids'])}",
        f"- sources: {', '.join(trace['source_ids'])}",
    ]))
    print(json.dumps({"monthly_comparison": "ok", "issues": len(issue_names)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
