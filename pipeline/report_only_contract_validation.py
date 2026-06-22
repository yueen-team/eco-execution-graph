from __future__ import annotations

import csv
import datetime as dt
import json
import os
from pathlib import Path
from typing import Any

from common import EXPORTS_DIR, REPORTS_DIR, ROOT, read_json, sha256_file, write_json, write_text
from p2p3_common import ECO_KB, ECO_KB_MANIFEST

ONTOLOGY_ROOT = Path(os.environ.get("ECO_ONTOLOGY_ROOT", ROOT.parent / "eco-ontology"))
SEMANTIC_EVENT_SCHEMA = Path(
    os.environ.get("ECO_ONTOLOGY_SEMANTIC_EVENT_SCHEMA", ONTOLOGY_ROOT / "schemas" / "semantic_event.v2.schema.json")
)
MAX_FINDINGS_PER_CHECK = 80

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


def type_matches(value: Any, expected: str) -> bool:
    if expected == "object":
        return isinstance(value, dict)
    if expected == "array":
        return isinstance(value, list)
    if expected == "string":
        return isinstance(value, str)
    if expected == "number":
        return isinstance(value, (int, float)) and not isinstance(value, bool)
    if expected == "integer":
        return isinstance(value, int) and not isinstance(value, bool)
    if expected == "boolean":
        return isinstance(value, bool)
    return True


def validate_value(value: Any, schema: Any, path: str, check_id: str, findings: list[dict[str, Any]]) -> None:
    if schema is False:
        add_finding(findings, "red", check_id, path, "Forbidden field is present.")
        return
    if not isinstance(schema, dict):
        return
    expected_type = schema.get("type")
    if isinstance(expected_type, str) and not type_matches(value, expected_type):
        add_finding(findings, "red", check_id, path, f"Expected {expected_type}, got {type(value).__name__}.")
        return
    if "const" in schema and value != schema["const"]:
        add_finding(findings, "red", check_id, path, f"Expected const {schema['const']!r}.")
    if "enum" in schema and value not in schema["enum"]:
        add_finding(findings, "red", check_id, path, f"Value {value!r} is not declared by schema enum.")
    if isinstance(value, dict):
        for field in schema.get("required", []):
            if field not in value:
                add_finding(findings, "red", check_id, f"{path}.{field}", "Required field is missing.")
        properties = schema.get("properties", {})
        for key, item in value.items():
            if key in properties:
                validate_value(item, properties[key], f"{path}.{key}", check_id, findings)
            elif schema.get("additionalProperties") is False:
                add_finding(findings, "red", check_id, f"{path}.{key}", "Additional property is not declared by schema.")
    if isinstance(value, list) and "items" in schema:
        for index, item in enumerate(value):
            validate_value(item, schema["items"], f"{path}[{index}]", check_id, findings)


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


def write_report(findings: list[dict[str, Any]]) -> dict[str, Any]:
    summary = {"red": 0, "yellow": 0, "info": 0}
    for finding in findings:
        summary[finding["severity"]] += 1
    report = {
        "validator_id": "ECO-GRAPH-CONTRACT-REPORT-ONLY",
        "mode": "report-only",
        "ontology_schema": str(SEMANTIC_EVENT_SCHEMA),
        "consumer_repo": "eco-execution-graph",
        "checked_at": dt.datetime.now(dt.timezone.utc).isoformat(),
        "eco_kb_root": str(ECO_KB),
        "eco_kb_package_manifest": str(ECO_KB_MANIFEST),
        "summary": summary,
        "findings": findings,
    }
    write_json(REPORTS_DIR / "ontology-contract-report-only-validation.json", report)
    lines = [
        "# Ontology Contract Report-only Validation",
        "",
        f"- mode: `{report['mode']}`",
        f"- semantic_event_schema: `{report['ontology_schema']}`",
        f"- eco_kb_root: `{report['eco_kb_root']}`",
        f"- eco_kb_package_manifest: `{report['eco_kb_package_manifest']}`",
        f"- red: {summary['red']}",
        f"- yellow: {summary['yellow']}",
        f"- info: {summary['info']}",
        "",
        "## Findings",
        "",
    ]
    if findings:
        for finding in findings:
            lines.append(f"- {finding['severity']} {finding['check_id']} {finding['path']}: {finding['message']}")
    else:
        lines.append("- none")
    write_text(REPORTS_DIR / "ontology-contract-report-only-validation.md", "\n".join(lines))
    return report


def main() -> None:
    findings: list[dict[str, Any]] = []
    validate_graph_exports(findings)
    validate_semantic_event_fixture(findings)
    validate_kb_manifest(findings)
    validate_kb_columns(findings)
    report = write_report(findings)
    print(json.dumps({"status": "report-only", "summary": report["summary"]}, ensure_ascii=False))


if __name__ == "__main__":
    main()
