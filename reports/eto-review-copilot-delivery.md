# 十律 ETO 审核副驾 · 交付报告

> 分支 `feat/eto-review-copilot`,**未合并主干**(留 candy 按 `main:ship` 发货)。
> 蓝图见 `docs/api/eto-review-copilot.md`,决策见 `docs/adr/0013-...`,合同见 `specs/features/eto-review-copilot.feature`。

## 1. 状态

P0 + P1 + P2 **全部建成、提交、离线全绿**。十律是 ETO 切片审核台的**上游守门人 / 错配检测器 / 异议引擎**:坐审核台帮 ETO 更快更准,**永不替 ETO 裁决**。与下游消费已审核图的「小悦」是两个身份。

## 2. 提交清单

| commit | 切片 | 内容 |
|---|---|---|
| `7d92f9a` | 设计 | 蓝图 + ADR-0013 + Gherkin 合同(12 场景) |
| `35083d3` | P0a | 确定性 backbone:10 错配检测 + 补足 + trace 闸 + advisory(13 测试) |
| `d1dc613` | P0c | GET 详情副驾研判 + 审核台副驾段 + demo + render-proof 实拍 |
| `3f7c46b` | P0d | 无状态 copilotView 提取 + 9 条 UI 契约测试 + 接 verify |
| `fed01a9` | P1 | LLM critic(DeepSeek)+ POST /copilot + 私有脱敏纵深 + 外部 lane gate |
| `89438e0` | P2 | 分歧飞轮 ai_review_delta + 副驾回执落库 + 一致率指标 |

## 3. 验证

- **graph-api 88/88、graph-ui 10/10、`verify:all` 32/32 离线全绿**(零腾讯云密钥、零网络)。
- 每切片走「实现 → 对抗复核(3–4 lens)→ 修复 → 主循环亲自取地面真相 → GitNexus impact/detect_changes → 提交」。
- render-proof:桌面 / 移动 / 异议态 / 降级态 PNG(`graph-ui/reports/render-proof/`,Playwright 实拍)。
## 3.1 收尾红线审计(对抗式,跨整个十律面)

三路对抗审计 + 总判定。**私有零泄漏、fail-closed/advisory-only 两条红线一次通过**(逐外泄面 live 探针验证)。**防幻觉-trace 红线首轮发现 1 个 blocking + 2 个 major,已全部修复并加回归测试守住:**

| 审计发现 | 级别 | 修复 | 回归测试 |
|---|---|---|---|
| LLM 把虚构法条号写进散文、trace 锚到真实但无关节点(issue)便车存活 | **blocking** | `parseFindings` 加 law-anchor 闸:法律维度或引用法条标识的异议,必须锚定 context 内真实法条节点/法条关系边,否则丢弃 | `copilot-llm.test.js` ok 28 |
| 副驾建议方向 自由文本无白名单,可注入 ai_review_delta + 污染一致率 | major | `buildAiReviewDelta` 对建议方向加 ACTIONS kind 白名单,非枚举归一 null | `copilot-delta.test.js` (9) |
| 一致率单向偏置:重复同意刷高 + 非布尔静默算一致 | major | `computeAgreementRate` 按审核编号去重(latest-wins)+ 非布尔进「未知」桶不算一致 | `copilot-delta.test.js` (10) |
| external lane 红线键缺中文私有键变体 | low | `FORBIDDEN_PAYLOAD_KEYS` 补 证据判断标准/整改模板/eto审核笔记 | — |

修复后 graph-api 91/91、`verify:all` 全绿。剩余 low(非阻断,follow-up):RAG 降级仅覆盖 law_not_applicable 一码(其余 LLM 码散文的硬法措辞未机器降级,但虚构法条已被 law-anchor 闸斩断);external lane 仅扫键名未扫值模式(报告由红线干净管道产出)。

## 4. 架构(as-built)

| 层 | 文件 | 职责 |
|---|---|---|
| 确定性 backbone | `graph-api/src/review-copilot.js` | 检索补足 + 10 条规则错配检测;纯函数离线;advisory;trace-required |
| LLM critic | `graph-api/src/copilot-llm.js` | DeepSeek;4 语义错配(issue_type_mismatch/law_not_applicable/evidence_insufficient/duplicate_mergeable);projectCandidate 脱敏白名单 + assertPromptClean 双闸;fail-closed;RAG 无原文降级不伪造 |
| 分歧飞轮 | `graph-api/src/copilot-delta.js` | ai_review_delta(默认 candidate 永不自动晋级)+ computeAgreementRate(一致率) |
| 端点 | `graph-api/src/server.js` | GET `:id` 附副驾研判;POST `:id/copilot`(LLM,fail-closed);GET `copilot-agreement`;POST `:id/decision`(扩展副驾回执 + delta) |
| 审核台 | `graph-ui/src/{copilotView,review}.js` + `styles.css` | 副驾段(整体研判 + 补足 + 异议卡)+ 采纳/驳回回执 + [请十律复核] + 副驾回执入提交 body |
| 外部 lane | `pipeline/external_verification_lane.py` | ETO-REVIEW-COPILOT-LLM-SMOKE(opt-in,缺凭证 blocked 非 failed,不阻塞 verify:all) |

## 5. 红线守则(全部由代码强制,非约定)

- **私有零泄漏**:projectCandidate 白名单投影(绝不 spread 原始 item)+ assertPromptClean(送 LLM 前)/ assertRedlineClean(所有输出)双闸,英文 + 中文私有键对称(企业名称快照 / 证据判断标准 / 整改模板 / eto审核笔记 / evidence_judgment_standard / rectification_template);前端 bundle 物理无私有;demo 纯合成;ai_review_delta / 一致率只取脱敏维度键。
- **advisory-only**:建议方向可 null,永不改审核状态,永不自动晋级 CANDIDATE→approved。
- **fail-closed**:无 key / 超时 / 报错 / 非2xx / 解析失败 / RAG 无原文 —— 全退确定性 backbone,绝不 500、绝不伪造法条原文。
- **trace-required**:缺 trace / trace 越界 / 幻觉法条 finding 一律丢弃(dropTracelessFindings + parseFindings)。
- **离线纪律**:`verify:all` 零密钥;LLM 网络路径只在 `verify:external` 的 opt-in gate(ADR-0012)。

## 6. candy 4 决策落地(2026-06-28)

| 决策 | 落地 |
|---|---|
| Q1 私有判断标准不进外部 LLM | ✓ projectCandidate 白名单 + assertPromptClean fail-closed throw(测试断言无 key 时 `fetch.calls.length===0`) |
| Q2 命名「十律」 | ✓ 取义十条审核律(§4),与小悦分两个身份 |
| Q3 LLM 手动触发 | ✓ `[请十律复核]` 按钮;补足与确定性异议进详情即自动 |
| Q4 一致率进政府演示 | ✓ `GET /api/review/copilot-agreement`;副驾每次表态都落记录,分母完整、曲线可随一致增多上升 |

## 7. 已知缺口 / 待办(诚实)

- **真实 LLM/RAG smoke**:需 `.env.local` 的 `TENCENT_TOKENHUB_*` / `TENCENT_LKE_*`,跑 `pnpm verify:external`(`GRAPH_EXTERNAL_REQUIRED_GATES` 含 `ETO-REVIEW-COPILOT-LLM-SMOKE`)。缺凭证时全栈 fail-closed,功能与离线测试不受影响。
- **ragAvailable 谓词统一**:真接 RAG 取文时收(当前 `ragFetch` 默认 null,为死路径;法条语义异议默认走"需人工复核"降级,符合"绝不伪造原文")。
- **真图 lineage 负样本**:错配#4(法条状态风险)的真实演示数据——当前真图 0 条 lineage 边、4 个法条全 `现行有效`,负样本在测试 fixture + demo payload 内合成(带 synthetic 标识、默认不导出);真图沿革合成可在 demo-pack 渲染时补。
- **一致率 UI 展示**:后端指标已就绪(`GET copilot-agreement`),审核台/演示页可低调挂出曲线(§9.3 非必须,本期未做)。
- **main:ship**:留 candy 按项目主干发货流程。

## 8. 给主任演示的一句话

> 十律守十条审核律,引不出依据就不开口;它跟着我们顶尖 ETO 学,每一次分歧都被捕获成专家经验,一致率随时间上升——这是一个会进化的上游守门人,而不是一个静态模型。
