import cytoscape from "cytoscape";
import { createIcons, LockKeyholeOpen, Scan, ShieldCheck } from "lucide";
import "./styles.css";

createIcons({ icons: { LockKeyholeOpen, Scan, ShieldCheck } });

const state = {
  graph: null,
  cards: [],
  view: "internal",
  entry: "law",
  centerId: null,
  activeEdgeTypes: new Set(["manifests_as", "regulated_by", "evidenced_by", "pitfall_of", "supports_stat"]),
  cy: null,
};

const entryCenters = {
  law: "law:swl:art77",
  issue: "issue:hw:label-incomplete",
  industry: "industry:demo:manufacturing",
};

const nodeTypeLabel = {
  law_article: "法条",
  law_obligation: "义务",
  issue_type: "问题",
  pitfall_class: "踩雷类",
  pitfall_pattern_stat: "踩雷统计",
  pitfall_instance: "踩雷实例",
  evidence_category: "证据类别",
  evidence_field_requirement: "字段要求",
  evidence_judgment_standard: "证据标准",
  rectification_template: "整改模板",
  report_expression: "报告表达",
  stat_signal: "聚合信号",
  industry: "行业",
  process_scenario: "场景",
  pollution_source: "产污源",
  pollutant: "污染物",
  tech_spec: "技术规范",
};

function byId(collection, idKey) {
  return new Map(collection.map((item) => [item[idKey], item]));
}

function allowedNode(node) {
  return state.view === "internal" || node.tier !== "private";
}

function allowedEdge(edge, visibleNodeIds) {
  if (!state.activeEdgeTypes.has(edge.edge_type)) return false;
  if (state.view === "shared" && edge.tier !== "shared") return false;
  return visibleNodeIds.has(edge.from) && visibleNodeIds.has(edge.to);
}

function buildElements() {
  const nodes = state.graph.nodes.filter(allowedNode);
  const visibleNodeIds = new Set(nodes.map((node) => node.node_id));
  const edges = state.graph.edges.filter((edge) => allowedEdge(edge, visibleNodeIds));
  return [
    ...nodes.map((node) => ({
      data: {
        id: node.node_id,
        label: node.name,
        nodeType: node.node_type,
        nodeTypeLabel: nodeTypeLabel[node.node_type] || node.node_type,
        tier: node.tier,
        reviewStatus: node.review_status,
      },
    })),
    ...edges.map((edge) => ({
      data: {
        id: edge.edge_id,
        source: edge.from,
        target: edge.to,
        edgeType: edge.edge_type,
        tier: edge.tier,
        confidence: edge.confidence,
        label: edge.edge_type,
        reasons: (edge.confidence_reason || []).join(" · "),
      },
    })),
  ];
}

function renderGraph() {
  const elements = buildElements();
  const centerExists = elements.some((item) => item.data.id === state.centerId);
  if (!centerExists) state.centerId = entryCenters.issue;

  if (!state.cy) {
    state.cy = cytoscape({
      container: document.getElementById("cy"),
      elements,
      minZoom: 0.45,
      maxZoom: 2.2,
      style: [
        {
          selector: "node",
          style: {
            "background-color": "data(tier)",
            "border-color": "#dbeafe",
            "border-width": 1,
            color: "#f8fafc",
            "font-size": 11,
            "font-family": "Inter, system-ui, sans-serif",
            label: "data(label)",
            "text-halign": "center",
            "text-valign": "bottom",
            "text-margin-y": 7,
            "text-wrap": "wrap",
            "text-max-width": 120,
            width: 44,
            height: 44,
          },
        },
        { selector: 'node[tier = "shared"]', style: { "background-color": "#047857" } },
        { selector: 'node[tier = "private"]', style: { "background-color": "#7c2d12", "border-style": "dashed" } },
        { selector: 'node[tier = "aggregate"]', style: { "background-color": "#7c3aed" } },
        { selector: 'node[nodeType = "law_article"]', style: { shape: "round-rectangle", width: 72, height: 42, "background-color": "#1d4ed8" } },
        { selector: 'node[nodeType = "issue_type"]', style: { shape: "round-rectangle", width: 78, height: 46, "background-color": "#b91c1c" } },
        { selector: 'node[nodeType *= "evidence"]', style: { shape: "round-rectangle", "background-color": "#0f766e" } },
        { selector: "edge", style: {
          width: "mapData(confidence, 0.6, 0.9, 1.2, 4)",
          "line-color": "#64748b",
          "target-arrow-color": "#64748b",
          "target-arrow-shape": "triangle",
          "curve-style": "bezier",
          opacity: "mapData(confidence, 0.6, 0.9, 0.48, 0.95)",
        } },
        { selector: 'edge[edgeType = "manifests_as"]', style: { "line-color": "#f59e0b", "target-arrow-color": "#f59e0b" } },
        { selector: 'edge[edgeType = "regulated_by"], edge[edgeType = "obligation_of"]', style: { "line-color": "#38bdf8", "target-arrow-color": "#38bdf8" } },
        { selector: 'edge[edgeType = "evidenced_by"]', style: { "line-color": "#2dd4bf", "target-arrow-color": "#2dd4bf" } },
        { selector: 'edge[edgeType = "pitfall_of"]', style: { "line-color": "#f472b6", "target-arrow-color": "#f472b6", "line-style": "dashed" } },
        { selector: ":selected", style: { "border-color": "#fef08a", "border-width": 3 } },
      ],
      layout: { name: "breadthfirst", directed: true, padding: 30, spacingFactor: 1.05 },
    });
    state.cy.on("tap", "node", (event) => selectNode(event.target.id()));
  } else {
    state.cy.elements().remove();
    state.cy.add(elements);
    state.cy.layout({ name: "breadthfirst", directed: true, padding: 30, spacingFactor: 1.05 }).run();
  }
  selectNode(state.centerId, false);
  state.cy.fit(undefined, 40);
}

function findCardForNode(nodeId) {
  return state.cards.find((card) => card.field_manifestations?.some((item) => item.issue_type_ref === nodeId))
    || state.cards.find((card) => card.law_article_ref?.node_id === nodeId)
    || state.cards[0];
}

function selectNode(nodeId, fit = true) {
  state.centerId = nodeId;
  const nodeMap = byId(state.graph.nodes, "node_id");
  const edgeMap = state.graph.edges.filter((edge) => edge.from === nodeId || edge.to === nodeId);
  const node = nodeMap.get(nodeId) || nodeMap.get(entryCenters.issue);
  const card = findCardForNode(node.node_id);

  document.getElementById("centerTitle").textContent = node.name;
  document.getElementById("cardTitle").textContent = card.title || node.name;
  const tierBadge = document.getElementById("tierBadge");
  tierBadge.textContent = node.tier;
  tierBadge.className = `tier-badge ${node.tier}`;

  const facts = document.getElementById("nodeFacts");
  facts.innerHTML = [
    ["类型", nodeTypeLabel[node.node_type] || node.node_type],
    ["审核", node.review_status],
    ["节点", node.node_id],
  ].map(([label, value]) => `<dt>${label}</dt><dd>${value}</dd>`).join("");

  const manifestation = card.field_manifestations?.[0]?.description || node.attrs?.summary || node.attrs?.obligation_summary || "-";
  document.getElementById("manifestation").textContent = manifestation;
  document.getElementById("evidenceList").innerHTML = (card.evidence_categories || [])
    .map((item) => `<li>${item.label}<span>${item.tier}</span></li>`)
    .join("");
  const boundary = state.view === "shared"
    ? "共有视图仅展示问题分类、法条瘦引用、证据类别、概念级字段和聚合统计；判定标准、整改模板、报告表达不进入共有包。"
    : "内部视图可见 private runtime 节点，用于证明能力存在；导出时由物理过滤和泄漏检测兜底。";
  document.getElementById("boundaryText").textContent = boundary;
  document.getElementById("confidenceList").innerHTML = edgeMap.slice(0, 6).map((edge) => (
    `<li><strong>${edge.edge_type}</strong><span>${edge.confidence?.toFixed(2) || "-"}</span><small>${(edge.confidence_reason || []).join(" / ")}</small></li>`
  )).join("") || "<li>暂无邻接边</li>";

  if (state.cy) {
    state.cy.nodes().unselect();
    const cyNode = state.cy.getElementById(node.node_id);
    if (cyNode.length) {
      cyNode.select();
      if (fit) state.cy.animate({ center: { eles: cyNode }, zoom: Math.max(state.cy.zoom(), 1.05) }, { duration: 220 });
    }
  }
}

function updateMetrics() {
  const sharedNodes = state.graph.nodes.filter((node) => node.tier === "shared").length;
  document.getElementById("nodeCount").textContent = state.graph.nodes.length;
  document.getElementById("edgeCount").textContent = state.graph.edges.length;
  document.getElementById("cardCount").textContent = state.cards.length;
  document.getElementById("sharedCount").textContent = sharedNodes;
}

function bindControls() {
  document.querySelectorAll("[data-view]").forEach((button) => {
    button.addEventListener("click", () => {
      state.view = button.dataset.view;
      document.querySelectorAll("[data-view]").forEach((item) => item.classList.toggle("is-active", item === button));
      document.getElementById("viewStatus").textContent = state.view === "shared"
        ? "共有视图: private 节点已物理隐藏,只保留共有口径。"
        : "内部全量视图: 可见 private runtime 节点。";
      renderGraph();
    });
  });
  document.querySelectorAll("[data-entry]").forEach((button) => {
    button.addEventListener("click", () => {
      state.entry = button.dataset.entry;
      state.centerId = entryCenters[state.entry];
      document.querySelectorAll("[data-entry]").forEach((item) => item.classList.toggle("is-active", item === button));
      selectNode(state.centerId);
    });
  });
  document.querySelectorAll(".check-row input").forEach((input) => {
    input.addEventListener("change", () => {
      if (input.checked) state.activeEdgeTypes.add(input.value);
      else state.activeEdgeTypes.delete(input.value);
      renderGraph();
    });
  });
  document.getElementById("fitButton").addEventListener("click", () => state.cy?.fit(undefined, 40));
}

async function boot() {
  const [graph, cards] = await Promise.all([
    fetch("/demo-data/graph.json").then((response) => response.json()),
    fetch("/demo-data/cards.json").then((response) => response.json()),
  ]);
  state.graph = graph;
  state.cards = cards;
  state.centerId = entryCenters.law;
  updateMetrics();
  bindControls();
  renderGraph();
}

boot().catch((error) => {
  document.getElementById("centerTitle").textContent = "加载失败";
  document.getElementById("manifestation").textContent = error.message;
});
