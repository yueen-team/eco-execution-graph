# specs · BDD 行为规格

本目录只放:BDD 行为规格(`features/`)、已确认业务术语(`_glossary.md`)、尚未确认的口径与待决策问题(`open-questions.md`)。

规则(继承新项目 checklist):

- 涉及业务流程、AI 输出、报告生成、法规引用、数据解释、领域判断的任务,**Gherkin 首先作为行为规格格式**;
- 行为合同优先于 TDD:先写/改 `.feature`,再写实现与测试;
- 导出:`pnpm bdd:export`(coco830/gherkin-v39-cli → Cucumber Messages NDJSON);
- 业务行为变化优先更新本目录。
