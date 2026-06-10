from __future__ import annotations

import json

from common import REPORTS_DIR, load_internal_graph, write_json, write_text

REQUIRED = {"confidence", "confidence_reason", "evidence_count", "last_verified_at", "reviewer_role", "staleness_risk", "source_ref", "tier", "review_status"}


def main() -> None:
    graph = load_internal_graph()
    missing = []
    high_staleness = []
    for edge in graph["edges"]:
        miss = sorted(field for field in REQUIRED if field not in edge)
        if miss:
            missing.append({"edge_id": edge["edge_id"], "missing": miss})
        if edge.get("staleness_risk") == "high":
            high_staleness.append(edge["edge_id"])
    result = {
        "status": "pass" if not missing else "failed",
        "edge_count": len(graph["edges"]),
        "missing": missing,
        "high_staleness": high_staleness,
    }
    write_json(REPORTS_DIR / "graph-quality-score-coverage.json", result)
    write_text(REPORTS_DIR / "graph-quality-score-coverage.md", "\n".join([
        "# 图谱质量评分覆盖报告",
        "",
        f"- status: `{result['status']}`",
        f"- edge_count: {result['edge_count']}",
        f"- missing: {len(missing)}",
        f"- high_staleness: {len(high_staleness)}",
    ]))
    print(json.dumps(result, ensure_ascii=False))
    if missing:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
