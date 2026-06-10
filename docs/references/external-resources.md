# 外部工具、资源与开源项目引用清单

> ARCHITECTURE.md §5 的扩展版。新增外部依赖前:MCP/插件/agent 工具走 `mcp-intake-review`;实验性框架先进 `D:\agent-tools-lab` 隔离评估;涉及密钥/网络走 `security-preflight`。

## 运行时依赖

| 名称 | 版本基线 | 许可 | 用途 | 风险备注 |
|---|---|---|---|---|
| Cytoscape.js | ^3.x | MIT | ego 图渲染(graph-ui) | 无服务端依赖,演示可离线 |
| Vite | ^7.x | MIT | 前端构建 | — |
| Python | 3.11+ | PSF | pipeline 脚本 | 标准库优先,第三方依赖需登记 |
| Node.js + pnpm | Node 20+/pnpm 9+ | MIT | 工作流与 UI 工具链 | — |

## 云服务

| 名称 | 用途 | 边界 |
|---|---|---|
| 腾讯云知识引擎原子能力(LKE)+ RAG 组件 | 法律法规与技术规范条款全文的存储、检索、引用 | 图谱只存瘦节点与 rag_doc_ref(ADR-0003);密钥走环境变量;检索失败触发降级表达 |

## 私有仓库(coco830)

| 仓库 | 角色 |
|---|---|
| eco-semantic-knowledge-base | 骨架数据上游(approved baselines) |
| semantic-profile-lab | 图模型与治理契约上游 |
| ecocheck | 现场蒸馏流上游(semantic_event_outbox v2) |
| Yunnan-emission-smart-calculator | 标准化键共享(pollutant_id/dim_type) |
| git-workflow-hooks | Git 门禁(pre-commit/commit-msg/pre-push/main-ship) |
| gherkin-v39-cli | BDD .feature → Cucumber Messages NDJSON |
| ai-operation-protocol | 全局 AI 操作协议与 skills 路由 |
| afk-test-engineering-protocol | AFK 测试工程协议(verify/afk-test.config.json 的上游规范) |

## 方法论与设计来源(致谢/参考,非依赖)

| 来源 | 吸收内容 |
|---|---|
| GitNexus | 图谱交互美学(ego 范式),**工具本身只用于代码导航,不用于领域图谱** |
| Microsoft GraphRAG | 适合非结构化文本抽图 + 社区摘要探索,不作为主业务图谱 |
| Karpathy context engineering | 上下文装配思想(docs/api/context-assembly-api.md) |
| Every compound-engineering plugin | 本项目需求文档由其 brainstorm 流程产出(D:\agent-tools-lab 隔离试用,未安装进本项目) |

## 延后评估(未引入)

| 名称 | 触发条件 | 备注 |
|---|---|---|
| Neo4j Community | ADR-0006 三个阈值任一 | GPLv3 边界需评估 |
| Graphiti | 同上,并出现实时/时序 agent 记忆需求 | Apache-2.0 |
| ECC(affaan-m/ECC) | 不引入 | 2026-06-10 评估结论:与现有协议栈重叠且互相冲突,负资产 |
