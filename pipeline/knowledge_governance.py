from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import re
from collections import defaultdict
from pathlib import Path
from typing import Any

from common import EXPORTS_DIR, REPORTS_DIR, ROOT, read_json, write_json, write_text


GOVERNANCE_DIR = ROOT / "data" / "knowledge-governance"
DOC_REGISTRY_PATH = GOVERNANCE_DIR / "doc-registry" / "knowledge-documents.json"
CANDIDATES_PATH = GOVERNANCE_DIR / "candidates" / "governance-candidates.json"
PUBLICATIONS_DIR = GOVERNANCE_DIR / "publications"
RAG_REPORT_PATH = REPORTS_DIR / "rag-citation-resolution-report.json"
FULL_INTERNAL_GRAPH_PATH = EXPORTS_DIR / "full_internal_product_v1" / "graph.json"
DEMO_INTERNAL_GRAPH_PATH = EXPORTS_DIR / "demo_hazardous_waste_internal" / "graph.json"
DEFAULT_GRAPH_PATH = FULL_INTERNAL_GRAPH_PATH if FULL_INTERNAL_GRAPH_PATH.exists() else DEMO_INTERNAL_GRAPH_PATH
GOVERNANCE_REPORT_JSON = REPORTS_DIR / "knowledge-governance-report.json"
GOVERNANCE_REPORT_MD = REPORTS_DIR / "knowledge-governance-report.md"
PUBLICATION_REPORT_JSON = REPORTS_DIR / "knowledge-publication-report.json"
PUBLICATION_REPORT_MD = REPORTS_DIR / "knowledge-publication-report.md"

ARTICLE_RE = re.compile(r"第[一二三四五六七八九十百千万零〇两\d]+条(?:之[一二三四五六七八九十\d]+)?")
STANDARD_RE = re.compile(
    r"\b(?:GB|GB/T|HJ|HJ/T|DB\d{2}|DB\d{2}/T|T/[A-Z0-9]+)\s*[0-9][0-9A-Za-z./-]*(?:[-—－][0-9]{2,4})?\b",
    re.IGNORECASE,
)
HASH_SUFFIX_RE = re.compile(r"__[0-9a-fA-F]{6,}$")
FORBIDDEN_KEYS = {
    "content",
    "raw_text",
    "full_text",
    "original_text",
    "enterprise_name",
    "company_name",
    "gps",
    "photo_path",
    "raw_report",
}
FORBIDDEN_VALUE_MARKERS = (
    "RAG 原文正文",
    "原始报告全文",
    "照片路径",
    "GPS",
)
PUBLISHABLE_REVIEW_STATUSES = {"approved", "human_reviewed"}
PUBLISHABLE_EFFECTIVE_STATUSES = {"effective"}
PUBLIC_AUDIENCES = ("expert_agent", "ecocheck", "ecodoc")


def stable_hash(value: Any) -> str:
    text = json.dumps(value, ensure_ascii=False, sort_keys=True)
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def rel_path(path: Path) -> str:
    try:
        return str(path.relative_to(ROOT)).replace("\\", "/")
    except ValueError:
        return str(path).replace("\\", "/")


def as_text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value.strip()
    return str(value).strip()


def slug(value: str) -> str:
    text = re.sub(r"[^a-zA-Z0-9_\-\u4e00-\u9fff]+", "-", value.strip()).strip("-")
    return text[:96] or "unknown"


def normalize_standard_no(value: str) -> str | None:
    match = STANDARD_RE.search(value.replace("－", "-").replace("—", "-"))
    if not match:
        return None
    return re.sub(r"\s+", " ", match.group(0).replace("—", "-").replace("－", "-")).strip().upper()


def canonical_title(title: str, law_name: str = "") -> str:
    text = law_name or title
    text = HASH_SUFFIX_RE.sub("", text)
    text = ARTICLE_RE.sub("", text)
    text = re.sub(r"tencent-lke://\S+", "", text)
    text = re.sub(r"\s+", "", text)
    text = text.replace("（", "(").replace("）", ")")
    return text.strip("·-_:：") or title


def infer_doc_type(title: str, node_type: str = "") -> str:
    if node_type == "law_article" or any(term in title for term in ("法", "条例", "办法", "规定")):
        return "law"
    if node_type in {"tech_spec", "standard_limit"} or normalize_standard_no(title):
        return "technical_standard"
    if any(term in title for term in ("指南", "导则")):
        return "guideline"
    if any(term in title for term in ("目录", "政策", "通知")):
        return "policy_doc"
    return "unknown"


def map_review_status(value: str) -> str:
    upper = value.upper()
    if upper == "APPROVED_BASELINE":
        return "approved"
    if upper == "HUMAN_REVIEWED":
        return "human_reviewed"
    if upper in {"REJECTED", "DEPRECATED"}:
        return "rejected" if upper == "REJECTED" else "approved"
    return "candidate"


def infer_effective_status(*values: str) -> str:
    joined = " ".join(value for value in values if value)
    lowered = joined.lower()
    if "已废止" in joined or "废止" in joined or "deprecated" in lowered:
        return "deprecated"
    if "被替代" in joined or "superseded" in lowered:
        return "superseded"
    if "待生效" in joined or "征求意见" in joined or "draft" in lowered:
        return "draft"
    if "现行有效" in joined or "有效" in joined:
        return "effective"
    return "effective"


def infer_supersedes(title: str) -> list[str]:
    if "代替" not in title:
        return []
    after = title.split("代替", 1)[1]
    matches = [re.sub(r"\s+", " ", match.replace("—", "-").replace("－", "-")).strip().upper() for match in STANDARD_RE.findall(after)]
    return sorted(set(matches))


def load_graph(graph_path: Path) -> dict[str, Any]:
    if not graph_path.exists():
        return {"nodes": [], "edges": [], "sources": []}
    return read_json(graph_path)


def graph_nodes_by_id(graph: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {
        node.get("node_id"): node
        for node in graph.get("nodes", [])
        if isinstance(node, dict) and node.get("node_id")
    }


def citation_records(rag_report: dict[str, Any]) -> list[dict[str, Any]]:
    records = rag_report.get("results", [])
    return [record for record in records if isinstance(record, dict)]


def source_ref_from_record(record: dict[str, Any]) -> dict[str, str]:
    return {
        "node_id": as_text(record.get("node_id")),
        "node_type": as_text(record.get("node_type")),
        "rag_doc_ref": as_text(record.get("rag_doc_ref")),
        "citation_locator": as_text(record.get("citation_locator") or "source-level"),
        "locator_level": as_text(record.get("locator_level") or record.get("source_level_reason") or "unknown"),
        "source_hash": as_text(record.get("source_hash") or stable_hash(record)),
    }


def merge_source_ref(target: list[dict[str, str]], ref: dict[str, str]) -> None:
    key = (ref["node_id"], ref["rag_doc_ref"], ref["citation_locator"])
    existing = {(item["node_id"], item["rag_doc_ref"], item["citation_locator"]) for item in target}
    if key not in existing:
        target.append(ref)


def build_registry_payload(rag_report_path: Path = RAG_REPORT_PATH, graph_path: Path = DEFAULT_GRAPH_PATH) -> dict[str, Any]:
    rag_report = read_json(rag_report_path)
    graph = load_graph(graph_path)
    nodes = graph_nodes_by_id(graph)
    groups: dict[str, dict[str, Any]] = {}
    aliases: dict[str, set[str]] = defaultdict(set)

    for record in citation_records(rag_report):
        node = nodes.get(record.get("node_id"), {})
        attrs = node.get("attrs", {}) if isinstance(node.get("attrs"), dict) else {}
        title = as_text(record.get("citation_title") or record.get("law_name") or node.get("name"))
        law_name = as_text(record.get("law_name") or attrs.get("law_name"))
        node_type = as_text(record.get("node_type") or node.get("node_type"))
        standard_no = normalize_standard_no(as_text(record.get("tech_spec_no") or attrs.get("standard_no") or title))
        canonical = canonical_title(title, law_name if node_type == "law_article" else "")
        group_key = f"std:{standard_no}" if standard_no else f"title:{canonical.lower()}"
        dedupe_group_id = f"kg-dedupe:{slug(group_key)}"
        review_status = map_review_status(as_text(node.get("review_status") or "HUMAN_REVIEWED"))
        effective_status = infer_effective_status(
            title,
            as_text(attrs.get("effective_status")),
            as_text(record.get("effective_status")),
        )
        rag_doc_ref = as_text(record.get("rag_doc_ref") or attrs.get("rag_doc_ref") or node.get("source_ref"))
        source_ref = source_ref_from_record(record)

        aliases[group_key].add(title)
        if node.get("name"):
            aliases[group_key].add(as_text(node.get("name")))

        if group_key not in groups:
            groups[group_key] = {
                "doc_id": f"kg-doc:{slug(group_key)}",
                "doc_type": infer_doc_type(title, node_type),
                "title": title,
                "canonical_title": canonical,
                "standard_no": standard_no,
                "rag_doc_ref": rag_doc_ref,
                "rag_knowledge_base_id_suffix": None,
                "content_hash": as_text(record.get("source_hash") or stable_hash({"title": title, "rag_doc_ref": rag_doc_ref})),
                "metadata_hash": stable_hash({"title": title, "standard_no": standard_no, "rag_doc_ref": rag_doc_ref}),
                "effective_status": effective_status,
                "effective_date": None,
                "abolished_date": None,
                "supersedes": infer_supersedes(title),
                "superseded_by": [],
                "dedupe_group_id": dedupe_group_id,
                "aliases": [],
                "source_refs": [],
                "review_status": review_status,
                "trace": {
                    "source_report": rel_path(rag_report_path),
                    "node_ids": [],
                    "rag_doc_refs": [],
                },
            }

        doc = groups[group_key]
        merge_source_ref(doc["source_refs"], source_ref)
        doc["trace"]["node_ids"] = sorted(set(doc["trace"]["node_ids"] + [source_ref["node_id"]]))
        doc["trace"]["rag_doc_refs"] = sorted(set(doc["trace"]["rag_doc_refs"] + [rag_doc_ref]))
        if doc["review_status"] == "candidate" and review_status in PUBLISHABLE_REVIEW_STATUSES:
            doc["review_status"] = review_status
        if doc["effective_status"] == "effective" and effective_status in {"deprecated", "superseded", "draft"}:
            doc["effective_status"] = effective_status
        doc["supersedes"] = sorted(set(doc["supersedes"] + infer_supersedes(title)))

    documents = []
    for group_key, doc in groups.items():
        doc["aliases"] = sorted(alias for alias in aliases[group_key] if alias and alias != doc["title"])
        doc["metadata_hash"] = stable_hash({
            "canonical_title": doc["canonical_title"],
            "standard_no": doc["standard_no"],
            "source_refs": doc["source_refs"],
            "effective_status": doc["effective_status"],
        })
        documents.append(doc)

    documents.sort(key=lambda item: item["doc_id"])
    payload = {
        "schema_version": "knowledge-document.v1",
        "generated_at": today(),
        "source_reports": [rel_path(rag_report_path)],
        "source_graph": rel_path(graph_path) if graph_path.exists() else None,
        "documents": documents,
    }
    assert_redline_clean(payload)
    return payload


def candidate(
    candidate_id: str,
    candidate_type: str,
    source_system: str,
    target_ref: str,
    action: str,
    reason: str,
    evidence_refs: list[str],
    trace: dict[str, Any],
    *,
    risk_level: str = "medium",
    tier: str = "internal_review",
    fields: dict[str, Any] | None = None,
) -> dict[str, Any]:
    return {
        "candidate_id": candidate_id,
        "candidate_type": candidate_type,
        "source_system": source_system,
        "target_ref": target_ref,
        "proposed_change": {
            "action": action,
            "reason": reason,
            "fields": fields or {},
        },
        "evidence_refs": sorted(set(evidence_refs)),
        "risk_level": risk_level,
        "tier": tier,
        "review_status": "candidate",
        "reviewer_role": "SYSTEM",
        "contains_private_data": False,
        "created_at": today(),
        "trace": trace,
    }


def graph_expert_candidates(graph: dict[str, Any], source_report: str) -> list[dict[str, Any]]:
    safe_types = {"issue_type", "pitfall_class", "evidence_category", "law_obligation"}
    results = []
    for node in graph.get("nodes", []):
        if not isinstance(node, dict):
            continue
        if node.get("tier") == "private" or node.get("node_type") not in safe_types:
            continue
        if as_text(node.get("review_status")).upper() in {"APPROVED_BASELINE", "HUMAN_REVIEWED"}:
            continue
        node_id = as_text(node.get("node_id"))
        if not node_id:
            continue
        trace = {"source_report": source_report, "node_ids": [node_id], "rag_doc_refs": []}
        results.append(candidate(
            f"kg-cand:graph-expert:{slug(node_id)}",
            "graph_expert_candidate",
            "graph",
            node_id,
            "review_for_expert_bundle",
            "Graph semantic asset is not ETO-approved yet; review before it can inform expert-agent context. It must not be written into the legal full-text knowledge base.",
            [node_id],
            trace,
            risk_level="low",
            tier="shared" if node.get("tier") == "shared" else "aggregate",
            fields={
                "node_type": as_text(node.get("node_type")),
                "name": as_text(node.get("name")),
            },
        ))
    return results


def build_candidates_payload(
    registry_path: Path = DOC_REGISTRY_PATH,
    rag_report_path: Path = RAG_REPORT_PATH,
    graph_path: Path = DEFAULT_GRAPH_PATH,
) -> dict[str, Any]:
    registry = read_json(registry_path) if registry_path.exists() else build_registry_payload(rag_report_path, graph_path)
    rag_report = read_json(rag_report_path)
    graph = load_graph(graph_path)
    source_report = rel_path(rag_report_path)
    candidates: list[dict[str, Any]] = []
    by_node = {}
    for doc in registry.get("documents", []):
        for ref in doc.get("source_refs", []):
            by_node[ref.get("node_id")] = (doc, ref)

    for item in rag_report.get("source_level_items", []):
        node_id = as_text(item.get("node_id"))
        doc, ref = by_node.get(node_id, ({}, {}))
        trace = doc.get("trace") or {"source_report": source_report, "node_ids": [node_id], "rag_doc_refs": []}
        candidates.append(candidate(
            f"kg-cand:locator:{slug(node_id)}",
            "locator_patch",
            "rag_report",
            node_id,
            "fill_article_standard_page_or_section_locator",
            as_text(item.get("reason") or "source-level locator needs manual positioning"),
            [source_report, node_id],
            trace,
            risk_level="high",
            fields={
                "citation_title": as_text(item.get("citation_title")),
                "current_locator": ref.get("citation_locator", "source-level"),
            },
        ))

    for doc in registry.get("documents", []):
        if len(doc.get("aliases", [])) > 0:
            candidates.append(candidate(
                f"kg-cand:alias:{slug(doc['doc_id'])}",
                "alias_normalization",
                "rag_report",
                doc["doc_id"],
                "review_canonical_title_and_aliases",
                "Multiple title variants point to the same canonical document identity.",
                doc["trace"]["rag_doc_refs"],
                doc["trace"],
                risk_level="low",
                fields={
                    "canonical_title": doc["canonical_title"],
                    "aliases": doc["aliases"],
                },
            ))
        if doc.get("effective_status") in {"deprecated", "superseded", "draft"}:
            candidates.append(candidate(
                f"kg-cand:status:{slug(doc['doc_id'])}",
                "doc_status_update",
                "rag_report",
                doc["doc_id"],
                "review_effective_status_before_publication",
                f"Document status is {doc.get('effective_status')} and must be reviewed before runtime publication.",
                doc["trace"]["rag_doc_refs"],
                doc["trace"],
                risk_level="high",
                fields={"effective_status": doc.get("effective_status")},
            ))

    candidates.extend(graph_expert_candidates(graph, source_report))
    candidates.sort(key=lambda item: item["candidate_id"])
    payload = {
        "schema_version": "knowledge-governance-candidate.v1",
        "generated_at": today(),
        "source_registry": rel_path(registry_path),
        "candidates": candidates,
    }
    assert_redline_clean(payload)
    return payload


def publication_item(doc: dict[str, Any]) -> dict[str, Any]:
    first_ref = doc["source_refs"][0]
    return {
        "item_id": f"kg-pub-item:{slug(doc['doc_id'])}",
        "doc_id": doc["doc_id"],
        "title": doc["title"],
        "doc_type": doc["doc_type"],
        "rag_doc_ref": doc["rag_doc_ref"],
        "source_ref": first_ref["node_id"],
        "legal_basis_status": "internal_reviewed",
        "review_status": doc["review_status"],
        "citation_locator": first_ref["citation_locator"],
        "locator_level": first_ref["locator_level"],
        "source_hash": first_ref["source_hash"],
        "cache_policy": "metadata_only",
        "raw_cached": False,
        "trace": doc["trace"],
    }


def has_source_level_locator(doc: dict[str, Any]) -> bool:
    return any(ref.get("citation_locator") == "source-level" for ref in doc.get("source_refs", []))


def publication_block(doc: dict[str, Any], reason: str) -> dict[str, Any]:
    return {
        "target_ref": doc["doc_id"],
        "reason": reason,
        "trace": doc["trace"],
    }


def build_publication_bundle(audience: str, registry: dict[str, Any], candidates: dict[str, Any]) -> dict[str, Any]:
    items = []
    blocked = []
    for doc in registry.get("documents", []):
        if doc.get("review_status") not in PUBLISHABLE_REVIEW_STATUSES:
            blocked.append(publication_block(doc, f"review_status={doc.get('review_status')}"))
            continue
        if doc.get("effective_status") not in PUBLISHABLE_EFFECTIVE_STATUSES:
            blocked.append(publication_block(doc, f"effective_status={doc.get('effective_status')}"))
            continue
        if has_source_level_locator(doc):
            blocked.append(publication_block(doc, "locator=source-level"))
            continue
        items.append(publication_item(doc))

    if audience == "internal_review":
        for item in candidates.get("candidates", []):
            blocked.append({
                "target_ref": item["candidate_id"],
                "reason": f"pending {item['candidate_type']} review",
                "trace": item["trace"],
            })

    bundle = {
        "bundle_id": f"kg-publication:{audience}:v1",
        "audience": audience,
        "version": "v1",
        "generated_at": today(),
        "approval_basis": "ETO_APPROVED_IN_GRAPH",
        "human_review_required": False,
        "machine_gate_status": "pass",
        "inputs": [
            "data/knowledge-governance/doc-registry/knowledge-documents.json",
            "data/knowledge-governance/candidates/governance-candidates.json",
        ],
        "items": items,
        "blocked_items": blocked,
        "hash": "",
        "redline_scan_status": "pass",
    }
    if blocked:
        bundle["machine_gate_status"] = "partial" if items else "blocked"
    bundle["hash"] = stable_hash({key: value for key, value in bundle.items() if key != "hash"})
    assert_redline_clean(bundle)
    return bundle


def build_publications_payload(
    registry_path: Path = DOC_REGISTRY_PATH,
    candidates_path: Path = CANDIDATES_PATH,
) -> dict[str, Any]:
    registry = read_json(registry_path)
    candidates = read_json(candidates_path)
    bundles = {audience: build_publication_bundle(audience, registry, candidates) for audience in (*PUBLIC_AUDIENCES, "internal_review")}
    summary = {
        "schema_version": "knowledge-publication-report.v1",
        "generated_at": today(),
        "bundle_count": len(bundles),
        "audiences": {
            audience: {
                "items": len(bundle["items"]),
                "blocked_items": len(bundle["blocked_items"]),
                "redline_scan_status": bundle["redline_scan_status"],
            }
            for audience, bundle in bundles.items()
        },
        "offline_boundary": "v1 writes local bundles only; it does not call Tencent RAG document-management APIs or EcoCheck production databases.",
    }
    return {"bundles": bundles, "summary": summary}


def assert_redline_clean(value: Any, path: str = "$") -> None:
    if isinstance(value, dict):
        for key, item in value.items():
            key_text = str(key)
            if key_text.lower() in FORBIDDEN_KEYS:
                raise ValueError(f"redline forbidden key at {path}.{key_text}")
            assert_redline_clean(item, f"{path}.{key_text}")
    elif isinstance(value, list):
        for index, item in enumerate(value):
            assert_redline_clean(item, f"{path}[{index}]")
    elif isinstance(value, str):
        for marker in FORBIDDEN_VALUE_MARKERS:
            if marker in value:
                raise ValueError(f"redline forbidden value marker at {path}: {marker}")


def today() -> str:
    return dt.date.today().isoformat()


def write_registry(payload: dict[str, Any]) -> dict[str, Any]:
    write_json(DOC_REGISTRY_PATH, payload)
    write_governance_report(payload, None)
    return payload


def write_candidates(payload: dict[str, Any]) -> dict[str, Any]:
    write_json(CANDIDATES_PATH, payload)
    registry = read_json(DOC_REGISTRY_PATH) if DOC_REGISTRY_PATH.exists() else None
    write_governance_report(registry, payload)
    return payload


def write_governance_report(registry: dict[str, Any] | None, candidates: dict[str, Any] | None) -> None:
    registry = registry or {"documents": []}
    candidates = candidates or {"candidates": []}
    doc_counts: dict[str, int] = defaultdict(int)
    for doc in registry.get("documents", []):
        doc_counts[doc.get("effective_status", "unknown")] += 1
    candidate_counts: dict[str, int] = defaultdict(int)
    for item in candidates.get("candidates", []):
        candidate_counts[item.get("candidate_type", "unknown")] += 1

    report = {
        "generated_at": today(),
        "documents": len(registry.get("documents", [])),
        "document_effective_status_counts": dict(sorted(doc_counts.items())),
        "candidates": len(candidates.get("candidates", [])),
        "candidate_type_counts": dict(sorted(candidate_counts.items())),
        "redline_scan_status": "pass",
        "offline_boundary": "local metadata-only governance outputs; no Tencent RAG document-management write; no EcoCheck production write",
    }
    assert_redline_clean(report)
    write_json(GOVERNANCE_REPORT_JSON, report)

    lines = [
        "# Knowledge Governance Report",
        "",
        f"- generated_at: {report['generated_at']}",
        f"- documents: {report['documents']}",
        f"- candidates: {report['candidates']}",
        f"- redline_scan_status: {report['redline_scan_status']}",
        f"- offline_boundary: {report['offline_boundary']}",
        "",
        "## Document Effective Status Counts",
    ]
    for key, count in report["document_effective_status_counts"].items():
        lines.append(f"- {key}: {count}")
    lines.append("")
    lines.append("## Candidate Type Counts")
    for key, count in report["candidate_type_counts"].items():
        lines.append(f"- {key}: {count}")
    write_text(GOVERNANCE_REPORT_MD, "\n".join(lines))


def write_publications(payload: dict[str, Any]) -> dict[str, Any]:
    PUBLICATIONS_DIR.mkdir(parents=True, exist_ok=True)
    expected_files = {f"{audience}.json" for audience in payload["bundles"]}
    for existing in PUBLICATIONS_DIR.glob("*.json"):
        if existing.name not in expected_files:
            existing.unlink()
    for audience, bundle in payload["bundles"].items():
        write_json(PUBLICATIONS_DIR / f"{audience}.json", bundle)
    write_json(PUBLICATION_REPORT_JSON, payload["summary"])
    lines = [
        "# Knowledge Publication Report",
        "",
        f"- generated_at: {payload['summary']['generated_at']}",
        f"- bundle_count: {payload['summary']['bundle_count']}",
        f"- offline_boundary: {payload['summary']['offline_boundary']}",
        "",
        "| audience | items | blocked_items | redline_scan_status |",
        "|---|---:|---:|---|",
    ]
    for audience, row in payload["summary"]["audiences"].items():
        lines.append(f"| {audience} | {row['items']} | {row['blocked_items']} | {row['redline_scan_status']} |")
    write_text(PUBLICATION_REPORT_MD, "\n".join(lines))
    return payload


def run_build_registry(args: argparse.Namespace) -> dict[str, Any]:
    payload = build_registry_payload(Path(args.rag_report), Path(args.graph))
    return write_registry(payload)


def run_generate_candidates(args: argparse.Namespace) -> dict[str, Any]:
    if not DOC_REGISTRY_PATH.exists():
        write_registry(build_registry_payload(Path(args.rag_report), Path(args.graph)))
    payload = build_candidates_payload(DOC_REGISTRY_PATH, Path(args.rag_report), Path(args.graph))
    return write_candidates(payload)


def run_publish_bundles(args: argparse.Namespace) -> dict[str, Any]:
    if not DOC_REGISTRY_PATH.exists():
        write_registry(build_registry_payload(Path(args.rag_report), Path(args.graph)))
    if not CANDIDATES_PATH.exists():
        write_candidates(build_candidates_payload(DOC_REGISTRY_PATH, Path(args.rag_report), Path(args.graph)))
    payload = build_publications_payload(DOC_REGISTRY_PATH, CANDIDATES_PATH)
    return write_publications(payload)


def run_all(args: argparse.Namespace) -> dict[str, Any]:
    registry = run_build_registry(args)
    candidates = run_generate_candidates(args)
    publications = run_publish_bundles(args)
    return {
        "registry_documents": len(registry.get("documents", [])),
        "candidates": len(candidates.get("candidates", [])),
        "bundles": publications["summary"]["bundle_count"],
    }


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Build offline knowledge-governance registry, candidates, and publication bundles.")
    parser.add_argument("command", choices=["build-registry", "generate-candidates", "publish-bundles", "all"])
    parser.add_argument("--rag-report", default=str(RAG_REPORT_PATH))
    parser.add_argument("--graph", default=str(DEFAULT_GRAPH_PATH))
    parser.add_argument("--check", action="store_true", help="Run redline checks while writing deterministic local outputs.")
    return parser


def main() -> None:
    args = build_parser().parse_args()
    if args.command == "build-registry":
        result = run_build_registry(args)
        print(json.dumps({"status": "pass", "documents": len(result.get("documents", []))}, ensure_ascii=False))
        return
    if args.command == "generate-candidates":
        result = run_generate_candidates(args)
        print(json.dumps({"status": "pass", "candidates": len(result.get("candidates", []))}, ensure_ascii=False))
        return
    if args.command == "publish-bundles":
        result = run_publish_bundles(args)
        print(json.dumps({"status": "pass", "bundles": result["summary"]["bundle_count"]}, ensure_ascii=False))
        return
    result = run_all(args)
    print(json.dumps({"status": "pass", **result}, ensure_ascii=False))


if __name__ == "__main__":
    main()
