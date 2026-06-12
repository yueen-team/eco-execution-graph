// 右栏执行卡:DataHub 范式 —— 概览 → 现场表现 → 证据 → 能力胶囊 → 来源追溯 → 置信 → 质量
import {
  state, nodeMeta, TIER_META, EDGE_TYPE_COLOR, EDGE_TYPE_LABEL,
  findCardForNode, reviewStatusLabel, LEGAL_BASIS_LABEL, confidenceReasonLabel,
} from "./state.js";

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

function badge(text, cls, icon) {
  return `<span class="badge ${cls}">${icon ? `<i data-lucide="${icon}"></i>` : ""}${esc(text)}</span>`;
}

function section(title, icon, body) {
  if (!body) return "";
  return `<section class="dp-section"><h3><i data-lucide="${icon}"></i>${title}</h3>${body}</section>`;
}

// 关联解释卡:边是一等公民 —— 谁、什么关系、谁、凭什么、来自哪
export function renderEdgePanel(edgeId) {
  const body = document.getElementById("detailBody");
  const edge = state.graph?.edges.find((e) => e.edge_id === edgeId);
  if (!edge) return;
  const from = state.graph.nodes.find((n) => n.node_id === edge.from);
  const to = state.graph.nodes.find((n) => n.node_id === edge.to);
  const fromMeta = nodeMeta(from?.node_type);
  const toMeta = nodeMeta(to?.node_type);
  const tier = TIER_META[edge.tier] || TIER_META.shared;
  const color = EDGE_TYPE_COLOR[edge.edge_type] || "#5b7282";
  const conf = edge.confidence ?? 0;
  const ev = edge.confidence_evidence || {};

  body.innerHTML = `
    <header class="dp-header">
      <p class="dp-kind"><i data-lucide="spline"></i>关联解释</p>
      <h2 style="color:${color}">${esc(EDGE_TYPE_LABEL[edge.edge_type] || edge.edge_type)}</h2>
      <div class="dp-badges">
        ${badge(tier.label, tier.badge, tier.icon)}
        ${edge.review_status ? badge(reviewStatusLabel(edge.review_status), "b-plain") : ""}
        ${edge.legal_basis_status ? badge(LEGAL_BASIS_LABEL[edge.legal_basis_status] || edge.legal_basis_status, "b-blue", "stamp") : ""}
      </div>
    </header>
    <section class="dp-section">
      <h3><i data-lucide="git-fork"></i>这条关联连接了谁</h3>
      <button class="edge-endpoint" data-jump="${esc(edge.from)}">
        <i data-lucide="${fromMeta.icon}"></i>
        <span><small>${esc(fromMeta.label)}</small>${esc(from?.name || edge.from)}</span>
      </button>
      <div class="edge-arrow" style="--c:${color}"><i data-lucide="move-down"></i><span>${esc(EDGE_TYPE_LABEL[edge.edge_type] || edge.edge_type)}</span></div>
      <button class="edge-endpoint" data-jump="${esc(edge.to)}">
        <i data-lucide="${toMeta.icon}"></i>
        <span><small>${esc(toMeta.label)}</small>${esc(to?.name || edge.to)}</span>
      </button>
    </section>
    <section class="dp-section">
      <h3><i data-lucide="shield-check"></i>凭什么连</h3>
      <div class="quality-grid">
        <div class="q-cell"><b>${conf.toFixed(2)}</b><span>置信度</span></div>
        <div class="q-cell"><b>${edge.evidence_count ?? ev.verified_count ?? 0}</b><span>证据计数</span></div>
        <div class="q-cell"><b>${esc(edge.last_verified_at || ev.last_updated || "—")}</b><span>最近验证</span></div>
        <div class="q-cell"><b>${esc(edge.reviewer_role || "—")}</b><span>审核角色</span></div>
      </div>
      ${edge.confidence_reason?.length ? `<div class="chip-row">${edge.confidence_reason.map((r) => `<span class="chip">${esc(confidenceReasonLabel(r))}</span>`).join("")}</div>` : ""}
    </section>
    ${edge.report_usage_policy ? section("对外口径", "file-pen", `<p>报告中只允许写:「${esc(edge.report_usage_policy)}」—— 由法条依据状态(legal_basis_status)约束,未经官方确认不写违法认定。</p>`) : ""}
    ${section("来源追溯", "git-commit-horizontal", `<div class="trace-list">
        ${edge.source_ref ? `<div class="trace-item"><span class="tk">来源引用</span><span class="tv">${esc(edge.source_ref)}</span></div>` : ""}
        ${edge.origin_repo ? `<div class="trace-item"><span class="tk">来源库</span><span class="tv">${esc(edge.origin_repo)}</span></div>` : ""}
        ${edge.origin_commit ? `<div class="trace-item"><span class="tk">提交</span><span class="tv">${esc(edge.origin_commit.slice(0, 9))}</span></div>` : ""}
        ${edge.origin_asset ? `<div class="trace-item"><span class="tk">资产</span><span class="tv">${esc(edge.origin_asset)}</span></div>` : ""}
      </div>`)}
    <p class="boundary-note">每条关联出生即带授权层级、置信与来源;置信度不是拍的,由整改验证回写(RECTIFICATION_VERIFIED)逐步挣得。</p>
  `;
  window.__refreshIcons?.();
}

export function renderPanel(nodeId) {
  const body = document.getElementById("detailBody");
  const node = state.graph?.nodes.find((n) => n.node_id === nodeId);
  if (!node) {
    body.innerHTML = `<div class="dp-header"><p class="dp-kind">执行卡</p><h2>请选择节点</h2>
      <p class="boundary-note">点击图谱中的任意节点查看其执行卡、来源追溯与授权边界;双击以该节点为中心重新展开邻域。</p></div>`;
    return;
  }
  const card = findCardForNode(nodeId);
  const meta = nodeMeta(node.node_type);
  const tier = TIER_META[node.tier] || TIER_META.shared;
  const adjacent = state.graph.edges.filter((e) => e.from === nodeId || e.to === nodeId);

  const manifestation =
    card?.field_manifestations?.[0]?.description ||
    node.attrs?.obligation_summary ||
    node.attrs?.summary ||
    node.attrs?.typical_scene || "";

  // 证据类别
  const evidenceChips = (card?.evidence_categories || [])
    .map((item) => `<span class="chip"><b class="dot t-${esc(item.tier || "shared")}"></b>${esc(item.label)}</span>`)
    .join("");
  const evidenceBody = evidenceChips
    ? `<div class="chip-row">${evidenceChips}</div>`
    : card?.evidence_summary
      ? `<p>${esc(card.evidence_summary)}</p>`
      : "";

  // 能力胶囊:shared 视图=锁定占位(看得见带不走);internal 视图=能力解锁展示
  let capsules = "";
  if (state.view === "shared") {
    const placeholders = card?.internal_capability_placeholders || [];
    capsules = placeholders.map((p) =>
      `<div class="capsule"><i data-lucide="lock"></i><span><strong>已建立标准 ${p.count ?? 1} 条</strong> · ${esc(p.summary)}</span></div>`,
    ).join("");
    if (!capsules && card) {
      capsules = `<div class="capsule"><i data-lucide="lock"></i><span><strong>内部能力层</strong> · 判定标准、整改模板、报告表达不进入共有包。</span></div>`;
    }
  } else {
    const parts = [];
    for (const r of card?.rectifications || []) {
      const rate = parseInt(r.pass_rate, 10);
      parts.push(`<div class="capsule unlocked"><i data-lucide="wrench"></i><span><strong>整改模板</strong> · ${esc(r.summary || r.ref)}
        ${Number.isFinite(rate) ? `<span class="passrate"><span class="bar"><i style="width:${rate}%"></i></span>整改验证通过率 ${rate}%</span>` : ""}</span></div>`);
    }
    for (const e of card?.evidence_private_refs || []) {
      parts.push(`<div class="capsule unlocked"><i data-lucide="file-lock"></i><span><strong>证据判定标准</strong> · <span style="font-family:var(--font-mono);font-size:11.5px">${esc(e.ref)}</span></span></div>`);
    }
    capsules = parts.join("");
  }

  // 来源追溯
  const trace = card?.source_trace || {};
  const origin = trace.origin_repo || node.origin_repo;
  const commit = (trace.origin_commit || node.origin_commit || "").slice(0, 9);
  const asset = trace.origin_asset || node.origin_asset;
  const sourceRefs = trace.source_refs || (node.source_ref ? [node.source_ref] : []);
  const traceBody = (origin || sourceRefs.length)
    ? `<div class="trace-list">
        ${origin ? `<div class="trace-item"><span class="tk">来源库</span><span class="tv">${esc(origin)}</span></div>` : ""}
        ${commit ? `<div class="trace-item"><span class="tk">提交</span><span class="tv">${esc(commit)}</span></div>` : ""}
        ${asset ? `<div class="trace-item"><span class="tk">资产</span><span class="tv">${esc(asset)}</span></div>` : ""}
        ${sourceRefs.length ? `<div class="trace-item"><span class="tk">来源引用</span><span class="tv">${sourceRefs.map(esc).join("<br>")}</span></div>` : ""}
      </div>`
    : "";

  // 置信来源(邻接边)
  const confBody = adjacent.slice(0, 6).map((edge) => {
    const conf = edge.confidence ?? 0;
    const color = EDGE_TYPE_COLOR[edge.edge_type] || "#5b7282";
    return `<div class="conf-item">
      <div class="conf-head"><b class="dot" style="background:${color}"></b>${esc(EDGE_TYPE_LABEL[edge.edge_type] || edge.edge_type)}
        <span class="cv">${conf.toFixed(2)}</span></div>
      <div class="conf-bar"><i style="width:${Math.round(conf * 100)}%"></i></div>
      ${edge.confidence_reason?.length ? `<div class="conf-reason">${esc(edge.confidence_reason.map(confidenceReasonLabel).join(" / "))}</div>` : ""}
    </div>`;
  }).join("");

  // 质量评分
  const q = card?.quality_score;
  const qualityBody = q
    ? `<div class="quality-grid">
        <div class="q-cell"><b>${(q.confidence ?? 0).toFixed(2)}</b><span>置信度</span></div>
        <div class="q-cell"><b>${q.evidence_count ?? 0}</b><span>证据计数</span></div>
        <div class="q-cell"><b>${esc(q.last_verified_at || "—")}</b><span>最近验证</span></div>
        <div class="q-cell q-risk-${esc(q.staleness_risk || "low")}"><b>${{ low: "低", medium: "中", high: "高" }[q.staleness_risk] || "—"}</b><span>陈旧风险</span></div>
      </div>`
    : "";

  const boundary = state.view === "shared"
    ? "共有视图仅含问题分类、法条瘦引用、证据类别与聚合统计;判定标准、整改模板、报告表达以能力计数呈现 —— 看得见,带不走。"
    : "内部全量视图:私有运行层(private runtime)节点可见,用于证明能力存在;对外导出按授权层级物理过滤 + 双重泄漏检测兜底。";

  const legalStatus = card?.legal_basis_status || adjacent.find((e) => e.legal_basis_status)?.legal_basis_status;

  body.innerHTML = `
    <header class="dp-header">
      <p class="dp-kind"><i data-lucide="${meta.icon}"></i>${esc(meta.label)} · 执行卡</p>
      <h2>${esc(card?.title || node.name)}</h2>
      <div class="dp-badges">
        ${badge(tier.label, tier.badge, tier.icon)}
        ${node.review_status ? badge(reviewStatusLabel(node.review_status), "b-plain") : ""}
        ${legalStatus ? badge(LEGAL_BASIS_LABEL[legalStatus] || legalStatus, "b-blue", "stamp") : ""}
      </div>
    </header>
    ${section("现场表现", "eye", manifestation ? `<p>${esc(manifestation)}</p>` : "")}
    ${section("证据类别", "camera", evidenceBody)}
    ${section(state.view === "shared" ? "内部能力 · 已建立" : "内部能力层", state.view === "shared" ? "lock" : "key-round", capsules)}
    ${card?.pitfalls?.length ? section("踩雷提示", "triangle-alert", `<p>${esc(card.pitfalls[0].text)}</p>`) : ""}
    ${section("来源追溯", "git-commit-horizontal", traceBody)}
    ${section("置信来源", "shield-check", confBody ? `<div class="conf-list">${confBody}</div>` : "")}
    ${section("质量评分", "gauge", qualityBody)}
    <p class="boundary-note">${boundary}</p>
  `;
  window.__refreshIcons?.();
}
