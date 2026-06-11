// 节点美术:程序化生成 SVG 令牌(渐变 + 语义图标 + tier 徽章),替代 Cytoscape 裸图形。
// 每个 (node_type, tier) 组合只生成一次并缓存为 data URI。
import {
  Scale, BookOpen, Ruler, FlagTriangleRight, ClipboardCheck, Workflow, Factory,
  Flame, Droplets, Camera, ListChecks, FileLock, Wrench, FilePen, TriangleAlert,
  BarChart3, Zap, Radar, Lock, Circle,
} from "lucide";
import { nodeMeta } from "./state.js";

const ICON_MAP = {
  scale: Scale, "book-open": BookOpen, ruler: Ruler, "flag-triangle-right": FlagTriangleRight,
  "clipboard-check": ClipboardCheck, workflow: Workflow, factory: Factory, flame: Flame,
  droplets: Droplets, camera: Camera, "list-checks": ListChecks, "file-lock": FileLock,
  wrench: Wrench, "file-pen": FilePen, "triangle-alert": TriangleAlert,
  "bar-chart-3": BarChart3, zap: Zap, radar: Radar, circle: Circle,
};

// node_type → 形态(卡片/圆形实体/菱形警示)与画布尺寸
const KIND = {
  law_article: { kind: "card", size: 66 },
  law_obligation: { kind: "card", size: 58 },
  tech_spec: { kind: "card", size: 54 },
  issue_type: { kind: "card", size: 62 },
  evidence_category: { kind: "card", size: 54 },
  evidence_field_requirement: { kind: "card", size: 54 },
  evidence_judgment_standard: { kind: "card", size: 54 },
  rectification_template: { kind: "card", size: 54 },
  report_expression: { kind: "card", size: 54 },
  pitfall_class: { kind: "diamond", size: 56 },
  pitfall_pattern_stat: { kind: "diamond", size: 56 },
  pitfall_instance: { kind: "diamond", size: 56 },
};
export function nodeKind(nodeType) {
  return KIND[nodeType] || { kind: "entity", size: 52 };
}

function serializeIcon(iconDef, { x, y, scale, color, width = 1.9, opacity = 1 }) {
  const children = (iconDef?.[2] || [])
    .map(([tag, attrs]) => `<${tag} ${Object.entries(attrs).map(([k, v]) => `${k}="${v}"`).join(" ")}/>`)
    .join("");
  return `<g transform="translate(${x} ${y}) scale(${scale})" fill="none" stroke="${color}"
    stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round" opacity="${opacity}">${children}</g>`;
}

function tierDecoration(tier, kind) {
  if (tier === "private") {
    // 锁徽章:右下角,演示"私有层"身份
    return `<circle cx="51" cy="51" r="9.5" fill="#0a1611" stroke="#f5b84d" stroke-opacity="0.85" stroke-width="1.3"/>
      ${serializeIcon(Lock, { x: 45.5, y: 45.5, scale: 11 / 24, color: "#f5b84d", width: 2.2 })}`;
  }
  if (tier === "aggregate") {
    // 聚合层:外圈细环
    return kind === "entity"
      ? `<circle cx="32" cy="32" r="30.4" fill="none" stroke="#a78bfa" stroke-opacity="0.55" stroke-width="1.2"/>`
      : `<rect x="0.8" y="0.8" width="62.4" height="62.4" rx="19" fill="none" stroke="#a78bfa" stroke-opacity="0.55" stroke-width="1.2"/>`;
  }
  return "";
}

function cardSvg(color, icon, tier) {
  const dash = tier === "private" ? `stroke-dasharray="5.5 4"` : "";
  return `
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${color}" stop-opacity="0.40"/>
      <stop offset="0.55" stop-color="${color}" stop-opacity="0.16"/>
      <stop offset="1" stop-color="${color}" stop-opacity="0.08"/>
    </linearGradient>
  </defs>
  <rect x="4" y="4" width="56" height="56" rx="16" fill="#0c1a14"/>
  <rect x="4" y="4" width="56" height="56" rx="16" fill="url(#g)"
    stroke="${color}" stroke-opacity="${tier === "private" ? 0.9 : 0.7}" stroke-width="1.5" ${dash}/>
  <path d="M16 5.2 H48" stroke="#ffffff" stroke-opacity="0.16" stroke-width="1" stroke-linecap="round"/>
  ${serializeIcon(icon, { x: 19, y: 19, scale: 26 / 24, color: "#edf7f0" })}
  ${tierDecoration(tier, "card")}`;
}

function entitySvg(color, icon, tier) {
  const dash = tier === "private" ? `stroke-dasharray="5.5 4"` : "";
  return `
  <defs>
    <radialGradient id="g" cx="0.5" cy="0.38" r="0.75">
      <stop offset="0" stop-color="${color}" stop-opacity="0.42"/>
      <stop offset="0.65" stop-color="${color}" stop-opacity="0.14"/>
      <stop offset="1" stop-color="${color}" stop-opacity="0.06"/>
    </radialGradient>
  </defs>
  <circle cx="32" cy="32" r="27" fill="#0c1a14"/>
  <circle cx="32" cy="32" r="27" fill="url(#g)"
    stroke="${color}" stroke-opacity="${tier === "private" ? 0.9 : 0.65}" stroke-width="1.5" ${dash}/>
  <path d="M20 12.5 a23 23 0 0 1 24 0" stroke="#ffffff" stroke-opacity="0.14" stroke-width="1.4" fill="none" stroke-linecap="round"/>
  ${serializeIcon(icon, { x: 20, y: 20, scale: 24 / 24, color: "#edf7f0" })}
  ${tierDecoration(tier, "entity")}`;
}

function diamondSvg(color, icon, tier) {
  const dash = tier === "private" ? `stroke-dasharray="5 4"` : "";
  return `
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${color}" stop-opacity="0.46"/>
      <stop offset="1" stop-color="${color}" stop-opacity="0.10"/>
    </linearGradient>
  </defs>
  <g transform="rotate(45 32 32)">
    <rect x="11" y="11" width="42" height="42" rx="11" fill="#0c1a14"/>
    <rect x="11" y="11" width="42" height="42" rx="11" fill="url(#g)"
      stroke="${color}" stroke-opacity="0.8" stroke-width="1.5" ${dash}/>
  </g>
  ${serializeIcon(icon, { x: 21, y: 21, scale: 22 / 24, color: "#f4f9f4" })}
  ${tierDecoration(tier, "diamond")}`;
}

const cache = new Map();

export function nodeArt(nodeType, tier) {
  const key = `${nodeType}|${tier}`;
  if (cache.has(key)) return cache.get(key);
  const meta = nodeMeta(nodeType);
  const { kind } = nodeKind(nodeType);
  const icon = ICON_MAP[meta.icon] || Circle;
  const body =
    kind === "card" ? cardSvg(meta.color, icon, tier)
    : kind === "diamond" ? diamondSvg(meta.color, icon, tier)
    : entitySvg(meta.color, icon, tier);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">${body}</svg>`;
  const uri = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  cache.set(key, uri);
  return uri;
}
