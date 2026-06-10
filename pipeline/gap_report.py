from __future__ import annotations

import sys

from p2p3_common import gap_full

if "--scope" in sys.argv and "full" in sys.argv:
    import json
    print(json.dumps(gap_full(), ensure_ascii=False))
    raise SystemExit(0)

import json

from common import REPORTS_DIR, load_internal_graph, write_json, write_text


def main() -> None:
    graph = load_internal_graph()
    nodes = {node["node_id"]: node for node in graph["nodes"]}
    edges = graph["edges"]
    obligations = [node for node in graph["nodes"] if node["node_type"] == "law_obligation"]
    issues = [node for node in graph["nodes"] if node["node_type"] == "issue_type"]
    manifests_from_obligation = {edge["from"] for edge in edges if edge["edge_type"] == "manifests_as"}
    regulated_from_issue = {edge["from"] for edge in edges if edge["edge_type"] == "regulated_by"}
    pitfall_counts: dict[str, int] = {}
    for edge in edges:
        if edge["edge_type"] == "pitfall_of" and edge["tier"] in {"shared", "aggregate"}:
            pitfall_counts[edge["to"]] = pitfall_counts.get(edge["to"], 0) + 1
    zero_coverage = [node for node in obligations if node["node_id"] not in manifests_from_obligation]
    management_only = [node for node in issues if node["node_id"] not in regulated_from_issue]
    rankings = sorted(
        [{"target_id": target, "target_name": nodes.get(target, {}).get("name", target), "pitfall_count": count} for target, count in pitfall_counts.items()],
        key=lambda item: item["pitfall_count"],
        reverse=True,
    )
    result = {
        "zero_field_coverage_obligations": zero_coverage,
        "management_experience_without_law": management_only,
        "pitfall_rankings": rankings,
        "shared_summary": {
            "zero_coverage_count": len(zero_coverage),
            "management_only_count": len(management_only),
            "top_pitfall_count": rankings[0]["pitfall_count"] if rankings else 0,
        },
    }
    write_json(REPORTS_DIR / "gap-report-hazardous-waste.json", result)
    zero_lines = [f"- {item['name']} (`{item['node_id']}`)" for item in zero_coverage] or ["- 无"]
    management_lines = [f"- {item['name']} (`{item['node_id']}`)" for item in management_only] or ["- 无"]
    ranking_lines = [f"- {item['target_name']} (`{item['target_id']}`): {item['pitfall_count']}" for item in rankings[:10]] or ["- 无"]
    lines = [
        "# 双向缺口报告 · 危废精品切片",
        "",
        "## 现场零覆盖条款",
        *zero_lines,
        "",
        "## 管理经验类问题",
        *management_lines,
        "",
        "## 高频踩雷排行",
        *ranking_lines,
        "",
        "## 共有视图说明",
        "- 本报告共有视图只输出 shared/aggregate 摘要,不输出 pitfall_instance、企业实例、证据判断标准、整改模板或报告表达模板。",
    ]
    write_text(REPORTS_DIR / "gap-report-hazardous-waste.md", "\n".join(lines))
    print(json.dumps(result["shared_summary"], ensure_ascii=False))


if __name__ == "__main__":
    main()
