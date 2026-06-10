# ADR-0006 暂不引入图数据库(JSON/NDJSON + 构建脚本先行)

- 状态:Accepted(2026-06-10)

## 决策

第一刀及第二刀使用 JSON/NDJSON 文件 + Python 构建脚本 + 前端内存加载,**不引入 Neo4j / Graphiti / RDF 栈**。

## 理由

第一刀图规模 < 5,000 节点 / 20,000 边;ego 邻域查询用内存索引毫秒级;核心是关系设计而非工具;与 eco-kb / spl 现有文件形态零摩擦;部署演示无服务依赖(笔记本可跑)。

## 重新评估触发条件(满足任一)

1. 节点 > 50,000 或边 > 200,000,内存加载 > 3s;
2. 出现需要多跳(≥4)实时图查询的运行时消费者;
3. 多人并发写入图数据成为常态。

届时优先评估 Neo4j Community(注意 GPLv3 边界)与 Graphiti(Apache-2.0),走 tool-lab 隔离评估 + mcp-intake-review 流程。

## 后果

- `pipeline/build_graph.py` 输出 JSON(调试友好)+ NDJSON(流式/未来导入图库)双形态,迁移成本已预付。
