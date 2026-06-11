# eco-execution-graph 私有仓库归档审核单

生成时间:2026-06-11
本地目录:`E:\eco-execution-graph`
目标远端:`git@github.com:coco830/eco-execution-graph.git`
目标仓库可见性:private
目标主分支:`main`

## 1. 审核结论

当前本地 `main` 已合并全部隔离分支成果,具备推送到新的 GitHub 私有仓库作为项目归档与后续协作基线的条件。

本轮不是把 P1 seed 当作 full product 主数据源。P2/P3 full product 由以下来源共同驱动:

- `E:\eco-semantic-knowledge-base` approved baseline
- `E:\semantic-profile-lab` 契约
- 腾讯云知识引擎 RAG `RetrieveKnowledge` 检索 metadata
- P1 seed 仅作为兼容性样例和危废精品切片保底

最终产品就绪状态:

- `zhang_director_ready`:yes
- `rag_real_smoke`:pass
- `upstream_real_import`:pass
- `private_leak_violations`:0
- `regulatory_findings`:0

## 2. 分支合并审核

本地原主线为 `master`,已重命名为 `main`。

已合并隔离分支:

- `codex/p1-hazardous-waste-slice`
- `codex/p2p3-rag-upstream-productization`

合并方式:fast-forward。

祖先关系审核:

- `codex/p1-hazardous-waste-slice` 已包含在 `main`
- `codex/p2p3-rag-upstream-productization` 已完全等于 `main`
- `codex/p1-hazardous-waste-slice` 是 `codex/p2p3-rag-upstream-productization` 的祖先

当前关键提交:

- `59957f5` P0 项目矩阵脚手架
- `7359e63` P1 危废执行切片
- `4f265f9` 归档证据报告
- `8e17fc3` 腾讯云 LKE probe 与时间偏移签名
- `a7d227c` P2/P3 RAG upstream full product
- `6b33161` 腾讯云 RAG retrieval readiness verified

## 3. 产物审核

核心交付:

- full graph:`513 nodes / 1007 edges / 10 sources`
- shared graph:`483 nodes / 977 edges / 6 sources`
- cards:`90 total / 20 showcase / 70 ready / 0 candidate`
- 危废精品切片:`19 hazardous showcase cards`
- RAG citation resolved:`218`
- 渲染证据:4 张截图记录于 `reports/render-proof-p2p3/manifest.json`

关键报告:

- `reports/P2P3-rag-upstream-full-productization-final.md`
- `reports/rag-citation-resolution-report.md`
- `reports/private-leak-check-full.md`
- `reports/regulatory-consistency-check-full.md`
- `reports/gap-report-full.md`
- `reports/yunnan-pitfall-map-full.md`
- `reports/monthly-report-comparison-full.md`
- `reports/showcase-card-pack.md`

## 4. 安全与授权边界审核

已确认:

- shared export 私有层泄漏检测通过,violations 为 0。
- 监管口径一致性检查通过,findings 为 0。
- RAG 检索报告只保留 metadata,未持久化原始 `Content`。
- 法条全文不进入图谱节点。
- `.env` / `.env.local` 仍在 `.gitignore` 内,密钥只走环境变量。
- 本轮未提交真实企业可识别数据。

安全扫描结果:

- `security-preflight.ps1` 通过。
- 扫描器对 `evidence-risk...` 路径中的字符串片段产生过假阳性,已判断不是实际 OpenAI key。
- `SecretId` / `SecretKey` 仅作为文档和环境变量名出现,未发现真实值。

## 5. 验证记录

已执行:

```powershell
pnpm verify:all
```

结果:`VERIFY OK (all)`

覆盖项:

- schema validate
- docs matrix
- BDD export
- graph build
- graph quality
- gap report
- monthly compare
- pitfall map
- regulatory consistency
- upstream lock / inventory / import
- SPL contract compatibility
- RAG resolve
- full graph build
- lineage contract check
- demo pack
- Python unit tests
- shared export
- private leak contract
- UI build
- final delivery reports

## 6. 未完成与风险坦诚

仍未完成:

- 政府 lineage 真实导入尚未完成。当前只有 lineage exchange contract 和 fixture case,等待政府侧正式 lineage 文件或交换样例。
- `RetrieveKnowledge Records` 到每条 citation 的精确 locator mapping 还需要标准化。目前已验证 RAG metadata 可取,但尚未把每条引用映射到稳定页码/段落/条目定位规范。
- 腾讯云 `GetEmbedding` probe 返回资源包额度不足。当前产品 readiness 不依赖 embedding,因为 RAG 知识库检索已经通过;如果后续要做向量侧自建召回或 rerank,需要补资源包或改走已有 RAG 套件能力。
- TokenHub DeepSeek 调用目前通过 `TENCENT_LKEAP_API_KEY` fallback 跑通。建议后续清理为专用 `TENCENT_TOKENHUB_API_KEY`,避免长期混用历史变量名。
- 截图 PNG 文件按 `.gitignore` 不入库,仓库内保留 manifest 和 sha256。正式演示归档如需二进制截图,应单独放入受控证据包或调整归档策略。

当前不建议做的事:

- 不把 private/internal 执行卡作为政府共有交付。
- 不把 RAG 原文或法规全文写入图谱。
- 不把 P1 seed 扩大解释为 full product 主数据源。
- 不在未取得政府 lineage 数据前声明法典沿革真实导入完成。

## 7. 审核建议

建议 candy 大人重点审核以下 5 件事:

1. `reports/P2P3-rag-upstream-full-productization-final.md` 的 readiness 表述是否足够克制。
2. `reports/rag-citation-resolution-report.md` 是否只呈现 metadata,没有越界引用原文。
3. `data/exports/shared_product_v1/` 是否符合 shared 可交付边界。
4. `reports/private-leak-check-full.json` 和 `reports/regulatory-consistency-check-full.json` 是否作为门禁证据足够。
5. 未完成项是否按真实状态陈述,没有把 contract-only 能力包装成已落地能力。
