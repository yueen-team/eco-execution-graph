from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from typing import Any

from common import EXPORTS_DIR, REPORTS_DIR, ROOT, load_internal_graph, read_json, write_json, write_text


LEGAL_EDGE_TYPES = {"regulated_by", "manifests_as", "obligation_of", "limited_by"}
EVIDENCE_EDGE_TYPES = {"evidenced_by", "requires_evidence", "supported_by"}
OUTSIDE_AUDIENCES = {"enterprise", "government_demo", "shared_export"}
BLOCKING = "blocking"
WARNING = "warning"

ASSERTIVE_LEGAL_RE = re.compile(r"依据|根据|违反|违法|不符合|应当|必须")
HARD_LEGAL_RE = re.compile(r"依据|根据|违反|违法|不符合")
SAFE_DOWNGRADE_RE = re.compile(r"建议核查|建议完善|管理建议|参考相关要求|需.*确认|进一步核查|存在管理风险")
OVERCOMMIT_RE = re.compile(r"必然合规|完全合法|保证通过|无任何风险|百分之百|100%|一定通过|绝对合规")
LAW_CITATION_RE = re.compile(
    r"(?:《(?P<law_book>[^》]{2,60})》|(?P<law_plain>[\u4e00-\u9fffA-Za-z0-9（）()]{2,60}?(?:法|条例|办法|规范|标准)))?"
    r"\s*(?P<article>第[一二三四五六七八九十百千万零〇\d]+条(?:之[一二三四五六七八九十\d]+)?)"
)
FULL_TEXT_RE = re.compile(r"本法全文|全文如下|第一条.{20,}第二条")


def add(
    findings: list[dict[str, Any]],
    code: str,
    severity: str,
    message: str,
    trace_ref: str = "",
    *,
    guidance: str = "",
    matched_text: str = "",
) -> None:
    findings.append(
        {
            "code": code,
            "severity": severity,
            "message": message,
            "trace_ref": trace_ref,
            "guidance": guidance,
            "matched_text": matched_text,
        }
    )


def edge_source_ref(edge: dict[str, Any]) -> str | None:
    return edge.get("source_ref") or edge.get("attrs", {}).get("source_ref")


def edge_report_usage_policy(edge: dict[str, Any]) -> str:
    return str(edge.get("report_usage_policy") or edge.get("attrs", {}).get("report_usage_policy") or "")


def node_effective_status(node: dict[str, Any]) -> str:
    return str(node.get("effective_status") or node.get("attrs", {}).get("effective_status") or "")


def graph_indexes(graph: dict[str, Any]) -> dict[str, Any]:
    nodes = {node.get("node_id"): node for node in graph.get("nodes", []) if node.get("node_id")}
    edges = {edge.get("edge_id"): edge for edge in graph.get("edges", []) if edge.get("edge_id")}
    sources = {source.get("source_id"): source for source in graph.get("sources", []) if source.get("source_id")}
    outgoing: dict[str, list[dict[str, Any]]] = {}
    incoming: dict[str, list[dict[str, Any]]] = {}
    law_locators: dict[tuple[str, str], str] = {}
    article_only: dict[str, set[str]] = {}
    for edge in edges.values():
        outgoing.setdefault(edge.get("from", ""), []).append(edge)
        incoming.setdefault(edge.get("to", ""), []).append(edge)
    for node_id, node in nodes.items():
        if node.get("node_type") != "law_article":
            continue
        attrs = node.get("attrs", {})
        law_name = str(attrs.get("law_name") or node.get("law_name") or node.get("name") or "")
        article_no = str(attrs.get("article_no") or node.get("article_no") or "")
        if law_name and article_no:
            law_locators[(law_name, article_no)] = node_id
            article_only.setdefault(article_no, set()).add(node_id)
    return {
        "nodes": nodes,
        "edges": edges,
        "sources": sources,
        "outgoing": outgoing,
        "incoming": incoming,
        "law_locators": law_locators,
        "article_only": article_only,
    }


def as_set(trace: dict[str, Any], key: str) -> set[str]:
    value = trace.get(key) or []
    return {str(item) for item in value if item}


def trace_context(trace: dict[str, Any], indexes: dict[str, Any]) -> dict[str, Any]:
    nodes = indexes["nodes"]
    edges = indexes["edges"]
    outgoing = indexes["outgoing"]
    incoming = indexes["incoming"]
    trace_node_ids = as_set(trace, "node_ids")
    trace_edge_ids = as_set(trace, "edge_ids")
    trace_source_ids = as_set(trace, "source_ids")

    for edge_id in list(trace_edge_ids):
        edge = edges.get(edge_id)
        if not edge:
            continue
        trace_node_ids.add(str(edge.get("from", "")))
        trace_node_ids.add(str(edge.get("to", "")))

    legal_edges: list[dict[str, Any]] = []
    evidence_edges: list[dict[str, Any]] = []
    for edge_id in trace_edge_ids:
        edge = edges.get(edge_id)
        if not edge:
            continue
        edge_type = edge.get("edge_type")
        if edge_type in LEGAL_EDGE_TYPES:
            legal_edges.append(edge)
        if edge_type in EVIDENCE_EDGE_TYPES:
            evidence_edges.append(edge)
        trace_node_ids.add(str(edge.get("from", "")))
        trace_node_ids.add(str(edge.get("to", "")))

    law_node_ids = {node_id for node_id in trace_node_ids if nodes.get(node_id, {}).get("node_type") == "law_article"}
    for edge in legal_edges:
        for endpoint in (edge.get("from"), edge.get("to")):
            node = nodes.get(endpoint)
            if node and node.get("node_type") == "law_article":
                law_node_ids.add(str(endpoint))

    issue_present = any(nodes.get(node_id, {}).get("node_type") == "issue_type" for node_id in trace_node_ids)
    evidence_present = bool(evidence_edges) or any(
        nodes.get(node_id, {}).get("node_type") in {"evidence_category", "evidence_class"} for node_id in trace_node_ids
    )
    source_present = any(source_id in indexes["sources"] for source_id in trace_source_ids) or any(
        edge_source_ref(edge) in indexes["sources"] for edge in legal_edges + evidence_edges
    )

    statuses = []
    for edge in legal_edges:
        status = edge.get("legal_basis_status")
        if status:
            statuses.append({"status": status, "edge_id": edge.get("edge_id"), "edge_type": edge.get("edge_type")})
    for node_id in trace_node_ids:
        node = nodes.get(node_id) or {}
        status = node.get("legal_basis_status") or node.get("attrs", {}).get("legal_basis_status")
        if status:
            statuses.append({"status": status, "node_id": node_id, "node_type": node.get("node_type")})

    return {
        "trace_node_ids": trace_node_ids,
        "trace_edge_ids": trace_edge_ids,
        "trace_source_ids": trace_source_ids,
        "legal_edges": legal_edges,
        "evidence_edges": evidence_edges,
        "law_node_ids": law_node_ids,
        "issue_present": issue_present,
        "evidence_present": evidence_present,
        "source_present": source_present,
        "statuses": statuses,
    }


def find_law_citations(text: str) -> list[dict[str, str]]:
    citations = []
    for match in LAW_CITATION_RE.finditer(text):
        law_name = (match.group("law_book") or match.group("law_plain") or "").strip()
        article_no = match.group("article").strip()
        if not article_no:
            continue
        citations.append({"law_name": law_name, "article_no": article_no, "matched_text": match.group(0).strip()})
    return citations


def resolve_law_citation(citation: dict[str, str], indexes: dict[str, Any]) -> set[str]:
    law_name = citation["law_name"]
    article_no = citation["article_no"]
    if law_name:
        direct = indexes["law_locators"].get((law_name, article_no))
        if direct:
            return {direct}
        return set()
    return set(indexes["article_only"].get(article_no, set()))


def government_mismatch(record: dict[str, Any]) -> bool:
    attrs = record.get("attrs", {})
    status = str(record.get("government_position_status") or attrs.get("government_position_status") or "")
    note = str(record.get("government_position") or attrs.get("government_position") or attrs.get("government_position_note") or "")
    return status in {"mismatch", "conflict", "inconsistent"} or "不一致" in note or "冲突" in note


def check_report_conclusion(
    text: str,
    trace: dict[str, Any],
    graph: dict[str, Any],
    *,
    audience: str = "government_demo",
    conclusion_id: str = "conclusion",
) -> dict[str, Any]:
    indexes = graph_indexes(graph)
    ctx = trace_context(trace, indexes)
    findings: list[dict[str, Any]] = []
    assertive = bool(ASSERTIVE_LEGAL_RE.search(text))
    hard_legal = bool(HARD_LEGAL_RE.search(text))
    safe_downgrade = bool(SAFE_DOWNGRADE_RE.search(text))
    outside = audience in OUTSIDE_AUDIENCES

    for match in OVERCOMMIT_RE.finditer(text):
        add(
            findings,
            "overcommitted_language",
            BLOCKING,
            "这句话承诺过满,不能写成一定合规、保证通过或没有任何风险。",
            conclusion_id,
            guidance="改成“建议核查”“目前未见明显异常,仍需结合证据和监管口径确认”。",
            matched_text=match.group(0),
        )

    for citation in find_law_citations(text):
        resolved = resolve_law_citation(citation, indexes)
        if not resolved:
            add(
                findings,
                "missing_law_reference",
                BLOCKING,
                "文本引用了图谱里找不到的法条定位。",
                conclusion_id,
                guidance="先补 law_article 瘦节点和 RAG 引用,否则删除具体条款号。",
                matched_text=citation["matched_text"],
            )
            continue
        if not (resolved & ctx["law_node_ids"]):
            add(
                findings,
                "missing_law_reference",
                BLOCKING,
                "文本引用的法条存在,但本结论 trace 没有挂到这条法条。",
                conclusion_id,
                guidance="补齐 trace.node_ids/edge_ids,或把表述降为不带具体条款号的管理建议。",
                matched_text=citation["matched_text"],
            )

    for status_ref in ctx["statuses"]:
        status = status_ref["status"]
        trace_ref = str(status_ref.get("edge_id") or status_ref.get("node_id") or conclusion_id)
        if status in {"candidate", "disputed"} and hard_legal and outside:
            add(
                findings,
                "candidate_or_disputed_basis",
                BLOCKING,
                "候选或争议口径不能对外写成依据、根据、违反或违法。",
                trace_ref,
                guidance="进入人工审核;对外只保留“建议核查”或“需结合监管口径确认”。",
            )
        if status == "no_legal_basis" and hard_legal:
            add(
                findings,
                "management_advice_miscast_as_law",
                BLOCKING,
                "这类问题当前没有法律依据,不能包装成违法或违反某条规定。",
                trace_ref,
                guidance="改成管理建议,不要写违法、违反、依据或根据。",
            )
        if status == "internal_reviewed" and re.search(r"依据|根据|违反|违法", text) and outside:
            add(
                findings,
                "basis_requires_official_confirmation",
                BLOCKING,
                "内部审核口径还不是官方确认口径,对外不能写成确定法律依据或违法认定。",
                trace_ref,
                guidance="改成“参考相关要求”“建议结合监管口径确认”。",
            )

    if outside and assertive and ctx["issue_present"] and (not ctx["evidence_present"] or not ctx["source_present"]) and not safe_downgrade:
        missing = []
        if not ctx["evidence_present"]:
            missing.append("证据类别")
        if not ctx["source_present"]:
            missing.append("来源")
        add(
            findings,
            "missing_evidence_chain",
            BLOCKING,
            "对外结论缺少可追溯证据链,不能直接下确定判断。",
            conclusion_id,
            guidance=f"先补{','.join(missing)},或把结论降级成“建议核查/管理建议”。",
        )

    for law_node_id in ctx["law_node_ids"]:
        law_node = indexes["nodes"].get(law_node_id, {})
        effective_status = node_effective_status(law_node)
        if effective_status and effective_status != "现行有效":
            add(
                findings,
                "law_status_risk",
                BLOCKING if hard_legal and outside else WARNING,
                "引用的条款不是现行有效状态,需要人工复核后再对外使用。",
                law_node_id,
                guidance="废止、待确认、待生效或冲突条款只能进入人工审核,不能直接作为结论依据。",
                matched_text=effective_status,
            )
        if government_mismatch(law_node):
            add(
                findings,
                "government_position_mismatch",
                BLOCKING,
                "图谱口径标记为与政府确认口径不一致,必须进入人工审核。",
                law_node_id,
                guidance="对外先不引用该结论,等政府口径或 ETO 审核确认后再放行。",
            )
    for edge in ctx["legal_edges"]:
        if government_mismatch(edge):
            add(
                findings,
                "government_position_mismatch",
                BLOCKING,
                "法律判断边与政府确认口径不一致,必须进入人工审核。",
                str(edge.get("edge_id") or conclusion_id),
                guidance="对外先不引用该结论,等政府口径或 ETO 审核确认后再放行。",
            )

    return {
        "status": status_from_findings(findings),
        "audience": audience,
        "conclusion_id": conclusion_id,
        "findings": findings,
        "trace_summary": {
            "nodes": len(ctx["trace_node_ids"]),
            "edges": len(ctx["trace_edge_ids"]),
            "sources": len(ctx["trace_source_ids"]),
            "law_articles": len(ctx["law_node_ids"]),
            "legal_edges": len(ctx["legal_edges"]),
            "evidence_chain_present": bool(ctx["evidence_present"] and ctx["source_present"]),
        },
    }


def graph_level_findings(graph: dict[str, Any], input_ref: str) -> list[dict[str, Any]]:
    indexes = graph_indexes(graph)
    findings: list[dict[str, Any]] = []
    for edge in graph.get("edges", []):
        edge_id = str(edge.get("edge_id") or "")
        source_ref = edge_source_ref(edge)
        if source_ref not in indexes["sources"]:
            add(findings, "missing_source_ref", BLOCKING, "边缺少可解析 source_ref。", edge_id)
        if edge.get("edge_type") in LEGAL_EDGE_TYPES:
            status = edge.get("legal_basis_status")
            if not status:
                add(findings, "missing_legal_basis_status", BLOCKING, "法律判断边缺少 legal_basis_status。", edge_id)
            if status in {"candidate", "disputed", "no_legal_basis"} and edge_report_usage_policy(edge) in {"依据", "根据"}:
                add(findings, "unsafe_report_policy", BLOCKING, "未确认法律口径不能配置成“依据/根据”。", edge_id)
    for node in graph.get("nodes", []):
        if node.get("node_type") != "law_article":
            continue
        attrs = node.get("attrs", {})
        node_id = str(node.get("node_id") or "")
        if not (attrs.get("law_name") and attrs.get("article_no")):
            add(findings, "law_article_missing_locator", BLOCKING, "law_article 缺法规名或条款号。", node_id)
        if not attrs.get("rag_doc_ref"):
            add(findings, "missing_law_reference", BLOCKING, "law_article 缺 RAG 引用定位。", node_id)
        if FULL_TEXT_RE.search(json.dumps(attrs, ensure_ascii=False)):
            add(findings, "law_full_text_in_graph", BLOCKING, "law_article attrs 疑似包含条文全文。", node_id)
        effective_status = node_effective_status(node)
        if effective_status and effective_status != "现行有效":
            add(findings, "law_status_risk", WARNING, "法条状态非现行有效,对外引用前要人工复核。", node_id)
    for section in ("nodes", "edges", "sources"):
        for record in graph.get(section, []):
            if record.get("tier") == "private" and "shared" in input_ref:
                add(
                    findings,
                    "shared_contains_private",
                    BLOCKING,
                    "shared 包含 private 记录。",
                    str(record.get("node_id") or record.get("edge_id") or record.get("source_id") or ""),
                )
    return findings


def status_from_findings(findings: list[dict[str, Any]]) -> str:
    if any(finding["severity"] == BLOCKING for finding in findings):
        return "blocked"
    if findings:
        return "warning"
    return "pass"


def load_graph_for_scope(scope: str) -> tuple[dict[str, Any], str]:
    candidates: list[Path]
    if scope == "full":
        candidates = [
            EXPORTS_DIR / "full_internal_product_v1" / "graph.json",
            ROOT / "data" / "upstream" / "full-graph-source.json",
            EXPORTS_DIR / "shared_product_v1" / "graph.json",
        ]
    else:
        candidates = [EXPORTS_DIR / "demo_hazardous_waste_internal" / "graph.json"]
    for path in candidates:
        if path.exists():
            return read_json(path), str(path.relative_to(ROOT)).replace("\\", "/")
    return {"nodes": [], "edges": [], "sources": []}, "missing"


def conclusion_inputs(scope: str) -> list[dict[str, Any]]:
    inputs: list[dict[str, Any]] = []
    hazard_path = REPORTS_DIR / "monthly-report-comparison-hazardous-waste.json"
    if hazard_path.exists():
        report = read_json(hazard_path)
        inputs.append(
            {
                "conclusion_id": "monthly-report-comparison-hazardous-waste.graph_context_paragraph",
                "text": report.get("graph_context_paragraph", ""),
                "trace": report.get("trace", {}),
                "audience": "enterprise",
            }
        )
    if scope == "full":
        full_path = REPORTS_DIR / "monthly-report-comparison-full.json"
        if full_path.exists():
            report = read_json(full_path)
            bundles = report.get("bundles") or []
            bundle_by_issue = {bundle.get("issue_type"): bundle for bundle in bundles}
            for item in report.get("comparisons", []):
                issue_type = item.get("issue_type")
                bundle = bundle_by_issue.get(issue_type, {})
                inputs.append(
                    {
                        "conclusion_id": item.get("case_id") or "monthly-full",
                        "text": item.get("graph_context") or "",
                        "trace": bundle.get("source_trace") or {},
                        "audience": "enterprise",
                    }
                )
    return [item for item in inputs if item["text"]]


def run(scope: str = "demo") -> dict[str, Any]:
    graph, graph_input = load_graph_for_scope(scope)
    findings = graph_level_findings(graph, graph_input)
    conclusion_results = []
    for item in conclusion_inputs(scope):
        checked = check_report_conclusion(
            item["text"],
            item.get("trace", {}),
            graph,
            audience=item.get("audience", "government_demo"),
            conclusion_id=item.get("conclusion_id", "conclusion"),
        )
        conclusion_results.append(checked)
        findings.extend(checked["findings"])
    result = {
        "status": status_from_findings(findings),
        "scope": scope,
        "graph_input": graph_input,
        "summary": {
            "findings": len(findings),
            "blocking": sum(1 for finding in findings if finding["severity"] == BLOCKING),
            "warning": sum(1 for finding in findings if finding["severity"] == WARNING),
            "conclusions_checked": len(conclusion_results),
        },
        "findings": findings,
        "conclusion_results": conclusion_results,
    }
    suffix = "-full" if scope == "full" else ""
    write_json(REPORTS_DIR / f"regulatory-consistency-check{suffix}.json", result)
    write_markdown_report(REPORTS_DIR / f"regulatory-consistency-check{suffix}.md", result)
    return result


def write_markdown_report(path: Path, result: dict[str, Any]) -> None:
    lines = [
        "# 监管口径一致性检查",
        "",
        f"- 状态: `{result['status']}`",
        f"- 检查范围: `{result['scope']}`",
        f"- 图谱输入: `{result['graph_input']}`",
        f"- 结论文本检查数: {result['summary']['conclusions_checked']}",
        f"- 风险总数: {result['summary']['findings']}",
        f"- 阻断风险: {result['summary']['blocking']}",
        f"- 提醒风险: {result['summary']['warning']}",
        "",
    ]
    if not result["findings"]:
        lines.append("没有发现错引法条、管理建议违法化、证据链断裂、过度承诺或条款状态风险。")
    else:
        lines.append("## 风险明细")
        lines.append("")
        for finding in result["findings"]:
            lines.append(f"- [{finding['severity']}] {finding['code']}: {finding['message']}")
            if finding.get("trace_ref"):
                lines.append(f"  - 追溯对象: `{finding['trace_ref']}`")
            if finding.get("matched_text"):
                lines.append(f"  - 命中文本: `{finding['matched_text']}`")
            if finding.get("guidance"):
                lines.append(f"  - 建议: {finding['guidance']}")
    write_text(path, "\n".join(lines))


def main() -> None:
    scope = "full" if "--scope" in sys.argv and "full" in sys.argv else "demo"
    result = run(scope)
    print(json.dumps(result, ensure_ascii=False))
    if result["status"] == "blocked":
        raise SystemExit(1)


if __name__ == "__main__":
    main()
