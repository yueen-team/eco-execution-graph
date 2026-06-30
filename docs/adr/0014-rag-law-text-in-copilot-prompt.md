# ADR-0014 RAG 法条原文可进副驾 DeepSeek prompt(仅 prompt、瞬时、绝不落盘/落图/落 report)

- Status: Accepted(candy 已定 2026-06-28;接 JS 侧 RAG 取文 `tc3-rag-client.js`)
- Date: 2026-06-28
- 配套:`docs/api/eto-review-copilot.md`(§8.1 / §8.3 / §11.4)、`docs/deploy/copilot-llm-external-smoke.md`、`specs/features/eto-review-copilot.feature`
- 关联:ADR-0003(法条瘦节点,全文留 RAG)、ADR-0012(RAG 真实 smoke 外部 cutover + 报告边界)、ADR-0013(副驾 advisory-only)

## Context

ADR-0013 定下副驾「十律」是 advisory-only 上游守门人,LLM critic 负责「必须读懂语义」的错配(#1 归类 / #3 法条不适用 / #6 证据 / #7 重复)。其中 **#3 `law_not_applicable`**(候选法条在本场景是否适用)本质上**必须读到法条原文**才能研判——只看条款号判不出适用性。

此前 as-built 生产路径 `ragFetch=null`(JS 侧无 RAG 客户端),`law_not_applicable` 一律降级为「需人工复核法条」,grounding 缺位。M1 已落地 `graph-api/src/tc3-rag-client.js`:TC3-HMAC-SHA256 直连腾讯云 LKE `RetrieveKnowledge` 取法条原文 + `sanitizeRetrieveRecord` 脱敏,`buildRagFetch(env)` 作为 `copilot-llm.js` 的 `ragFetch` 注入函数。

这把一个**架构红线问题**摆上台面:ADR-0003 规定「法条全文不进图」,ADR-0012 规定「report 不存 raw RAG `Content` / 法条全文」。那么——**法条原文到底能不能进副驾发往 DeepSeek 的 prompt?** 把外部 LLM 引入入图审核链路、且让法条原文流经它,是不可轻易反转的决策,故立此 ADR 与既有红线对账。

## Decision

1. **法条原文【可进】副驾 DeepSeek prompt——但仅限 prompt、瞬时、绝不持久化。** RAG 取得的法条原文(`excerpt`)只允许出现在 `buildCopilotPrompt` 装配的**「法条引用」段**,随单次 DeepSeek 请求体发出供研判,请求结束即消失。**绝不落盘(`reports/*`)、绝不落图(graph 节点 / shared 包)、绝不回流进副驾 findings / 副驾意见对象。**

2. **红线分域不变量(三域三强度,任何实现不得弱化):**

   | 域 | 法条原文 | 私有判断字段 | 企业 / GPS / 照片 / 密钥 |
   |---|---|---|---|
   | 候选(`projectCandidate`)+ 已审核图段(`projectGraphContext`) | **禁** | **禁** | **禁** |
   | prompt「法条引用」段(`projectCitations`) | **允许**(本轮已审核来源、截断、瞬时) | **禁** | **禁** |
   | 副驾输出 + 任何 report / 图谱节点 | **恒禁** | **禁** | **禁** |

   - strict 域闸:`assertPromptClean`(`scanForbidden` 全集含法条全文模式 + private-tier),命中 fail-closed 不发送。
   - citation 域闸:`scanCitationForbidden` + private-tier 逐条丢脏原文,`assertCitationSegmentClean` 兜底抛。法条原文只取本轮**已审核来源**(`rag_doc_ref ∈ law_refs/tech_spec_refs` 且不在 `blocked_refs`)。
   - 输出/report 域闸:`assertRedlineClean` / `scanForbidden` 全集(法条全文也拦)+ `stripFindingLawFullText`(整段模式闸 + ≥20 字逐字内容感知闸,剥离 LLM 回贴)+ lane `find_forbidden_payload_keys(report)` 纵深第二道。

3. **grounding 凭证可选、永不阻塞。** LKE 三键(`TENCENT_LKE_SECRET_ID/SECRET_KEY/KNOWLEDGE_BASE_IDS`)在场 = 启用真 grounding(`grounded=true`);缺则 `buildRagFetch` 返回 `null` 合法降级(`grounded=false`,`law_not_applicable` 退为需人工复核)。**LKE 永不阻塞 `verify:external` lane、永不进 `DEFAULT_REQUIRED_GATE_IDS`;TokenHub 仍是唯一 HARD 触发 + pass 要件。** 但 **LKE 在场却 `grounded≠true` → lane 判 grounding 回归(`failed`)**:凭证在但没取到原文是接线/代码缺口,不是配置缺口。

4. **原文供研判,不许复述。** system prompt 明确:引用法条只回 `locator` / `article_no`,绝不把原文整段回贴进异议任何字段。`stripFindingLawFullText` 在解析边界 + 调用点两道叠加剥离;单条款 `locator` 引用(如「第七十七条」,<20 字)合法保留。

## 与既有红线对账

- **ADR-0003(法条瘦节点,法条全文不进图)——仍守。** 本 ADR 只放行原文进**外部 LLM 的瞬时 prompt**,图谱节点依旧只存瘦字段 + `lineage_ref`;原文绝不写回任何 graph 节点 / shared 包。两者不冲突:一个管「图里存什么」(永不存全文),一个管「研判时 prompt 里瞬时读什么」。
- **ADR-0012(RAG 真实 smoke + 报告边界,report 不存原文)——仍守。** 报告(`reports/copilot-llm-smoke.json` / `external-verification-lane.json`)只存计数 / 布尔 / 码 / 环境变量名 + 新增 `grounded` 布尔信号;**绝不存法条原文 / raw `Content`**。lane 的 `find_forbidden_payload_keys(report)` 在报告侧再拦一道。grounding 凭证按 ADR-0012「报告只记环境变量名 + 配置布尔」口径暴露(`grounding_env_names` 仅名不带值)。
- **ADR-0013(副驾 advisory-only)——仍守。** grounding 只增强研判质量,不改变副驾「只产异议、永不裁决」的定位;findings 仍过 trace 锚定 + 防幻觉法条闸,原文不回流不动摇「分歧即资产」与「ETO 是唯一裁决者」。

## Consequences

**正向:**
- `law_not_applicable` 从「一律降级」升级为「拿真原文研判」,副驾对法条适用性的判断力实质提升;grounding 缺位时仍优雅降级,审核台始终可用。
- 红线分域把「原文能进哪、不能进哪」写成可测不变量,纵深多道闸 + 内容感知守卫,杜绝原文从 prompt 回流到输出/报告/图。

**代价/风险:**
- 法条原文流经外部腾讯云 DeepSeek:已限定**只**脱敏后法条原文 + 脱敏候选 + shared 图上下文,**私有判断标准 / 企业数据恒不出域**;但仍是一次外部传输,接受度由 candy 数据治理边界背书(私有判断标准入 LLM:否)。
- grounding 回归判级依赖 smoke 报告如实 emit `grounded`;报告字段若被旁路则回归检测失效——故 lane 侧对 `grounded` 取严格 `is True`,缺失/false 在 LKE 在场时一律判回归 `failed`。

## Rollback

移除 `buildRagFetch` 注入(`ragFetch=null`)即回退到「无 grounding、`law_not_applicable` 一律降级」的 as-built 路径,副驾仍可用、审核台不受影响。不得为迁就 grounding 弱化任何域的红线扫描强度,也不得把法条原文写进 report / 图 / findings 以「省一次 RAG 调用」。
