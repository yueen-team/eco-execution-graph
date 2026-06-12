// 全局状态与领域常量。所有数据来自 pipeline 真实导出,UI 不编造任何数字。

export const state = {
  datasets: {},
  reports: { gap: null, monthly: null },
  graph: null,
  cards: [],
  view: "internal",
  product: "full",
  entry: "law",
  centerId: null,
  activeEdgeGroups: new Set(["law", "field", "evidence", "scene", "pitfall", "stat"]),
  cy: null,
  demo: { active: false, act: 0 },
  deployPolicy: { readonlyShared: false },
};

export const ENTRY_CENTERS = {
  full: {
    law: "law:swl:art77",
    issue: "issue:hw:label-incomplete",
    industry: "scenario:危险废物识别、暂存与转移",
  },
  p1: {
    law: "law:swl:art77",
    issue: "issue:hw:label-incomplete",
    industry: "industry:demo:manufacturing",
  },
};

export const NODE_TYPE_META = {
  law_article: { label: "法条", icon: "scale", color: "#5aa7ff", shape: "round-rectangle" },
  law_obligation: { label: "法定义务", icon: "book-open", color: "#7cb8ff", shape: "round-rectangle" },
  tech_spec: { label: "技术规范", icon: "ruler", color: "#6c8fb8", shape: "round-rectangle" },
  issue_type: { label: "问题分类", icon: "flag-triangle-right", color: "#fb7185", shape: "round-rectangle" },
  inspection_item: { label: "排查项", icon: "clipboard-check", color: "#8fae9e", shape: "ellipse" },
  process_scenario: { label: "产污场景", icon: "workflow", color: "#34c08b", shape: "ellipse" },
  industry: { label: "行业", icon: "factory", color: "#2aa876", shape: "ellipse" },
  pollution_source: { label: "污染源", icon: "flame", color: "#34c08b", shape: "ellipse" },
  pollutant: { label: "污染物", icon: "droplets", color: "#4fd1a5", shape: "ellipse" },
  evidence_category: { label: "证据类别", icon: "camera", color: "#2dd4bf", shape: "round-rectangle" },
  evidence_field_requirement: { label: "证据字段要求", icon: "list-checks", color: "#2dd4bf", shape: "round-rectangle" },
  evidence_judgment_standard: { label: "证据判定标准", icon: "file-lock", color: "#f5b84d", shape: "round-rectangle" },
  rectification_template: { label: "整改模板", icon: "wrench", color: "#f5b84d", shape: "round-rectangle" },
  report_expression: { label: "报告表达", icon: "file-pen", color: "#f5b84d", shape: "round-rectangle" },
  pitfall_class: { label: "踩雷类型", icon: "triangle-alert", color: "#fb9f6c", shape: "diamond" },
  pitfall_pattern_stat: { label: "踩雷统计", icon: "bar-chart-3", color: "#a78bfa", shape: "diamond" },
  pitfall_instance: { label: "踩雷实例", icon: "zap", color: "#f5b84d", shape: "diamond" },
  stat_signal: { label: "聚合信号", icon: "radar", color: "#a78bfa", shape: "ellipse" },
};

export function nodeMeta(nodeType) {
  return NODE_TYPE_META[nodeType] || { label: nodeType, icon: "circle", color: "#8fae9e", shape: "ellipse" };
}

// 边类型分组:UI 按业务语义分组筛选,而不是逐一列出 16 种边
export const EDGE_GROUPS = {
  law: { label: "法规约束", color: "#5aa7ff", types: ["regulated_by", "obligation_of", "lineage"] },
  field: { label: "现场表现", color: "#f5b84d", types: ["manifests_as"] },
  evidence: { label: "证据链", color: "#2dd4bf", types: ["evidenced_by", "rectified_by", "reported_as"] },
  spec: { label: "标准限值", color: "#6c8fb8", types: ["limited_by"] },
  scene: { label: "场景归属", color: "#34c08b", types: ["occurs_in", "emits", "instance_of", "belongs_to_dimension", "located_at"] },
  pitfall: { label: "踩雷", color: "#fb7185", types: ["pitfall_of", "often_co_occurs_with"] },
  stat: { label: "聚合统计", color: "#a78bfa", types: ["supports_stat"] },
};

export const EDGE_TYPE_COLOR = {};
for (const group of Object.values(EDGE_GROUPS)) {
  for (const t of group.types) EDGE_TYPE_COLOR[t] = group.color;
}

export const EDGE_TYPE_LABEL = {
  regulated_by: "法规约束",
  obligation_of: "义务来源",
  manifests_as: "现场表现",
  evidenced_by: "证据支撑",
  rectified_by: "整改指向",
  reported_as: "报告表达",
  limited_by: "标准限值",
  occurs_in: "场景归属",
  emits: "排放",
  pitfall_of: "踩雷关联",
  supports_stat: "聚合统计",
  instance_of: "实例",
  belongs_to_dimension: "维度归属",
  located_at: "位置",
  often_co_occurs_with: "共现",
  lineage: "法典沿革",
};

export const TIER_META = {
  shared: { label: "共有 shared", badge: "b-shared", icon: "share-2" },
  private: { label: "私有 private", badge: "b-private", icon: "lock" },
  aggregate: { label: "聚合 aggregate", badge: "b-aggregate", icon: "bar-chart" },
};

export function activeEdgeTypes() {
  const types = new Set();
  for (const key of state.activeEdgeGroups) {
    for (const t of EDGE_GROUPS[key]?.types || []) types.add(t);
  }
  return types;
}

export function applyDataset() {
  const view = state.deployPolicy.readonlyShared ? "shared" : state.view;
  const product = state.deployPolicy.readonlyShared ? "full" : state.product;
  const key = product === "full" && view === "shared" ? "fullShared" : product;
  const dataset = state.datasets[key] || state.datasets.full || state.datasets.p1;
  state.graph = dataset.graph;
  state.cards = dataset.cards;
  if (state.deployPolicy.readonlyShared) {
    state.view = "shared";
    state.product = "full";
  }
}

export function byId(collection, idKey) {
  return new Map(collection.map((item) => [item[idKey], item]));
}

export function findCardForNode(nodeId) {
  return (
    state.cards.find((card) => card.field_manifestations?.some((item) => item.issue_type_ref === nodeId)) ||
    state.cards.find((card) => card.law_article_ref?.node_id === nodeId) ||
    state.cards.find((card) => card.root_issue_type === nodeId) ||
    state.cards.find((card) => card.graph_slice_refs?.nodes?.includes(nodeId)) ||
    null
  );
}
