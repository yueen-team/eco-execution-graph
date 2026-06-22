from __future__ import annotations

import argparse
import csv
import datetime as dt
import json
import os
import sys
from pathlib import Path
from typing import Any

from common import EXPORTS_DIR, REPORTS_DIR, ROOT, read_json, sha256_file, write_json, write_text
from p2p3_common import ECO_KB, ECO_KB_MANIFEST
from schema_validation import validate_against_schema

ONTOLOGY_ROOT = Path(os.environ.get("ECO_ONTOLOGY_ROOT", ROOT.parent / "eco-ontology"))
SEMANTIC_EVENT_SCHEMA = Path(
    os.environ.get("ECO_ONTOLOGY_SEMANTIC_EVENT_SCHEMA", ONTOLOGY_ROOT / "schemas" / "semantic_event.v2.schema.json")
)
PROFILE_GAP_SCHEMA = Path(
    os.environ.get("ECO_ONTOLOGY_PROFILE_GAP_SCHEMA", ONTOLOGY_ROOT / "schemas" / "profile_gap_confirmed.v1.schema.json")
)
KB_PRODUCT_MANIFEST_SCHEMA = Path(
    os.environ.get("ECO_ONTOLOGY_KB_PRODUCT_MANIFEST_SCHEMA", ONTOLOGY_ROOT / "schemas" / "kb_product_manifest.v1.schema.json")
)
GRAPH_ONTOLOGY_PROJECTIONS = {
    "registry": {
        "path": Path(
            os.environ.get(
                "ECO_ONTOLOGY_GRAPH_REGISTRY_PROJECTION",
                ONTOLOGY_ROOT / "dist" / "projections" / "graph" / "ontology-registry.generated.json",
            )
        ),
        "sha256": "18846a7375b54b034c8512a5e71de6222fd8db086b2b031594ba87b0ad173479",
        "schema_version": "eco-ontology.projection.graph.registry.v1",
    },
    "schema_fragment": {
        "path": Path(
            os.environ.get(
                "ECO_ONTOLOGY_GRAPH_SCHEMA_FRAGMENT_PROJECTION",
                ONTOLOGY_ROOT / "dist" / "projections" / "graph" / "schema.fragment.generated.json",
            )
        ),
        "sha256": "f2720412066da1d80ff3eeadcdb070863338f7053a01a23719b3fa714bb81ea6",
        "schema_version": "eco-ontology.projection.graph.schema_fragment.v1",
    },
}
MAX_FINDINGS_PER_CHECK = 80
BLOCKING_SEVERITIES = {"red", "yellow"}

GRAPH_PACKAGES = [
    EXPORTS_DIR / "shared_product_v1" / "graph.json",
    EXPORTS_DIR / "shared_hazardous_waste_v1" / "graph.json",
]

KB_ASSETS = {
    "approved_show_if_rules": {
        "path": ECO_KB / "data" / "approved_baseline" / "approved_show_if_rules_v1_0.csv",
        "columns": ["scenario_id", "scenario_name", "show_if_rule_id", "template_subsection", "inspection_type"],
    },
    "pollutant_domain_approved_baseline": {
        "path": ECO_KB / "data" / "approved_baseline" / "pollutant_domain_v8_5" / "pollutant_domain_approved_baseline_v8_5.csv",
        "columns": ["baseline_entry_id", "domain", "source_id"],
    },
    "pollutant_standard_link_map": {
        "path": ECO_KB / "data" / "approved_baseline" / "pollutant_domain_v8_5" / "pollutant_standard_link_map_v8_6.csv",
        "columns": ["link_id", "source_id", "target_kind"],
    },
    "approved_specialized_inspection_items": {
        "path": ECO_KB / "data" / "approved_baseline" / "approved_specialized_inspection_items_v1_0.csv",
        "columns": ["item_id", "title", "source_basis"],
    },
}


def add_finding(findings: list[dict[str, Any]], severity: str, check_id: str, path: str, message: str, owner: str = "eco-execution-graph") -> None:
    if sum(1 for item in findings if item["check_id"] == check_id) >= MAX_FINDINGS_PER_CHECK:
        if not any(item["check_id"] == check_id and item["message"].startswith("Finding output capped") for item in findings):
            findings.append({
                "severity": "info",
                "check_id": check_id,
                "path": "$",
                "message": f"Finding output capped at {MAX_FINDINGS_PER_CHECK} rows for readability.",
                "owner": owner,
            })
        return
    findings.append({"severity": severity, "check_id": check_id, "path": path, "message": message, "owner": owner})


def validate_value(value: Any, schema: Any, path: str, check_id: str, findings: list[dict[str, Any]]) -> None:
    for issue in validate_against_schema(value, schema, path):
        add_finding(findings, "red", check_id, issue["path"], issue["message"])


def validate_graph_exports(findings: list[dict[str, Any]]) -> None:
    schemas = {
        "nodes": (read_json(ROOT / "schema" / "node.schema.json"), "GRAPH-001", "node_id"),
        "edges": (read_json(ROOT / "schema" / "edge.schema.json"), "GRAPH-002", "edge_id"),
        "sources": (read_json(ROOT / "schema" / "source.schema.json"), "GRAPH-003", "source_id"),
    }
    for graph_path in GRAPH_PACKAGES:
        if not graph_path.exists():
            add_finding(findings, "yellow", "GRAPH-001", str(graph_path), "Graph export does not exist.")
            continue
        graph = read_json(graph_path)
        for collection, (schema, check_id, id_field) in schemas.items():
            for index, record in enumerate(graph.get(collection, [])):
                record_id = record.get(id_field, f"{collection}[{index}]")
                validate_value(record, schema, f"{graph_path.name}:{collection}[{index}]({record_id})", check_id, findings)


def scan_forbidden(value: Any, path: str, findings: list[dict[str, Any]]) -> None:
    forbidden_keys = {
        "raw_attachment",
        "raw_attachments",
        "attachment_url",
        "photo_url",
        "gps",
        "latitude",
        "longitude",
        "authorization",
        "token",
        "secret",
        "law_full_text",
        "raw_report_text",
    }
    if isinstance(value, dict):
        for key, item in value.items():
            next_path = f"{path}.{key}"
            if key.lower() in forbidden_keys:
                add_finding(findings, "red", "GRAPH-006", next_path, "Forbidden field is present in semantic event payload.")
            scan_forbidden(item, next_path, findings)
    elif isinstance(value, list):
        for index, item in enumerate(value):
            scan_forbidden(item, f"{path}[{index}]", findings)


def validate_semantic_event_fixture(findings: list[dict[str, Any]]) -> None:
    fixture_path = ROOT / "data" / "fixtures" / "ecocheck-field-event-fixture.json"
    if not SEMANTIC_EVENT_SCHEMA.exists():
        add_finding(findings, "red", "GRAPH-006", str(SEMANTIC_EVENT_SCHEMA), "semantic_event.v2 schema is missing.")
        return
    payload = read_json(fixture_path)
    schema = read_json(SEMANTIC_EVENT_SCHEMA)
    validate_value(payload, schema, "$", "GRAPH-006", findings)
    scan_forbidden(payload, "$", findings)


def validate_profile_gap_fixture(findings: list[dict[str, Any]]) -> None:
    fixture_path = ROOT / "data" / "fixtures" / "ecocheck-profile-gap-confirmed-fixture.json"
    if not PROFILE_GAP_SCHEMA.exists():
        add_finding(findings, "red", "GRAPH-007", str(PROFILE_GAP_SCHEMA), "profile_gap_confirmed.v1 schema is missing.")
        return
    payload = read_json(fixture_path)
    schema = read_json(PROFILE_GAP_SCHEMA)
    validate_value(payload, schema, "$", "GRAPH-007", findings)
    scan_forbidden(payload, "$", findings)


def normalize_manifest_hash(value: str | None) -> str:
    if not value:
        return ""
    return value.removeprefix("sha256:")


def iter_manifest_outputs(value: Any) -> list[dict[str, str]]:
    outputs: list[dict[str, str]] = []
    if isinstance(value, dict):
        for item in value.values():
            if isinstance(item, dict) and item.get("path"):
                outputs.append({"path": item["path"], "sha256": normalize_manifest_hash(item.get("sha256"))})
        artifacts = value.get("artifacts")
        if isinstance(artifacts, dict):
            for path in artifacts.values():
                if isinstance(path, str):
                    outputs.append({"path": path, "sha256": ""})
    return outputs


def validate_kb_manifest(findings: list[dict[str, Any]]) -> None:
    if not ECO_KB_MANIFEST.exists():
        add_finding(findings, "red", "GRAPH-004", str(ECO_KB_MANIFEST), "KB package manifest does not exist.")
        return
    manifest = read_json(ECO_KB_MANIFEST)
    runtime_status = manifest.get("runtime_status") or manifest.get("final_state") or manifest.get("runtime_integration")
    if not runtime_status:
        add_finding(findings, "red", "GRAPH-004", "$.runtime_status", "Manifest does not declare runtime/final state.")
    if not manifest.get("knowledge_base_version"):
        add_finding(findings, "red", "GRAPH-004", "$.knowledge_base_version", "Manifest does not declare knowledge_base_version.")
    outputs = iter_manifest_outputs(manifest.get("outputs")) + iter_manifest_outputs(manifest)
    if not outputs:
        add_finding(findings, "yellow", "GRAPH-004", "$.outputs", "Manifest has no path/hash output entries to verify.")
    for item in outputs:
        path = ECO_KB / item["path"]
        if not path.exists():
            add_finding(findings, "red", "GRAPH-004", item["path"], "Manifest output path does not exist under ECO_KB root.")
        elif item["sha256"] and item["sha256"] != sha256_file(path):
            add_finding(findings, "red", "GRAPH-004", item["path"], "Manifest sha256 does not match local file.")
    if KB_PRODUCT_MANIFEST_SCHEMA.exists():
        schema = read_json(KB_PRODUCT_MANIFEST_SCHEMA)
        validate_value(manifest, schema, "$", "GRAPH-008", findings)
    else:
        add_finding(
            findings,
            "info",
            "GRAPH-008",
            str(KB_PRODUCT_MANIFEST_SCHEMA),
            "Formal ontology kb_product_manifest.v1 schema is pending; graph validates path/version/hash contract directly.",
        )


def validate_kb_columns(findings: list[dict[str, Any]]) -> None:
    for asset_name, contract in KB_ASSETS.items():
        path = contract["path"]
        if not path.exists():
            add_finding(findings, "red", "GRAPH-005", str(path), f"{asset_name} asset is missing.")
            continue
        with path.open("r", encoding="utf-8-sig", newline="") as handle:
            reader = csv.DictReader(handle)
            columns = reader.fieldnames or []
            for column in contract["columns"]:
                if column not in columns:
                    add_finding(findings, "red", "GRAPH-005", f"{asset_name}.{column}", "Required KB import column is missing.")
            for index, row in enumerate(reader):
                if index >= 20:
                    break
                for column in contract["columns"]:
                    if column in row and not str(row.get(column, "")).strip():
                        add_finding(findings, "yellow", "GRAPH-005", f"{asset_name}[{index}].{column}", "Required KB import column is empty.")


def validate_ontology_projections(findings: list[dict[str, Any]]) -> list[dict[str, Any]]:
    projection_reports: list[dict[str, Any]] = []
    for projection_id, projection in GRAPH_ONTOLOGY_PROJECTIONS.items():
        path = projection["path"]
        record = {
            "projection_id": projection_id,
            "path": str(path),
            "expected_sha256": projection["sha256"],
            "sha256": "",
            "schema_version": "",
            "ontology_version": "",
        }
        projection_reports.append(record)
        if not path.exists():
            add_finding(findings, "red", "GRAPH-ONTOLOGY-PROJECTION", str(path), "Ontology graph projection is missing.")
            continue
        record["sha256"] = sha256_file(path)
        if record["sha256"] != projection["sha256"]:
            add_finding(
                findings,
                "red",
                "GRAPH-ONTOLOGY-PROJECTION",
                str(path),
                "Ontology graph projection sha256 does not match v0.1.0 compatibility matrix.",
            )
        payload = read_json(path)
        record["schema_version"] = payload.get("schema_version", "")
        record["ontology_version"] = payload.get("generated_by", {}).get("ontology_version", "")
        if record["schema_version"] != projection["schema_version"]:
            add_finding(
                findings,
                "red",
                "GRAPH-ONTOLOGY-PROJECTION",
                "$.schema_version",
                "Ontology graph projection schema_version is not the expected v0.1.0 projection.",
            )
        if record["ontology_version"] != "0.1.0":
            add_finding(
                findings,
                "red",
                "GRAPH-ONTOLOGY-PROJECTION",
                "$.generated_by.ontology_version",
                "Ontology graph projection must be generated from ontology v0.1.0.",
            )
    return projection_reports


def write_report(findings: list[dict[str, Any]], mode: str, ontology_projections: list[dict[str, Any]]) -> dict[str, Any]:
    summary = {"red": 0, "yellow": 0, "info": 0}
    for finding in findings:
        summary[finding["severity"]] += 1
    blocking_failed = any(finding["severity"] in BLOCKING_SEVERITIES for finding in findings)
    report = {
        "validator_id": "ECO-GRAPH-CONTRACT-VALIDATION",
        "mode": mode,
        "ontology_schemas": {
            "semantic_event": str(SEMANTIC_EVENT_SCHEMA),
            "profile_gap_confirmed": str(PROFILE_GAP_SCHEMA),
            "kb_product_manifest": str(KB_PRODUCT_MANIFEST_SCHEMA),
        },
        "ontology_projections": ontology_projections,
        "upstream_lock_policy": {
            "status": "pinned",
            "reason": "Graph keeps KB upstream lock pinning until a KB manifest update ships with manifest sha256 evidence.",
            "lock_path": str(ROOT / "data" / "upstream" / "upstream-lock.json"),
        },
        "blocking_policy": {
            "fail_on": sorted(BLOCKING_SEVERITIES),
            "failed": blocking_failed,
        },
        "consumer_repo": "eco-execution-graph",
        "checked_at": dt.datetime.now(dt.timezone.utc).isoformat(),
        "eco_kb_root": str(ECO_KB),
        "eco_kb_package_manifest": str(ECO_KB_MANIFEST),
        "summary": summary,
        "findings": findings,
    }
    stem = "ontology-contract-report-only-validation" if mode == "report-only" else "ontology-contract-blocking-validation"
    write_json(REPORTS_DIR / f"{stem}.json", report)
    lines = [
        "# Ontology Contract Validation",
        "",
        f"- mode: `{report['mode']}`",
        f"- semantic_event_schema: `{report['ontology_schemas']['semantic_event']}`",
        f"- profile_gap_schema: `{report['ontology_schemas']['profile_gap_confirmed']}`",
        f"- kb_product_manifest_schema: `{report['ontology_schemas']['kb_product_manifest']}`",
        f"- upstream_lock_policy: `{report['upstream_lock_policy']['status']}`",
        f"- eco_kb_root: `{report['eco_kb_root']}`",
        f"- eco_kb_package_manifest: `{report['eco_kb_package_manifest']}`",
        f"- red: {summary['red']}",
        f"- yellow: {summary['yellow']}",
        f"- info: {summary['info']}",
        f"- blocking_failed: `{str(blocking_failed).lower()}`",
        "",
        "## Ontology Projections",
        "",
    ]
    for projection in ontology_projections:
        lines.append(
            f"- {projection['projection_id']}: `{projection['path']}` sha256=`{projection['sha256'] or 'missing'}`"
        )
    lines.extend([
        "",
        "## Findings",
        "",
    ])
    if findings:
        for finding in findings:
            lines.append(f"- {finding['severity']} {finding['check_id']} {finding['path']}: {finding['message']}")
    else:
        lines.append("- none")
    write_text(REPORTS_DIR / f"{stem}.md", "\n".join(lines))
    return report


def main() -> None:
    parser = argparse.ArgumentParser(description="Validate graph artifacts against ontology contracts.")
    parser.add_argument("--mode", choices=["report-only", "blocking"], default="report-only")
    args = parser.parse_args()

    findings: list[dict[str, Any]] = []
    validate_graph_exports(findings)
    validate_semantic_event_fixture(findings)
    validate_profile_gap_fixture(findings)
    validate_kb_manifest(findings)
    validate_kb_columns(findings)
    ontology_projections = validate_ontology_projections(findings)
    report = write_report(findings, args.mode, ontology_projections)
    status = "fail" if args.mode == "blocking" and report["blocking_policy"]["failed"] else args.mode
    print(json.dumps({"status": status, "summary": report["summary"]}, ensure_ascii=False))
    if args.mode == "blocking" and report["blocking_policy"]["failed"]:
        sys.exit(1)


if __name__ == "__main__":
    main()
