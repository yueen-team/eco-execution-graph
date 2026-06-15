// 把 /api/graph/context 端点所需的图谱数据从仓库根 data/ 复制进 graph-api/data/，
// 使其落在 graph-api 的 Docker 构建上下文内（BuildDir=graph-api）。
// 部署前运行: node scripts/stage-context-data.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const graphApiRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(graphApiRoot, '..');

const FILES = [
  'data/exports/shared_product_v1/graph.json',
  'data/knowledge-governance/publications/ecocheck.json',
];

for (const rel of FILES) {
  const src = path.join(repoRoot, rel);
  const dest = path.join(graphApiRoot, rel);
  if (!fs.existsSync(src)) {
    throw new Error(`源数据缺失: ${src}`);
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
  const bytes = fs.statSync(dest).size;
  console.log(`staged ${rel} (${bytes} bytes)`);
}
console.log('done');
