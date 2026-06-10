from __future__ import annotations

import json

from common import REPORTS_DIR, load_internal_graph, write_json, write_text


def main() -> None:
    graph = load_internal_graph()
    nodes = {node["node_id"]: node for node in graph["nodes"]}
    rows = []
    for node in graph["nodes"]:
        if node["node_type"] not in {"stat_signal", "pitfall_pattern_stat"}:
            continue
        attrs = node.get("attrs", {})
        sample_size = int(attrs.get("sample_size", 0))
        if sample_size < 5:
            continue
        rows.append({
            "region": attrs.get("region", "云南省示例区域"),
            "industry": attrs.get("industry", "合成制造业"),
            "dimension": node.get("dimension", "危废管理"),
            "signal_ref": node["node_id"],
            "signal_name": node["name"],
            "recurrence_rate": attrs.get("recurrence_rate", 0),
            "rectification_difficulty": attrs.get("rectification_difficulty", "medium"),
            "sample_size": sample_size,
            "source_ref": "src:demo:aggregation",
            "batch_id": "pitfall-map:2026-06",
        })
    result = {"status": "pass", "rows": rows, "note": "aggregate-only synthetic demo; no enterprise-level records."}
    write_json(REPORTS_DIR / "yunnan-pitfall-map.json", result)
    lines = ["# 云南环保高频踩雷地图 · 危废聚合视图", "", "- 输入仅来自 aggregate 层 stat_signal / pitfall_pattern_stat。", ""]
    for row in rows:
        lines.append(f"- {row['region']} / {row['industry']} / {row['signal_name']}: 复发率 {row['recurrence_rate']}, 整改难度 {row['rectification_difficulty']}, 样本 {row['sample_size']}")
    write_text(REPORTS_DIR / "yunnan-pitfall-map.md", "\n".join(lines))
    print(json.dumps({"rows": len(rows)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
