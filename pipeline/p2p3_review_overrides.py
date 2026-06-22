from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from common import ROOT


ETO_REVIEW_OVERRIDES_PATH = ROOT / "data" / "review" / "eto_review_overrides.json"
DEFAULT_ETO_V4_CONCLUSION_SOURCE = "reports/eto_hazardous_waste_slice_conclusions_31_v4.md"
ETO_SHARED_CARD_FIELDS = (
    "eto_review_conclusion",
    "eto_display_group",
    "eto_display_priority",
    "eto_ingest_status",
    "eto_ingest_action",
    "eto_ingest_type",
    "eto_conclusion_source",
    "director_demo_order",
    "director_demo_backup_order",
    "merge_with",
    "secondary_merge_refs",
    "external_expression",
    "hazardous_slice_scope",
    "hazardous_slice_stage",
    "hazardous_slice_role",
    "hazardous_slice_order",
    "hazardous_slice_display_policy",
)
HAZARDOUS_TERMS = ("危废", "危险废物", "hazwaste", "HAZWASTE")


def load_eto_review_override_payload(path: Path = ETO_REVIEW_OVERRIDES_PATH) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def load_eto_review_overrides(path: Path = ETO_REVIEW_OVERRIDES_PATH) -> dict[str, dict[str, Any]]:
    payload = load_eto_review_override_payload(path)
    overrides = payload.get("overrides")
    if not isinstance(overrides, dict):
        raise ValueError(f"{path} must contain an object field named overrides")
    return overrides


_ETO_REVIEW_OVERRIDE_PAYLOAD = load_eto_review_override_payload()
ETO_V4_CONCLUSION_SOURCE = _ETO_REVIEW_OVERRIDE_PAYLOAD.get("eto_v4_conclusion_source", DEFAULT_ETO_V4_CONCLUSION_SOURCE)
ETO_REVIEW_OVERRIDES = load_eto_review_overrides()


def is_hazardous_text(text: str) -> bool:
    return any(term in text for term in HAZARDOUS_TERMS)


def is_hazardous_card(card: dict[str, Any]) -> bool:
    text = f"{card.get('title', '')} {card.get('root_issue_type', '')} {card.get('dimension', '')}"
    return is_hazardous_text(text)


def hazardous_slice_role(card: dict[str, Any]) -> tuple[str, str, str]:
    if card.get("director_demo_order"):
        return ("阶段一:主任开场精品", "主任开场精品", "首轮单独讲")
    if card.get("eto_ingest_action") == "合并入库":
        return ("阶段二:危废专题全量目录", "合并采纳子项", "知识点已入主卡,不单独成卡")
    if card.get("eto_ingest_action") == "模板入库":
        return ("阶段二:危废专题全量目录", "内部场景模板", "不进主任开场,作为场景模板或专题扩展")
    if card.get("eto_ingest_type") == "主任追问展开卡":
        return ("阶段二:危废专题全量目录", "主任追问展开卡", "主任追问时展开讲")
    if card.get("show_or_not_for_director_demo") == "showcase":
        return ("阶段二:危废专题全量目录", "专题扩展切片", "可按主任提问展开讲")
    return ("阶段二:危废专题全量目录", "规模化候补切片", "证明可规模化,待 ETO 继续加固")
