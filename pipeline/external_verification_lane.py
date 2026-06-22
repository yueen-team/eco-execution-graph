from __future__ import annotations

import datetime as dt
import json
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

REQUIRED_ENV = (
    "TENCENT_LKE_SECRET_ID",
    "TENCENT_LKE_SECRET_KEY",
    "TENCENT_LKE_KNOWLEDGE_BASE_IDS",
)
TOKENHUB_ENV = ("TENCENT_TOKENHUB_API_KEY", "TENCENT_LKEAP_API_KEY")
FORBIDDEN_PAYLOAD_KEYS = {"Content", "content", "full_text", "raw_text", "article_text"}


def utc_now() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def rel(path: Path) -> str:
    return path.resolve().relative_to(ROOT).as_posix()


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


def lane_status(preflight: dict[str, Any], steps: list[dict[str, Any]], rag: dict[str, Any]) -> str:
    if preflight["status"] != "pass":
        return "blocked"
    if any(step["status"] != "pass" for step in steps):
        return "failed"
    return "pass" if rag["status"] == "pass" else "failed"


def promotion_decision(status: str) -> dict[str, Any]:
    candidate = status == "pass"
    return {
        "blocking_now": False,
        "global_ontology_blocking": "no",
        "environment_scoped_blocking_candidate": candidate,
        "decision": "candidate_after_repeat_evidence" if candidate else "remain_report_only",
        "required_before_blocking": [
            "repeat pass evidence in the target CI or hosted runtime",
            "documented secret injection and outage policy for that runtime",
            "explicit ADR cutover that scopes the gate to environments with Tencent credentials",
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
    status = lane_status(preflight, steps, rag)
    return {
        "lane_id": "GRAPH-RAG-REAL-SMOKE",
        "mode": "external",
        "status": status,
        "checked_at_utc": checked_at,
        "report_only_source": "Tencent RAG real smoke remains outside default verify:all",
        "preflight": preflight,
        "steps": steps,
        "rag_summary": rag,
        "promotion_decision": promotion_decision(status),
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
    env = load_env()
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
