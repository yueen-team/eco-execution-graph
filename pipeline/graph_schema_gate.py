from __future__ import annotations

import sys
from pathlib import Path
from typing import Any

from common import EXPORTS_DIR, REPORTS_DIR, ROOT, read_json, write_json, write_text
from p2p3_paths import UPSTREAM_DIR
from p2p3_io import rel
from schema_validation import validate_against_schema


GRAPH_DATASETS = (
    ("upstream-eco-kb-import", UPSTREAM_DIR / "eco-kb-import.json", True),
    ("upstream-full-graph-source", UPSTREAM_DIR / "full-graph-source.json", True),
    ("demo-hazardous-waste-internal", EXPORTS_DIR / "demo_hazardous_waste_internal" / "graph.json", True),
    ("full-internal-product-v1", EXPORTS_DIR / "full_internal_product_v1" / "graph.json", True),
    ("shared-product-v1", EXPORTS_DIR / "shared_product_v1" / "graph.json", True),
    ("shared-hazardous-waste-v1", EXPORTS_DIR / "shared_hazardous_waste_v1" / "graph.json", True),
)


def load_graph_schemas() -> dict[str, dict[str, Any]]:
    return {
        "nodes": read_json(ROOT / "schema" / "node.schema.json"),
        "edges": read_json(ROOT / "schema" / "edge.schema.json"),
        "sources": read_json(ROOT / "schema" / "source.schema.json"),
    }


def unwrap_graph_payload(payload: dict[str, Any]) -> dict[str, Any]:
    if "graph" in payload and isinstance(payload["graph"], dict):
        return payload["graph"]
    return payload


def validate_graph_payload(graph: dict[str, Any], schemas: dict[str, dict[str, Any]], dataset: str) -> list[dict[str, Any]]:
    findings: list[dict[str, Any]] = []
    checks = {
        "nodes": ("GRAPH-SCHEMA-NODE", "node_id"),
        "edges": ("GRAPH-SCHEMA-EDGE", "edge_id"),
        "sources": ("GRAPH-SCHEMA-SOURCE", "source_id"),
    }
    for collection, (check_id, identity_field) in checks.items():
        records = graph.get(collection)
        if not isinstance(records, list):
            findings.append({
                "severity": "red",
                "check_id": check_id,
                "dataset": dataset,
                "path": f"$.{collection}",
                "message": "graph collection is missing or not an array",
            })
            continue
        for index, record in enumerate(records):
            record_id = record.get(identity_field, f"index:{index}") if isinstance(record, dict) else f"index:{index}"
            for issue in validate_against_schema(record, schemas[collection], f"$.{collection}[{index}]"):
                findings.append({
                    "severity": "red",
                    "check_id": check_id,
                    "dataset": dataset,
                    "record_id": record_id,
                    "path": issue["path"],
                    "message": issue["message"],
                })
    return findings


def run_graph_schema_gate(datasets: tuple[tuple[str, Path, bool], ...] = GRAPH_DATASETS) -> dict[str, Any]:
    schemas = load_graph_schemas()
    findings: list[dict[str, Any]] = []
    checked: list[dict[str, Any]] = []

    for dataset, path, blocking in datasets:
        if not path.exists():
            findings.append({
                "severity": "red" if blocking else "yellow",
                "check_id": "GRAPH-SCHEMA-DATASET",
                "dataset": dataset,
                "path": rel(path),
                "message": "expected graph dataset is missing",
            })
            continue
        graph = unwrap_graph_payload(read_json(path))
        checked.append({
            "dataset": dataset,
            "path": rel(path),
            "nodes": len(graph.get("nodes", [])) if isinstance(graph.get("nodes"), list) else None,
            "edges": len(graph.get("edges", [])) if isinstance(graph.get("edges"), list) else None,
            "sources": len(graph.get("sources", [])) if isinstance(graph.get("sources"), list) else None,
        })
        findings.extend(validate_graph_payload(graph, schemas, dataset))

    summary = {
        "status": "pass" if not any(item["severity"] == "red" for item in findings) else "failed",
        "red": sum(1 for item in findings if item["severity"] == "red"),
        "yellow": sum(1 for item in findings if item["severity"] == "yellow"),
        "info": sum(1 for item in findings if item["severity"] == "info"),
        "checked_datasets": checked,
    }
    report = {
        "gate": "graph-schema-blocking",
        "mode": "blocking",
        "summary": summary,
        "findings": findings,
    }
    write_json(REPORTS_DIR / "graph-schema-blocking-gate.json", report)
    write_text(REPORTS_DIR / "graph-schema-blocking-gate.md", render_markdown_report(report))
    return report


def render_markdown_report(report: dict[str, Any]) -> str:
    summary = report["summary"]
    lines = [
        "# Graph Schema Blocking Gate",
        "",
        f"- status: `{summary['status']}`",
        f"- red: {summary['red']}",
        f"- yellow: {summary['yellow']}",
        f"- info: {summary['info']}",
        "",
        "## Checked Datasets",
        "",
        "| dataset | path | nodes | edges | sources |",
        "|---|---|---:|---:|---:|",
    ]
    for dataset in summary["checked_datasets"]:
        lines.append(
            f"| {dataset['dataset']} | {dataset['path']} | {dataset['nodes']} | {dataset['edges']} | {dataset['sources']} |"
        )
    lines.extend(["", "## Findings"])
    if report["findings"]:
        lines.extend(["", "| severity | check_id | dataset | record_id | path | message |", "|---|---|---|---|---|---|"])
        for finding in report["findings"][:200]:
            lines.append(
                "| "
                + " | ".join(
                    str(finding.get(field, "")).replace("|", "/")
                    for field in ("severity", "check_id", "dataset", "record_id", "path", "message")
                )
                + " |"
            )
    else:
        lines.append("")
        lines.append("No findings.")
    return "\n".join(lines)


def main() -> int:
    report = run_graph_schema_gate()
    summary = report["summary"]
    print(f"graph schema blocking: red={summary['red']} yellow={summary['yellow']} info={summary['info']}")
    return 0 if summary["red"] == 0 and summary["yellow"] == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
