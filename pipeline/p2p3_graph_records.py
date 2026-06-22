from __future__ import annotations

import re
from typing import Any

from p2p3_paths import TODAY


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
