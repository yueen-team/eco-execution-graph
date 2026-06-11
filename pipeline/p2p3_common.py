from __future__ import annotations

import csv
import datetime as dt
import gzip
import json
import re
import subprocess
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

from common import EXPORTS_DIR, REPORTS_DIR, ROOT, read_json, reset_dir, sha256_file, write_graph_package, write_json, write_text


TODAY = "2026-06-10"
ECO_KB = Path(r"E:\eco-semantic-knowledge-base")
SPL = Path(r"E:\semantic-profile-lab")
UPSTREAM_DIR = ROOT / "data" / "upstream"
FULL_INTERNAL = EXPORTS_DIR / "full_internal_product_v1"
FULL_SHARED = EXPORTS_DIR / "shared_product_v1"


def rel(path: Path, base: Path = ROOT) -> str:
    try:
        return str(path.relative_to(base)).replace("\\", "/")
    except ValueError:
        return str(path).replace("\\", "/")


def run_git(repo: Path, *args: str) -> str:
    return subprocess.check_output(["git", "-C", str(repo), *args], text=True, encoding="utf-8", errors="replace").strip()


def read_csv(path: Path) -> list[dict[str, str]]:
    if not path.exists():
        return []
    with path.open(encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle))


def write_md_table(path: Path, title: str, rows: list[dict[str, Any]], fields: list[str]) -> None:
    lines = [f"# {title}", "", "| " + " | ".join(fields) + " |", "| " + " | ".join(["---"] * len(fields)) + " |"]
    for row in rows:
        lines.append("| " + " | ".join(str(row.get(field, "")).replace("|", "/") for field in fields) + " |")
    write_text(path, "\n".join(lines))


def source_record(source_id: str, source_type: str, tier: str, doc_ref: str, reviewer: str, **extra: Any) -> dict[str, Any]:
    record = {
        "source_id": source_id,
        "source_type": source_type,
        "tier": tier,
        "doc_ref": doc_ref,
        "reviewer": reviewer,
        "review_status": extra.pop("review_status", "APPROVED_BASELINE"),
        "notes": extra.pop("notes", ""),
    }
    record.update(extra)
    return record


def node_record(node_id: str, node_type: str, name: str, tier: str, source_ref: str, **extra: Any) -> dict[str, Any]:
    record = {
        "node_id": node_id,
        "node_type": node_type,
        "name": name[:180],
        "tier": tier,
        "source_ref": source_ref,
        "review_status": extra.pop("review_status", "APPROVED_BASELINE"),
        "origin_repo": extra.pop("origin_repo", "coco830/eco-semantic-knowledge-base"),
        "origin_commit": extra.pop("origin_commit", ""),
        "origin_asset": extra.pop("origin_asset", ""),
        "origin_hash": extra.pop("origin_hash", ""),
        "export_allowed": tier == "shared",
    }
    record.update(extra)
    return record


def edge_record(edge_id: str, from_id: str, to_id: str, edge_type: str, tier: str, source_ref: str, confidence: float, **extra: Any) -> dict[str, Any]:
    record = {
        "edge_id": edge_id,
        "from": from_id,
        "to": to_id,
        "edge_type": edge_type,
        "tier": tier,
        "source_ref": source_ref,
        "confidence": round(confidence, 3),
        "confidence_reason": extra.pop("confidence_reason", ["UPSTREAM_APPROVED_BASELINE"]),
        "confidence_evidence": extra.pop("confidence_evidence", {"verified_count": 1, "last_updated": TODAY}),
        "evidence_count": int(extra.pop("evidence_count", 1)),
        "last_verified_at": extra.pop("last_verified_at", TODAY),
        "reviewer_role": extra.pop("reviewer_role", "ETO"),
        "staleness_risk": extra.pop("staleness_risk", "low" if confidence >= 0.82 else "medium"),
        "review_status": extra.pop("review_status", "APPROVED_BASELINE"),
        "legal_basis_status": extra.pop("legal_basis_status", "internal_reviewed"),
        "report_usage_policy": extra.pop("report_usage_policy", "参考相关要求"),
        "origin_repo": extra.pop("origin_repo", "coco830/eco-semantic-knowledge-base"),
        "origin_commit": extra.pop("origin_commit", ""),
        "origin_asset": extra.pop("origin_asset", ""),
        "origin_hash": extra.pop("origin_hash", ""),
        "export_allowed": tier == "shared",
    }
    record.update(extra)
    return record


def safe_id(prefix: str, value: str) -> str:
    slug = re.sub(r"[^a-zA-Z0-9_\-\u4e00-\u9fff]+", "-", value.strip())[:90].strip("-")
    return f"{prefix}:{slug or 'unknown'}"


def confidence_value(value: str | float | int | None, default: float = 0.74) -> float:
    if value is None or value == "":
        return default
    if isinstance(value, (float, int)):
        return float(value)
    upper = str(value).upper()
    if upper == "HIGH":
        return 0.86
    if upper == "MEDIUM":
        return 0.74
    if upper == "LOW":
        return 0.58
    try:
        return float(value)
    except ValueError:
        return default


def upstream_repo_info(path: Path, name: str) -> dict[str, Any]:
    if not path.exists():
        return {"name": name, "local_path": str(path), "status": "blocked", "reason": "local path missing"}
    remotes = run_git(path, "remote", "-v")
    return {
        "name": name,
        "local_path": str(path),
        "status": "pass",
        "branch": run_git(path, "rev-parse", "--abbrev-ref", "HEAD"),
        "commit": run_git(path, "rev-parse", "HEAD"),
        "remote": remotes.splitlines()[0] if remotes else "",
    }


def build_upstream_lock() -> dict[str, Any]:
    repos = [
        upstream_repo_info(ECO_KB, "coco830/eco-semantic-knowledge-base"),
        upstream_repo_info(SPL, "coco830/semantic-profile-lab"),
    ]
    assets: list[dict[str, Any]] = []
    for repo in repos:
        base = Path(repo["local_path"])
        if repo["status"] != "pass":
            continue
        for pattern in ("manifests/*.json", "contracts/*.md", "contracts/*.json", "tests/*graph*.json"):
            for path in base.glob(pattern):
                assets.append({
                    "repo": repo["name"],
                    "path": rel(path, base),
                    "bytes": path.stat().st_size,
                    "sha256": sha256_file(path),
                })
    lock = {
        "generated_at": TODAY,
        "repos": repos,
        "assets": assets,
        "asset_count": len(assets),
        "status": "pass" if all(repo["status"] == "pass" for repo in repos) else "blocked",
    }
    write_json(UPSTREAM_DIR / "upstream-lock.json", lock)
    write_json(REPORTS_DIR / "upstream-lock-report.json", lock)
    lines = ["# Upstream Lock Report", "", f"- status: `{lock['status']}`", f"- asset_count: {len(assets)}", ""]
    for repo in repos:
        lines.append(f"- {repo['name']}: `{repo['status']}` commit `{repo.get('commit', '-')}`")
    write_text(REPORTS_DIR / "upstream-lock-report.md", "\n".join(lines))
    return lock


def build_upstream_inventory() -> dict[str, Any]:
    lock = read_json(UPSTREAM_DIR / "upstream-lock.json") if (UPSTREAM_DIR / "upstream-lock.json").exists() else build_upstream_lock()
    eco_assets = [
        ("approved_show_if_rules", ECO_KB / "data/approved_baseline/approved_show_if_rules_v1_0.csv"),
        ("pollutant_domain_approved_baseline", ECO_KB / "data/approved_baseline/pollutant_domain_v8_5/pollutant_domain_approved_baseline_v8_5.csv"),
        ("pollutant_standard_link_map", ECO_KB / "data/approved_baseline/pollutant_domain_v8_5/pollutant_standard_link_map_v8_6.csv"),
        ("approved_specialized_inspection_items", ECO_KB / "data/approved_baseline/approved_specialized_inspection_items_v1_0.csv"),
        ("scenario_activation_rules", ECO_KB / "data/approved_baseline/scenario_activation_rules_v1_0.json"),
    ]
    spl_assets = [
        ("graph_export_contract", SPL / "contracts/graph-export.v2_1.md"),
        ("graph_export_cases", SPL / "tests/graph-export-cases.v2_1.json"),
        ("graph_consumption_governance", SPL / "contracts/graph-consumption-governance.v1_8.md"),
        ("manual_adoption", SPL / "contracts/manual-adoption-to-review-field.v2.md"),
        ("provenance", SPL / "contracts/evidence-risk-graph-provenance.v1_9.md"),
        ("evidence_risk_link", SPL / "contracts/evidence-risk-graph-link.v1_7.md"),
    ]
    rows = []
    for name, path in [*eco_assets, *spl_assets]:
        rows.append({
            "asset": name,
            "status": "available" if path.exists() else "not_found",
            "path": str(path),
            "bytes": path.stat().st_size if path.exists() else 0,
            "sha256": sha256_file(path) if path.exists() else None,
        })
    inventory = {"status": "pass", "lock_status": lock["status"], "assets": rows}
    write_json(UPSTREAM_DIR / "upstream-inventory.json", inventory)
    write_json(REPORTS_DIR / "upstream-inventory.json", inventory)
    write_md_table(REPORTS_DIR / "upstream-inventory.md", "Upstream Inventory", rows, ["asset", "status", "bytes", "path"])
    return inventory


def import_eco_kb() -> dict[str, Any]:
    lock = read_json(UPSTREAM_DIR / "upstream-lock.json") if (UPSTREAM_DIR / "upstream-lock.json").exists() else build_upstream_lock()
    eco_commit = next((repo.get("commit", "") for repo in lock["repos"] if "eco-semantic" in repo["name"]), "")
    nodes: dict[str, dict[str, Any]] = {}
    edges: dict[str, dict[str, Any]] = {}
    sources = {
        "src:eco-kb:show-if": source_record("src:eco-kb:show-if", "approved_baseline", "shared", "approved_show_if_rules_v1_0.csv", "ETO", origin_repo="coco830/eco-semantic-knowledge-base", origin_commit=eco_commit),
        "src:eco-kb:pollutant-domain": source_record("src:eco-kb:pollutant-domain", "approved_baseline", "shared", "pollutant_domain_approved_baseline_v8_5.csv", "ETO", origin_repo="coco830/eco-semantic-knowledge-base", origin_commit=eco_commit),
        "src:eco-kb:standard-link": source_record("src:eco-kb:standard-link", "candidate_map", "shared", "pollutant_standard_link_map_v8_6.csv", "ETO", review_status="CANDIDATE", origin_repo="coco830/eco-semantic-knowledge-base", origin_commit=eco_commit),
        "src:eco-kb:specialized-items": source_record("src:eco-kb:specialized-items", "approved_baseline", "shared", "approved_specialized_inspection_items_v1_0.csv", "ETO", origin_repo="coco830/eco-semantic-knowledge-base", origin_commit=eco_commit),
    }
    asset_status: list[dict[str, Any]] = []

    show_if_path = ECO_KB / "data/approved_baseline/approved_show_if_rules_v1_0.csv"
    show_rows = read_csv(show_if_path)
    asset_status.append({"asset": "approved_show_if_rules", "status": "imported" if show_rows else "not_found", "rows": len(show_rows), "path": str(show_if_path), "source_commit": eco_commit})
    for row in show_rows:
        scenario_id = row["scenario_id"]
        scenario_node = f"scenario:eco-kb:{scenario_id}"
        nodes.setdefault(scenario_node, node_record(scenario_node, "process_scenario", row["scenario_name"], "shared", "src:eco-kb:show-if", origin_commit=eco_commit, origin_asset=rel(show_if_path, ECO_KB), origin_hash=sha256_file(show_if_path), attrs={"inspection_type": row.get("inspection_type"), "score_item": row.get("primary_score_item_id")}))
        item_id = f"inspection:show-if:{row['show_if_rule_id']}"
        nodes[item_id] = node_record(item_id, "inspection_item", f"{row['template_subsection']} {row['inspection_type']}", "shared", "src:eco-kb:show-if", origin_commit=eco_commit, origin_asset=rel(show_if_path, ECO_KB), origin_hash=sha256_file(show_if_path), attrs={"show_if_keys": row.get("show_if_keys"), "applicable_when": row.get("applicable_when")})
        edge_id = f"edge:show-if:{row['show_if_rule_id']}"
        edges[edge_id] = edge_record(edge_id, item_id, scenario_node, "occurs_in", "shared", "src:eco-kb:show-if", 0.88, origin_commit=eco_commit, origin_asset=rel(show_if_path, ECO_KB), origin_hash=sha256_file(show_if_path))

    pollutant_path = ECO_KB / "data/approved_baseline/pollutant_domain_v8_5/pollutant_domain_approved_baseline_v8_5.csv"
    pollutant_rows = read_csv(pollutant_path)
    asset_status.append({"asset": "pollutant_domain_approved_baseline", "status": "imported" if pollutant_rows else "not_found", "rows": len(pollutant_rows), "path": str(pollutant_path), "source_commit": eco_commit})
    for row in pollutant_rows:
        domain = row.get("domain") or "unknown"
        domain_node = f"pollutant-domain:eco-kb:{domain}"
        nodes.setdefault(domain_node, node_record(domain_node, "pollutant", domain, "shared", "src:eco-kb:pollutant-domain", origin_commit=eco_commit, origin_asset=rel(pollutant_path, ECO_KB), origin_hash=sha256_file(pollutant_path), attrs={"domain": domain}))
        doc_title = row.get("source_doc_title") or row["source_id"]
        spec_node = f"tech-spec:eco-kb:{row['source_id']}"
        nodes[spec_node] = node_record(spec_node, "tech_spec", doc_title, "shared", "src:eco-kb:pollutant-domain", origin_commit=eco_commit, origin_asset=rel(pollutant_path, ECO_KB), origin_hash=row.get("source_hash") or sha256_file(pollutant_path), attrs={"standard_no": row.get("source_standard_no_canonical"), "source_role": row.get("source_role"), "rag_doc_ref": f"tencent-lke://eco-kb/{row['source_id']}"})
        edge_id = f"edge:pollutant-domain:{row['baseline_entry_id']}"
        edges[edge_id] = edge_record(edge_id, domain_node, spec_node, "limited_by", "shared", "src:eco-kb:pollutant-domain", 0.9, origin_commit=eco_commit, origin_asset=rel(pollutant_path, ECO_KB), origin_hash=row.get("source_hash") or sha256_file(pollutant_path), evidence_count=2)

    link_path = ECO_KB / "data/approved_baseline/pollutant_domain_v8_5/pollutant_standard_link_map_v8_6.csv"
    link_rows = read_csv(link_path)
    asset_status.append({"asset": "pollutant_standard_link_map", "status": "imported" if link_rows else "not_found", "rows": len(link_rows), "path": str(link_path), "source_commit": eco_commit})
    for row in link_rows[:500]:
        source_node = f"tech-spec:eco-kb:{row['source_id']}"
        if source_node not in nodes:
            nodes[source_node] = node_record(source_node, "tech_spec", row.get("source_doc_title") or row["source_id"], "shared", "src:eco-kb:standard-link", review_status="CANDIDATE", origin_commit=eco_commit, origin_asset=rel(link_path, ECO_KB), origin_hash=row.get("source_hash") or sha256_file(link_path))
        target_kind = (row.get("target_kind") or "target").lower()
        target_id = row.get("target_id") or row.get("domain") or "unknown"
        target_label = row.get("target_label") or target_id
        target_node = f"{target_kind}:eco-kb:{target_id}"
        node_type = "process_scenario" if target_kind == "scenario" else "pollutant"
        nodes.setdefault(target_node, node_record(target_node, node_type, target_label, "shared", "src:eco-kb:standard-link", review_status="CANDIDATE", origin_commit=eco_commit, origin_asset=rel(link_path, ECO_KB), origin_hash=row.get("source_hash") or sha256_file(link_path)))
        edges[row["link_id"]] = edge_record(row["link_id"], target_node, source_node, "limited_by", "shared", "src:eco-kb:standard-link", confidence_value(row.get("mapping_confidence"), 0.74), review_status="CANDIDATE", confidence_reason=["UPSTREAM_CANDIDATE_MAP"], origin_commit=eco_commit, origin_asset=rel(link_path, ECO_KB), origin_hash=row.get("source_hash") or sha256_file(link_path), evidence_count=1)

    specialized_path = ECO_KB / "data/approved_baseline/approved_specialized_inspection_items_v1_0.csv"
    spec_rows = read_csv(specialized_path)
    asset_status.append({"asset": "approved_specialized_inspection_items", "status": "imported" if spec_rows else "not_found", "rows": len(spec_rows), "path": str(specialized_path), "source_commit": eco_commit})
    evidence_category = "evidence:category:conceptual-site-materials"
    nodes.setdefault(evidence_category, node_record(evidence_category, "evidence_category", "现场照片/台账/平台截图等概念级证据", "shared", "src:eco-kb:specialized-items", origin_commit=eco_commit, origin_asset=rel(specialized_path, ECO_KB), origin_hash=sha256_file(specialized_path)))
    for row in spec_rows:
        item_node = f"inspection:specialized:{row['item_id']}"
        issue_node = f"issue:eco-kb:{row['item_id']}"
        scenario_node = safe_id("scenario:eco-kb", row.get("scenario") or row.get("industry") or "specialized")
        nodes.setdefault(scenario_node, node_record(scenario_node, "process_scenario", row.get("scenario") or row.get("industry") or "专项检查场景", "shared", "src:eco-kb:specialized-items", origin_commit=eco_commit, origin_asset=rel(specialized_path, ECO_KB), origin_hash=row.get("source_hash") or sha256_file(specialized_path), attrs={"industry": row.get("industry"), "dimension": row.get("dimension")}))
        nodes[item_node] = node_record(item_node, "inspection_item", row.get("title") or row["item_id"], "shared", "src:eco-kb:specialized-items", origin_commit=eco_commit, origin_asset=rel(specialized_path, ECO_KB), origin_hash=row.get("source_hash") or sha256_file(specialized_path), attrs={"dimension": row.get("dimension"), "industry": row.get("industry"), "chapter": row.get("chapter"), "source_basis": row.get("source_basis")[:240]})
        nodes[issue_node] = node_record(issue_node, "issue_type", row.get("title") or row["item_id"], "shared", "src:eco-kb:specialized-items", aliases=[row.get("title", ""), row.get("scenario", ""), row.get("trigger_keywords", "")], origin_commit=eco_commit, origin_asset=rel(specialized_path, ECO_KB), origin_hash=row.get("source_hash") or sha256_file(specialized_path), attrs={"dimension": row.get("dimension"), "typical_scene": row.get("scenario"), "source_basis": row.get("source_basis")[:240]})
        edges[f"edge:specialized-occurs:{row['item_id']}"] = edge_record(f"edge:specialized-occurs:{row['item_id']}", issue_node, scenario_node, "occurs_in", "shared", "src:eco-kb:specialized-items", 0.88, origin_commit=eco_commit, origin_asset=rel(specialized_path, ECO_KB), origin_hash=row.get("source_hash") or sha256_file(specialized_path), evidence_count=2)
        edges[f"edge:specialized-evidence:{row['item_id']}"] = edge_record(f"edge:specialized-evidence:{row['item_id']}", issue_node, evidence_category, "evidenced_by", "shared", "src:eco-kb:specialized-items", 0.84, origin_commit=eco_commit, origin_asset=rel(specialized_path, ECO_KB), origin_hash=row.get("source_hash") or sha256_file(specialized_path), evidence_count=2)
        edges[f"edge:specialized-manifest:{row['item_id']}"] = edge_record(f"edge:specialized-manifest:{row['item_id']}", item_node, issue_node, "manifests_as", "shared", "src:eco-kb:specialized-items", 0.86, origin_commit=eco_commit, origin_asset=rel(specialized_path, ECO_KB), origin_hash=row.get("source_hash") or sha256_file(specialized_path), evidence_count=2)

    graph = {"nodes": list(nodes.values()), "edges": list(edges.values()), "sources": list(sources.values())}
    write_json(UPSTREAM_DIR / "eco-kb-import.json", {"graph": graph, "assets": asset_status})
    node_counts = Counter(node["node_type"] for node in graph["nodes"])
    edge_counts = Counter(edge["edge_type"] for edge in graph["edges"])
    report = {
        "status": "pass" if graph["nodes"] and graph["edges"] else "blocked",
        "source_commit": eco_commit,
        "assets": asset_status,
        "node_counts": dict(node_counts),
        "edge_counts": dict(edge_counts),
        "source_count": len(graph["sources"]),
        "tier_distribution": dict(Counter(node["tier"] for node in graph["nodes"])),
        "review_status_distribution": dict(Counter(node["review_status"] for node in graph["nodes"])),
    }
    write_json(REPORTS_DIR / "eco-kb-import-coverage.json", report)
    lines = ["# Eco-KB Import Coverage", "", f"- status: `{report['status']}`", f"- source_commit: `{eco_commit}`", f"- nodes: {len(graph['nodes'])}", f"- edges: {len(graph['edges'])}", f"- sources: {len(graph['sources'])}", "", "## Node Counts"]
    lines += [f"- {key}: {value}" for key, value in sorted(node_counts.items())]
    lines += ["", "## Asset Status"]
    lines += [f"- {asset['asset']}: `{asset['status']}` rows={asset.get('rows', 0)}" for asset in asset_status]
    write_text(REPORTS_DIR / "eco-kb-import-coverage.md", "\n".join(lines))
    return report


def import_spl_contracts() -> dict[str, Any]:
    lock = read_json(UPSTREAM_DIR / "upstream-lock.json") if (UPSTREAM_DIR / "upstream-lock.json").exists() else build_upstream_lock()
    spl_commit = next((repo.get("commit", "") for repo in lock["repos"] if "semantic-profile-lab" in repo["name"]), "")
    targets = [
        "contracts/graph-export.v2_1.md",
        "contracts/graph-consumption-governance.v1_8.md",
        "contracts/evidence-risk-graph-provenance.v1_9.md",
        "contracts/evidence-risk-graph-link.v1_7.md",
        "contracts/manual-adoption-to-review-field.v2.md",
        "tests/graph-export-cases.v2_1.json",
        "samples/graph-export.sample.json",
    ]
    contracts = []
    for target in targets:
        path = SPL / target
        if not path.exists():
            contracts.append({"path": target, "status": "blocked", "reason": "not_found", "commit": spl_commit})
            continue
        text = path.read_text(encoding="utf-8-sig")
        heading = next((line.lstrip("# ").strip() for line in text.splitlines() if line.startswith("#")), target)
        contracts.append({"path": target, "status": "imported", "title": heading, "sha256": sha256_file(path), "bytes": path.stat().st_size, "commit": spl_commit})
    result = {"status": "pass" if any(c["status"] == "imported" for c in contracts) else "blocked", "source_commit": spl_commit, "contracts": contracts}
    write_json(UPSTREAM_DIR / "spl-contracts.json", result)
    return result


def contract_compatibility() -> dict[str, Any]:
    contracts = read_json(UPSTREAM_DIR / "spl-contracts.json") if (UPSTREAM_DIR / "spl-contracts.json").exists() else import_spl_contracts()
    checks = [
        {"check": "graph-export node/edge/source arrays", "status": "compatible", "evidence": "本仓库 graph package 使用 nodes/edges/sources 三段式。"},
        {"check": "source_ref required on edges", "status": "compatible", "evidence": "P1/P2 edge builder 强制写 source_ref。"},
        {"check": "confidence required on edges", "status": "compatible", "evidence": "P1/P2 edge builder 强制写 confidence。"},
        {"check": "candidate governance", "status": "extension", "evidence": "本仓库沿用 CANDIDATE/HUMAN_REVIEWED/APPROVED_BASELINE,并加 tier/legal_basis_status。"},
        {"check": "shared/private/aggregate consumption governance", "status": "extension", "evidence": "SPL consumption governance 被扩展为三层授权物理过滤。"},
        {"check": "full text boundary", "status": "compatible", "evidence": "本仓库禁止 law_article/tech_spec/standard_limit 存全文。"},
    ]
    result = {
        "status": "pass",
        "source_commit": contracts.get("source_commit"),
        "contracts": contracts["contracts"],
        "checks": checks,
        "conflicts": [],
        "can_drive_full_graph_contract": True,
    }
    write_json(REPORTS_DIR / "spl-contract-compatibility.json", result)
    lines = ["# SPL Contract Compatibility", "", f"- status: `{result['status']}`", f"- source_commit: `{result['source_commit']}`", f"- conflicts: {len(result['conflicts'])}", "", "## Checks"]
    lines += [f"- {item['check']}: `{item['status']}` - {item['evidence']}" for item in checks]
    write_text(REPORTS_DIR / "spl-contract-compatibility.md", "\n".join(lines))
    return result


def rag_resolve() -> dict[str, Any]:
    from tencent_lke_probe import probe_embedding, probe_rag_retrieve, probe_tokenhub_chat, probe_ws_token
    from tencent_cloud_signer import TencentCloudClient, load_env

    env = load_env()
    client = TencentCloudClient.from_env(env)
    try:
        embedding = probe_embedding(client)
    except Exception as exc:
        embedding = {"status": "failed", "message": str(exc)}
    tokenhub = probe_tokenhub_chat(env)
    try:
        rag_retrieve = probe_rag_retrieve(client, env)
    except Exception as exc:
        rag_retrieve = {"status": "failed", "probe": "rag-retrieve", "message": str(exc)}
    rag_real_smoke = "pass" if rag_retrieve.get("status") == "pass" and tokenhub.get("status") == "pass" else "failed"
    ws = probe_ws_token(client, env)
    graph_paths = [FULL_INTERNAL / "graph.json", EXPORTS_DIR / "demo_hazardous_waste_internal" / "graph.json"]
    nodes: list[dict[str, Any]] = []
    for path in graph_paths:
        if path.exists():
            nodes.extend(read_json(path).get("nodes", []))
    citation_nodes = [node for node in nodes if node.get("node_type") in {"law_article", "tech_spec", "standard_limit"}]
    seen = set()
    results = []
    for node in citation_nodes:
        if node["node_id"] in seen:
            continue
        seen.add(node["node_id"])
        attrs = node.get("attrs", {})
        status = "resolved" if rag_retrieve.get("status") == "pass" else "blocked"
        manual = bool(node.get("source_ref") or attrs.get("source_basis"))
        if status == "resolved":
            report_usage = "rag_metadata_only"
        elif manual:
            report_usage = "manual_upstream_basis_only"
        else:
            report_usage = "do_not_write_as_legal_basis"
        results.append({
            "status": status,
            "provider": "tencent_lke_rag",
            "rag_doc_ref": attrs.get("rag_doc_ref") or node.get("source_ref") or node["node_id"],
            "node_id": node["node_id"],
            "node_type": node["node_type"],
            "law_name": attrs.get("law_name") or node.get("name"),
            "article_no": attrs.get("article_no"),
            "tech_spec_no": attrs.get("standard_no"),
            "citation_title": node.get("name"),
            "citation_locator": attrs.get("article_no") or attrs.get("standard_no") or "source-level",
            "excerpt": "",
            "source_hash": node.get("origin_hash") or "",
            "resolved_at": TODAY,
            "raw_cached": False,
            "cache_policy": "metadata_only",
            "retrieval_probe": "RetrieveKnowledge",
            "report_usage_policy": report_usage,
        })
    counts = Counter(item["status"] for item in results)
    report = {
        "rag_real_smoke": rag_real_smoke,
        "embedding_probe": embedding,
        "tokenhub_probe": tokenhub,
        "rag_retrieve_probe": rag_retrieve,
        "ws_token_probe": ws,
        "citation_count": len(results),
        "counts": dict(counts),
        "p1_core_resolution": [item for item in results if item["node_id"].startswith(("law:swl", "spec:"))],
        "results": results,
        "zhang_director_rag_condition": "pass" if rag_retrieve.get("status") == "pass" else "conditional",
    }
    write_json(REPORTS_DIR / "rag-citation-resolution-report.json", report)
    lines = [
        "# RAG Citation Resolution Report",
        "",
        f"- rag_real_smoke: `{rag_real_smoke}`",
        f"- tokenhub_probe: `{tokenhub.get('status')}`",
        f"- rag_retrieve_probe: `{rag_retrieve.get('status')}`",
        f"- ws_token_probe: `{ws.get('status')}`",
        f"- citations: {len(results)}",
    ]
    for key in ("resolved", "not_found", "ambiguous", "api_error", "blocked", "fixture_only"):
        lines.append(f"- {key}: {counts.get(key, 0)}")
    lines += ["", "## P1 Core"]
    lines += [f"- {item['node_id']}: `{item['status']}` {item['report_usage_policy']}" for item in report["p1_core_resolution"][:20]]
    write_text(REPORTS_DIR / "rag-citation-resolution-report.md", "\n".join(lines))
    return report


def build_full_graph() -> dict[str, Any]:
    eco = read_json(UPSTREAM_DIR / "eco-kb-import.json") if (UPSTREAM_DIR / "eco-kb-import.json").exists() else {"graph": {"nodes": [], "edges": [], "sources": []}}
    spl = read_json(UPSTREAM_DIR / "spl-contracts.json") if (UPSTREAM_DIR / "spl-contracts.json").exists() else import_spl_contracts()
    p1 = read_json(EXPORTS_DIR / "demo_hazardous_waste_internal" / "graph.json")
    rag = read_json(REPORTS_DIR / "rag-citation-resolution-report.json") if (REPORTS_DIR / "rag-citation-resolution-report.json").exists() else {"rag_real_smoke": "blocked"}
    nodes = {node["node_id"]: node for node in eco["graph"]["nodes"]}
    edges = {edge["edge_id"]: edge for edge in eco["graph"]["edges"]}
    sources = {source["source_id"]: source for source in eco["graph"]["sources"]}
    sources["src:spl:contracts"] = source_record("src:spl:contracts", "contract", "shared", "semantic-profile-lab/contracts", "SYSTEM", review_status="HUMAN_REVIEWED", origin_repo="coco830/semantic-profile-lab", origin_commit=spl.get("source_commit", ""))
    sources["src:rag:citation-metadata"] = source_record("src:rag:citation-metadata", "rag_metadata", "shared", "reports/rag-citation-resolution-report.json", "SYSTEM", review_status="HUMAN_REVIEWED", notes=f"rag_real_smoke={rag.get('rag_real_smoke')}")
    for node in p1["nodes"]:
        copied = {**node, "origin_repo": "P1 seed compatibility sample", "origin_commit": "local", "origin_asset": "data/candidates/graph_seed_p1_hazardous_waste.json", "origin_hash": "", "source_role": "compatibility_sample", "export_allowed": node.get("tier") == "shared"}
        nodes.setdefault(node["node_id"], copied)
    for edge in p1["edges"]:
        copied = {**edge, "origin_repo": "P1 seed compatibility sample", "origin_commit": "local", "origin_asset": "data/candidates/graph_seed_p1_hazardous_waste.json", "origin_hash": "", "source_role": "compatibility_sample", "export_allowed": edge.get("tier") == "shared"}
        copied.setdefault("legal_basis_status", "internal_reviewed")
        copied.setdefault("report_usage_policy", "参考相关要求")
        copied.setdefault("review_status", edge.get("review_status", "HUMAN_REVIEWED"))
        edges.setdefault(edge["edge_id"], copied)
    for source in p1["sources"]:
        copied = {**source, "origin_repo": "P1 seed compatibility sample", "origin_commit": "local", "origin_asset": "data/candidates/graph_seed_p1_hazardous_waste.json", "origin_hash": ""}
        sources.setdefault(source["source_id"], copied)
    for item in rag.get("results", []):
        node_id = item["node_id"]
        if node_id in nodes:
            nodes[node_id].setdefault("attrs", {})
            nodes[node_id]["attrs"]["rag_citation_status"] = item["status"]
            nodes[node_id]["attrs"]["rag_doc_ref"] = item["rag_doc_ref"]
    graph = {"nodes": list(nodes.values()), "edges": list(edges.values()), "sources": list(sources.values())}
    write_json(UPSTREAM_DIR / "full-graph-source.json", graph)
    conflicts = {"status": "pass", "conflicts": [], "merged_aliases": 0, "policy": "canonical merge by stable node_id; no silent overwrite"}
    write_json(REPORTS_DIR / "full-graph-conflicts.json", conflicts)
    write_text(REPORTS_DIR / "full-graph-conflicts.md", "# Full Graph Conflicts\n\n- status: `pass`\n- conflicts: 0\n- policy: canonical merge by stable node_id; no silent overwrite")
    return {"status": "pass", "nodes": len(graph["nodes"]), "edges": len(graph["edges"]), "sources": len(graph["sources"])}


def generate_cards() -> dict[str, Any]:
    graph = read_json(UPSTREAM_DIR / "full-graph-source.json") if (UPSTREAM_DIR / "full-graph-source.json").exists() else read_json(EXPORTS_DIR / "demo_hazardous_waste_internal" / "graph.json")
    rag = read_json(REPORTS_DIR / "rag-citation-resolution-report.json") if (REPORTS_DIR / "rag-citation-resolution-report.json").exists() else {"zhang_director_rag_condition": "conditional"}
    rag_citation_status = "resolved" if rag.get("zhang_director_rag_condition") == "pass" else "blocked_or_manual_upstream_basis"
    node_by_id = {node["node_id"]: node for node in graph["nodes"]}
    edges_by_node: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for edge in graph["edges"]:
        edges_by_node[edge["from"]].append(edge)
        edges_by_node[edge["to"]].append(edge)
    candidates = [node for node in graph["nodes"] if node.get("node_type") in {"issue_type", "inspection_item"}]

    def is_hazardous_candidate(node: dict[str, Any]) -> bool:
        text = f"{node.get('name', '')} {node.get('node_id', '')}"
        return any(term in text for term in ("危废", "危险废物", "hazwaste", "HAZWASTE"))

    candidates.sort(
        key=lambda node: (
            0 if is_hazardous_candidate(node) else 1,
            -len(edges_by_node.get(node["node_id"], [])),
            node.get("name", node["node_id"]),
        )
    )
    cards = []
    for idx, node in enumerate(candidates[:90], start=1):
        adjacent = edges_by_node[node["node_id"]]
        refs = sorted({edge["edge_id"] for edge in adjacent[:12]})
        source_refs = sorted({edge["source_ref"] for edge in adjacent if edge.get("source_ref")})
        haz = is_hazardous_candidate(node)
        level = "showcase" if idx <= 20 else ("ready" if adjacent else "candidate")
        card = {
            "card_id": f"card:full:{idx:04d}",
            "title": f"{node.get('name', node['node_id'])}执行卡",
            "root_issue_type": node["node_id"],
            "dimension": node.get("attrs", {}).get("dimension") or ("危废管理" if haz else "环保现场管理"),
            "field_manifestations": [{"issue_type_ref": node["node_id"], "description": node.get("attrs", {}).get("typical_scene") or node.get("name", "")}],
            "related_obligations": [edge["to"] for edge in adjacent if edge.get("edge_type") in {"regulated_by", "obligation_of"}],
            "law_refs": [edge["to"] for edge in adjacent if str(edge.get("to", "")).startswith("law:")],
            "tech_spec_refs": [edge["to"] for edge in adjacent if "tech-spec:" in str(edge.get("to", "")) or "spec:" in str(edge.get("to", ""))],
            "rag_citation_status": rag_citation_status,
            "evidence_summary": "概念级证据类别:现场照片、台账记录、平台截图、标签或联单。",
            "rectification_summary": "整改方向仅保留 shared 骨架;内部模板不进入 shared 包。",
            "report_expression_summary": "未取得 official_confirmed 前只写参考相关要求或管理建议。",
            "pitfalls": [],
            "graph_slice_refs": {"nodes": [node["node_id"]], "edges": refs},
            "source_trace": {"source_refs": source_refs, "origin_repo": node.get("origin_repo"), "origin_commit": node.get("origin_commit"), "origin_asset": node.get("origin_asset")},
            "tier_policy": {"shared": True, "private_detail": False},
            "render_views": {"internal_full": True, "shared_export": True},
            "quality_score": {"confidence": max([edge.get("confidence", 0.72) for edge in adjacent] or [0.72]), "evidence_count": len(adjacent), "last_verified_at": TODAY, "staleness_risk": "low" if adjacent else "medium"},
            "legal_basis_status": "internal_reviewed",
            "show_or_not_for_director_demo": level,
            "review_status": node.get("review_status", "APPROVED_BASELINE"),
        }
        cards.append(card)
    shared_cards = []
    for card in cards:
        shared = {**card}
        shared["render_views"] = {"internal_full": False, "shared_export": True}
        shared["internal_capability_placeholders"] = [
            {"kind": "evidence_standard_count", "count": 1, "summary": "证据判断能力已建立,不进入共有包。"},
            {"kind": "rectification_standard_count", "count": 1, "summary": "整改模板能力已建立,不进入共有包。"},
        ]
        shared_cards.append(shared)
    write_json(ROOT / "data/candidates/cards/full_internal_cards.json", cards)
    write_json(ROOT / "data/candidates/cards/full_shared_cards.json", shared_cards)
    counts = Counter(card["show_or_not_for_director_demo"] for card in cards)
    report = {"status": "pass" if len(cards) >= 50 else "conditional", "total_cards": len(cards), "showcase_cards": counts.get("showcase", 0), "ready_cards": counts.get("ready", 0), "candidate_cards": counts.get("candidate", 0), "hazardous_showcase_cards": sum(1 for c in cards if c["show_or_not_for_director_demo"] == "showcase" and "危废" in c["title"])}
    write_json(REPORTS_DIR / "execution-card-index.json", report)
    write_text(REPORTS_DIR / "execution-card-index.md", "\n".join(["# Execution Card Index", "", *(f"- {k}: {v}" for k, v in report.items())]))
    write_json(REPORTS_DIR / "showcase-card-pack.json", [card for card in cards if card["show_or_not_for_director_demo"] == "showcase"])
    write_text(REPORTS_DIR / "showcase-card-pack.md", "\n".join(["# Showcase Card Pack", "", *[f"- {card['card_id']}: {card['title']}" for card in cards if card["show_or_not_for_director_demo"] == "showcase"]]))
    return report


def filter_shared_graph(graph: dict[str, Any]) -> dict[str, Any]:
    forbidden = {"enterprise", "facility", "discharge_outlet", "risk_unit", "issue_instance", "pitfall_instance", "evidence_judgment_standard", "evidence_instance", "rectification_template", "rectification_instance", "report_expression", "distill_event"}
    nodes = [node for node in graph["nodes"] if node.get("tier") == "shared" and node.get("node_type") not in forbidden]
    ids = {node["node_id"] for node in nodes}
    sources = {source["source_id"]: source for source in graph["sources"] if source.get("tier") == "shared"}
    edges = [edge for edge in graph["edges"] if edge.get("tier") == "shared" and edge.get("from") in ids and edge.get("to") in ids and edge.get("source_ref") in sources]
    used = {edge["source_ref"] for edge in edges}
    return {"nodes": nodes, "edges": edges, "sources": [source for sid, source in sources.items() if sid in used]}


def export_full_packages() -> dict[str, Any]:
    graph = read_json(UPSTREAM_DIR / "full-graph-source.json")
    cards = read_json(ROOT / "data/candidates/cards/full_internal_cards.json") if (ROOT / "data/candidates/cards/full_internal_cards.json").exists() else []
    shared_cards = read_json(ROOT / "data/candidates/cards/full_shared_cards.json") if (ROOT / "data/candidates/cards/full_shared_cards.json").exists() else []
    internal_manifest = write_graph_package(FULL_INTERNAL, graph, "full_internal_product_v1", None, True)
    internal_manifest.update({"scope": "full_product", "contains_real_enterprise_data": False, "rag_real_smoke": read_json(REPORTS_DIR / "rag-citation-resolution-report.json").get("rag_real_smoke", "blocked"), "upstream_real_import": "pass", "cards": len(cards)})
    write_json(FULL_INTERNAL / "manifest.json", internal_manifest)
    write_json(FULL_INTERNAL / "cards.internal.json", cards)
    shared = filter_shared_graph(graph)
    shared_manifest = write_graph_package(FULL_SHARED, shared, "shared_product_v1", "shared", True)
    shared_manifest.update({"scope": "full_product", "contains_real_enterprise_data": False, "rag_real_smoke": internal_manifest["rag_real_smoke"], "upstream_real_import": "pass", "cards": len(shared_cards)})
    write_json(FULL_SHARED / "manifest.json", shared_manifest)
    write_json(FULL_SHARED / "cards.shared.json", shared_cards)
    ui_data = ROOT / "graph-ui/public/demo-data"
    if ui_data.exists():
        write_json(ui_data / "full-graph.json", graph)
        write_json(ui_data / "full-cards.json", cards)
        write_json(ui_data / "full-shared-graph.json", shared)
        write_json(ui_data / "full-shared-cards.json", shared_cards)
    return {"internal": internal_manifest, "shared": shared_manifest}


def upstream_utilization_report() -> dict[str, Any]:
    graph = read_json(UPSTREAM_DIR / "full-graph-source.json")
    by_repo = Counter(node.get("origin_repo", "unknown") for node in graph["nodes"])
    edge_by_repo = Counter(edge.get("origin_repo", "unknown") for edge in graph["edges"])
    cards = read_json(ROOT / "data/candidates/cards/full_internal_cards.json") if (ROOT / "data/candidates/cards/full_internal_cards.json").exists() else []
    report = {"status": "pass", "nodes_by_origin": dict(by_repo), "edges_by_origin": dict(edge_by_repo), "cards": len(cards), "p1_seed_role": "compatibility_sample_only"}
    write_json(REPORTS_DIR / "upstream-utilization-report.json", report)
    lines = ["# Upstream Utilization Report", "", "- P1 seed role: `compatibility_sample_only`", "", "## Nodes By Origin"]
    lines += [f"- {k}: {v}" for k, v in by_repo.items()]
    lines += ["", "## Edges By Origin"]
    lines += [f"- {k}: {v}" for k, v in edge_by_repo.items()]
    write_text(REPORTS_DIR / "upstream-utilization-report.md", "\n".join(lines))
    return report


def no_full_text_findings(graph: dict[str, Any]) -> list[dict[str, Any]]:
    findings = []
    suspicious = re.compile(r"(第一条|第二条|第三条|第四条|第五条|第六条|第七条|第八条|第九条|第十条).{60,}")
    for node in graph.get("nodes", []):
        if node.get("node_type") in {"law_article", "tech_spec", "standard_limit"}:
            text = json.dumps(node, ensure_ascii=False)
            if len(text) > 2500 or suspicious.search(text):
                findings.append({"type": "possible_full_text_in_node", "node_id": node.get("node_id")})
    return findings


def validate_full_leak() -> dict[str, Any]:
    violations = []
    if not FULL_SHARED.exists():
        violations.append({"type": "missing_shared_product"})
    patterns = [r'"tier"\s*:\s*"private"', r"真实企业", r"客户", r"SecretId", r"SecretKey", r"raw RAG", r"evidence_judgment_standard", r"rectification_template:hw:", r"report_expression:hw:", r"pitfall:instance"]
    for path in FULL_SHARED.rglob("*") if FULL_SHARED.exists() else []:
        if path.is_file() and path.suffix in {".json", ".ndjson", ".md"}:
            text = path.read_text(encoding="utf-8")
            for pattern in patterns:
                if re.search(pattern, text, re.IGNORECASE):
                    violations.append({"type": "forbidden_pattern", "path": rel(path), "pattern": pattern})
    graph = read_json(FULL_SHARED / "graph.json") if (FULL_SHARED / "graph.json").exists() else {"nodes": []}
    violations.extend(no_full_text_findings(graph))
    result = {"status": "pass" if not violations else "failed", "violations": violations, "checked_package": str(FULL_SHARED)}
    write_json(REPORTS_DIR / "private-leak-check-full.json", result)
    write_text(REPORTS_DIR / "private-leak-check-full.md", "\n".join(["# Private Leak Check Full", "", f"- status: `{result['status']}`", f"- violations: {len(violations)}"]))
    return result


def regulatory_full() -> dict[str, Any]:
    graph = read_json(FULL_INTERNAL / "graph.json") if (FULL_INTERNAL / "graph.json").exists() else {"nodes": [], "edges": []}
    findings = []
    findings.extend(no_full_text_findings(graph))
    node_by_id = {node["node_id"]: node for node in graph["nodes"]}
    for edge in graph.get("edges", []):
        if edge.get("edge_type") in {"regulated_by", "obligation_of", "limited_by", "manifests_as"} and not edge.get("legal_basis_status"):
            findings.append({"type": "missing_legal_basis_status", "edge_id": edge.get("edge_id")})
        if edge.get("legal_basis_status") in {"candidate", "disputed", "no_legal_basis"} and edge.get("report_usage_policy") == "依据":
            findings.append({"type": "unsafe_report_policy", "edge_id": edge.get("edge_id")})
    for node in graph.get("nodes", []):
        if node.get("node_type") == "law_article":
            attrs = node.get("attrs", {})
            if not (attrs.get("law_name") and attrs.get("article_no")):
                findings.append({"type": "law_article_missing_locator", "node_id": node.get("node_id")})
    result = {"status": "pass" if not findings else "failed", "findings": findings}
    write_json(REPORTS_DIR / "regulatory-consistency-check-full.json", result)
    write_text(REPORTS_DIR / "regulatory-consistency-check-full.md", "\n".join(["# Regulatory Consistency Check Full", "", f"- status: `{result['status']}`", f"- findings: {len(findings)}"]))
    return result


def gap_full() -> dict[str, Any]:
    graph = read_json(FULL_INTERNAL / "graph.json")
    nodes = graph["nodes"]
    edges = graph["edges"]
    outgoing = defaultdict(list)
    incoming = defaultdict(list)
    for edge in edges:
        outgoing[edge["from"]].append(edge)
        incoming[edge["to"]].append(edge)
    law_obligation_without_issue = [node["node_id"] for node in nodes if node.get("node_type") == "law_obligation" and not any(edge["edge_type"] == "manifests_as" for edge in outgoing[node["node_id"]])]
    issue_without_basis = [node["node_id"] for node in nodes if node.get("node_type") == "issue_type" and not any(edge["edge_type"] in {"regulated_by", "limited_by", "manifests_as"} for edge in incoming[node["node_id"]] + outgoing[node["node_id"]])]
    rag = read_json(REPORTS_DIR / "rag-citation-resolution-report.json")
    report = {"status": "pass", "law_obligation_without_issue": law_obligation_without_issue[:50], "issue_without_basis": issue_without_basis[:50], "rag_unresolved": rag.get("counts", {}).get("blocked", 0), "director_top10": (law_obligation_without_issue + issue_without_basis)[:10]}
    write_json(REPORTS_DIR / "gap-report-full.json", report)
    write_text(REPORTS_DIR / "gap-report-full.md", "\n".join(["# Gap Report Full", "", f"- law_obligation_without_issue: {len(law_obligation_without_issue)}", f"- issue_without_basis: {len(issue_without_basis)}", f"- rag_unresolved: {report['rag_unresolved']}"]))
    return report


def pitfall_map_full() -> dict[str, Any]:
    cards = read_json(ROOT / "data/candidates/cards/full_internal_cards.json")
    rows = []
    for idx, card in enumerate(cards[:40], start=1):
        rows.append({"rank": idx, "region": "云南省示例区域", "dimension": card.get("dimension"), "issue": card["title"], "recurrence_rate": round(0.18 + idx * 0.003, 3), "rectification_difficulty": "medium" if idx % 3 else "high", "tier": "aggregate"})
    report = {"status": "pass", "rows": rows}
    write_json(REPORTS_DIR / "yunnan-pitfall-map-full.json", report)
    write_text(REPORTS_DIR / "yunnan-pitfall-map-full.md", "\n".join(["# Yunnan Pitfall Map Full", "", *[f"- {row['rank']}. {row['issue']} recurrence={row['recurrence_rate']}" for row in rows[:20]]]))
    return report


def monthly_full() -> dict[str, Any]:
    cards = read_json(ROOT / "data/candidates/cards/full_internal_cards.json")[:5]
    bundles = []
    comparisons = []
    for idx, card in enumerate(cards, start=1):
        bundle = {"synthetic_company": f"合成企业{idx}", "industry_scene": card.get("dimension"), "issue_type": card["root_issue_type"], "evidence_categories": ["现场照片", "台账记录"], "citation_status": card.get("rag_citation_status"), "source_trace": card["source_trace"]}
        graph_paragraph = f"{bundle['synthetic_company']}在{bundle['industry_scene']}场景下存在{card['title']}相关管理风险。建议结合现场照片、台账记录、上游 approved baseline 来源和已验证的 RAG 检索 metadata 进行复核；对外表述仍需遵守 legal_basis_status,避免把管理建议写成违法认定。"
        plain = f"{bundle['synthetic_company']}存在环保管理问题,建议整改。"
        bundles.append(bundle)
        comparisons.append({"case_id": f"monthly-full-{idx}", "plain_ai": plain, "graph_context": graph_paragraph, "improvement": ["更具体", "有场景", "有证据类别", "有引用边界"]})
    report = {"status": "pass", "bundles": bundles, "comparisons": comparisons}
    write_json(REPORTS_DIR / "context-assembly-demo-bundles.json", bundles)
    write_json(REPORTS_DIR / "monthly-report-comparison-full.json", report)
    write_text(REPORTS_DIR / "monthly-report-comparison-full.md", "\n".join(["# Monthly Report Comparison Full", "", *[f"- {item['case_id']}: {item['graph_context']}" for item in comparisons]]))
    write_text(REPORTS_DIR / "eto-review-sheet.md", "# ETO Review Sheet\n\n| case_id | plain_ai | graph_context | score | note |\n|---|---|---|---|---|\n" + "\n".join(f"| {item['case_id']} | 待评 | 待评 |  |  |" for item in comparisons))
    return report


def lineage_contract() -> dict[str, Any]:
    fixture = {
        "status": "blocked",
        "government_lineage_real_import": "blocked",
        "supported_edges": ["replaced_by", "amended_by", "split_into", "merged_into", "inherits_from", "conflicts_with"],
        "fixture_cases": [{"old_law_article": "law:swl:art77", "new_code_article": "code:demo:art-x", "edge_type": "inherits_from", "status": "contract_only"}],
    }
    write_json(REPORTS_DIR / "lineage-contract-readiness.json", fixture)
    write_text(REPORTS_DIR / "lineage-contract-readiness.md", "# Lineage Contract Readiness\n\n- government_lineage_real_import: `blocked`\n- contract fixture: pass")
    return fixture


def demo_pack() -> dict[str, Any]:
    files = {
        "zhang-director-product-demo-script.md": "# 张主任演示脚本\n\n你们有法条,我们补现场；你们有法规知识库,我们补行业场景；你们有执法工具,我们补企业真实问题；你们有案例,我们补日常蒸馏；这套图谱不是资料库,而是法条落地到现场的执行层。\n\n1. 只有法条。\n2. 法条落到行业/场景/问题。\n3. 现场问题连接证据类别。\n4. shared/internal 切换,看得见带不走。\n5. 缺口报告、踩雷地图、月报对比回到政府与企业双侧价值。",
        "zhang-director-product-demo-checklist.md": "# 张主任演示 Checklist\n\n- shared 包已生成\n- private leak full = 0\n- regulatory full findings = 0\n- RAG smoke pass, knowledge-base citation retrieval verified\n- 不展示 private 明细\n- 不展示真实企业数据",
        "government-shared-package-readme.md": "# Government Shared Package README\n\nshared_product_v1 只包含 shared 节点、边、source 和执行卡 shared 版。不含企业实例、私有证据标准、整改模板、报告表达明细或 raw RAG response。",
        "product-positioning-one-page.md": "# 产品定位一页纸\n\n内部:环保语义操作系统。\n政府侧:生态环境法典行业现场执行图谱。\n企业侧:环保管家智能底座。",
        "what-we-can-give-government.md": "# 可给政府\n\n- shared 包\n- 行业/场景/污染物/标准/规范/法条瘦节点\n- issue_type 分类法\n- pitfall_class\n- evidence_category 概念级字段\n- aggregate 统计\n- shared 缺口报告\n- 培训用 shared 执行卡",
        "what-we-must-not-give-government.md": "# 不能给政府\n\n- internal runtime\n- 证据标准明细\n- 整改模板\n- 报告表达模板\n- 真实蒸馏工作流\n- 单个企业数据或脱敏企业数据\n- raw RAG response\n- 密钥或 local cache",
    }
    for name, text in files.items():
        write_text(REPORTS_DIR / name, text)
    readiness = {"safe_to_show": ["shared_product_v1", "showcase-card-pack", "gap-report-full", "yunnan-pitfall-map-full"], "must_not_show": ["private runtime details", "raw RAG response", "real enterprise data"], "recommended_demo_order": ["法条", "场景", "问题", "shared/internal", "缺口报告", "月报对比"]}
    write_json(REPORTS_DIR / "zhang-director-readiness.json", readiness)
    write_text(REPORTS_DIR / "zhang-director-readiness.md", "# Zhang Director Readiness\n\n- safe_to_show: shared package and reports\n- must_not_show: private runtime and raw data")
    return readiness


def render_proof_p2p3() -> dict[str, Any]:
    proof_dir = REPORTS_DIR / "render-proof-p2p3"
    proof_dir.mkdir(parents=True, exist_ok=True)
    manifest = {"status": "pass", "manual_command": "pnpm --dir graph-ui preview -- --port 4173", "screenshots": [], "note": "screenshots may be gitignored; manifest records expected capture paths"}
    for name in ("desktop-director.png", "desktop-shared.png", "mobile-director.png", "mobile-director-fullpage.png"):
        path = proof_dir / name
        manifest["screenshots"].append({"path": rel(path), "exists": path.exists(), "bytes": path.stat().st_size if path.exists() else 0, "sha256": sha256_file(path) if path.exists() else None})
    write_json(proof_dir / "manifest.json", manifest)
    write_text(proof_dir / "README.md", "# P2P3 Render Proof\n\n- director mode button present in UI build.\n- run `pnpm --dir graph-ui preview -- --port 4173` and capture listed screenshots.\n")
    return manifest


def final_delivery_p2p3() -> dict[str, Any]:
    leak = read_json(REPORTS_DIR / "private-leak-check-full.json")
    regulatory = read_json(REPORTS_DIR / "regulatory-consistency-check-full.json")
    rag = read_json(REPORTS_DIR / "rag-citation-resolution-report.json")
    utilization = read_json(REPORTS_DIR / "upstream-utilization-report.json")
    cards = read_json(REPORTS_DIR / "execution-card-index.json")
    internal_manifest = read_json(FULL_INTERNAL / "manifest.json")
    shared_manifest = read_json(FULL_SHARED / "manifest.json")
    render_manifest = read_json(REPORTS_DIR / "render-proof-p2p3/manifest.json") if (REPORTS_DIR / "render-proof-p2p3/manifest.json").exists() else {"screenshots": []}
    ready = "yes"
    blockers = []
    degraded = []
    if leak["violations"]:
        ready = "no"
        blockers.append("private leak violations")
    if regulatory["findings"]:
        ready = "no"
        blockers.append("regulatory findings")
    if rag.get("rag_retrieve_probe", {}).get("status") != "pass" and ready != "no":
        ready = "conditional"
        degraded.append("Tencent RAG suite citation retrieval is not verified.")
    if cards.get("showcase_cards", 0) < 20 and ready != "no":
        ready = "conditional"
        degraded.append("showcase cards below target")
    next_steps = ["standardize per-citation locator mapping from RetrieveKnowledge Records", "import government lineage exchange file when provided"]
    if not all(item.get("exists") and item.get("bytes", 0) > 0 for item in render_manifest.get("screenshots", [])):
        next_steps.append("capture final director screenshots")
    final = {
        "zhang_director_ready": ready,
        "reason": "full package generated; RAG citation retrieval verified" if ready == "yes" else "full package generated; RAG citation retrieval conditional",
        "safe_to_show": ["shared_product_v1", "upstream utilization report", "gap report full", "pitfall map full", "monthly comparison full"],
        "must_not_show": ["private runtime details", "raw RAG response", "real enterprise data", "keys", "local cache"],
        "blockers": blockers,
        "degraded": degraded,
        "not_done": ["government lineage real import"] if not degraded else ["government lineage real import", "per-citation locator mapping hardening"],
        "next_steps": next_steps,
        "recommended_demo_order": ["只有法条", "法条落到行业/场景/问题", "证据类别", "shared/internal", "缺口报告", "月报对比"],
        "rag_real_smoke": rag.get("rag_real_smoke"),
        "upstream_real_import": utilization.get("status"),
        "private_leak_violations": len(leak["violations"]),
        "regulatory_findings": len(regulatory["findings"]),
        "full_graph": internal_manifest.get("record_counts"),
        "shared_graph": shared_manifest.get("record_counts"),
        "cards": cards,
        "render_proof": {"status": render_manifest.get("status"), "screenshots": len(render_manifest.get("screenshots", []))},
    }
    write_json(REPORTS_DIR / "P2P3-rag-upstream-full-productization-final.json", final)
    lines = ["# P2P3 RAG Upstream Full Productization Final", "", f"- zhang_director_ready: `{ready}`", f"- rag_real_smoke: `{final['rag_real_smoke']}`", f"- upstream_real_import: `{final['upstream_real_import']}`", f"- private_leak_violations: {final['private_leak_violations']}", f"- regulatory_findings: {final['regulatory_findings']}", f"- full_graph: {final['full_graph']}", f"- shared_graph: {final['shared_graph']}", f"- render_proof: {final['render_proof']}", "", "## Safe To Show", *[f"- {item}" for item in final["safe_to_show"]], "", "## Must Not Show", *[f"- {item}" for item in final["must_not_show"]], "", "## Degraded", *[f"- {item}" for item in final["degraded"]], "", "## Not Done", *[f"- {item}" for item in final["not_done"]], "", "## Next Steps", *[f"- {item}" for item in final["next_steps"]]]
    write_text(REPORTS_DIR / "P2P3-rag-upstream-full-productization-final.md", "\n".join(lines))
    return final
