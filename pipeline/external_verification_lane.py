from __future__ import annotations

import datetime as dt
import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Any

from common import REPORTS_DIR, ROOT, read_json, write_json, write_text
from tencent_cloud_signer import load_env
from tencent_lke_probe import configured


REPORT_JSON = REPORTS_DIR / "external-verification-lane.json"
REPORT_MD = REPORTS_DIR / "external-verification-lane.md"
RAG_REPORT = REPORTS_DIR / "rag-citation-resolution-report.json"
AGGREGATE_REPORT = REPORTS_DIR / "ecocheck-aggregate-pitfall-candidates.json"
LINEAGE_REPORT = REPORTS_DIR / "lineage-contract-readiness.json"
MONTHLY_COMPARISON_REPORT = REPORTS_DIR / "monthly-report-comparison-full.json"

REQUIRED_ENV = (
    "TENCENT_LKE_SECRET_ID",
    "TENCENT_LKE_SECRET_KEY",
    "TENCENT_LKE_KNOWLEDGE_BASE_IDS",
)
TOKENHUB_ENV = ("TENCENT_TOKENHUB_API_KEY", "TENCENT_LKEAP_API_KEY")
FORBIDDEN_PAYLOAD_KEYS = {"Content", "content", "full_text", "raw_text", "article_text"}
ALL_GATE_IDS = (
    "GRAPH-RAG-REAL-SMOKE",
    "ECOCHECK-GRAPH-PUSH-REAL-SMOKE",
    "ECOCHECK-AGGREGATE-ETO-BLIND-REVIEW",
    "GOVERNMENT-LINEAGE-REAL-IMPORT",
)
DEFAULT_REQUIRED_GATE_IDS = ("GRAPH-RAG-REAL-SMOKE",)


def utc_now() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def rel(path: Path) -> str:
    return path.resolve().relative_to(ROOT).as_posix()


def display_path(path: Path) -> str:
    try:
        return rel(path)
    except ValueError:
        return str(path)


def load_external_env() -> dict[str, str]:
    env = load_env()
    for key, value in os.environ.items():
        if value:
            env[key] = value
    return env


def parse_required_gate_ids(env: dict[str, str]) -> list[str]:
    raw = (env.get("GRAPH_EXTERNAL_REQUIRED_GATES") or "").strip()
    if not raw:
        return list(DEFAULT_REQUIRED_GATE_IDS)
    if raw.lower() == "all":
        return list(ALL_GATE_IDS)
    requested = [item.strip() for item in raw.split(",") if item.strip()]
    unknown = sorted(set(requested) - set(ALL_GATE_IDS))
    if unknown:
        raise ValueError(f"Unknown external gate id(s): {', '.join(unknown)}")
    return requested


def build_preflight(env: dict[str, str]) -> dict[str, Any]:
    required = [{"name": name, "configured": configured(env.get(name))} for name in REQUIRED_ENV]
    tokenhub_configured = [name for name in TOKENHUB_ENV if configured(env.get(name))]
    alternatives = [
        {
            "group": "tokenhub_deepseek_api_key",
            "accepted_env_names": list(TOKENHUB_ENV),
            "configured_env_names": tokenhub_configured,
            "configured": bool(tokenhub_configured),
        }
    ]
    missing = [item["name"] for item in required if not item["configured"]]
    if not tokenhub_configured:
        missing.append("tokenhub_deepseek_api_key")
    return {
        "status": "pass" if not missing else "blocked",
        "env_source_policy": ".env.local plus process environment; report records names only",
        "required": required,
        "alternatives": alternatives,
        "missing": missing,
    }


def redact_text(text: str, env: dict[str, str]) -> str:
    redacted = text
    for value in env.values():
        if configured(value) and len(value) >= 6:
            redacted = redacted.replace(value, "<redacted>")
    redacted = re.sub(r"Bearer\s+[A-Za-z0-9._~+/=-]+", "Bearer <redacted>", redacted)
    redacted = re.sub(r"Authorization:\s*[^\\r\\n]+", "Authorization: <redacted>", redacted, flags=re.IGNORECASE)
    redacted = re.sub(r"(secret[_-]?key[\"'=:\s]+)[^\\s,;}]+", r"\1<redacted>", redacted, flags=re.IGNORECASE)
    redacted = re.sub(r"(api[_-]?key[\"'=:\s]+)[^\\s,;}]+", r"\1<redacted>", redacted, flags=re.IGNORECASE)
    return redacted


def summarize_error_output(text: str, env: dict[str, str]) -> str:
    lines = [line for line in redact_text(text, env).splitlines() if line.strip()]
    return "\n".join(lines[-12:])[:1200]


def run_command(name: str, command: list[str], env: dict[str, str]) -> dict[str, Any]:
    executable = shutil.which(command[0]) or command[0]
    resolved_command = [executable, *command[1:]]
    try:
        result = subprocess.run(resolved_command, cwd=ROOT, text=True, capture_output=True, timeout=240)
    except subprocess.TimeoutExpired as error:
        combined = "\n".join(part for part in (error.stdout, error.stderr) if isinstance(part, str))
        return {
            "name": name,
            "command": " ".join(command),
            "status": "failed",
            "exit_code": None,
            "error_summary": summarize_error_output(combined or "command timed out after 240 seconds", env),
        }
    except FileNotFoundError as error:
        return {
            "name": name,
            "command": " ".join(command),
            "status": "failed",
            "exit_code": None,
            "error_summary": summarize_error_output(str(error), env),
        }
    step = {
        "name": name,
        "command": " ".join(command),
        "status": "pass" if result.returncode == 0 else "failed",
        "exit_code": result.returncode,
    }
    if result.returncode != 0:
        combined = "\n".join(part for part in (result.stdout, result.stderr) if part)
        step["error_summary"] = summarize_error_output(combined, env)
    return step


def find_forbidden_payload_keys(value: Any, path: str = "$") -> list[dict[str, str]]:
    hits: list[dict[str, str]] = []
    if isinstance(value, dict):
        for key, item in value.items():
            child_path = f"{path}.{key}"
            if key in FORBIDDEN_PAYLOAD_KEYS:
                hits.append({"path": child_path, "key": key})
            hits.extend(find_forbidden_payload_keys(item, child_path))
    elif isinstance(value, list):
        for index, item in enumerate(value):
            hits.extend(find_forbidden_payload_keys(item, f"{path}[{index}]"))
    return hits


def summarize_rag_report(report: dict[str, Any] | None) -> dict[str, Any]:
    if not report:
        return {
            "status": "blocked",
            "reason": "rag citation resolution report not available from this lane run",
            "report": rel(RAG_REPORT),
        }

    results = report.get("results", []) if isinstance(report.get("results"), list) else []
    raw_cached_true = [item for item in results if isinstance(item, dict) and item.get("raw_cached") is True]
    non_empty_excerpt = [item for item in results if isinstance(item, dict) and item.get("excerpt")]
    forbidden_keys = find_forbidden_payload_keys(report)
    safety_status = "pass" if not raw_cached_true and not non_empty_excerpt and not forbidden_keys else "failed"
    rag_status = report.get("rag_real_smoke") or "blocked"
    return {
        "status": "pass" if rag_status == "pass" and safety_status == "pass" else "failed",
        "rag_real_smoke": rag_status,
        "tokenhub_probe": report.get("tokenhub_probe", {}).get("status"),
        "rag_retrieve_probe": report.get("rag_retrieve_probe", {}).get("status"),
        "embedding_probe": report.get("embedding_probe", {}).get("status"),
        "citation_count": report.get("citation_count", 0),
        "counts": report.get("counts", {}),
        "locator_counts": report.get("locator_counts", {}),
        "source_level_review_queue_size": len(report.get("source_level_items", [])),
        "report": rel(RAG_REPORT),
        "safety": {
            "status": safety_status,
            "raw_cached_true_count": len(raw_cached_true),
            "non_empty_excerpt_count": len(non_empty_excerpt),
            "forbidden_payload_key_count": len(forbidden_keys),
            "forbidden_payload_key_examples": forbidden_keys[:10],
            "raw_rag_content_stored": bool(forbidden_keys),
            "cache_policy": "metadata_only",
        },
    }


def rag_gate_status(preflight: dict[str, Any], steps: list[dict[str, Any]], rag: dict[str, Any]) -> str:
    if preflight["status"] != "pass":
        return "blocked"
    if any(step["status"] != "pass" for step in steps):
        return "failed"
    return "pass" if rag["status"] == "pass" else "failed"


def read_optional_json(path: Path) -> dict[str, Any] | None:
    if not path.exists():
        return None
    return read_json(path)


def summarize_ecocheck_graph_push(env: dict[str, str]) -> dict[str, Any]:
    report_path = Path(
        env.get("ECOCHECK_GRAPH_SMOKE_REPORT")
        or Path(env.get("ECOCHECK_ROOT") or "E:/EcoCheck")
        / "docs"
        / "validation"
        / "graph-synthetic-smoke.latest.json"
    )
    report = read_optional_json(report_path)
    if report is None:
        return {
            "gate_id": "ECOCHECK-GRAPH-PUSH-REAL-SMOKE",
            "status": "blocked",
            "report": display_path(report_path),
            "reason": "EcoCheck graph synthetic/live smoke report is missing.",
            "required_input": "Run EcoCheck pnpm semantic:graph:smoke with ECO_GRAPH_FIELD_EVENT_ENDPOINT and ECO_GRAPH_API_TOKEN.",
        }

    cases = report.get("cases", []) if isinstance(report.get("cases"), list) else []
    posted_cases = [
        case
        for case in cases
        if case.get("posted") is True
        and case.get("result") == "post-pass"
        and isinstance(case.get("http_status"), int)
        and 200 <= case.get("http_status") < 300
    ]
    synthetic = str(report.get("business_key") or "").startswith("synthetic-")
    disposition = (
        report.get("post_smoke_disposition")
        or env.get("ECOCHECK_GRAPH_SYNTHETIC_DISPOSITION")
        or ""
    )
    cleanup_ok = (not synthetic) or disposition in {"marked_not_for_graph", "deleted", "not_applicable"}
    live_ok = report.get("mode") == "live" and report.get("result") == "live-pass"
    token_ok = report.get("token_configured") is True
    status = "pass" if live_ok and token_ok and posted_cases and cleanup_ok else "blocked"
    return {
        "gate_id": "ECOCHECK-GRAPH-PUSH-REAL-SMOKE",
        "status": status,
        "report": display_path(report_path),
        "checked_at": report.get("checked_at"),
        "mode": report.get("mode"),
        "endpoint": report.get("endpoint"),
        "token_configured": token_ok,
        "business_key": report.get("business_key"),
        "posted_case_count": len(posted_cases),
        "synthetic_cleanup_status": disposition or "missing",
        "synthetic_review_id": report.get("synthetic_review_id"),
        "reason": None
        if status == "pass"
        else "Live smoke must pass and synthetic rows must be marked not-for-graph or deleted.",
    }


def summarize_aggregate_and_blind_review() -> dict[str, Any]:
    aggregate = read_optional_json(AGGREGATE_REPORT)
    monthly = read_optional_json(MONTHLY_COMPARISON_REPORT)
    aggregate_rows = len(aggregate.get("rows", [])) if aggregate else 0
    aggregate_pass = bool(aggregate and aggregate.get("status") == "pass" and aggregate_rows > 0)
    monthly_pass = bool(monthly and monthly.get("status") == "pass")
    status = "pass" if aggregate_pass and monthly_pass else "blocked"
    return {
        "gate_id": "ECOCHECK-AGGREGATE-ETO-BLIND-REVIEW",
        "status": status,
        "aggregate_report": display_path(AGGREGATE_REPORT),
        "monthly_comparison_report": display_path(MONTHLY_COMPARISON_REPORT),
        "aggregate_status": aggregate.get("status") if aggregate else "missing",
        "aggregate_rows": aggregate_rows,
        "monthly_comparison_status": monthly.get("status") if monthly else "missing",
        "eto_blind_review_status": "pass" if monthly_pass else "pending",
        "reason": None
        if status == "pass"
        else "Requires real aggregate rows plus ETO blind review of desensitized monthly samples.",
    }


def summarize_government_lineage() -> dict[str, Any]:
    report = read_optional_json(LINEAGE_REPORT)
    if report is None:
        return {
            "gate_id": "GOVERNMENT-LINEAGE-REAL-IMPORT",
            "status": "blocked",
            "report": display_path(LINEAGE_REPORT),
            "reason": "Government lineage readiness report is missing.",
        }
    real_import = report.get("government_lineage_real_import")
    dataset_status = report.get("dataset_status")
    status = "pass" if real_import == "ready" and dataset_status == "government_confirmed" else "blocked"
    return {
        "gate_id": "GOVERNMENT-LINEAGE-REAL-IMPORT",
        "status": status,
        "report": display_path(LINEAGE_REPORT),
        "exchange_path": report.get("exchange_path"),
        "dataset_status": dataset_status,
        "government_lineage_real_import": real_import,
        "record_count": report.get("record_count", 0),
        "edge_preview_count": report.get("edge_preview_count", 0),
        "reason": None
        if status == "pass"
        else "Requires a government_confirmed lineage exchange dataset, not only the contract fixture.",
    }


def lane_status(required_gate_ids: list[str], gates: dict[str, dict[str, Any]]) -> str:
    required = [gates[gate_id] for gate_id in required_gate_ids]
    if any(gate["status"] == "failed" for gate in required):
        return "failed"
    if any(gate["status"] == "blocked" for gate in required):
        return "blocked"
    return "pass"


def promotion_decision(status: str, required_gate_ids: list[str]) -> dict[str, Any]:
    candidate = status == "pass"
    return {
        "blocking_now": False,
        "global_ontology_blocking": "no",
        "environment_scoped_blocking_candidate": candidate,
        "decision": "candidate_after_repeat_evidence" if candidate else "remain_report_only",
        "required_gate_ids": required_gate_ids,
        "required_before_blocking": [
            "repeat pass evidence in the target CI or hosted runtime",
            "documented secret injection and outage policy for that runtime",
            "explicit ADR cutover that scopes each gate to environments with its required credentials or data",
        ],
    }


def build_report(
    *,
    checked_at: str,
    env: dict[str, str],
    steps: list[dict[str, Any]],
    rag_report: dict[str, Any] | None,
) -> dict[str, Any]:
    preflight = build_preflight(env)
    rag = summarize_rag_report(rag_report)
    rag_status = rag_gate_status(preflight, steps, rag)
    required_gate_ids = parse_required_gate_ids(env)
    gates = {
        "GRAPH-RAG-REAL-SMOKE": {
            "gate_id": "GRAPH-RAG-REAL-SMOKE",
            "status": rag_status,
            "preflight_status": preflight["status"],
            "rag_summary_status": rag["status"],
            "report": rel(RAG_REPORT),
            "reason": None if rag_status == "pass" else "Tencent RAG real smoke did not pass.",
        },
        "ECOCHECK-GRAPH-PUSH-REAL-SMOKE": summarize_ecocheck_graph_push(env),
        "ECOCHECK-AGGREGATE-ETO-BLIND-REVIEW": summarize_aggregate_and_blind_review(),
        "GOVERNMENT-LINEAGE-REAL-IMPORT": summarize_government_lineage(),
    }
    status = lane_status(required_gate_ids, gates)
    return {
        "lane_id": "GRAPH-EXTERNAL-VERIFICATION",
        "mode": "external",
        "status": status,
        "checked_at": checked_at,
        "checked_at_utc": checked_at,
        "report_only_source": "External gates remain outside default verify:all unless explicitly required by this lane.",
        "required_gate_ids": required_gate_ids,
        "gates": [gates[gate_id] for gate_id in ALL_GATE_IDS],
        "preflight": preflight,
        "steps": steps,
        "rag_summary": rag,
        "promotion_decision": promotion_decision(status, required_gate_ids),
        "redaction_boundary": {
            "secret_values_recorded": False,
            "env_values_recorded": False,
            "raw_rag_content_recorded": rag.get("safety", {}).get("raw_rag_content_stored", False),
            "safe_reports": [rel(RAG_REPORT)],
        },
    }


def write_markdown(report: dict[str, Any]) -> None:
    lines = [
        "# External Verification Lane",
        "",
        f"- lane_id: `{report['lane_id']}`",
        f"- mode: `{report['mode']}`",
        f"- status: `{report['status']}`",
        f"- checked_at_utc: `{report['checked_at_utc']}`",
        f"- required_gate_ids: `{', '.join(report['required_gate_ids'])}`",
        f"- rag_real_smoke: `{report['rag_summary'].get('rag_real_smoke')}`",
        f"- tokenhub_probe: `{report['rag_summary'].get('tokenhub_probe')}`",
        f"- rag_retrieve_probe: `{report['rag_summary'].get('rag_retrieve_probe')}`",
        f"- source_level_review_queue_size: {report['rag_summary'].get('source_level_review_queue_size', 0)}",
        f"- blocking_now: `{str(report['promotion_decision']['blocking_now']).lower()}`",
        f"- environment_scoped_blocking_candidate: `{str(report['promotion_decision']['environment_scoped_blocking_candidate']).lower()}`",
        "",
        "## Preflight",
    ]
    for item in report["preflight"]["required"]:
        lines.append(f"- {item['name']}: configured={str(item['configured']).lower()}")
    for item in report["preflight"]["alternatives"]:
        configured_names = ", ".join(item["configured_env_names"]) or "none"
        lines.append(f"- {item['group']}: configured={str(item['configured']).lower()} via {configured_names}")
    if report["preflight"]["missing"]:
        lines += ["", "## Missing", *[f"- {item}" for item in report["preflight"]["missing"]]]
    lines += ["", "## External Gates", "", "| gate | status | reason |", "| --- | --- | --- |"]
    for gate in report["gates"]:
        lines.append(f"| {gate['gate_id']} | `{gate['status']}` | {gate.get('reason') or ''} |")
    lines += ["", "## Steps"]
    for step in report["steps"]:
        lines.append(f"- {step['name']}: `{step['status']}` exit={step['exit_code']}")
    lines += [
        "",
        "## Redaction Boundary",
        "- secret_values_recorded: false",
        "- env_values_recorded: false",
        f"- raw_rag_content_recorded: {str(report['redaction_boundary']['raw_rag_content_recorded']).lower()}",
        f"- raw_cached_true_count: {report['rag_summary'].get('safety', {}).get('raw_cached_true_count', 0)}",
        f"- non_empty_excerpt_count: {report['rag_summary'].get('safety', {}).get('non_empty_excerpt_count', 0)}",
        "",
        "## Promotion Decision",
        f"- decision: `{report['promotion_decision']['decision']}`",
        "- global_ontology_blocking: `no`",
        "- required_before_blocking:",
        *[f"  - {item}" for item in report["promotion_decision"]["required_before_blocking"]],
    ]
    write_text(REPORT_MD, "\n".join(lines))


def run_lane() -> int:
    env = load_external_env()
    steps: list[dict[str, Any]] = []
    preflight = build_preflight(env)
    rag_report: dict[str, Any] | None = None

    if preflight["status"] == "pass":
        resolve_step = run_command("rag-resolve", ["pnpm", "rag:resolve"], env)
        steps.append(resolve_step)
        if resolve_step["status"] == "pass":
            gate_step = run_command("rag-real-gate", ["pnpm", "rag:real:gate"], env)
            steps.append(gate_step)
            if RAG_REPORT.exists():
                rag_report = read_json(RAG_REPORT)
        else:
            steps.append({"name": "rag-real-gate", "command": "pnpm rag:real:gate", "status": "skipped", "exit_code": None})

    report = build_report(checked_at=utc_now(), env=env, steps=steps, rag_report=rag_report)
    write_json(REPORT_JSON, report)
    write_markdown(report)
    print(
        json.dumps(
            {
                "status": report["status"],
                "lane_id": report["lane_id"],
                "report": rel(REPORT_JSON),
                "rag_report": report["rag_summary"].get("report"),
                "promotion_decision": report["promotion_decision"]["decision"],
            },
            ensure_ascii=False,
        )
    )
    return 0 if report["status"] == "pass" else 1


if __name__ == "__main__":
    sys.exit(run_lane())
