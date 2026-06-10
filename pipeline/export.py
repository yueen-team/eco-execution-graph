from __future__ import annotations

import argparse
import json

from common import EXPORTS_DIR, REPORTS_DIR, load_internal_graph, read_json, write_graph_package, write_json, write_text

FORBIDDEN_SHARED_NODE_TYPES = {
    "enterprise", "facility", "discharge_outlet", "risk_unit", "issue_instance",
    "pitfall_instance", "evidence_judgment_standard", "evidence_instance",
    "rectification_template", "rectification_instance", "report_expression", "distill_event",
}


def filter_shared(graph: dict) -> dict:
    shared_nodes = [node for node in graph["nodes"] if node["tier"] == "shared" and node["node_type"] not in FORBIDDEN_SHARED_NODE_TYPES]
    node_ids = {node["node_id"] for node in shared_nodes}
    shared_sources = {source["source_id"]: source for source in graph["sources"] if source["tier"] == "shared"}
    shared_edges = []
    for edge in graph["edges"]:
        if edge["tier"] != "shared":
            continue
        if edge["from"] not in node_ids or edge["to"] not in node_ids:
            continue
        if edge["source_ref"] not in shared_sources:
            continue
        if edge.get("legal_basis_status") in {"candidate", "disputed"}:
            continue
        shared_edges.append(edge)
    used_sources = {edge["source_ref"] for edge in shared_edges}
    return {
        "nodes": shared_nodes,
        "edges": shared_edges,
        "sources": [source for sid, source in shared_sources.items() if sid in used_sources],
    }


def write_export_report(manifest: dict) -> None:
    lines = [
        "# Shared Hazardous Waste Export",
        "",
        f"- package: `{manifest['package_name']}`",
        f"- demo_package: `{str(manifest['demo_package']).lower()}`",
        f"- tier_filter: `{manifest['tier_filter']}`",
        f"- nodes: {manifest['record_counts']['nodes']}",
        f"- edges: {manifest['record_counts']['edges']}",
        f"- sources: {manifest['record_counts']['sources']}",
        "- policy: shared package contains only shared node/edge/source records and law_article thin refs.",
    ]
    write_text(REPORTS_DIR / "shared-export-hazardous-waste.md", "\n".join(lines))
    write_json(REPORTS_DIR / "shared-export-hazardous-waste.json", manifest)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--tier", choices=["shared"], default="shared")
    args = parser.parse_args()
    graph = load_internal_graph()
    if args.tier == "shared":
        shared = filter_shared(graph)
        package_dir = EXPORTS_DIR / "shared_hazardous_waste_v1"
        manifest = write_graph_package(package_dir, shared, "shared_hazardous_waste_v1", "shared", True)
        shared_cards = read_json(EXPORTS_DIR / "demo_hazardous_waste_internal" / "cards.shared-preview.json")
        write_json(package_dir / "cards.shared.json", shared_cards)
        write_export_report(manifest)
        print(json.dumps({"exported": str(package_dir), "counts": manifest["record_counts"]}, ensure_ascii=False))


if __name__ == "__main__":
    main()
