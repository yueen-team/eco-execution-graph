from __future__ import annotations

import argparse
import json
from collections import defaultdict
from pathlib import Path
from typing import Any

from common import EXPORTS_DIR, REPORTS_DIR, ROOT, reset_dir, write_json, write_text


DEFAULT_STAGING = ROOT / "data" / "private-staging" / "field-events.jsonl"
AGGREGATE_EXPORT = EXPORTS_DIR / "ecocheck_aggregate_pitfall_v1"
APPROVED_STATUSES = {"已通过(待聚合)", "已进入聚合候选"}
MIN_SAMPLE_SIZE = 5
FORBIDDEN_EXPORT_MARKERS = (
    "企业名称快照",
    "企业内部标识",
    "检查记录",
    "整改记录",
    "证据实例",
    "原始备注",
    "附件路径",
    "cloud_path",
    "attachment",
    "photo_url",
    "gps",
    "latitude",
    "longitude",
)


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        return []
    rows: list[dict[str, Any]] = []
    for line in path.read_text(encoding="utf-8").splitlines():
        if line.strip():
            rows.append(json.loads(line))
    return rows


def safe_law_ref(item: dict[str, Any]) -> str:
    refs = item.get("法条规范候选") or []
    if refs and isinstance(refs[0], dict):
        return refs[0].get("引用编号") or "law-or-spec:pending"
    return "law-or-spec:pending"


def group_key(item: dict[str, Any]) -> tuple[str, str, str, str, str]:
    return (
        item.get("区域") or "未标注区域",
        item.get("行业") or "未标注行业",
        item.get("环保维度") or "未标注维度",
        item.get("合并目标问题类型") or item.get("问题类型引用") or "issue:pending",
        safe_law_ref(item),
    )


def rectification_difficulty(items: list[dict[str, Any]]) -> str:
    rejected = sum(1 for item in items if "驳回" in str(item.get("整改结果", "")))
    rate = rejected / max(len(items), 1)
    if rate >= 0.3:
        return "high"
    if rate >= 0.1:
        return "medium"
    return "low"


def build_aggregate_rows(items: list[dict[str, Any]], batch_id: str) -> dict[str, Any]:
    groups: dict[tuple[str, str, str, str, str], list[dict[str, Any]]] = defaultdict(list)
    ignored_status: dict[str, int] = defaultdict(int)

    for item in items:
        if item.get("当前审核状态") not in APPROVED_STATUSES or item.get("是否允许进入聚合") is not True:
            ignored_status[str(item.get("当前审核状态") or "未标注")] += 1
            continue
        groups[group_key(item)].append(item)

    rows = []
    sample_limited = []
    for key, group in sorted(groups.items()):
        region, industry, dimension, issue_ref, law_ref = key
        sample_size = len({item.get("企业内部标识") for item in group if item.get("企业内部标识")})
        row = {
            "region": region,
            "industry": industry,
            "dimension": dimension,
            "issue_type_ref": issue_ref,
            "law_or_spec_ref": law_ref,
            "sample_size": sample_size,
            "event_count": len(group),
            "recurrence_rate": round(len(group) / max(sample_size, 1), 2),
            "rectification_difficulty": rectification_difficulty(group),
            "eto_reviewed_count": len(group),
            "last_verified_at": sorted(str(item.get("审核时间") or item.get("来源时间") or "") for item in group)[-1],
            "source_ref": f"src:ecocheck-aggregate:{batch_id}",
            "batch_id": batch_id,
        }
        if sample_size < MIN_SAMPLE_SIZE:
            sample_limited.append({**row, "reason": "样本不足,不展示"})
        else:
            rows.append(row)

    return {
        "status": "pass" if rows else "blocked",
        "batch_id": batch_id,
        "rows": rows,
        "sample_limited": sample_limited,
        "ignored_status": dict(ignored_status),
        "note": "仅使用 graph ETO 入图审核通过且允许进入聚合的记录; aggregate 行不含企业级字段。",
    }


def validate_no_aggregate_leak(result: dict[str, Any]) -> list[dict[str, str]]:
    text = json.dumps(result.get("rows", []), ensure_ascii=False)
    violations = []
    for marker in FORBIDDEN_EXPORT_MARKERS:
        if marker in text:
            violations.append({"marker": marker, "reason": "aggregate rows must not contain enterprise-level details"})
    return violations


def write_outputs(result: dict[str, Any]) -> dict[str, Any]:
    violations = validate_no_aggregate_leak(result)
    if violations:
        result = {**result, "status": "blocked", "leak_violations": violations}
    else:
        result = {**result, "leak_violations": []}

    write_json(REPORTS_DIR / "ecocheck-aggregate-pitfall-candidates.json", result)
    lines = [
        "# EcoCheck 聚合候选生成报告",
        "",
        f"- status: `{result['status']}`",
        f"- batch_id: `{result['batch_id']}`",
        f"- aggregate_rows: {len(result['rows'])}",
        f"- sample_limited: {len(result['sample_limited'])}",
        f"- leak_violations: {len(result['leak_violations'])}",
        "",
        "## 规则",
        "",
        "- 只消费“已通过(待聚合)”或“已进入聚合候选”且允许进入聚合的 graph ETO 审核记录。",
        "- 选择“合并到已有问题类型”时,按合并目标问题类型归并统计。",
        "- 样本企业数少于 5 的组合只进入样本不足池。",
        "- 输出行不得包含企业名、企业 ID、检查记录、整改记录、证据实例或附件路径。",
    ]
    write_text(REPORTS_DIR / "ecocheck-aggregate-pitfall-candidates.md", "\n".join(lines))

    reset_dir(AGGREGATE_EXPORT)
    write_json(AGGREGATE_EXPORT / "pitfall-map.json", {"rows": result["rows"], "batch_id": result["batch_id"]})
    write_json(
        AGGREGATE_EXPORT / "manifest.json",
        {
            "package_name": "ecocheck_aggregate_pitfall_v1",
            "tier_filter": "aggregate",
            "record_counts": {"rows": len(result["rows"])},
            "sample_limited_count": len(result["sample_limited"]),
            "leak_violations": len(result["leak_violations"]),
        },
    )
    return result


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", default=str(DEFAULT_STAGING))
    parser.add_argument("--batch-id", default="pitfall-map:ecocheck-review-preview")
    args = parser.parse_args()
    result = write_outputs(build_aggregate_rows(read_jsonl(Path(args.input)), args.batch_id))
    print(json.dumps({"status": result["status"], "rows": len(result["rows"])}, ensure_ascii=False))


if __name__ == "__main__":
    main()
