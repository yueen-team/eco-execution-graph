// 副驾「十律」研判段 · 纯渲染模块(无状态、零 DOM、零 import.meta.env、零 ./state.js)
// 从 review.js 抽出,可被 node --test 直接 import 做契约测试。
// 渲染输出与 review.js 内联版字节一致:同样的 HTML 字符串、data-level、「查看溯源」折叠与中文标签。
// 为隔离(不反向 import review.js 拖入 state.js),本模块自带一份小纯 helper(esc/readableText/
// displayValue/field/chips/section)与 VALUE_LABELS / ACTIONS;轻微重复换取可测 + 离线隔离。

const VALUE_LABELS = new Map([
  ["not_for_runtime_import", "不进入运行库"],
  ["synthetic_smoke", "系统联通测试"],
  ["synthetic-region", "合成区域"],
  ["synthetic-industry", "合成行业"],
  ["synthetic-permit", "合成许可"],
  ["synthetic observation", "系统测试观察"],
  ["Synthetic graph smoke issue", "系统联通测试问题"],
  ["Synthetic problem summary only.", "系统联通测试摘要。"],
  ["historical_archive", "历史回档"],
  ["VERIFIED", "已验收通过"],
  ["REJECTED", "验收驳回"],
  ["OPEN", "处理中"],
  ["YELLOW", "黄色预警"],
]);

// 两步制结论:kind 驱动语义配色,hint 告诉 ETO 去向。copilotOverallBanner 用它把「建议方向」
// kind 映射回 label。与 review.js 各持一份(review.js 决策区/applyDecision 仍用它自己那份)。
const ACTIONS = [
  { label: "通过，进入聚合候选", kind: "approve", hint: "状态将变为「已通过(待聚合)」,满 5 家企业后参与聚合统计。" },
  { label: "合并到已有问题类型", kind: "merge", hint: "状态将变为「已进入聚合候选」,聚合时按合并目标问题类型归并。" },
  { label: "仅保留内部案例", kind: "internal", hint: "保留在私有案例层,不参与聚合,不对外。" },
  { label: "退回补充", kind: "return", hint: "退回 EcoCheck 侧补充现场事实或证据。" },
  { label: "不入图", kind: "reject", hint: "该候选经验不进入图谱。" },
];

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;",
  }[char]));
}

function readableText(value) {
  const text = String(value ?? "");
  if (!text) return text;
  if (VALUE_LABELS.has(text)) return VALUE_LABELS.get(text);
  return text.replace(/\bS(\d{2})\b/g, "风险域 S$1");
}

function displayValue(value) {
  if (value === null || value === undefined || value === "") return "未提供";
  if (Array.isArray(value)) return value.length ? value.map(displayValue).join("、") : "未提供";
  if (typeof value === "object") {
    if ("值" in value) return displayValue(value["值"]);
    if ("名称" in value) return displayValue(value["名称"]);
    return Object.entries(value).map(([key, item]) => `${key}:${displayValue(item)}`).join("；");
  }
  return readableText(value);
}

function field(label, value) {
  return `<div class="review-field"><span>${esc(label)}</span><strong>${esc(displayValue(value))}</strong></div>`;
}

function chips(values) {
  const list = values?.length ? values : ["待补充"];
  return `<div class="review-chip-row">${list.map((item) => `<span>${esc(displayValue(item))}</span>`).join("")}</div>`;
}

function section(title, body) {
  return `<section class="review-detail-section"><h3>${esc(title)}</h3>${body}</section>`;
}

// ============ 副驾「十律」研判段:异议是观点不是事实,视觉更轻、可就地采纳/驳回 ============
// 错配码 → 人读中文(机器码只在「查看溯源」里露出)
export const COPILOT_CODE_LABELS = {
  issue_type_mismatch: "归类与摘要错配",
  management_advice_miscast_as_law: "管理经验被法律化",
  law_not_applicable: "法条不适用",
  law_status_risk: "法条状态有风险",
  missing_law_locator: "法条定位缺失",
  evidence_insufficient: "证据不足",
  duplicate_mergeable: "疑似重复可合并",
  aggregation_risk: "聚合误导风险",
  confidence_stale: "置信存疑",
  pitfall_candidate: "疑似踩雷点",
  basis_requires_official_confirmation: "内部口径不得对外作依据",
  candidate_or_disputed_basis: "候选/争议口径需人工审核",
  no_law_basis_advisory: "无法条依据(仅管理建议)",
};
// effective_status → 人读现状
export const COPILOT_EFFECTIVE_LABELS = {
  in_force: "现行有效",
  deprecated: "已废止",
  superseded: "被替代",
  pending: "待生效",
  unconfirmed: "待确认",
  conflict: "冲突",
};
// 严重度 → 复用 #reviewDetail [data-level] 的 --lv token:blocking 玫红 / warning 琥珀 / info 中性灰
// (info 是「提示」不是「就绪」,不能用 ok 的成功绿冒充无问题——守 DESIGN §9.2);零装饰性渐变
export const COPILOT_SEVERITY_LEVEL = { blocking: "bad", warning: "warn", info: "info" };
const COPILOT_SEVERITY_TEXT = { blocking: "需处理", warning: "待确认", info: "提示" };
const COPILOT_DIMENSION_ICON = {
  "归类": "git-merge",
  "法律": "scale",
  "证据": "list-checks",
  "聚合": "bar-chart",
  "置信": "radar",
};

function copilotEffectiveLabel(status) {
  return COPILOT_EFFECTIVE_LABELS[status] || readableText(status) || "状态未知";
}

// 法条现状:review-law 蓝卡;非现行有效加 effective_status 警示点,沿革警示显示取代条款
function copilotLawCard(law = {}) {
  const status = law["effective_status"] || "";
  const warn = Boolean(status) && status !== "in_force";
  const lineage = law["沿革警示"];
  const name = law["article_no"] || law["条款号"] || law["name"] || law["node_id"] || "候选法条";
  return `
    <div class="review-law rv-copilot-law"${warn ? " data-warn=\"true\"" : ""}>
      <strong>${esc(displayValue(name))}</strong>
      <span class="rv-effective">${warn ? "<i class=\"rv-effective-dot\" aria-hidden=\"true\"></i>" : ""}${esc(copilotEffectiveLabel(status))}</span>
    </div>
    ${lineage ? `<p class="rv-copilot-lineage"><i data-lucide="git-merge"></i>沿革警示:${esc(displayValue(lineage))}</p>` : ""}
  `;
}

// 补足面板:法条现状 + 证据应有项 + 跨企业分布 + 判例(确定性检索,零 LLM)
function copilotSupplement(supplement = {}) {
  const laws = Array.isArray(supplement["法条现状"]) ? supplement["法条现状"] : [];
  const evidence = Array.isArray(supplement["证据应有项"]) ? supplement["证据应有项"] : [];
  const dist = supplement["跨企业分布"] || null;
  const precedents = Array.isArray(supplement["判例"]) ? supplement["判例"] : [];
  const pitfalls = Array.isArray(supplement["踩雷点关联"]) ? supplement["踩雷点关联"] : [];
  const hit = supplement["命中问题类型"] || null;

  const blocks = [];
  if (hit) {
    blocks.push(`<div class="rv-supp-block"><b><i data-lucide="git-merge"></i>命中问题类型</b><p class="review-summary">${esc(displayValue(hit["name"] || hit["node_id"]))}</p></div>`);
  }
  blocks.push(`
    <div class="rv-supp-block">
      <b><i data-lucide="scale"></i>法条现状</b>
      ${laws.length
        ? `<div class="rv-copilot-laws">${laws.map(copilotLawCard).join("")}</div>`
        : "<p class=\"review-summary\">无候选法条 —— 通过后只可作管理建议,不得写成法律依据。</p>"}
    </div>
  `);
  blocks.push(`
    <div class="rv-supp-block">
      <b><i data-lucide="list-checks"></i>证据应有项</b>
      ${chips(evidence)}
    </div>
  `);
  if (dist) {
    blocks.push(`
      <div class="rv-supp-block">
        <b><i data-lucide="bar-chart"></i>跨企业分布</b>
        <div class="review-field-grid">
          ${field("样本企业数", dist["样本企业数"])}
          ${field("复发率", dist["复发率"])}
          ${field("是否够聚合", dist["是否够聚合"] === true ? "已达 ≥5 家口径" : dist["是否够聚合"] === false ? "未达 5 家口径" : dist["是否够聚合"])}
        </div>
      </div>
    `);
  }
  if (pitfalls.length) {
    blocks.push(`
      <div class="rv-supp-block">
        <b><i data-lucide="triangle-alert"></i>踩雷点关联</b>
        ${chips(pitfalls.map((p) => p["name"] || p["node_id"] || p["kind"]))}
      </div>
    `);
  }
  if (precedents.length) {
    blocks.push(`
      <div class="rv-supp-block">
        <b><i data-lucide="gavel"></i>判例</b>
        <div class="review-completion">
          ${precedents.map((p) => `
            <div class="review-completion-row">
              <strong>${esc(displayValue(p["审核编号"]))}</strong>
              <span>${esc(displayValue(p["结论"]))}</span>
              <small>${esc(displayValue(p["时间"]))}</small>
            </div>
          `).join("")}
        </div>
      </div>
    `);
  }
  return `<div class="rv-copilot-supplement">${blocks.join("")}</div>`;
}

// 整体研判:克隆 rv-readiness(就绪度 data-level + 一句话 + 建议方向);建议方向 null 时不显示「建议方向」
function copilotOverallBanner(overall = {}) {
  const level = ["ok", "warn", "bad"].includes(overall["就绪度"]) ? overall["就绪度"] : "ok";
  const dir = overall["建议方向"];
  const rec = dir ? ACTIONS.find((action) => action.kind === dir) : null;
  return `
    <div class="rv-readiness rv-copilot-readiness" data-level="${level}">
      <div class="rv-readiness-main">
        <span class="rv-readiness-kicker">副驾整体研判</span>
        <strong class="rv-readiness-title">${esc(displayValue(overall["一句话"] || "副驾已完成研判"))}</strong>
      </div>
      ${rec ? `<div class="rv-readiness-rec"><span>建议方向</span><b>${esc(rec.label)}</b></div>` : ""}
    </div>
  `;
}

// 异议[] 为空 → 不造异议,只给一条良好态(对齐 rv-readiness ok)
function copilotNoDissent() {
  return `
    <div class="rv-readiness rv-copilot-nodissent" data-level="ok">
      <div class="rv-readiness-main">
        <span class="rv-readiness-kicker">副驾异议</span>
        <strong class="rv-readiness-title">三项信号良好,副驾无异议</strong>
      </div>
    </div>
  `;
}

// 单条异议卡:克隆 rv-signal 但更轻(3px 左强调边 + 更哑背景);自带 data-level;「副驾」徽章;机器码折进溯源
function copilotOpinionCard(opinion = {}, { degraded = false } = {}) {
  const code = opinion["错配码"] || "";
  const severity = opinion["严重度"] || "info";
  const level = COPILOT_SEVERITY_LEVEL[severity] || "ok";
  const dim = opinion["判断维度"] || "";
  const icon = COPILOT_DIMENSION_ICON[dim] || "triangle-alert";
  const codeLabel = COPILOT_CODE_LABELS[code] || readableText(code) || "副驾异议";
  const trace = opinion["trace"] || {};
  // 降级态(门禁 partial/blocked):法律维度异议标「需人工复核法条」
  const needLawReview = degraded && dim === "法律";
  return `
    <div class="rv-opinion" data-level="${level}">
      <span class="rv-opinion-ico"><i data-lucide="${icon}"></i></span>
      <div class="rv-opinion-main">
        <div class="rv-opinion-top">
          <span class="rv-opinion-code">${esc(codeLabel)}</span>
          <span class="rv-opinion-sev">${esc(COPILOT_SEVERITY_TEXT[severity] || "提示")}</span>
          <span class="rv-copilot-pill">副驾</span>
        </div>
        <strong class="rv-opinion-head">${esc(displayValue(opinion["一句话"]))}</strong>
        ${opinion["建议修正"] ? `<span class="rv-opinion-fix"><i data-lucide="arrow-right"></i>${esc(displayValue(opinion["建议修正"]))}</span>` : ""}
        ${needLawReview ? "<span class=\"rv-opinion-flag\"><i data-lucide=\"triangle-alert\"></i>需人工复核法条</span>" : ""}
        <div class="rv-opinion-actions" role="group" aria-label="副驾异议回执">
          <button type="button" class="rv-opinion-act" data-receipt="采纳" data-code="${esc(code)}" aria-pressed="false">采纳</button>
          <button type="button" class="rv-opinion-act" data-receipt="驳回" data-code="${esc(code)}" aria-pressed="false">驳回</button>
        </div>
        <details class="rv-raw rv-opinion-raw">
          <summary><i data-lucide="folder-open"></i>查看溯源<span>错配码 · 节点 · trace</span></summary>
          <div class="rv-raw-body">
            <div class="review-field-grid">
              ${field("错配码", code)}
              ${field("判断维度", dim)}
              ${field("检出方式", opinion["检出方式"])}
              ${field("严重度", severity)}
              ${field("证据", opinion["证据"])}
              ${field("node_ids", (trace["node_ids"] || []).join("、"))}
              ${field("edge_ids", (trace["edge_ids"] || []).join("、"))}
              ${field("source_refs", (trace["source_refs"] || []).join("、"))}
            </div>
          </div>
        </details>
      </div>
    </div>
  `;
}

// 副驾研判段:P0 进页即渲染(读 item["副驾研判"],无 fetch);无副驾数据则不渲染
export function copilotSection(item) {
  const copilot = item?.["副驾研判"];
  if (!copilot || typeof copilot !== "object") return "";
  const gate = copilot["上下文门禁"] || "pass";
  const degraded = gate === "partial" || gate === "blocked";
  const overall = copilot["整体研判"] || {};
  const supplement = copilot["补足"] || {};
  const opinions = Array.isArray(copilot["异议"]) ? copilot["异议"] : [];
  const degradeNote = copilot["降级说明"];
  return `
    <section class="rv-copilot" aria-label="副驾研判">
      <div class="rv-copilot-bar">
        <span class="rv-copilot-mark"><i data-lucide="shield-check"></i>十律副驾研判</span>
        <span class="rv-copilot-note">主动补足与异议 · 不替 ETO 裁决</span>
      </div>
      ${degraded ? `<div class="rv-copilot-degraded" data-gate="${esc(gate)}"><i data-lucide="triangle-alert"></i><span>${esc(displayValue(degradeNote || "上下文门禁降级:部分语义判断退回人工复核。"))}</span></div>` : ""}
      ${copilotOverallBanner(overall)}
      ${copilotSupplement(supplement)}
      <div class="rv-copilot-opinions" aria-label="副驾异议">
        ${opinions.length ? opinions.map((opinion) => copilotOpinionCard(opinion, { degraded })).join("") : copilotNoDissent()}
      </div>
    </section>
  `;
}

// section 为隔离自带一份(review.js 完整资料折叠用其同名件);本段不直接调用,保持 helper 集齐。
export { section };
