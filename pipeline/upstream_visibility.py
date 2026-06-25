from __future__ import annotations

import argparse
import json
from collections import Counter
from pathlib import Path
from typing import Any

from common import REPORTS_DIR, ROOT, write_json, write_text


UPSTREAM_REPO = "coco830/eco-semantic-knowledge-base"
PUBLIC_GOVERNANCE_SOURCE = "eco-ontology"
DEFAULT_IMPORT_PATH = ROOT / "data" / "upstream" / "eco-kb-import.json"
DEFAULT_UTILIZATION_PATH = ROOT / "reports" / "upstream-utilization-report.json"
OUT_PUBLIC = ROOT / "graph-ui" / "public" / "demo-data" / "upstream-visibility.json"

NODE_LABELS = {
    "process_scenario": "产污/管理场景",
    "inspection_item": "排查项",
    "pollutant": "污染物/领域",
    "tech_spec": "技术规范",
    "evidence_category": "证据类别",
    "issue_type": "问题分类",
}

EDGE_LABELS = {
    "occurs_in": "场景归属",
    "limited_by": "标准约束",
    "evidenced_by": "证据支撑",
    "manifests_as": "现场表现",
}

ASSET_LABELS = {
    "approved_show_if_rules": "场景触发规则",
    "pollutant_domain_approved_baseline": "污染物与标准基线",
    "pollutant_standard_link_map": "污染物-标准映射",
    "approved_specialized_inspection_items": "专项检查项",
}

FORBIDDEN_MARKERS = (
    "SecretId",
    "SecretKey",
    "API_KEY",
    "raw RAG response",
    "evidence_judgment_standard",
    "rectification_template",
    "report_expression",
    "issue_instance",
    "pitfall_instance",
    "本法全文",
    "全文如下",
    "锁定仓库",
    "锁定提交",
    "主任演示",
    "公开标准给骨架",
)


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def first_value(items: list[dict[str, Any]], *keys: str) -> str:
    for item in items:
        for key in keys:
            value = item.get(key)
            if value:
                return str(value)
    return ""


def rows_from_counter(counter: Counter[str], labels: dict[str, str]) -> list[dict[str, Any]]:
    return [{"label": labels.get(key, key), "key": key, "value": value} for key, value in counter.most_common()]


def build_asset_rows(assets: list[dict[str, Any]]) -> list[dict[str, Any]]:
    rows = []
    for item in assets:
        asset = str(item.get("asset", "unknown"))
        rows.append(
            {
                "资产名称": ASSET_LABELS.get(asset, asset),
                "资产代号": asset,
                "导入状态": "已导入" if item.get("status") == "imported" else item.get("status", "unknown"),
                "记录数量": item.get("rows", 0),
                "来源文件": Path(str(item.get("path", asset))).name,
            }
        )
    return rows


def sample_nodes(nodes: list[dict[str, Any]], node_type: str, limit: int = 5) -> list[dict[str, str]]:
    samples = []
    for node in nodes:
        if node.get("node_type") != node_type:
            continue
        samples.append(
            {
                "名称": str(node.get("name", ""))[:80],
                "类型": NODE_LABELS.get(node_type, node_type),
                "审核状态": str(node.get("review_status", "")),
                "来源": str(node.get("source_ref", "")),
            }
        )
        if len(samples) >= limit:
            break
    return samples


def assert_static_demo_safe(summary: dict[str, Any]) -> None:
    text = json.dumps(summary, ensure_ascii=False)
    hits = [marker for marker in FORBIDDEN_MARKERS if marker in text]
    if hits:
        raise ValueError(f"upstream visibility output contains forbidden marker(s): {', '.join(hits)}")


def build_visibility_summary(
    import_path: Path = DEFAULT_IMPORT_PATH,
    utilization_path: Path = DEFAULT_UTILIZATION_PATH,
) -> dict[str, Any]:
    imported = read_json(import_path)
    utilization = read_json(utilization_path)
    graph = imported.get("graph", {})
    nodes = graph.get("nodes", [])
    edges = graph.get("edges", [])
    sources = graph.get("sources", [])
    assets = imported.get("assets", [])

    node_counts = Counter(str(node.get("node_type", "unknown")) for node in nodes)
    edge_counts = Counter(str(edge.get("edge_type", "unknown")) for edge in edges)
    repo_name = first_value(sources, "origin_repo") or UPSTREAM_REPO

    summary = {
        "status": "pass" if imported.get("graph") and utilization.get("status") == "pass" else "blocked",
        "title": "三仓统一口径接入可见化",
        "plain_summary": "现场执行图谱、语义知识库与画像实验室统一消费 eco-ontology;公共素材、现场编排与画像契约按仓库职责分层治理。公开演示只呈现中文业务结论,不展示仓库路径、提交哈希和内部文件名。",
        "repo": {
            "名称": PUBLIC_GOVERNANCE_SOURCE,
            "状态": "三仓消费中" if imported.get("graph") else "待确认",
            "口径": "三仓统一消费本体、字段与审核口径",
        },
        "visible_metrics": [
            {"label": "上游骨架节点", "value": len(nodes), "unit": "个"},
            {"label": "上游骨架关联", "value": len(edges), "unit": "条"},
            {"label": "接入资产", "value": len(assets), "unit": "类"},
            {"label": "可追溯来源", "value": len(sources), "unit": "项"},
            {"label": "执行卡切片", "value": utilization.get("cards", 0), "unit": "张"},
        ],
        "asset_rows": build_asset_rows(assets),
        "node_counts": rows_from_counter(node_counts, NODE_LABELS),
        "edge_counts": rows_from_counter(edge_counts, EDGE_LABELS),
        "utilization": {
            "状态": utilization.get("status"),
            "上游节点": utilization.get("nodes_by_origin", {}).get(repo_name, 0),
            "上游关联": utilization.get("edges_by_origin", {}).get(repo_name, 0),
            "P1样本角色": "兼容样例" if utilization.get("p1_seed_role") else "",
        },
        "role_boundary": [
            "eco-ontology 负责统一本体、字段含义和审核口径。",
            "语义知识库负责公共知识素材，现场执行图谱负责编排现场证据与演示路径。",
            "真实企业数据、证据判断标准、整改模板和报告表达模板不进入公开可见包。",
            "待审核关系只作内部治理提示，不对外表达为法律认定。",
        ],
        "demo_line": "三仓共用同一套本体口径，公开演示只展示可共有的业务骨架。",
    }
    assert_static_demo_safe(summary)
    return summary


def write_visibility_outputs(
    summary: dict[str, Any],
    output_path: Path = OUT_PUBLIC,
    report_json_path: Path = REPORTS_DIR / "upstream-visibility-dashboard.json",
    report_md_path: Path = REPORTS_DIR / "upstream-visibility-dashboard.md",
) -> None:
    write_json(report_json_path, summary)
    write_json(output_path, summary)
    lines = [
        "# 三仓统一口径可见化报告",
        "",
        f"- status: `{summary['status']}`",
        f"- 统一口径源: `{summary['repo']['名称']}`",
        f"- 治理状态: `{summary['repo']['状态']}`",
        f"- 口径: {summary['repo']['口径']}",
        f"- 说明: {summary['plain_summary']}",
        "",
        "## 可见指标",
        *[f"- {item['label']}: {item['value']}{item['unit']}" for item in summary["visible_metrics"]],
        "",
        "## 接入资产",
        *[f"- {item['资产名称']}: {item['记录数量']} 条, {item['导入状态']}" for item in summary["asset_rows"]],
        "",
        "## 边界",
        *[f"- {item}" for item in summary["role_boundary"]],
    ]
    write_text(report_md_path, "\n".join(lines))


def main() -> dict[str, Any]:
    parser = argparse.ArgumentParser(description="Build upstream skeleton visibility summary.")
    parser.add_argument("--import-path", type=Path, default=DEFAULT_IMPORT_PATH)
    parser.add_argument("--utilization-path", type=Path, default=DEFAULT_UTILIZATION_PATH)
    parser.add_argument("--output", type=Path, default=OUT_PUBLIC)
    args = parser.parse_args()
    summary = build_visibility_summary(args.import_path, args.utilization_path)
    write_visibility_outputs(summary, args.output)
    return summary


if __name__ == "__main__":
    print(json.dumps(main(), ensure_ascii=False, indent=2))
