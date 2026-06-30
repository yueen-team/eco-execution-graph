// 副驾段纯渲染契约测试 · node:test + node:assert/strict
// 锚定 specs/features/eto-review-copilot.feature(尤其第 84 行机器码隐藏场景)与 docs/api/eto-review-copilot.md §7/§9。
// 守红线:常显区私有零泄漏 + 机器码默认折叠 + info 中性(非 ok)+ 异议不无中生有。
import test from "node:test";
import assert from "node:assert/strict";
import {
  copilotSection,
  agreementSparkline,
  COPILOT_CODE_LABELS,
  COPILOT_SEVERITY_LEVEL,
  COPILOT_EFFECTIVE_LABELS,
} from "../src/copilotView.js";

// 合成态里故意把机器码/私有占位塞进 details 绑定字段(证据/trace),
// 用来证明常显区(<details「查看溯源」> 之外)一律不外泄。
const ENTERPRISE = "合成企业甲";
const PRIVATE_NODE = "issue:private:ent-7-snapshot";

// §7 副驾研判 fixture:含 blocking/warning/info 三类异议、含私有占位 trace。
function copilotFixture(overrides = {}) {
  return {
    "副驾研判": {
      "副驾版本": "copilot.v1",
      "上下文门禁": "pass",
      "整体研判": { "就绪度": "warn", "建议方向": "merge", "一句话": "归类需复核,建议合并而非新建。" },
      "补足": {
        "命中问题类型": { "node_id": "issue:hw:label", "name": "危废标签不规范" },
        "法条现状": [
          { "node_id": "law:swl:art77", "article_no": "固废法 第七十七条", "effective_status": "in_force", "沿革警示": null },
          { "node_id": "law:swl:art57-2016", "article_no": "固废法(2016) 第五十七条", "effective_status": "deprecated", "沿革警示": "被第七十八条替代" },
        ],
        "证据应有项": ["标签照片", "台账记录"],
        "跨企业分布": { "样本企业数": 3, "复发率": 1.8, "是否够聚合": false },
        "踩雷点关联": [{ "node_id": "pitfall:hw:transfer-gap", "kind": "pitfall_class", "name": "转移联单与台账脱节" }],
        "判例": [{ "审核编号": "review:peer1", "结论": "仅保留内部案例", "时间": "2026-06-20" }],
      },
      "异议": [
        {
          "错配码": "management_advice_miscast_as_law",
          "严重度": "blocking",
          "判断维度": "法律",
          "一句话": "法条候选为空,不得写成违反某法。",
          "检出方式": "rule+llm",
          // 机器 token 故意进证据,验证它们只落在折叠里
          "证据": "法条规范候选=[],legal_basis_status=no_legal_basis,rag_doc_ref 缺失",
          "建议修正": "改写为管理建议。",
          "trace": { "node_ids": [PRIVATE_NODE], "edge_ids": [], "source_refs": ["src:" + ENTERPRISE] },
        },
        {
          "错配码": "law_status_risk",
          "严重度": "warning",
          "判断维度": "法律",
          "一句话": "候选条款已废止,需改绑现行条款。",
          "检出方式": "rule",
          "证据": "effective_status=deprecated;machine_gate_status=pass",
          "建议修正": "改绑第七十八条。",
          "trace": { "node_ids": ["law:swl:art57-2016", "law:swl:art78"], "edge_ids": ["superseded_by:law:swl:art57-2016->law:swl:art78"], "source_refs": ["src:lawrisk"] },
        },
        {
          "错配码": "aggregation_risk",
          "严重度": "info",
          "判断维度": "聚合",
          "一句话": "样本仅 3 家,未达 5 家口径。",
          "检出方式": "rule",
          "证据": "样本企业数=3<5",
          "建议修正": "满 5 家再聚合。",
          "trace": { "node_ids": ["issue:hw:label"], "edge_ids": [], "source_refs": ["src:agg"] },
        },
      ],
      "降级说明": null,
      "trace": { "node_ids": ["issue:hw:label"], "edge_ids": [], "source_refs": ["src:main"] },
      "_redline_clean": true,
      ...overrides,
    },
  };
}

// 空异议态:不造异议,只给良好态。
function cleanFixture() {
  const f = copilotFixture();
  f["副驾研判"]["异议"] = [];
  f["副驾研判"]["整体研判"] = { "就绪度": "ok", "建议方向": "approve", "一句话": "三者就位,可直接判断。" };
  return f;
}

// 常显区 = 去掉所有 <details「查看溯源」> 折叠后的 HTML。
function visibleRegion(html) {
  return html.replace(/<details[\s\S]*?<\/details>/g, "");
}
// 折叠区 = 所有 details 折叠拼接。
function detailsRegion(html) {
  return (html.match(/<details[\s\S]*?<\/details>/g) || []).join("\n");
}
// 常显「文本节点」= 去折叠 + 去标签/属性,只剩用户真正读到的字
//(错配码经 data-code 属性参与采纳/驳回回执是不可见管道,不算「露出」)。
function visibleText(html) {
  return visibleRegion(html).replace(/<[^>]*>/g, "");
}
function opinionCount(html) {
  return (html.match(/class="rv-opinion"/g) || []).length;
}

test("(a) 常显区私有零泄漏:机器码 / 私有占位 / 企业名快照不出现在折叠之外(feature:84)", () => {
  const html = copilotSection(copilotFixture());
  const visible = visibleRegion(html);
  const forbidden = [
    "legal_basis_status",
    "node_ids",
    "copilot.v1",
    "machine_gate_status",
    "rag_doc_ref",
    "effective_status",
    "issue:private:",
    ENTERPRISE,
  ];
  for (const token of forbidden) {
    assert.equal(visible.includes(token), false, `常显区不得出现 ${token}`);
  }
  // 防空测:这些 token 确实存在于完整 HTML 的折叠区(否则上面断言形同虚设)。
  const folded = detailsRegion(html);
  for (const token of ["legal_basis_status", "node_ids", "machine_gate_status", "rag_doc_ref", "issue:private:", ENTERPRISE]) {
    assert.equal(folded.includes(token), true, `${token} 应只落在「查看溯源」折叠里`);
  }
});

test("(b) 错配码渲染为中文 CODE_LABELS(管理经验被法律化 / 法条状态有风险 / 聚合误导风险)", () => {
  const html = copilotSection(copilotFixture());
  const text = visibleText(html);
  assert.equal(COPILOT_CODE_LABELS["management_advice_miscast_as_law"], "管理经验被法律化");
  assert.equal(COPILOT_CODE_LABELS["law_status_risk"], "法条状态有风险");
  assert.equal(COPILOT_CODE_LABELS["aggregation_risk"], "聚合误导风险");
  assert.ok(text.includes("管理经验被法律化"), "应渲染中文标签 管理经验被法律化");
  assert.ok(text.includes("法条状态有风险"), "应渲染中文标签 法条状态有风险");
  assert.ok(text.includes("聚合误导风险"), "应渲染中文标签 聚合误导风险");
  // 常显「文本」不得出现机器原码;原码只在折叠里露出。
  assert.equal(text.includes("management_advice_miscast_as_law"), false);
  assert.ok(detailsRegion(html).includes("management_advice_miscast_as_law"));
});

test("(c) 上下文门禁 partial/blocked 渲染降级横幅;pass 不渲染", () => {
  const partial = copilotSection(copilotFixture({ "上下文门禁": "partial", "降级说明": "RAG 取文超时:法律维度异议仅作内部提示,需人工复核法条。" }));
  const pv = visibleRegion(partial);
  assert.ok(pv.includes("rv-copilot-degraded"), "partial 应渲染降级横幅");
  assert.ok(pv.includes('data-gate="partial"'));
  assert.ok(pv.includes("RAG 取文超时"), "应展示降级说明文案");
  assert.ok(pv.includes("需人工复核法条"), "降级态法律维度异议应标需人工复核法条");

  const blocked = copilotSection(copilotFixture({ "上下文门禁": "blocked" }));
  assert.ok(visibleRegion(blocked).includes('data-gate="blocked"'));

  const pass = copilotSection(copilotFixture());
  assert.equal(visibleRegion(pass).includes("rv-copilot-degraded"), false, "pass 不得渲染降级横幅");
  assert.equal(visibleRegion(pass).includes("需人工复核法条"), false, "非降级态不得出现需人工复核法条");
});

test("(d) 异议[] 为空 → 渲染「三项信号良好,副驾无异议」,不造异议", () => {
  const html = copilotSection(cleanFixture());
  const visible = visibleRegion(html);
  assert.ok(visible.includes("三项信号良好,副驾无异议"));
  assert.ok(visible.includes('class="rv-readiness rv-copilot-nodissent" data-level="ok"'));
  assert.equal(opinionCount(html), 0, "空异议不得渲染任何异议卡");
  // 不无中生有:不得出现任何错配码中文标签。
  for (const label of Object.values(COPILOT_CODE_LABELS)) {
    assert.equal(visible.includes(label), false, `空异议态不得凭空出现 ${label}`);
  }
});

test("(e) 严重度映射:info→data-level=info(中性,非 ok);blocking→bad;warning→warn", () => {
  assert.deepEqual(COPILOT_SEVERITY_LEVEL, { blocking: "bad", warning: "warn", info: "info" });
  const html = copilotSection(copilotFixture());
  assert.ok(html.includes('<div class="rv-opinion" data-level="bad">'), "blocking 异议卡 data-level=bad");
  assert.ok(html.includes('<div class="rv-opinion" data-level="warn">'), "warning 异议卡 data-level=warn");
  assert.ok(html.includes('<div class="rv-opinion" data-level="info">'), "info 异议卡 data-level=info");
  // info 绝不借成功绿:本 fixture 异议卡里不得出现 data-level=ok。
  assert.equal(html.includes('<div class="rv-opinion" data-level="ok">'), false, "info 不得渲染成 ok 成功绿");
});

test("(f) 异议卡数量 == 异议[].length;机器码 / trace 在「查看溯源」折叠内可现", () => {
  const fixture = copilotFixture();
  const opinions = fixture["副驾研判"]["异议"];
  const html = copilotSection(fixture);
  assert.equal(opinionCount(html), opinions.length, "异议卡数量必须等于异议条数");

  // 每条异议都带一份「查看溯源」折叠。
  assert.equal((html.match(/查看溯源/g) || []).length, opinions.length);
  const folded = detailsRegion(html);
  assert.ok(folded.includes("management_advice_miscast_as_law"), "机器原码在折叠内可现");
  assert.ok(folded.includes(PRIVATE_NODE), "trace node_ids 在折叠内可现");
  // edge_id 含 ">" 会被 esc 转义为 &gt;,断言 ">"-free 前缀即可证明 edge_ids 落折叠
  assert.ok(folded.includes("superseded_by:law:swl:art57-2016"), "trace edge_ids 在折叠内可现");
  assert.ok(folded.includes("src:" + ENTERPRISE), "trace source_refs 在折叠内可现");
});

test("(g) 补足法条现状:effective_status 经 COPILOT_EFFECTIVE_LABELS 渲染为中文(已废止 / 现行有效)", () => {
  const visible = visibleRegion(copilotSection(copilotFixture()));
  assert.equal(COPILOT_EFFECTIVE_LABELS["deprecated"], "已废止");
  assert.equal(COPILOT_EFFECTIVE_LABELS["in_force"], "现行有效");
  assert.ok(visible.includes("已废止"), "deprecated 应渲染为 已废止");
  assert.ok(visible.includes("现行有效"), "in_force 应渲染为 现行有效");
  assert.equal(visible.includes("deprecated"), false, "常显区不得出现英文 effective_status 值");
  assert.equal(visible.includes("in_force"), false);
});

// (h) render↔wiring 跨文件契约:每条异议卡必须渲染采纳/驳回回执按钮,且 data-code 锁定错配码。
// review.js:584-607 靠 querySelectorAll("[data-receipt]") + dataset.code + dataset.receipt 绑定互斥/持久化;
// 若有人改这些属性名/结构,回执留痕会静默失效——本测试守住该 markup 契约(candy:补实际呈现契约测试)。
test("(h) 每条异议卡渲染采纳/驳回回执按钮:data-code 锁定错配码、数量匹配、默认未决", () => {
  const fixture = copilotFixture();
  const opinions = fixture["副驾研判"]["异议"];
  const html = copilotSection(fixture);
  assert.equal((html.match(/data-receipt="采纳"/g) || []).length, opinions.length, "采纳按钮数=异议条数");
  assert.equal((html.match(/data-receipt="驳回"/g) || []).length, opinions.length, "驳回按钮数=异议条数");
  for (const op of opinions) {
    const code = op["错配码"];
    assert.ok(html.includes(`data-receipt="采纳" data-code="${code}"`), `采纳按钮应锁定 data-code=${code}`);
    assert.ok(html.includes(`data-receipt="驳回" data-code="${code}"`), `驳回按钮应锁定 data-code=${code}`);
  }
  // 渲染态默认未决:任何回执按钮都不得带 aria-pressed="true"
  assert.equal(html.includes('aria-pressed="true"'), false, "渲染态回执默认未决");
});

// (j) render↔wiring 跨文件契约:[请十律复核] 按钮必须渲染、带 data-copilot-recheck 绑定锚点 +
// data-recheck-label / data-copilot-recheck-state 三态写入位。review.js 靠这些选择器接 POST /copilot
// 与加载/失败/演示态;改名即静默断链——本测试守住该 markup 契约。空异议态也应渲染(手动复核入口常开)。
test("(j) [请十律复核] 按钮渲染:data-copilot-recheck + 文案 + 三态写入位(空异议态亦在)", () => {
  const html = copilotSection(copilotFixture());
  assert.ok(html.includes("data-copilot-recheck"), "应渲染带 data-copilot-recheck 的复核按钮");
  assert.ok(html.includes("请十律复核"), "按钮文案应为 请十律复核");
  assert.ok(html.includes("data-recheck-label"), "应有 data-recheck-label 供加载态改写");
  assert.ok(html.includes("data-copilot-recheck-state"), "应有 data-copilot-recheck-state 供失败/演示态写入");
  // 按钮是 <button>(可聚焦、键盘可达),不是 div
  assert.ok(/<button[^>]*data-copilot-recheck/.test(html), "复核入口必须是 <button>");
  // 手动复核入口常开:空异议态(无异议)按钮仍渲染
  const clean = copilotSection(cleanFixture());
  assert.ok(clean.includes("data-copilot-recheck"), "空异议态也应渲染复核按钮");
});

// (i) 补足面板契约:feature『法条状态有风险』要求补足显示现状与沿革取代关系;并锁定证据应有项/跨企业分布/命中问题类型。
test("(i) 补足锁定沿革取代关系 / 证据应有项 / 跨企业分布 / 命中问题类型", () => {
  const visible = visibleRegion(copilotSection(copilotFixture()));
  assert.ok(visible.includes("被第七十八条替代"), "应显示沿革取代条款(feature 法条状态有风险)");
  assert.ok(visible.includes("标签照片"), "应显示证据应有项 chips");
  assert.ok(visible.includes("未达 5 家口径"), "应显示跨企业分布未达聚合口径");
  assert.ok(visible.includes("危废标签不规范"), "应显示命中问题类型 name");
});

// ============ 副驾-ETO 一致率 sparkline 契约(§9 / DESIGN §9.2):纯 SVG、克制、私有零泄漏 ============
// 随序号上升的合成趋势(纯机器数据,末点 0.83 → 83%)。
const AGREEMENT_SERIES = [
  { "序号": 1, "累计一致率": 0.5 },
  { "序号": 2, "累计一致率": 0.62 },
  { "序号": 3, "累计一致率": 0.7 },
  { "序号": 4, "累计一致率": 0.78 },
  { "序号": 5, "累计一致率": 0.83 },
];

test("(k) agreementSparkline 多点:输出 <svg> 含 polyline + 末点数值 + role/aria;线用 --eco 绿、无装饰性渐变", () => {
  const svg = agreementSparkline(AGREEMENT_SERIES);
  assert.ok(svg.startsWith("<svg"), "多点应输出 <svg>");
  assert.ok(svg.includes("<polyline"), "多点应画 polyline 折线");
  assert.ok(/role="img"/.test(svg), "应带 role=img(可访问性)");
  assert.ok(svg.includes('aria-label="副驾-ETO 一致率趋势 当前 83%"'), "aria-label 含当前一致率");
  assert.ok(svg.includes(">83%</text>"), "末点应渲染当前一致率数值标签");
  assert.ok(svg.includes("<circle"), "末点应有高亮圆点");
  // DESIGN §9.2 克制:线用 --eco 绿,且全程无装饰性渐变/光效/滤镜/动画
  assert.ok(svg.includes("#2ee6a8"), "线应用 --eco 绿 #2ee6a8");
  assert.equal(/gradient|filter|feGaussian|glow|animate/i.test(svg), false, "不得有装饰性渐变/光效/滤镜/动画");
});

test("(l) agreementSparkline 空 series(空数组/null/undefined):占位文案,不画空轴/折线", () => {
  for (const empty of [[], null, undefined]) {
    const out = agreementSparkline(empty);
    assert.ok(out.includes("暂无副驾表态记录,一致率曲线待积累"), "空 series 应给占位文案");
    assert.equal(out.includes("<svg"), false, "空 series 不得画 svg 轴");
    assert.equal(out.includes("<polyline"), false, "空 series 不得画折线");
  }
});

test("(m) agreementSparkline 单点:不报错,画一个点 + 数值,无折线", () => {
  const svg = agreementSparkline([{ "序号": 1, "累计一致率": 0.5 }]);
  assert.ok(svg.startsWith("<svg"), "单点应输出 <svg>");
  assert.ok(svg.includes("<circle"), "单点应画一个点");
  assert.ok(svg.includes(">50%</text>"), "单点应渲染数值");
  assert.equal(svg.includes("<polyline"), false, "单点不画折线");
});

test("(n) agreementSparkline 纯合成数值,opts 私有内容不回写进 SVG", () => {
  const svg = agreementSparkline(AGREEMENT_SERIES, { enterprise: ENTERPRISE, node: PRIVATE_NODE, width: 240 });
  for (const token of [ENTERPRISE, PRIVATE_NODE, "issue:private:", "node_ids", "legal_basis_status", "rag_doc_ref"]) {
    assert.equal(svg.includes(token), false, `sparkline 不得出现私有内容 ${token}`);
  }
  // opts.width 被采纳(viewBox 反映),但任何非几何 opts 字段被丢弃
  assert.ok(svg.includes("viewBox=\"0 0 240"), "opts.width 应作用于 viewBox");
});
