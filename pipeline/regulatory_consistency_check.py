from __future__ import annotations

import sys

from p2p3_common import regulatory_full

if "--scope" in sys.argv and "full" in sys.argv:
    import json
    result = regulatory_full()
    print(json.dumps(result, ensure_ascii=False))
    raise SystemExit(1 if result["findings"] else 0)

import json
import re

from common import EXPORTS_DIR, REPORTS_DIR, load_internal_graph, read_json, write_json, write_text


def add(findings: list[dict], code: str, severity: str, message: str, trace_ref: str = "") -> None:
    findings.append({"code": code, "severity": severity, "message": message, "trace_ref": trace_ref})


def main() -> None:
    graph = load_internal_graph()
    nodes = {node["node_id"]: node for node in graph["nodes"]}
    sources = {source["source_id"]: source for source in graph["sources"]}
    findings: list[dict] = []
    for edge in graph["edges"]:
        if edge.get("source_ref") not in sources:
            add(findings, "missing_source_ref", "blocking", "边缺少可解析 source_ref。", edge["edge_id"])
        if edge["edge_type"] in {"regulated_by", "manifests_as"}:
            status = edge.get("legal_basis_status")
            if status in {"candidate", "disputed"}:
                add(findings, "candidate_or_disputed_basis", "blocking", "候选或争议依据不得对外引用。", edge["edge_id"])
            if not status:
                add(findings, "missing_legal_basis_status", "blocking", "法律判断边缺少 legal_basis_status。", edge["edge_id"])
    for node in graph["nodes"]:
        if node["node_type"] == "law_article":
            attrs = node.get("attrs", {})
            if not attrs.get("article_no") or not attrs.get("rag_doc_ref"):
                add(findings, "missing_law_reference", "blocking", "law_article 缺条款号或 RAG 引用。", node["node_id"])
            if re.search(r"第一条|第二条|第三条|本法全文|全文", json.dumps(attrs, ensure_ascii=False)):
                add(findings, "law_full_text_in_graph", "blocking", "law_article attrs 疑似包含条文全文。", node["node_id"])
            if attrs.get("effective_status") != "现行有效":
                add(findings, "law_status_risk", "warning", "法条状态非现行有效。", node["node_id"])
    shared_path = EXPORTS_DIR / "shared_hazardous_waste_v1" / "graph.json"
    if shared_path.exists():
        shared = read_json(shared_path)
        for section in ("nodes", "edges", "sources"):
            for record in shared[section]:
                if record.get("tier") != "shared":
                    add(findings, "shared_contains_private", "blocking", "shared 包含非 shared 记录。", record.get("node_id") or record.get("edge_id") or record.get("source_id"))
    report = read_json(REPORTS_DIR / "monthly-report-comparison-hazardous-waste.json") if (REPORTS_DIR / "monthly-report-comparison-hazardous-waste.json").exists() else {}
    text = report.get("graph_context_paragraph", "")
    if "违法" in text or "违反" in text:
        add(findings, "management_advice_miscast_as_law", "blocking", "月报段落出现违法/违反定性,需确认 legal_basis_status。")
    result = {"status": "blocked" if any(f["severity"] == "blocking" for f in findings) else ("warning" if findings else "pass"), "findings": findings}
    write_json(REPORTS_DIR / "regulatory-consistency-check.json", result)
    lines = ["# 监管口径一致性检查", "", f"- status: `{result['status']}`", f"- findings: {len(findings)}"]
    for finding in findings:
        lines.append(f"- [{finding['severity']}] {finding['code']}: {finding['message']} {finding['trace_ref']}")
    write_text(REPORTS_DIR / "regulatory-consistency-check.md", "\n".join(lines))
    print(json.dumps(result, ensure_ascii=False))
    if result["status"] == "blocked":
        raise SystemExit(1)


if __name__ == "__main__":
    main()
