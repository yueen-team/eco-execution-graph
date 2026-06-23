import test from "node:test";
import assert from "node:assert/strict";
import { buildGraphContextResponse } from "../src/graph-context.js";

// 最小可控图谱: 两个不同维度的 inspection_item + 一个行业标注节点。
function fixtureGraph() {
  const approved = { tier: "shared", review_status: "approved" };
  return {
    nodes: [
      { node_id: "ii:hw", node_type: "inspection_item", name: "危险废物暂存检查", ...approved, attrs: { dimension: "hazardous_waste", industry: "医院", applicable_when: "行业代码8411" } },
      { node_id: "ii:vocs", node_type: "inspection_item", name: "VOCs 废气检查", ...approved, attrs: { dimension: "vocs_emission", industry: "涂料制造", applicable_when: "行业代码2641" } },
      { node_id: "ii:plant", node_type: "inspection_item", name: "电镀重金属废水", ...approved, attrs: { dimension: "involves_heavy_metal", industry: "金属表面处理", applicable_when: "行业代码3360" } },
    ],
    edges: [],
    sources: [],
  };
}

test("dimension 精确过滤: 只选中该维度标注的节点", () => {
  const res = buildGraphContextResponse({ graph: fixtureGraph(), dimension: "hazardous_waste" });
  assert.equal(res.root_nodes.length, 1);
  assert.equal(res.root_nodes[0].node_id, "ii:hw");
  assert.equal(res.query.dimension, "hazardous_waste");
});

test("industry 过滤: 匹配 applicable_when 中的行业代码", () => {
  const res = buildGraphContextResponse({ graph: fixtureGraph(), industry: "3360" });
  assert.equal(res.root_nodes.length, 1);
  assert.equal(res.root_nodes[0].node_id, "ii:plant");
});

test("industry 过滤: 匹配中文行业类目", () => {
  const res = buildGraphContextResponse({ graph: fixtureGraph(), industry: "医院" });
  assert.equal(res.root_nodes.length, 1);
  assert.equal(res.root_nodes[0].node_id, "ii:hw");
});

test("industry + dimension 组合(AND): 精确到单一节点", () => {
  const res = buildGraphContextResponse({ graph: fixtureGraph(), industry: "医院", dimension: "hazardous_waste" });
  assert.equal(res.root_nodes.length, 1);
  assert.equal(res.root_nodes[0].node_id, "ii:hw");
  // 矛盾组合 → 空(不臆造)
  const none = buildGraphContextResponse({ graph: fixtureGraph(), industry: "医院", dimension: "vocs_emission" });
  assert.equal(none.root_nodes.length, 0);
  assert.equal(none.machine_gate_status, "blocked");
});

test("向后兼容: q 全文模糊仍可用", () => {
  const res = buildGraphContextResponse({ graph: fixtureGraph(), query: "VOCs" });
  assert.equal(res.root_nodes.length, 1);
  assert.equal(res.root_nodes[0].node_id, "ii:vocs");
});

test("node_id 直取优先, 忽略过滤", () => {
  const res = buildGraphContextResponse({ graph: fixtureGraph(), nodeId: "ii:plant", dimension: "hazardous_waste" });
  assert.equal(res.root_nodes.length, 1);
  assert.equal(res.root_nodes[0].node_id, "ii:plant");
});

test("无任何选择器 → 抛错", () => {
  assert.throws(() => buildGraphContextResponse({ graph: fixtureGraph() }), /node_id 或 q 或 industry\/dimension/);
});

test("safeAttrs 暴露 industry/dimension/show_if_keys", () => {
  const res = buildGraphContextResponse({ graph: fixtureGraph(), dimension: "hazardous_waste" });
  assert.equal(res.root_nodes[0].attrs.dimension, "hazardous_waste");
  assert.equal(res.root_nodes[0].attrs.industry, "医院");
});
