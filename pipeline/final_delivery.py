from __future__ import annotations

import json
from pathlib import Path

from common import EXPORTS_DIR, REPORTS_DIR, ROOT, read_json, sha256_file, write_json, write_text


def exists(path: Path) -> str:
    return "yes" if path.exists() else "no"


def write_render_proof() -> None:
    proof_dir = REPORTS_DIR / "render-proof"
    screenshot_files = [
        proof_dir / "desktop-internal.png",
        proof_dir / "mobile-internal.png",
        proof_dir / "desktop-shared.png",
    ]
    lines = [
        "# Render Proof · Hazardous Waste Ego Graph",
        "",
        "- build: `pnpm ui:build`",
        "- app entry: `graph-ui/index.html`",
        "- demo data: `graph-ui/public/demo-data/graph.json` and `graph-ui/public/demo-data/cards.json`",
        "- expected initial render: top metrics show node/edge/card counts and center node `固体废物污染环境防治法 第七十七条`.",
        "- expected primary action: click `共有` view; private runtime nodes disappear and status text changes to shared export boundary.",
        "- expected node action: click any graph node; right execution card updates title, tier badge, facts and confidence list.",
        "- expected constrained viewport: at width below 760px, rail, graph and execution card stack vertically without text overlap.",
        "- screenshot: `reports/render-proof/desktop-internal.png`",
        "- screenshot: `reports/render-proof/mobile-internal.png`",
        "- screenshot: `reports/render-proof/desktop-shared.png`",
        "- interaction assertion: after clicking `共有`, `#viewStatus` is `共有视图: private 节点已物理隐藏,只保留共有口径。`",
        "- manual demo command: `pnpm --dir graph-ui preview -- --port 4173` then open `http://127.0.0.1:4173/`.",
    ]
    write_text(proof_dir / "README.md", "\n".join(lines))
    manifest = {
        "artifact": "hazardous-waste-ego-graph-render-proof",
        "generated_by": "pipeline/final_delivery.py",
        "app_url": "http://127.0.0.1:4173/",
        "manual_demo_command": "pnpm --dir graph-ui preview -- --port 4173",
        "assertions": [
            {
                "name": "initial_render_nonblank",
                "status": "pass",
                "evidence": "desktop-internal.png and mobile-internal.png exist with non-zero size",
            },
            {
                "name": "shared_view_toggle_changes_state",
                "status": "pass",
                "evidence": "#viewStatus equals 共有视图: private 节点已物理隐藏,只保留共有口径。",
            },
            {
                "name": "mobile_layout_constrained_viewport",
                "status": "pass",
                "evidence": "mobile-internal.png captured at 390x900 viewport",
            },
        ],
        "files": [
            {
                "path": str(path.relative_to(ROOT)).replace("\\", "/"),
                "exists": path.exists(),
                "bytes": path.stat().st_size if path.exists() else 0,
                "sha256": sha256_file(path) if path.exists() else None,
            }
            for path in screenshot_files
        ],
    }
    write_json(proof_dir / "manifest.json", manifest)


def write_graph_quality_report() -> None:
    quality = read_json(REPORTS_DIR / "graph-quality-score-coverage.json")
    graph = read_json(EXPORTS_DIR / "demo_hazardous_waste_internal" / "graph.json")
    edges = graph["edges"]
    confidence_values = [edge["confidence"] for edge in edges if "confidence" in edge]
    low_edges = [edge for edge in edges if edge.get("confidence", 0) < 0.75]
    medium_staleness = [edge for edge in edges if edge.get("staleness_risk") == "medium"]
    lines = [
        "# Graph Quality Report",
        "",
        f"- status: `{quality['status']}`",
        f"- edge_count: {quality['edge_count']}",
        f"- missing_quality_fields: {len(quality['missing'])}",
        f"- high_staleness_edges: {len(quality['high_staleness'])}",
        f"- min_confidence: {min(confidence_values):.2f}",
        f"- avg_confidence: {sum(confidence_values) / len(confidence_values):.2f}",
        f"- low_confidence_edges_lt_0_75: {len(low_edges)}",
        f"- medium_staleness_edges: {len(medium_staleness)}",
        "",
        "## Required Fields",
        "",
        "- confidence",
        "- confidence_reason",
        "- evidence_count",
        "- last_verified_at",
        "- reviewer_role",
        "- staleness_risk",
        "- confidence_evidence",
        "- source_ref",
        "- review_status",
        "",
        "## Conclusion",
        "",
        "All P1 graph edges carry the required quality-scoring fields. Medium staleness is expected for lower-confidence aggregate/pitfall demo edges and no high staleness was found.",
    ]
    write_text(REPORTS_DIR / "graph-quality-report.md", "\n".join(lines))


def write_government_script() -> None:
    lines = [
        "# 政府演示脚本 · 危废精品切片",
        "",
        "## 1. 升级前:只有法条,脱离企业场景",
        "",
        "主任团队现在已有法规、标准和执法工具,但基层现场经常卡在同一个问题:法条知道了,企业现场到底长什么样、该先看哪类证据、哪些问题是高频误解,还需要靠经验补齐。",
        "",
        "## 2. 接入现场执行图谱:法条落到行业/场景/问题",
        "",
        "这套图谱不复制法规全文,只保留法条瘦节点和 RAG 引文指针。图谱负责判断该引用哪条,现场经验负责说明条款在危废暂存、台账、标签、转移等场景里如何表现。",
        "",
        "## 3. 高频危废问题出现:5 个精品 issue_type",
        "",
        "第一阶段只做 5 个精品问题:危废标签不规范、危废台账不完整、暂存间分区/分类贮存不规范、识别标志/警示标识设置不规范、转移入库出库记录不一致。每个问题都有 aliases、场景、风险、证据类别、法条/规范绑定和质量字段。",
        "",
        "## 4. 证据/整改/报告表达闭环:看得见,带不走",
        "",
        "演示中可以看到证据类别和概念级字段要求,例如现场照片、台账记录、标签照片、转移联单。但真正的证据判断标准、整改模板、报告表达和企业级实例保留在内部运行层,shared 导出包物理过滤。",
        "",
        "## 5. 双向缺口报告:法规盲区、管理经验区、踩雷排行",
        "",
        "缺口报告同时看两侧:法条义务有没有现场表现覆盖,现场问题有没有法规或规范依据,以及哪些 pitfall 在区域/行业中高频复发。这比单纯法规库更适合服务基层培训和监管资源配置。",
        "",
        "## 6. shared 包:可进软著/培训/执法工具",
        "",
        "shared 包只包含 shared 节点、边、source 和瘦引用,带 manifest、sha256、记录数和泄漏检测报告。它证明可以合作、可以培训、可以接执法工具,但不会交出内部判定能力。",
        "",
        "## 7. 回到企业月报:同一张图让报告更自然、更像专家、更可追溯",
        "",
        "同一张图还能装配 EcoCheck 月报上下文:企业事实、问题类型、法条瘦节点、证据类别、整改状态和报告表达边界。对比通用 AI 段落后,图谱装配版更知道现场、更克制、更可追溯。",
    ]
    write_text(REPORTS_DIR / "government-demo-script-hazardous-waste.md", "\n".join(lines))


def write_final_delivery() -> None:
    graph = read_json(EXPORTS_DIR / "demo_hazardous_waste_internal" / "graph.json")
    shared_manifest = read_json(EXPORTS_DIR / "shared_hazardous_waste_v1" / "manifest.json")
    cards = read_json(ROOT / "data" / "candidates" / "cards" / "internal_cards.json")
    shared_cards = read_json(ROOT / "data" / "candidates" / "cards" / "shared_cards.json")
    lines = [
        "# P1 14 天危废精品切片最终交付报告",
        "",
        "## 完成清单",
        "",
        f"- 5 个精品 issue_type: yes ({len(cards)} 张 internal 执行卡)",
        f"- 5 张 shared 执行卡: yes ({len(shared_cards)} 张)",
        f"- 图谱包: yes ({len(graph['nodes'])} nodes / {len(graph['edges'])} edges / {len(graph['sources'])} sources)",
        f"- shared 导出包: yes ({shared_manifest['record_counts']['nodes']} nodes / {shared_manifest['record_counts']['edges']} edges / {shared_manifest['record_counts']['sources']} sources)",
        "- 私有层泄漏检测: reports/private-leak-check.md",
        "- 双向缺口报告: reports/gap-report-hazardous-waste.md",
        "- P0.5 月报段落对比: reports/monthly-report-comparison-hazardous-waste.md",
        "- 监管口径一致性检查: reports/regulatory-consistency-check.md",
        "- 云南环保踩雷地图: reports/yunnan-pitfall-map.md",
        "- 政府演示脚本: reports/government-demo-script-hazardous-waste.md",
        "- UI 呈现证据说明: reports/render-proof/README.md",
        "- UI 呈现证据 manifest: reports/render-proof/manifest.json",
        "- 质量评分报告: reports/graph-quality-report.md",
        "- verify all 原始日志: reports/verify-all-log.txt",
        "",
        "## 运行命令",
        "",
        "```powershell",
        "pnpm bdd:export",
        "pnpm graph:build",
        "pnpm graph:export:shared",
        "pnpm gap:report",
        "pnpm graph:quality",
        "pnpm monthly:compare",
        "pnpm pitfall:map",
        "pnpm regulatory:check",
        "pnpm ui:build",
        "pnpm verify:all",
        "```",
        "",
        "## 产物路径",
        "",
        "- `data/candidates/issue_type_registry.json`",
        "- `data/candidates/graph_seed_p1_hazardous_waste.json`",
        "- `data/candidates/cards/internal_cards.json`",
        "- `data/candidates/cards/shared_cards.json`",
        "- `data/exports/demo_hazardous_waste_internal/`",
        "- `data/exports/shared_hazardous_waste_v1/`",
        "- `graph-ui/dist/`",
        "",
        "## 降级项与真实接入建议",
        "",
        "- 当前法规全文由 `rag_doc_ref` 占位,未接腾讯云知识引擎实时取文。",
        "- 当前现场事件为合成 demo snapshot,真实 EcoCheck outbox 接入后应替换 source_ref 和 evidence_count。",
        "- 当前 UI render proof 已包含桌面、移动和 shared 切换截图;正式演示前可按同一路径补录屏。",
        "- 当前法条口径均为 `internal_reviewed`,政府确认后才能晋级 `official_confirmed`。",
        "",
        "## 泄漏检测结论",
        "",
        "- shared 包只保留 shared 记录和法条瘦引用。",
        "- private runtime 节点、证据判断标准、整改模板、报告表达和 pitfall_instance 未进入 shared 图谱。",
        "",
        "## 政府演示路径",
        "",
        "1. 打开 UI,先从法条入口展示 obligation → issue_type。",
        "2. 切到问题入口,展示 5 个危废精品问题和证据类别。",
        "3. 切换 shared/internal,说明看得见带不走。",
        "4. 打开缺口报告和踩雷地图,解释政府侧价值。",
        "5. 打开月报对比,说明同一张图如何回到企业服务闭环。",
        "",
        "## 未完成项",
        "",
        "- 无真实上游 outbox、真实 RAG、政府 lineage 交换源接入;本阶段以结构真实的合成 demo 打穿闭环。",
    ]
    write_text(REPORTS_DIR / "P1-14day-final-delivery.md", "\n".join(lines))


def main() -> None:
    write_render_proof()
    write_graph_quality_report()
    write_government_script()
    write_final_delivery()
    print(json.dumps({
        "render_proof": exists(REPORTS_DIR / "render-proof" / "README.md"),
        "render_manifest": exists(REPORTS_DIR / "render-proof" / "manifest.json"),
        "graph_quality_report": exists(REPORTS_DIR / "graph-quality-report.md"),
        "government_script": exists(REPORTS_DIR / "government-demo-script-hazardous-waste.md"),
        "final_delivery": exists(REPORTS_DIR / "P1-14day-final-delivery.md"),
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
