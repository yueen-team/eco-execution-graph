from __future__ import annotations

import json
from pathlib import Path

from common import EXPORTS_DIR, ROOT, write_graph_package, write_json
from p1_demo_data import DIMENSION, EVIDENCE_CATEGORIES, ISSUES, LAW_META, PRIVATE_TYPES, TECH_SPECS, TODAY


def node(node_id: str, node_type: str, name: str, tier: str, review_status: str = "APPROVED_BASELINE", **extra):
    item = {"node_id": node_id, "node_type": node_type, "name": name, "tier": tier, "review_status": review_status}
    item.update(extra)
    return item


def source(source_id: str, source_type: str, tier: str, doc_ref: str, reviewer: str, review_status: str = "APPROVED_BASELINE", notes: str = ""):
    return {
        "source_id": source_id,
        "source_type": source_type,
        "tier": tier,
        "doc_ref": doc_ref,
        "reviewer": reviewer,
        "review_status": review_status,
        "notes": notes,
    }


def edge(edge_id: str, from_id: str, to_id: str, edge_type: str, tier: str, source_ref: str, confidence: float, reasons: list[str], evidence_count: int, legal_basis_status: str | None = None, **attrs):
    item = {
        "edge_id": edge_id,
        "from": from_id,
        "to": to_id,
        "edge_type": edge_type,
        "tier": tier,
        "confidence": confidence,
        "confidence_reason": reasons,
        "evidence_count": evidence_count,
        "last_verified_at": TODAY,
        "reviewer_role": "ETO" if "ETO_CONFIRMED" in reasons else "SYSTEM",
        "staleness_risk": "low" if confidence >= 0.82 else "medium",
        "confidence_evidence": {
            "verified_count": max(1, evidence_count - 2),
            "rejected_count": 1 if confidence < 0.85 else 0,
            "rectification_pass_rate": round(confidence, 2),
            "last_updated": TODAY,
        },
        "source_ref": source_ref,
        "review_status": "APPROVED_BASELINE",
        "attrs": attrs,
    }
    if legal_basis_status is not None:
        item["legal_basis_status"] = legal_basis_status
    return item


def build():
    nodes = []
    edges = []
    sources = [
        source("src:demo:eto-review", "expert_note", "shared", "synthetic-eto-review-notes-2026-06", "ETO", notes="合成 ETO 审核摘要,仅含虚构样本。"),
        source("src:demo:law-map", "law_or_standard_doc", "shared", "rag-doc-ref-only-law-map-2026-06", "ETO", notes="仅保存法规/规范瘦引用,不含条文全文。"),
        source("src:demo:private-standards", "expert_note", "private", "synthetic-private-standard-index-2026-06", "ETO", notes="内部证据/整改/报告表达标准索引,shared 导出必须过滤。"),
        source("src:demo:aggregation", "aggregation_job", "aggregate", "synthetic-aggregate-hw-2026-06", "SYSTEM", notes="合成聚合统计,样本数均 >=5。"),
    ]

    nodes.extend([
        node("industry:demo:manufacturing", "industry", "合成制造业", "shared", aliases=["制造企业", "合成样本行业"], dimension=DIMENSION),
        node("scenario:hw:temporary-storage", "process_scenario", "危废暂存管理", "shared", aliases=["危废暂存间", "危险废物贮存"], dimension=DIMENSION),
        node("pollution-source:hw:storage-room", "pollution_source", "危废暂存间", "shared", dimension=DIMENSION),
        node("pollutant:hw:hazardous-waste", "pollutant", "危险废物", "shared", dimension=DIMENSION),
    ])

    for law_id, (law_name, article_no, summary, rag_ref) in LAW_META.items():
        nodes.append(node(law_id, "law_article", f"{law_name} {article_no}", "shared", dimension=DIMENSION, attrs={
            "law_name": law_name,
            "article_no": article_no,
            "obligation_summary": summary,
            "effective_status": "现行有效",
            "rag_doc_ref": rag_ref,
        }, lineage_ref=[]))

    for spec_id, (name, summary) in TECH_SPECS.items():
        nodes.append(node(spec_id, "tech_spec", name, "shared", dimension=DIMENSION, attrs={"summary": summary, "rag_doc_ref": f"tencent-lke://{spec_id.replace(':', '/')}"}))

    for evidence_id, name in EVIDENCE_CATEGORIES:
        nodes.append(node(evidence_id, "evidence_category", name, "shared", dimension=DIMENSION, attrs={"share_level": "category"}))

    for issue in ISSUES:
        issue_id = f"issue:hw:{issue['slug']}"
        nodes.append(node(issue_id, "issue_type", issue["name"], "shared", aliases=issue["aliases"], dimension=DIMENSION, attrs={
            "canonical_name": issue["name"],
            "typical_scene": issue["scene"],
            "default_risk_level": issue["risk"],
            "demo_evidence_count": issue["evidence_count"],
            "confidence_seed": issue["confidence"],
            "shared_boundary": "仅输出问题类型、现场表现、证据类别、概念级字段和聚合统计。",
            "internal_boundary": "证据判断标准、整改模板、报告表达和企业实例保留在 private runtime。",
        }))
        nodes.append(node(issue["obligation"], "law_obligation", f"{issue['name']}管理义务", "shared", dimension=DIMENSION, attrs={
            "applies_to": "产废单位",
            "trigger": issue["scene"],
            "requirement_summary": f"围绕{issue['name']}建立可追溯现场管理要求。",
        }))
        nodes.append(node(issue["pitfall"], "pitfall_class", f"{issue['name']}常见误解", "shared", dimension=DIMENSION, attrs={"text": issue["manifestation"]}))
        stat_id = f"stat:hw:{issue['slug']}:yunnan-demo"
        nodes.append(node(stat_id, "stat_signal", f"云南危废-{issue['name']}-聚合信号", "aggregate", dimension=DIMENSION, attrs={
            "region": "云南省示例区域",
            "industry": "合成制造业",
            "sample_size": issue["evidence_count"],
            "recurrence_rate": issue["recurrence_rate"],
            "rectification_difficulty": issue["rectification_difficulty"],
        }))
        nodes.append(node(f"pitfall:stat:{issue['slug']}", "pitfall_pattern_stat", f"{issue['name']}聚合踩雷统计", "aggregate", dimension=DIMENSION, attrs={
            "sample_size": issue["evidence_count"],
            "recurrence_rate": issue["recurrence_rate"],
        }))
        nodes.append(node(f"evidence:field:{issue['slug']}", "evidence_field_requirement", f"{issue['name']}证据字段要求", "shared", dimension=DIMENSION, attrs={"summary": issue["evidence_fields"], "share_level": "shared_concept"}))

        for private_type, label, summary in PRIVATE_TYPES:
            nodes.append(node(f"{private_type}:hw:{issue['slug']}", private_type, f"{issue['name']}{label}", "private", "HUMAN_REVIEWED", dimension=DIMENSION, attrs={"summary": summary}))
        nodes.append(node(f"pitfall:instance:hw:{issue['slug']}:synthetic", "pitfall_instance", f"{issue['name']}合成企业踩雷实例", "private", "HUMAN_REVIEWED", dimension=DIMENSION, attrs={"summary": "合成企业实例,仅用于内部演示,不得导出。"}))

        shared_reasons = ["ETO_CONFIRMED", "LAW_MAPPING_REVIEWED", "MANUAL_REVIEWED"]
        edges.extend([
            edge(f"edge:industry:{issue['slug']}", "scenario:hw:temporary-storage", "industry:demo:manufacturing", "occurs_in", "shared", "src:demo:eto-review", 0.86, ["ETO_CONFIRMED", "AGGREGATE_OBSERVED"], issue["evidence_count"]),
            edge(f"edge:source:{issue['slug']}", "pollution-source:hw:storage-room", "pollutant:hw:hazardous-waste", "emits", "shared", "src:demo:eto-review", 0.82, ["ETO_CONFIRMED"], issue["evidence_count"]),
            edge(f"edge:regulated:{issue['slug']}", issue_id, issue["obligation"], "regulated_by", "shared", "src:demo:law-map", issue["confidence"], shared_reasons, issue["evidence_count"], "internal_reviewed", report_usage_policy="参考相关要求"),
            edge(f"edge:obligation:{issue['slug']}", issue["obligation"], issue["law"], "obligation_of", "shared", "src:demo:law-map", issue["confidence"], shared_reasons, issue["evidence_count"]),
            edge(f"edge:manifest:{issue['slug']}", issue["obligation"], issue_id, "manifests_as", "shared", "src:demo:eto-review", issue["confidence"], shared_reasons, issue["evidence_count"], "internal_reviewed", report_usage_policy="参考相关要求"),
            edge(f"edge:limited:{issue['slug']}", issue_id, issue["tech_spec"], "limited_by", "shared", "src:demo:law-map", issue["confidence"] - 0.02, shared_reasons, issue["evidence_count"]),
            edge(f"edge:pitfall:{issue['slug']}", issue["pitfall"], issue_id, "pitfall_of", "shared", "src:demo:eto-review", 0.8, ["ETO_CONFIRMED", "AGGREGATE_OBSERVED"], issue["evidence_count"]),
            edge(f"edge:pitfall-law:{issue['slug']}", issue["pitfall"], issue["law"], "pitfall_of", "shared", "src:demo:law-map", 0.78, ["LAW_MAPPING_REVIEWED", "AGGREGATE_OBSERVED"], issue["evidence_count"]),
            edge(f"edge:stat:{issue['slug']}", issue_id, stat_id, "supports_stat", "aggregate", "src:demo:aggregation", 0.76, ["AGGREGATE_OBSERVED"], issue["evidence_count"]),
            edge(f"edge:pitfall-stat:{issue['slug']}", f"pitfall:stat:{issue['slug']}", issue["pitfall"], "pitfall_of", "aggregate", "src:demo:aggregation", 0.74, ["AGGREGATE_OBSERVED"], issue["evidence_count"]),
            edge(f"edge:evidence-field:{issue['slug']}", issue_id, f"evidence:field:{issue['slug']}", "evidenced_by", "shared", "src:demo:eto-review", 0.83, ["ETO_CONFIRMED"], issue["evidence_count"]),
        ])
        for evidence_id, _name in EVIDENCE_CATEGORIES:
            edges.append(edge(f"edge:evidence-cat:{issue['slug']}:{evidence_id.split(':')[-1]}", issue_id, evidence_id, "evidenced_by", "shared", "src:demo:eto-review", 0.81, ["ETO_CONFIRMED"], issue["evidence_count"]))
        edges.extend([
            edge(f"edge:evidence-private:{issue['slug']}", issue_id, f"evidence_judgment_standard:hw:{issue['slug']}", "evidenced_by", "private", "src:demo:private-standards", 0.86, ["ETO_CONFIRMED", "MANUAL_REVIEWED"], issue["evidence_count"]),
            edge(f"edge:rectify:{issue['slug']}", issue_id, f"rectification_template:hw:{issue['slug']}", "rectified_by", "private", "src:demo:private-standards", 0.84, ["RECTIFICATION_VERIFIED", "ETO_CONFIRMED"], issue["evidence_count"]),
            edge(f"edge:report:{issue['slug']}", issue_id, f"report_expression:hw:{issue['slug']}", "reported_as", "private", "src:demo:private-standards", 0.83, ["ETO_CONFIRMED", "MANUAL_REVIEWED"], issue["evidence_count"]),
            edge(f"edge:pitfall-instance:{issue['slug']}", f"pitfall:instance:hw:{issue['slug']}:synthetic", issue_id, "pitfall_of", "private", "src:demo:private-standards", 0.79, ["ETO_CONFIRMED"], issue["evidence_count"]),
        ])

    graph = {"nodes": nodes, "edges": edges, "sources": sources}
    return graph


def make_registry(graph: dict) -> list[dict]:
    by_id = {node["node_id"]: node for node in graph["nodes"]}
    registry = []
    for issue in ISSUES:
        issue_id = f"issue:hw:{issue['slug']}"
        registry.append({
            "issue_type_id": issue_id,
            "canonical_name": issue["name"],
            "aliases": issue["aliases"],
            "dimension": DIMENSION,
            "typical_scene": issue["scene"],
            "default_risk_level": issue["risk"],
            "tier": by_id[issue_id]["tier"],
            "review_status": by_id[issue_id]["review_status"],
            "source_ref": "src:demo:eto-review",
            "demo_evidence_count": issue["evidence_count"],
            "confidence_seed": issue["confidence"],
            "shared_boundary": by_id[issue_id]["attrs"]["shared_boundary"],
            "internal_boundary": by_id[issue_id]["attrs"]["internal_boundary"],
        })
    return registry


def make_cards(graph: dict, shared: bool) -> list[dict]:
    cards = []
    for issue in ISSUES:
        issue_id = f"issue:hw:{issue['slug']}"
        edge_refs = [
            f"edge:regulated:{issue['slug']}",
            f"edge:obligation:{issue['slug']}",
            f"edge:manifest:{issue['slug']}",
            f"edge:limited:{issue['slug']}",
            f"edge:evidence-field:{issue['slug']}",
            f"edge:pitfall:{issue['slug']}",
        ]
        card = {
            "card_id": f"card:hw:{issue['slug']}",
            "title": f"{issue['name']}执行卡",
            "dimension": DIMENSION,
            "law_article_ref": {"node_id": issue["law"], "lineage_note": "法典 lineage 待政府格式对接后校准"},
            "related_obligations": [issue["obligation"]],
            "field_manifestations": [{
                "issue_type_ref": issue_id,
                "description": issue["manifestation"],
                "frequency_signal": f"stat:hw:{issue['slug']}:yunnan-demo",
            }],
            "evidence_categories": [{"ref": ref, "label": label, "tier": "shared"} for ref, label in EVIDENCE_CATEGORIES],
            "evidence_field_requirements": [{"ref": f"evidence:field:{issue['slug']}", "summary": issue["evidence_fields"], "share_level": "shared_concept"}],
            "evidence_summary": "、".join([label for _ref, label in EVIDENCE_CATEGORIES]),
            "rectification_summary": "内部整改闭环模板已建立;shared 版只展示方向和数量占位。" if shared else issue["rectification"],
            "report_expression_summary": "报告表达边界已建立;shared 版不输出模板全文。" if shared else issue["report_expression"],
            "pitfalls": [{"ref": issue["pitfall"], "text": issue["manifestation"], "pitfall_type": "pitfall_class", "tier": "shared"}],
            "legal_basis_status": "internal_reviewed",
            "graph_slice_refs": {
                "nodes": [
                    issue_id,
                    issue["law"],
                    issue["obligation"],
                    issue["tech_spec"],
                    issue["pitfall"],
                    f"evidence:field:{issue['slug']}",
                    f"stat:hw:{issue['slug']}:yunnan-demo",
                ],
                "edges": edge_refs,
            },
            "export_policy": {
                "tier": "shared" if shared else "private",
                "export_allowed": shared,
                "redaction": "internal runtime refs replaced by capability count placeholders" if shared else "internal full view only",
            },
            "quality_score": {
                "confidence": issue["confidence"],
                "evidence_count": issue["evidence_count"],
                "last_verified_at": TODAY,
                "staleness_risk": "low" if issue["confidence"] >= 0.82 else "medium",
            },
            "render_views": {"internal_full": not shared, "shared_export": shared},
            "review_status": "APPROVED_BASELINE",
        }
        if shared:
            card["internal_capability_placeholders"] = [
                {"kind": "evidence_standard_count", "count": 1, "summary": "证据判断能力已建立 1 条,不进入共有包。"},
                {"kind": "rectification_standard_count", "count": 1, "summary": "整改标准已建立 1 条,不进入共有包。"},
                {"kind": "report_rule_count", "count": 1, "summary": "报告表达规则已建立 1 条,不进入共有包。"},
            ]
            card["rectifications"] = [{"ref": "internal-count:rectification-template", "summary": "内部整改标准已建立 1 条,不进入共有包。"}]
            card["report_expressions"] = [{"ref": "internal-count:report-expression"}]
        else:
            card["evidence_private_refs"] = [{"ref": f"evidence_judgment_standard:hw:{issue['slug']}", "kind": "judgment_standard"}]
            card["rectifications"] = [{"ref": f"rectification_template:hw:{issue['slug']}", "summary": issue["rectification"], "pass_rate": f"{round(issue['confidence'] * 100)}%"}]
            card["report_expressions"] = [{"ref": f"report_expression:hw:{issue['slug']}"}]
        cards.append(card)
    return cards


def main() -> None:
    graph = build()
    write_json(ROOT / "data" / "candidates" / "issue_type_registry.json", make_registry(graph))
    write_json(ROOT / "data" / "candidates" / "graph_seed_p1_hazardous_waste.json", graph)
    internal_cards = make_cards(graph, shared=False)
    shared_cards = make_cards(graph, shared=True)
    write_json(ROOT / "data" / "candidates" / "cards" / "internal_cards.json", internal_cards)
    write_json(ROOT / "data" / "candidates" / "cards" / "shared_cards.json", shared_cards)
    package_dir = EXPORTS_DIR / "demo_hazardous_waste_internal"
    manifest = write_graph_package(package_dir, graph, "demo_hazardous_waste_internal", None, True)
    write_json(package_dir / "cards.internal.json", internal_cards)
    write_json(package_dir / "cards.shared-preview.json", shared_cards)
    ui_public = ROOT / "graph-ui" / "public" / "demo-data"
    write_json(ui_public / "graph.json", graph)
    write_json(ui_public / "cards.json", internal_cards)
    print(json.dumps({"package": str(package_dir), "manifest": manifest["record_counts"], "cards": len(internal_cards)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
