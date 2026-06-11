// Cytoscape 舞台:dagre 分层布局 + ego 邻域 + 生长回放 + 私有退场动效
import cytoscape from "cytoscape";
import dagreLayout from "cytoscape-dagre";
import {
  state, ENTRY_CENTERS, nodeMeta, EDGE_TYPE_COLOR, EDGE_TYPE_LABEL, activeEdgeTypes,
} from "./state.js";
import { nodeArt, nodeKind } from "./nodeArt.js";

cytoscape.use(dagreLayout);

const LAYOUT = {
  name: "dagre",
  rankDir: "TB",
  nodeSep: 52,
  rankSep: 92,
  edgeSep: 18,
  padding: 28,
  animate: true,
  animationDuration: 480,
  animationEasing: "ease-out",
};

let selectHandler = null;
export function onNodeSelect(fn) { selectHandler = fn; }

// 演示模式可注入额外节点过滤(如第一幕"只有法条")
let demoNodeFilter = null;
export function setDemoNodeFilter(fn) { demoNodeFilter = fn; }

function allowedNode(node) {
  if (state.view === "shared" && node.tier !== "shared") return false;
  if (demoNodeFilter && !demoNodeFilter(node)) return false;
  return true;
}

function allowedEdge(edge, visibleIds, types) {
  if (!types.has(edge.edge_type)) return false;
  if (state.view === "shared" && edge.tier !== "shared") return false;
  return visibleIds.has(edge.from) && visibleIds.has(edge.to);
}

export function buildElements(opts = {}) {
  const hopCap = opts.hopCap ?? 84;
  const types = activeEdgeTypes();
  const allowedNodes = state.graph.nodes.filter(allowedNode);
  const visibleIds = new Set(allowedNodes.map((n) => n.node_id));
  const allowedEdges = state.graph.edges.filter((e) => allowedEdge(e, visibleIds, types));

  let centerId = state.centerId;
  if (!visibleIds.has(centerId)) {
    centerId = allowedNodes[0]?.node_id ?? ENTRY_CENTERS[state.product].issue;
  }

  const egoIds = new Set([centerId]);
  const firstHop = allowedEdges.filter((e) => e.from === centerId || e.to === centerId).slice(0, 40);
  for (const e of firstHop) { egoIds.add(e.from); egoIds.add(e.to); }
  if (egoIds.size < 46) {
    const firstIds = new Set(egoIds);
    for (const e of allowedEdges) {
      if (egoIds.size >= hopCap) break;
      if (firstIds.has(e.from) || firstIds.has(e.to)) { egoIds.add(e.from); egoIds.add(e.to); }
    }
  }

  const nodes = demoNodeFilter
    ? allowedNodes // 演示过滤模式下直接展示整个过滤结果(如全部法条)
    : allowedNodes.filter((n) => egoIds.has(n.node_id));
  const nodeIds = new Set(nodes.map((n) => n.node_id));
  const edges = allowedEdges.filter((e) => nodeIds.has(e.from) && nodeIds.has(e.to));

  return {
    centerId,
    elements: [
      ...nodes.map((node) => {
        const meta = nodeMeta(node.node_type);
        const kind = nodeKind(node.node_type);
        return {
          data: {
            id: node.node_id,
            label: node.name,
            typeLabel: meta.label,
            color: meta.color,
            shape: kind.kind === "entity" ? "ellipse" : kind.kind === "diamond" ? "diamond" : "round-rectangle",
            size: kind.size,
            art: nodeArt(node.node_type, node.tier),
            tier: node.tier,
            reviewStatus: node.review_status,
          },
          classes: `tier-${node.tier}`,
        };
      }),
      ...edges.map((edge) => ({
        data: {
          id: edge.edge_id,
          source: edge.from,
          target: edge.to,
          edgeType: edge.edge_type,
          edgeLabel: EDGE_TYPE_LABEL[edge.edge_type] || edge.edge_type,
          color: EDGE_TYPE_COLOR[edge.edge_type] || "#5b7282",
          tier: edge.tier,
          confidence: edge.confidence ?? 0.7,
          reasons: (edge.confidence_reason || []).join(" · "),
          dashed: edge.edge_type === "pitfall_of" || edge.edge_type === "supports_stat" ? "dashed" : "solid",
        },
      })),
    ],
  };
}

const CY_STYLE = [
  {
    selector: "node",
    style: {
      "background-opacity": 0,
      "background-image": "data(art)",
      "background-fit": "contain",
      "background-clip": "none",
      "bounds-expansion": 6,
      shape: "data(shape)",
      width: "data(size)",
      height: "data(size)",
      "border-width": 0,
      label: "data(label)",
      color: "#cfe3d6",
      "font-size": 11,
      "font-family": '"Noto Sans SC", "Microsoft YaHei", sans-serif',
      "text-halign": "center",
      "text-valign": "bottom",
      "text-margin-y": 8,
      "text-wrap": "wrap",
      "text-max-width": 130,
      "text-background-color": "#060f0b",
      "text-background-opacity": 0.65,
      "text-background-padding": 2,
      "text-background-shape": "round-rectangle",
      "transition-property": "opacity",
      "transition-duration": "0.25s",
    },
  },
  {
    selector: "edge",
    style: {
      width: "mapData(confidence, 0.6, 0.95, 1.4, 4.2)",
      "line-color": "data(color)",
      "line-style": "data(dashed)",
      "line-opacity": "mapData(confidence, 0.6, 0.95, 0.4, 0.92)",
      "target-arrow-color": "data(color)",
      "target-arrow-shape": "triangle",
      "arrow-scale": 0.85,
      "curve-style": "bezier",
      "transition-property": "line-opacity, width",
      "transition-duration": "0.25s",
    },
  },
  {
    selector: "node:selected, node.is-center",
    style: {
      "underlay-color": "#2ee6a8",
      "underlay-opacity": 0.2,
      "underlay-padding": 9,
      "underlay-shape": "ellipse",
    },
  },
  { selector: "node.dimmed", style: { opacity: 0.16, "text-opacity": 0.1 } },
  { selector: "edge.dimmed", style: { "line-opacity": 0.08 } },
  {
    selector: "edge.spotlight",
    style: {
      width: 4.5,
      "line-opacity": 1,
      "underlay-color": "data(color)",
      "underlay-opacity": 0.22,
      "underlay-padding": 5,
    },
  },
  {
    selector: "node.leaving",
    style: {
      "underlay-color": "#f5b84d",
      "underlay-opacity": 0.32,
      "underlay-padding": 11,
      "underlay-shape": "ellipse",
    },
  },
];

const tooltip = () => document.getElementById("cyTooltip");

function showTooltip(html, pos) {
  const tip = tooltip();
  tip.innerHTML = html;
  tip.hidden = false;
  const stage = document.querySelector(".stage").getBoundingClientRect();
  const cyBox = document.getElementById("cy").getBoundingClientRect();
  const x = pos.x + (cyBox.left - stage.left);
  const y = pos.y + (cyBox.top - stage.top);
  tip.style.left = `${Math.min(Math.max(x, 150), stage.width - 150)}px`;
  tip.style.top = `${Math.max(y, 70)}px`;
}

export function hideTooltip() {
  const tip = tooltip();
  if (tip) tip.hidden = true;
}

export function initOrUpdateGraph(opts = {}) {
  const { centerId, elements } = buildElements(opts);
  state.centerId = centerId;

  if (!state.cy) {
    state.cy = cytoscape({
      container: document.getElementById("cy"),
      elements,
      minZoom: 0.3,
      maxZoom: 2.4,
      wheelSensitivity: 0.3,
      style: CY_STYLE,
      layout: { ...LAYOUT, animate: false },
    });
    bindGraphEvents();
  } else {
    state.cy.elements().remove();
    state.cy.add(elements);
    state.cy.layout({ ...LAYOUT, animate: !opts.skipAnimation }).run();
  }
  markCenter(centerId);
  state.cy.fit(undefined, 44);
  return { centerId, elementCount: elements.length };
}

function bindGraphEvents() {
  const cy = state.cy;
  cy.on("tap", "node", (event) => {
    const id = event.target.id();
    markCenter(id, false);
    selectHandler?.(id);
  });
  cy.on("dbltap", "node", (event) => {
    state.centerId = event.target.id();
    initOrUpdateGraph();
    selectHandler?.(state.centerId);
  });
  cy.on("mouseover", "node", (event) => {
    const d = event.target.data();
    document.getElementById("cy").style.cursor = "pointer";
    showTooltip(
      `<div class="tt-title">${d.label}</div>
       <div class="tt-meta">${d.typeLabel} · ${d.tier} · ${d.reviewStatus || ""}</div>
       <div class="tt-meta">双击以此为中心展开</div>`,
      event.target.renderedPosition(),
    );
  });
  cy.on("mouseover", "edge", (event) => {
    const d = event.target.data();
    const conf = Number(d.confidence) || 0;
    showTooltip(
      `<div class="tt-title">${d.edgeLabel}</div>
       <div class="tt-meta">${d.reasons || "—"}</div>
       <div class="tt-bar" style="--w:${Math.round(conf * 100)}%"><i style="width:${Math.round(conf * 100)}%"></i></div>
       <div class="tt-meta">置信度 ${conf.toFixed(2)}</div>`,
      event.renderedPosition,
    );
  });
  cy.on("mouseout", "node, edge", () => {
    document.getElementById("cy").style.cursor = "default";
    hideTooltip();
  });
  cy.on("pan zoom", hideTooltip);
}

export function markCenter(nodeId, restyle = true) {
  if (!state.cy) return;
  state.cy.nodes().removeClass("is-center");
  const node = state.cy.getElementById(nodeId);
  if (node.length) {
    node.addClass("is-center");
    if (restyle) {
      state.cy.animate({ center: { eles: node }, zoom: Math.max(state.cy.zoom(), 1.0) }, { duration: 320, easing: "ease-out" });
    }
  }
}

// 生长回放:节点按波次点亮,边随端点出现 —— 全部真实数据,无伪造
export function growthReplay(done) {
  const cy = state.cy;
  if (!cy) return;
  const nodes = cy.nodes();
  const edges = cy.edges();
  nodes.style("opacity", 0).style("text-opacity", 0);
  edges.style("line-opacity", 0).style("target-arrow-color", "transparent");

  const center = cy.getElementById(state.centerId);
  const ordered = [center, ...nodes.filter((n) => n.id() !== state.centerId)];
  const step = Math.max(34, Math.min(70, 2600 / ordered.length));

  ordered.forEach((node, i) => {
    setTimeout(() => {
      node.animate({ style: { opacity: 1 } }, { duration: 300, easing: "ease-out" });
      node.style("text-opacity", 1);
      node.connectedEdges().forEach((edge) => {
        const src = edge.source().style("opacity");
        const tgt = edge.target().style("opacity");
        if (Number(src) > 0.5 && Number(tgt) > 0.5) {
          edge.style("target-arrow-color", edge.data("color"));
          edge.animate({ style: { "line-opacity": 0.8 } }, { duration: 280 });
        }
      });
    }, i * step);
  });
  setTimeout(() => {
    edges.style("target-arrow-color", null);
    edges.style("line-opacity", null);
    nodes.style("opacity", null).style("text-opacity", null);
    done?.();
  }, ordered.length * step + 700);
}

// 私有/聚合节点退场:锁定脉冲 → 缩小淡出,然后回调切换数据集
export function privateExitAnimation(done) {
  const cy = state.cy;
  if (!cy) { done?.(); return; }
  const leaving = cy.nodes(".tier-private, .tier-aggregate");
  if (!leaving.length) { done?.(); return; }
  leaving.addClass("leaving");
  setTimeout(() => {
    leaving.forEach((node) => {
      node.connectedEdges().animate({ style: { "line-opacity": 0 } }, { duration: 360 });
      node.animate({ style: { opacity: 0 } }, { duration: 480, easing: "ease-in" });
    });
    setTimeout(() => done?.(), 620);
  }, 760);
}

// 聚光灯:高亮某些边类型,其余压暗
export function spotlightEdges(edgeTypes) {
  const cy = state.cy;
  if (!cy) return;
  cy.elements().removeClass("dimmed spotlight");
  if (!edgeTypes || !edgeTypes.length) return;
  const wanted = new Set(edgeTypes);
  const litEdges = cy.edges().filter((e) => wanted.has(e.data("edgeType")));
  const litNodes = litEdges.connectedNodes();
  cy.nodes().not(litNodes).addClass("dimmed");
  cy.edges().not(litEdges).addClass("dimmed");
  litEdges.addClass("spotlight");
}

export function clearSpotlight() {
  state.cy?.elements().removeClass("dimmed spotlight");
}

export function relayout() {
  state.cy?.layout(LAYOUT).run();
}

export function fitGraph() {
  state.cy?.animate({ fit: { padding: 44 } }, { duration: 300, easing: "ease-out" });
}
