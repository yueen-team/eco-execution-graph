from __future__ import annotations

import argparse
import json

from common import EXPORTS_DIR, REPORTS_DIR, load_internal_graph, read_json, write_graph_package, write_json, write_text
from p2p3_common import FULL_INTERNAL, FULL_SHARED, export_full_packages
from tier_policy import filter_shared_graph


def filter_shared(graph: dict) -> dict:
    return filter_shared_graph(graph)


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
    parser.add_argument("--tier", choices=["shared", "internal"], default="shared")
    parser.add_argument("--scope", choices=["p1", "full"], default="p1")
    args = parser.parse_args()
    if args.scope == "full":
        manifests = export_full_packages()
        selected = manifests["shared" if args.tier == "shared" else "internal"]
        print(json.dumps({"exported": str(FULL_SHARED if args.tier == "shared" else FULL_INTERNAL), "counts": selected["record_counts"]}, ensure_ascii=False))
        return
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
